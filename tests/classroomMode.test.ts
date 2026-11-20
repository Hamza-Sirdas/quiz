import type { AddressInfo } from 'node:net';
import { io as ioClient, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  ClientToServerEvents,
  CreateGameResponse,
  HostSessionSnapshot,
  PlayerSessionSnapshot,
  PresenterResultFocus,
  PresenterSessionSnapshot,
  QuestionResultPayload,
  ServerToClientEvents,
  SocketAck,
} from '../shared/gameTypes';
import { createServerApp } from '../server/app';
import { prisma } from '../server/lib/prisma';

type TestClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

function connectSocket(
  baseUrl: string,
  cookie?: string,
): Promise<TestClientSocket> {
  return new Promise((resolve, reject) => {
    const socket: TestClientSocket = ioClient(baseUrl, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: cookie ? { Cookie: cookie } : undefined,
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => reject(err));
  });
}

function waitForEvent<T>(
  socket: TestClientSocket,
  eventName: keyof ServerToClientEvents,
  predicate?: (payload: T) => boolean,
  timeoutMs = 8000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, handler as never);
      reject(new Error(`Timeout waiting for socket event: ${String(eventName)}`));
    }, timeoutMs);

    const handler = (payload: T) => {
      if (!predicate || predicate(payload)) {
        clearTimeout(timer);
        socket.off(eventName, handler as never);
        resolve(payload);
      }
    };

    socket.on(eventName, handler as never);
  });
}

function emitAck<T extends object = object>(
  socket: TestClientSocket,
  event: keyof ClientToServerEvents,
  payload: unknown,
): Promise<SocketAck<T>> {
  return new Promise((resolve) => {
    (
      socket as unknown as {
        emit: (e: string, p: unknown, cb: (r: SocketAck<T>) => void) => void;
      }
    ).emit(event, payload, (res) => resolve(res));
  });
}

async function registerTestTeacher(
  baseUrl: string,
  name: string,
  email: string,
  password: string,
): Promise<{ teacherId: string; cookie: string; csrfToken: string }> {
  const res = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      email,
      password,
      passwordConfirm: password,
      acceptedTerms: true,
    }),
  });
  if (res.status !== 201) {
    throw new Error(`Register failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as {
    teacher: { id: string };
    csrfToken: string;
  };
  const cookieList =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie') ?? ''];
  const cookie = cookieList
    .map((c) => c.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');
  return { teacherId: body.teacher.id, cookie, csrfToken: body.csrfToken };
}

describe('Aşama 11: Sınıf Modu, Öğretmen Kontrol Merkezi, Projeksiyon Görünümü ve Soru Duraklatma Sistemi', () => {
  const { httpServer, gameManager, io } = createServerApp({
    countdownMs: 80,
    questionGraceMs: 40,
  });

  let baseUrl = '';
  let teacherId = '';
  let teacherCookie = '';
  let teacherCsrf = '';
  let quizId = '';

  const createdSessionIds: string[] = [];
  const createdQuizIds: string[] = [];
  const createdTeacherIds: string[] = [];
  const activeSockets: TestClientSocket[] = [];

  const trackSocket = (socket: TestClientSocket) => {
    activeSockets.push(socket);
    return socket;
  };

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = httpServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const t = await registerTestTeacher(
      baseUrl,
      'Sınıf Modu Öğretmeni',
      `sinif.modu.${suffix}@quizora.test`,
      'GucluSifre123',
    );
    teacherId = t.teacherId;
    teacherCookie = t.cookie;
    teacherCsrf = t.csrfToken;
    createdTeacherIds.push(teacherId);

    const quizRes = await fetch(`${baseUrl}/api/quizzes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: teacherCookie,
        'X-CSRF-Token': teacherCsrf,
      },
      body: JSON.stringify({
        title: 'Aşama 11 Sınıf Modu Quizi',
        description: 'Projeksiyon ve duraklatma doğrulama quizi',
        category: 'Fen Bilimleri',
        status: 'PUBLISHED',
        questions: [
          {
            type: 'MULTIPLE_CHOICE',
            text: 'Dünya kendi ekseni etrafında dönüşünü kaç saatte tamamlar?',
            explanation: '1 gün 24 saattir.',
            timeLimitSec: 10,
            points: 1000,
            options: [
              { text: '12 saat', isCorrect: false },
              { text: '24 saat', isCorrect: true },
              { text: '36 saat', isCorrect: false },
              { text: '48 saat', isCorrect: false },
            ],
          },
          {
            type: 'TRUE_FALSE',
            text: 'Ay Dünya\'nın doğal uydusudur.',
            timeLimitSec: 10,
            points: 1000,
            options: [
              { text: 'Doğru', isCorrect: true },
              { text: 'Yanlış', isCorrect: false },
            ],
          },
        ],
      }),
    });
    expect(quizRes.status).toBe(201);
    const quizBody = (await quizRes.json()) as { quiz: { id: string } };
    quizId = quizBody.quiz.id;
    createdQuizIds.push(quizId);
  });

  afterAll(async () => {
    for (const s of activeSockets) {
      if (s.connected) s.disconnect();
    }
    gameManager.dispose();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));

    if (createdSessionIds.length > 0) {
      await prisma.gameSession.deleteMany({
        where: { id: { in: createdSessionIds } },
      });
    }
    if (createdQuizIds.length > 0) {
      await prisma.quiz.deleteMany({
        where: { id: { in: createdQuizIds } },
      });
    }
    if (createdTeacherIds.length > 0) {
      await prisma.teacher.deleteMany({
        where: { id: { in: createdTeacherIds } },
      });
    }
    await prisma.$disconnect();
  });

  it('Sınıf modunda oturum açar, projeksiyon ekranını senkronize eder, yetkisiz kontrolü reddeder, soruyu duraklatıp devam ettirir ve bağlantısı kopan ekranları kurtarır', async () => {
    // 1. Sınıf modunda yarışma oluştur
    const createRes = await fetch(`${baseUrl}/api/games`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: teacherCookie,
        'X-CSRF-Token': teacherCsrf,
      },
      body: JSON.stringify({ quizId, classroomMode: true }),
    });
    expect(createRes.status).toBe(201);
    const game = (await createRes.json()) as CreateGameResponse;
    createdSessionIds.push(game.sessionId);

    expect(game.classroomMode).toBe(true);
    expect(game.presenterToken.length).toBeGreaterThanOrEqual(32);
    expect(game.presentPath).toContain(`/present/${game.pin}?token=`);

    // 2. Öğretmen, Projeksiyon ve 2 Öğrenci bağlanır
    const hostSocket = trackSocket(await connectSocket(baseUrl, teacherCookie));
    const presenterSocket = trackSocket(await connectSocket(baseUrl));
    const p1Socket = trackSocket(await connectSocket(baseUrl));
    const p2Socket = trackSocket(await connectSocket(baseUrl));

    const hostAttach = await emitAck<{ snapshot: HostSessionSnapshot }>(
      hostSocket,
      'host:attach',
      { pin: game.pin, hostToken: game.hostToken },
    );
    expect(hostAttach.ok).toBe(true);
    if (!hostAttach.ok) throw new Error(hostAttach.message);
    expect(hostAttach.snapshot.classroomMode).toBe(true);
    expect(hostAttach.snapshot.presenterToken).toBe(game.presenterToken);

    // Yanlış presenterToken ile projeksiyon bağlantısı reddedilmeli
    const badPresAttach = await emitAck<{ snapshot: PresenterSessionSnapshot }>(
      presenterSocket,
      'presenter:attach',
      { pin: game.pin, presenterToken: '00000000000000000000000000000000' },
    );
    expect(badPresAttach.ok).toBe(false);

    // Doğru presenterToken ile projeksiyon bağlanır
    const presAttach = await emitAck<{ snapshot: PresenterSessionSnapshot }>(
      presenterSocket,
      'presenter:attach',
      { pin: game.pin, presenterToken: game.presenterToken },
    );
    expect(presAttach.ok).toBe(true);

    // Projeksiyon soketi öğretmen kontrol komutu gönderemez (UNAUTHORIZED_HOST)
    const illegalPauseFromPresenter = await emitAck(
      presenterSocket,
      'host:pause_question',
      { pin: game.pin, hostToken: game.hostToken },
    );
    expect(illegalPauseFromPresenter.ok).toBe(false);
    if (!illegalPauseFromPresenter.ok) {
      expect(illegalPauseFromPresenter.code).toBe('UNAUTHORIZED_HOST');
    }

    // Öğrenciler katılır
    const p1Join = await emitAck<{
      reconnectToken: string;
      snapshot: PlayerSessionSnapshot;
    }>(p1Socket, 'player:join', {
      pin: game.pin,
      nickname: 'Elif Sınıf',
    });
    expect(p1Join.ok).toBe(true);

    const p2Join = await emitAck<{
      reconnectToken: string;
      snapshot: PlayerSessionSnapshot;
    }>(p2Socket, 'player:join', {
      pin: game.pin,
      nickname: 'Burak Sınıf',
    });
    expect(p2Join.ok).toBe(true);

    // 3. Yarışma başlatılır -> hem öğretmen hem projeksiyon hem öğrenciler Soru 1'i alır
    const q1HostPromise = waitForEvent<{
      question: { index: number; options: Array<{ id: string; text: string }> };
    }>(hostSocket, 'game:question_started');
    const q1PresPromise = waitForEvent<{
      question: { index: number; options: Array<{ id: string; text: string }> };
    }>(presenterSocket, 'game:question_started');

    const startRes = await emitAck(hostSocket, 'host:start_game', {
      pin: game.pin,
      hostToken: game.hostToken,
    });
    expect(startRes.ok).toBe(true);

    const [q1Host, q1Pres] = await Promise.all([q1HostPromise, q1PresPromise]);
    expect(q1Host.question.index).toBe(0);
    expect(q1Pres.question.index).toBe(0);
    // Soru devam ederken doğru cevap sızdırılmamalı
    expect('isCorrect' in (q1Pres.question.options[0] ?? {})).toBe(false);

    // Aynı yarışmanın yanlışlıkla ikinci kez başlatılması engellenmeli
    const duplicateStartRes = await emitAck(hostSocket, 'host:start_game', {
      pin: game.pin,
      hostToken: game.hostToken,
    });
    expect(duplicateStartRes.ok).toBe(false);

    // 4. Öğrenci 1 cevap verir -> hem öğretmen hem projeksiyon anlık cevap sayısını (1 / 2) alır
    const correctOpt = q1Host.question.options.find(
      (o) => o.text === '24 saat',
    )!;
    const progressPresPromise = waitForEvent<{
      questionIndex: number;
      answeredCount: number;
      connectedCount: number;
    }>(
      presenterSocket,
      'game:answer_progress',
      (p) => p.answeredCount === 1,
    );

    const ans1 = await emitAck(p1Socket, 'player:submit_answer', {
      pin: game.pin,
      questionIndex: 0,
      optionId: correctOpt.id,
    });
    expect(ans1.ok).toBe(true);

    const presProgress = await progressPresPromise;
    expect(presProgress.answeredCount).toBe(1);
    expect(presProgress.connectedCount).toBe(2);

    // 5. Öğretmen soruyu duraklatır -> sunucu zamanlayıcısı durur ve duraklatma sırasında cevap kabul edilmez
    const pausedEventPromise = waitForEvent<{
      questionIndex: number;
      pausedRemainingMs: number;
    }>(presenterSocket, 'game:question_paused');

    const pauseRes = await emitAck<{
      questionIndex: number;
      pausedRemainingMs: number;
    }>(hostSocket, 'host:pause_question', {
      pin: game.pin,
      hostToken: game.hostToken,
    });
    expect(pauseRes.ok).toBe(true);
    const pausedEv = await pausedEventPromise;
    expect(pausedEv.questionIndex).toBe(0);
    expect(pausedEv.pausedRemainingMs).toBeGreaterThan(1000);

    // Duraklatma sırasında Öğrenci 2 cevap göndermeye çalışırsa QUESTION_PAUSED ile reddedilir
    const pausedSubmit = await emitAck(p2Socket, 'player:submit_answer', {
      pin: game.pin,
      questionIndex: 0,
      optionId: correctOpt.id,
    });
    expect(pausedSubmit.ok).toBe(false);
    if (!pausedSubmit.ok) {
      expect(pausedSubmit.code).toBe('QUESTION_PAUSED');
    }

    // 6. Öğretmen ve Projeksiyon bağlantısı kopup yeniden bağlandığında duraklatılmış durumu korur
    hostSocket.disconnect();
    presenterSocket.disconnect();

    const reconnectedHost = trackSocket(
      await connectSocket(baseUrl, teacherCookie),
    );
    const reconnectedPres = trackSocket(await connectSocket(baseUrl));

    const reHostAttach = await emitAck<{ snapshot: HostSessionSnapshot }>(
      reconnectedHost,
      'host:attach',
      { pin: game.pin, hostToken: game.hostToken },
    );
    expect(reHostAttach.ok).toBe(true);
    if (reHostAttach.ok) {
      expect(reHostAttach.snapshot.isPaused).toBe(true);
      expect(reHostAttach.snapshot.answeredCount).toBe(1);
    }

    const rePresAttach = await emitAck<{ snapshot: PresenterSessionSnapshot }>(
      reconnectedPres,
      'presenter:attach',
      { pin: game.pin, presenterToken: game.presenterToken },
    );
    expect(rePresAttach.ok).toBe(true);
    if (rePresAttach.ok) {
      expect(rePresAttach.snapshot.isPaused).toBe(true);
      expect(rePresAttach.snapshot.currentQuestion?.index).toBe(0);
    }

    // 7. Öğretmen soruyu devam ettirir -> Öğrenci 2 artık cevabını gönderebilir
    const resumeRes = await emitAck<{
      questionIndex: number;
      questionEndsAtMs: number;
    }>(reconnectedHost, 'host:resume_question', {
      pin: game.pin,
      hostToken: game.hostToken,
    });
    expect(resumeRes.ok).toBe(true);

    const q1ResultPresPromise = waitForEvent<QuestionResultPayload>(
      reconnectedPres,
      'game:question_result',
    );

    const ans2 = await emitAck(p2Socket, 'player:submit_answer', {
      pin: game.pin,
      questionIndex: 0,
      optionId: correctOpt.id,
    });
    expect(ans2.ok).toBe(true);

    const q1ResultPres = await q1ResultPresPromise;
    expect(q1ResultPres.exactCorrectCount).toBe(2);
    expect(q1ResultPres.leaderboard.length).toBeLessThanOrEqual(10);

    // 8. Öğretmen projeksiyonda Liderlik Tablosu görünümüne geçiş yapar
    const focusPromise = waitForEvent<{ focus: PresenterResultFocus }>(
      reconnectedPres,
      'game:presenter_focus',
    );
    const focusRes = await emitAck<{ focus: PresenterResultFocus }>(
      reconnectedHost,
      'host:set_presenter_focus',
      { pin: game.pin, hostToken: game.hostToken, focus: 'LEADERBOARD' },
    );
    expect(focusRes.ok).toBe(true);
    const focusEv = await focusPromise;
    expect(focusEv.focus).toBe('LEADERBOARD');

    // 9. Öğretmen projeksiyon belirtecini yeniler/iptal eder -> açık projeksiyon soketi presenter:revoked alır
    const revokedPromise = waitForEvent<{ message: string }>(
      reconnectedPres,
      'presenter:revoked',
    );
    const rotateRes = await emitAck<{ presenterToken: string }>(
      reconnectedHost,
      'host:rotate_presenter_token',
      { pin: game.pin, hostToken: game.hostToken },
    );
    expect(rotateRes.ok).toBe(true);
    const revokedEv = await revokedPromise;
    expect(revokedEv.message).toContain('Projeksiyon');
  });
});
