import type { Socket } from 'socket.io';
import { z } from 'zod';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketAck,
} from '@shared/gameTypes';
import {
  GameDomainError,
  type GameManager,
  type GameSocketServer,
} from '../game/GameManager';
import { SlidingWindowLimiter } from '../game/rateLimiter';
import { logger } from '../lib/logger';
import { resolveTeacherIdFromCookieHeader } from '../middleware/requireTeacher';

interface SocketSessionData {
  role?: 'host' | 'presenter' | 'player';
  teacherId?: string;
  pin?: string;
  participantId?: string;
}

type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketSessionData
>;

async function requireAuthenticatedHostTeacherId(
  socket: TypedSocket,
): Promise<string> {
  if (socket.data.role === 'player' || socket.data.role === 'presenter') {
    throw new GameDomainError(
      'UNAUTHORIZED_HOST',
      'Öğrenci veya projeksiyon bağlantıları öğretmen kontrol yetkisi kazanamaz.',
    );
  }

  const activeTeacherId = await resolveTeacherIdFromCookieHeader(
    socket.handshake.headers.cookie,
  );
  if (!activeTeacherId) {
    socket.data.teacherId = undefined;
    throw new GameDomainError(
      'UNAUTHORIZED_HOST',
      'Yarışma yönetimi için geçerli bir öğretmen oturumu gereklidir.',
    );
  }

  if (socket.data.teacherId && socket.data.teacherId !== activeTeacherId) {
    throw new GameDomainError(
      'UNAUTHORIZED_HOST',
      'Öğretmen oturumu doğrulaması uyuşmuyor.',
    );
  }

  socket.data.teacherId = activeTeacherId;
  return activeTeacherId;
}

const pinSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Oyun PIN kodu 6 haneli rakamlardan oluşmalıdır.');

const tokenSchema = z
  .string()
  .trim()
  .min(16, 'Geçersiz oturum belirteci.')
  .max(256, 'Geçersiz oturum belirteci.');

const hostAttachSchema = z.object({
  pin: pinSchema,
  hostToken: tokenSchema,
});

const presenterAttachSchema = z.object({
  pin: pinSchema,
  presenterToken: tokenSchema,
});

const presenterFocusSchema = z.object({
  pin: pinSchema,
  hostToken: tokenSchema,
  focus: z.enum(['DISTRIBUTION', 'LEADERBOARD']),
});

const hostKickSchema = z.object({
  pin: pinSchema,
  hostToken: tokenSchema,
  participantId: z.string().trim().min(1, 'Oyuncu kimliği gereklidir.'),
});

const playerJoinSchema = z.object({
  pin: pinSchema,
  nickname: z
    .string()
    .trim()
    .min(2, 'Kullanıcı adı en az 2 karakter olmalıdır.')
    .max(24, 'Kullanıcı adı en fazla 24 karakter olabilir.'),
});

const playerReconnectSchema = z.object({
  pin: pinSchema,
  reconnectToken: tokenSchema,
});

const submitAnswerSchema = z.object({
  pin: pinSchema,
  questionIndex: z.number().int().min(0).max(500),
  optionId: z.string().trim().min(1).optional(),
  optionIds: z.array(z.string().trim().min(1)).max(10).optional(),
  orderedOptionIds: z.array(z.string().trim().min(1)).max(10).optional(),
});

const timeSyncSchema = z.object({
  clientSentMs: z.number().finite(),
});

function toAckError(error: unknown): { ok: false; code: string; message: string } {
  if (error instanceof GameDomainError) {
    return { ok: false, code: error.code, message: error.message };
  }
  if (error instanceof z.ZodError) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: error.issues[0]?.message ?? 'Geçersiz istek verisi.',
    };
  }
  logger.error('socket_handler_error', {
    errorName: error instanceof Error ? error.name : 'UnknownError',
    errorMessage: error instanceof Error ? error.message : String(error),
  });
  return {
    ok: false,
    code: 'INTERNAL_ERROR',
    message: 'İşlem sırasında beklenmeyen bir sunucu hatası oluştu.',
  };
}

function safeAck<T extends object = object>(
  ack: ((res: SocketAck<T>) => void) | undefined,
  payload: SocketAck<T>,
): void {
  if (typeof ack === 'function') {
    ack(payload);
  }
}

export function registerGameSockets(
  io: GameSocketServer,
  gameManager: GameManager,
): void {
  const limiter = new SlidingWindowLimiter();

  io.on('connection', (rawSocket) => {
    const socket = rawSocket as TypedSocket;

    socket.on('time:sync', (payload, ack) => {
      const parsed = timeSyncSchema.safeParse(payload);
      if (!parsed.success || typeof ack !== 'function') return;
      ack({
        clientSentMs: parsed.data.clientSentMs,
        serverNowMs: Date.now(),
      });
    });

    socket.on('host:attach', async (payload, ack) => {
      try {
        if (!limiter.check(`host:attach:${socket.id}`, 10_000, 15)) {
          safeAck(ack, {
            ok: false,
            code: 'RATE_LIMITED',
            message: 'Çok fazla bağlantı denemesi. Lütfen kısa süre bekleyin.',
          });
          return;
        }

        const teacherId = await requireAuthenticatedHostTeacherId(socket);
        const { pin, hostToken } = hostAttachSchema.parse(payload);
        const snapshot = gameManager.attachHost(pin, hostToken, socket.id, teacherId);
        socket.data.role = 'host';
        socket.data.pin = pin;
        await socket.join(gameManager.roomChannel(pin));
        safeAck(ack, { ok: true, snapshot });
      } catch (error) {
        safeAck(ack, toAckError(error));
      }
    });

    socket.on('presenter:attach', async (payload, ack) => {
      try {
        if (!limiter.check(`presenter:attach:${socket.id}`, 10_000, 15)) {
          safeAck(ack, {
            ok: false,
            code: 'RATE_LIMITED',
            message: 'Çok fazla bağlantı denemesi. Lütfen kısa süre bekleyin.',
          });
          return;
        }

        const { pin, presenterToken } = presenterAttachSchema.parse(payload);
        const snapshot = gameManager.attachPresenter(pin, presenterToken, socket.id);
        socket.data.role = 'presenter';
        socket.data.pin = pin;
        await socket.join(gameManager.roomChannel(pin));
        safeAck(ack, { ok: true, snapshot });
      } catch (error) {
        safeAck(ack, toAckError(error));
      }
    });

    socket.on('host:pause_question', async (payload, ack) => {
      try {
        if (!limiter.check(`host:ctrl:${socket.id}`, 10_000, 20)) {
          safeAck(ack, {
            ok: false,
            code: 'RATE_LIMITED',
            message: 'Çok fazla kontrol isteği gönderildi.',
          });
          return;
        }
        const teacherId = await requireAuthenticatedHostTeacherId(socket);
        const { pin, hostToken } = hostAttachSchema.parse(payload);
        const res = gameManager.hostPauseQuestion(pin, hostToken, teacherId);
        safeAck(ack, { ok: true, ...res });
      } catch (error) {
        safeAck(ack, toAckError(error));
      }
    });

    socket.on('host:resume_question', async (payload, ack) => {
      try {
        if (!limiter.check(`host:ctrl:${socket.id}`, 10_000, 20)) {
          safeAck(ack, {
            ok: false,
            code: 'RATE_LIMITED',
            message: 'Çok fazla kontrol isteği gönderildi.',
          });
          return;
        }
        const teacherId = await requireAuthenticatedHostTeacherId(socket);
        const { pin, hostToken } = hostAttachSchema.parse(payload);
        const res = gameManager.hostResumeQuestion(pin, hostToken, teacherId);
        safeAck(ack, { ok: true, ...res });
      } catch (error) {
        safeAck(ack, toAckError(error));
      }
    });

    socket.on('host:set_presenter_focus', async (payload, ack) => {
      try {
        if (!limiter.check(`host:ctrl:${socket.id}`, 10_000, 25)) {
          safeAck(ack, {
            ok: false,
            code: 'RATE_LIMITED',
            message: 'Çok fazla kontrol isteği gönderildi.',
          });
          return;
        }
        const teacherId = await requireAuthenticatedHostTeacherId(socket);
        const { pin, hostToken, focus } = presenterFocusSchema.parse(payload);
        const res = gameManager.setPresenterFocus(pin, hostToken, teacherId, focus);
        safeAck(ack, { ok: true, ...res });
      } catch (error) {
        safeAck(ack, toAckError(error));
      }
    });

    socket.on('host:rotate_presenter_token', async (payload, ack) => {
      try {
        if (!limiter.check(`host:ctrl:${socket.id}`, 10_000, 15)) {
          safeAck(ack, {
            ok: false,
            code: 'RATE_LIMITED',
            message: 'Çok fazla kontrol isteği gönderildi.',
          });
          return;
        }
        const teacherId = await requireAuthenticatedHostTeacherId(socket);
        const { pin, hostToken } = hostAttachSchema.parse(payload);
        const res = gameManager.rotatePresenterToken(pin, hostToken, teacherId);
        safeAck(ack, { ok: true, ...res });
      } catch (error) {
        safeAck(ack, toAckError(error));
      }
    });

    socket.on('host:start_game', async (payload, ack) => {
      try {
        if (!limiter.check(`host:ctrl:${socket.id}`, 10_000, 20)) {
          safeAck(ack, {
            ok: false,
            code: 'RATE_LIMITED',
            message: 'Çok fazla kontrol isteği gönderildi.',
          });
          return;
        }
        const teacherId = await requireAuthenticatedHostTeacherId(socket);
        const { pin, hostToken } = hostAttachSchema.parse(payload);
        await gameManager.startGame(pin, hostToken, teacherId);
        safeAck(ack, { ok: true });
      } catch (error) {
        safeAck(ack, toAckError(error));
      }
    });

    socket.on('host:end_question', async (payload, ack) => {
      try {
        if (!limiter.check(`host:ctrl:${socket.id}`, 10_000, 20)) {
          safeAck(ack, {
            ok: false,
            code: 'RATE_LIMITED',
            message: 'Çok fazla kontrol isteği gönderildi.',
          });
          return;
        }
        const teacherId = await requireAuthenticatedHostTeacherId(socket);
        const { pin, hostToken } = hostAttachSchema.parse(payload);
        gameManager.hostEndQuestion(pin, hostToken, teacherId);
        safeAck(ack, { ok: true });
      } catch (error) {
        safeAck(ack, toAckError(error));
      }
    });

    socket.on('host:next_question', async (payload, ack) => {
      try {
        if (!limiter.check(`host:ctrl:${socket.id}`, 10_000, 20)) {
          safeAck(ack, {
            ok: false,
            code: 'RATE_LIMITED',
            message: 'Çok fazla kontrol isteği gönderildi.',
          });
          return;
        }
        const teacherId = await requireAuthenticatedHostTeacherId(socket);
        const { pin, hostToken } = hostAttachSchema.parse(payload);
        await gameManager.nextQuestion(pin, hostToken, teacherId);
        safeAck(ack, { ok: true });
      } catch (error) {
        safeAck(ack, toAckError(error));
      }
    });

    socket.on('host:kick_player', async (payload, ack) => {
      try {
        if (!limiter.check(`host:kick:${socket.id}`, 10_000, 30)) {
          safeAck(ack, {
            ok: false,
            code: 'RATE_LIMITED',
            message: 'Çok fazla işlem isteği gönderildi.',
          });
          return;
        }
        const teacherId = await requireAuthenticatedHostTeacherId(socket);
        const { pin, hostToken, participantId } = hostKickSchema.parse(payload);
        gameManager.kickPlayer(pin, hostToken, participantId, teacherId);
        safeAck(ack, { ok: true });
      } catch (error) {
        safeAck(ack, toAckError(error));
      }
    });

    socket.on('host:cancel_game', async (payload, ack) => {
      try {
        const teacherId = await requireAuthenticatedHostTeacherId(socket);
        const { pin, hostToken } = hostAttachSchema.parse(payload);
        await gameManager.cancelGame(pin, hostToken, teacherId);
        safeAck(ack, { ok: true });
      } catch (error) {
        safeAck(ack, toAckError(error));
      }
    });

    socket.on('host:end_game', async (payload, ack) => {
      try {
        if (!limiter.check(`host:ctrl:${socket.id}`, 10_000, 20)) {
          safeAck(ack, {
            ok: false,
            code: 'RATE_LIMITED',
            message: 'Çok fazla kontrol isteği gönderildi.',
          });
          return;
        }
        const teacherId = await requireAuthenticatedHostTeacherId(socket);
        const { pin, hostToken } = hostAttachSchema.parse(payload);
        await gameManager.hostEndGame(pin, hostToken, teacherId);
        safeAck(ack, { ok: true });
      } catch (error) {
        safeAck(ack, toAckError(error));
      }
    });

    socket.on('player:join', async (payload, ack) => {
      try {
        if (!limiter.check(`player:join:${socket.id}`, 10_000, 10)) {
          safeAck(ack, {
            ok: false,
            code: 'RATE_LIMITED',
            message: 'Çok fazla katılım denemesi. Lütfen birkaç saniye bekleyin.',
          });
          return;
        }

        const { pin, nickname } = playerJoinSchema.parse(payload);
        const result = gameManager.joinPlayer(pin, nickname, socket.id);

        socket.data.role = 'player';
        socket.data.pin = pin;
        socket.data.participantId = result.participantId;

        await socket.join(gameManager.roomChannel(pin));
        safeAck(ack, {
          ok: true,
          reconnectToken: result.reconnectToken,
          snapshot: result.snapshot,
        });
      } catch (error) {
        safeAck(ack, toAckError(error));
      }
    });

    socket.on('player:reconnect', async (payload, ack) => {
      try {
        if (!limiter.check(`player:reconnect:${socket.id}`, 10_000, 15)) {
          safeAck(ack, {
            ok: false,
            code: 'RATE_LIMITED',
            message: 'Çok fazla yeniden bağlanma denemesi.',
          });
          return;
        }

        const { pin, reconnectToken } = playerReconnectSchema.parse(payload);
        const result = gameManager.reconnectPlayer(pin, reconnectToken, socket.id);

        socket.data.role = 'player';
        socket.data.pin = pin;
        socket.data.participantId = result.participantId;

        await socket.join(gameManager.roomChannel(pin));
        safeAck(ack, {
          ok: true,
          snapshot: result.snapshot,
        });
      } catch (error) {
        safeAck(ack, toAckError(error));
      }
    });

    socket.on('player:submit_answer', (payload, ack) => {
      try {
        if (!limiter.check(`player:answer:${socket.id}`, 10_000, 20)) {
          safeAck(ack, {
            ok: false,
            code: 'RATE_LIMITED',
            message: 'Çok hızlı cevap gönderimi engellendi.',
          });
          return;
        }

        const { pin, questionIndex, optionId, optionIds, orderedOptionIds } =
          submitAnswerSchema.parse(payload);

        if (
          socket.data.role !== 'player' ||
          !socket.data.participantId ||
          socket.data.pin !== pin
        ) {
          safeAck(ack, {
            ok: false,
            code: 'UNAUTHORIZED_PLAYER',
            message: 'Bu odada aktif bir oyuncu oturumunuz bulunmuyor.',
          });
          return;
        }

        const accepted = gameManager.submitAnswer(
          pin,
          socket.data.participantId,
          questionIndex,
          { optionId, optionIds, orderedOptionIds },
        );
        safeAck(ack, { ok: true, ...accepted });
      } catch (error) {
        safeAck(ack, toAckError(error));
      }
    });

    socket.on('disconnect', () => {
      gameManager.handleDisconnect(socket.id);
    });
  });
}
