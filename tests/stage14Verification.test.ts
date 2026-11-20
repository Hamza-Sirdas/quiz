import './testDbEnv';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { io as ioClient, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  ClientToServerEvents,
  CreateGameResponse,
  FinishedPayload,
  HostSessionSnapshot,
  PlayerSessionSnapshot,
  PresenterSessionSnapshot,
  QuestionResultPayload,
  ServerToClientEvents,
  SocketAck,
} from '@shared/gameTypes';
import { createServerApp } from '../server/app';
import { prisma } from '../server/lib/prisma';
import { UPLOADS_DIR } from '../server/middleware/upload';

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const VALID_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0x50,
  0x0f, 0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd,
  0x8d, 0xb0, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
  0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

function parseCookies(res: Response): { cookieHeader: string; rawSetCookies: string[] } {
  const rawSetCookies =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie') ?? ''].filter(Boolean);

  const cookieHeader = rawSetCookies
    .map((line) => line.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');

  return { cookieHeader, rawSetCookies };
}

function connectSocket(baseUrl: string, cookie?: string): Promise<TestSocket> {
  return new Promise((resolve, reject) => {
    const socket: TestSocket = ioClient(baseUrl, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: cookie ? { Cookie: cookie } : undefined,
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => reject(err));
  });
}

function emitAck<T extends object = object>(
  socket: TestSocket,
  event: keyof ClientToServerEvents,
  payload: unknown,
): Promise<SocketAck<T>> {
  return new Promise((resolve) => {
    (
      socket as unknown as {
        emit: (e: string, p: unknown, cb: (r: SocketAck<T>) => void) => void;
      }
    ).emit(event, payload, (ackRes) => resolve(ackRes));
  });
}

function waitForEvent<T>(
  socket: TestSocket,
  eventName: keyof ServerToClientEvents,
  predicate?: (payload: T) => boolean,
  timeoutMs = 8000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, handler as never);
      reject(new Error(`Timeout waiting for ${String(eventName)}`));
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

async function registerTeacher(
  baseUrl: string,
  name: string,
  email: string,
  password: string,
) {
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
    teacher: { id: string; email: string };
    csrfToken: string;
  };
  const { cookieHeader, rawSetCookies } = parseCookies(res);
  return {
    teacherId: body.teacher.id,
    email: body.teacher.email,
    cookie: cookieHeader,
    rawSetCookies,
    csrfToken: body.csrfToken,
  };
}

describe('Aşama 14: Oyun Senkronizasyonu, Puanlama Doğruluğu, Bağlantı Kurtarma ve Güvenlik Matrisi', () => {
  const { httpServer, gameManager, io } = createServerApp({
    countdownMs: 90,
    questionGraceMs: 40,
    maxPlayers: 60,
  });

  let baseUrl = '';
  let teacherA!: Awaited<ReturnType<typeof registerTeacher>>;
  let teacherB!: Awaited<ReturnType<typeof registerTeacher>>;
  const createdTeacherIds: string[] = [];
  const createdQuizIds: string[] = [];
  const createdSessionIds: string[] = [];
  const uploadedFilesToRemove: string[] = [];
  const activeSockets: TestSocket[] = [];

  const trackSocket = (s: TestSocket) => {
    activeSockets.push(s);
    return s;
  };

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = httpServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    teacherA = await registerTeacher(
      baseUrl,
      'Stage14 Öğretmen A',
      `stage14-a-${suffix}@quizora.local`,
      'GucluSifre123!',
    );
    teacherB = await registerTeacher(
      baseUrl,
      'Stage14 Öğretmen B',
      `stage14-b-${suffix}@quizora.local`,
      'GucluSifre123!',
    );
    createdTeacherIds.push(teacherA.teacherId, teacherB.teacherId);
  });

  afterAll(async () => {
    for (const sock of activeSockets) {
      sock.removeAllListeners();
      sock.disconnect();
    }
    for (const relUrl of uploadedFilesToRemove) {
      await fs.promises
        .unlink(path.join(UPLOADS_DIR, path.basename(relUrl)))
        .catch(() => undefined);
    }

    gameManager.dispose();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    if (httpServer.listening) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }

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

  it('senkronizasyon, saat farkı bağışıklığı, süre dolumu, 4 soru türü puanlama matrisi, istemci sahteciliği reddi ve beraberlik bozmayı doğrular', async () => {
    // Soru 1 için 1sn süre dolum testi amacıyla doğrudan Prisma ile quiz oluşturulur
    const quiz = await prisma.quiz.create({
      data: {
        ownerId: teacherA.teacherId,
        status: 'PUBLISHED',
        visibility: 'PRIVATE',
        title: 'Stage 14 Puanlama ve Senkronizasyon Quizi',
        description: 'Tüm soru türleri ve puanlama kenar durumları',
        category: 'Fen Bilimleri',
        questions: {
          create: [
            {
              order: 1,
              type: 'MULTIPLE_CHOICE',
              text: 'Soru 1 (Çoktan Seçmeli): Suyun kimyasal formülü nedir?',
              timeLimitSec: 1,
              points: 1000,
              options: {
                create: [
                  { order: 1, text: 'CO2', isCorrect: false },
                  { order: 2, text: 'H2O', isCorrect: true },
                  { order: 3, text: 'O2', isCorrect: false },
                  { order: 4, text: 'NaCl', isCorrect: false },
                ],
              },
            },
            {
              order: 2,
              type: 'TRUE_FALSE',
              text: 'Soru 2 (Doğru/Yanlış): Dünya Güneş etrafında döner.',
              timeLimitSec: 10,
              points: 1000,
              options: {
                create: [
                  { order: 1, text: 'Doğru', isCorrect: true },
                  { order: 2, text: 'Yanlış', isCorrect: false },
                ],
              },
            },
            {
              order: 3,
              type: 'MULTI_SELECT',
              text: 'Soru 3 (Çoklu Doğru - Kısmi Açık): Asal sayıları seçin.',
              allowPartialCredit: true,
              timeLimitSec: 10,
              points: 1000,
              options: {
                create: [
                  { order: 1, text: '2', isCorrect: true },
                  { order: 2, text: '3', isCorrect: true },
                  { order: 3, text: '4', isCorrect: false },
                  { order: 4, text: '9', isCorrect: false },
                ],
              },
            },
            {
              order: 4,
              type: 'MULTI_SELECT',
              text: 'Soru 4 (Çoklu Doğru - Kısmi Kapalı): Çift sayıları seçin.',
              allowPartialCredit: false,
              timeLimitSec: 10,
              points: 1000,
              options: {
                create: [
                  { order: 1, text: '2', isCorrect: true },
                  { order: 2, text: '6', isCorrect: true },
                  { order: 3, text: '3', isCorrect: false },
                  { order: 4, text: '5', isCorrect: false },
                ],
              },
            },
            {
              order: 5,
              type: 'ORDERING',
              text: 'Soru 5 (Sıralama): Küçükten büyüğe sıralayın.',
              timeLimitSec: 10,
              points: 1000,
              options: {
                create: [
                  { order: 1, text: 'Birinci (10)', isCorrect: true },
                  { order: 2, text: 'İkinci (20)', isCorrect: true },
                  { order: 3, text: 'Üçüncü (30)', isCorrect: true },
                ],
              },
            },
          ],
        },
      },
      include: {
        questions: {
          orderBy: { order: 'asc' },
          include: { options: { orderBy: { order: 'asc' } } },
        },
      },
    });
    createdQuizIds.push(quiz.id);

    const createGameRes = await fetch(`${baseUrl}/api/games`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: teacherA.cookie,
        'X-CSRF-Token': teacherA.csrfToken,
      },
      body: JSON.stringify({ quizId: quiz.id, classroomMode: true }),
    });
    expect(createGameRes.status).toBe(201);
    const created = (await createGameRes.json()) as CreateGameResponse;
    createdSessionIds.push(created.sessionId);

    const hostSock = trackSocket(await connectSocket(baseUrl, teacherA.cookie));
    const p1Sock = trackSocket(await connectSocket(baseUrl));
    const p2Sock = trackSocket(await connectSocket(baseUrl));
    const p3Sock = trackSocket(await connectSocket(baseUrl));

    const hostAttach = await emitAck<{ snapshot: HostSessionSnapshot }>(
      hostSock,
      'host:attach',
      { pin: created.pin, hostToken: created.hostToken },
    );
    expect(hostAttach.ok).toBe(true);

    // Farklı cihaz saatleri simülasyonu (+30sn ve -30sn clientSentMs -> sunucu her zaman Date.now() döner)
    const syncFuture = await new Promise<{ clientSentMs: number; serverNowMs: number }>(
      (resolve) => {
        p1Sock.emit('time:sync', { clientSentMs: Date.now() + 30_000 }, resolve);
      },
    );
    const syncPast = await new Promise<{ clientSentMs: number; serverNowMs: number }>(
      (resolve) => {
        p2Sock.emit('time:sync', { clientSentMs: Date.now() - 30_000 }, resolve);
      },
    );
    expect(Math.abs(syncFuture.serverNowMs - syncPast.serverNowMs)).toBeLessThan(200);

    const j1 = await emitAck<{ reconnectToken: string; snapshot: PlayerSessionSnapshot }>(
      p1Sock,
      'player:join',
      { pin: created.pin, nickname: 'Hizli_TamPuan' },
    );
    const j2 = await emitAck<{ reconnectToken: string; snapshot: PlayerSessionSnapshot }>(
      p2Sock,
      'player:join',
      { pin: created.pin, nickname: 'Kismi_ve_SureDoldu' },
    );
    const j3 = await emitAck<{ reconnectToken: string; snapshot: PlayerSessionSnapshot }>(
      p3Sock,
      'player:join',
      { pin: created.pin, nickname: 'Yanlis_ve_Bos' },
    );
    expect(j1.ok && j2.ok && j3.ok).toBe(true);

    // Soru 1 (timeLimitSec = 1): aynı soruyu görme ve süre dolumu kontrolü
    const q1StartedPromise = Promise.all([
      waitForEvent<{
        question: { index: number; text: string; options: Array<{ id: string; text: string }> };
        questionEndsAtMs: number;
      }>(p1Sock, 'game:question_started'),
      waitForEvent<{
        question: { index: number; text: string; options: Array<{ id: string; text: string }> };
        questionEndsAtMs: number;
      }>(p2Sock, 'game:question_started'),
      waitForEvent<{
        question: { index: number; text: string; options: Array<{ id: string; text: string }> };
        questionEndsAtMs: number;
      }>(p3Sock, 'game:question_started'),
    ]);

    const startAck = await emitAck(hostSock, 'host:start_game', {
      pin: created.pin,
      hostToken: created.hostToken,
    });
    expect(startAck.ok).toBe(true);

    const [q1P1, q1P2, q1P3] = await q1StartedPromise;
    expect(q1P1.question.index).toBe(0);
    expect(q1P2.question.index).toBe(0);
    expect(q1P3.question.index).toBe(0);
    expect(q1P1.questionEndsAtMs).toBe(q1P2.questionEndsAtMs);
    expect(q1P2.questionEndsAtMs).toBe(q1P3.questionEndsAtMs);

    const mcCorrectId = quiz.questions[0]!.options.find((o) => o.text === 'H2O')!.id;
    const mcWrongId = quiz.questions[0]!.options.find((o) => o.text === 'CO2')!.id;

    // P1 doğru cevap gönderir VE istemciden sahte puan alanları enjekte etmeyi dener
    const p1AnswerAck = await emitAck(p1Sock, 'player:submit_answer', {
      pin: created.pin,
      questionIndex: 0,
      optionId: mcCorrectId,
      score: 999999,
      pointsAwarded: 999999,
      isCorrect: true,
    });
    expect(p1AnswerAck.ok).toBe(true);

    // Aynı cevabın tekrar gönderilmesi kesinlikle reddedilmeli
    const p1DupAck = await emitAck(p1Sock, 'player:submit_answer', {
      pin: created.pin,
      questionIndex: 0,
      optionId: mcCorrectId,
    });
    expect(p1DupAck.ok).toBe(false);
    if (!p1DupAck.ok) {
      expect(p1DupAck.code).toBe('ALREADY_ANSWERED');
    }

    // P3 yanlış cevap gönderir
    const p3AnswerAck = await emitAck(p3Sock, 'player:submit_answer', {
      pin: created.pin,
      questionIndex: 0,
      optionId: mcWrongId,
    });
    expect(p3AnswerAck.ok).toBe(true);

    // P2 cevap vermeden Question 1 süresinin (1000ms + 40ms grace) sunucuda doğal dolmasını bekler
    const [q1ResHost, q1ResP1, q1ResP2] = await Promise.all([
      waitForEvent<QuestionResultPayload>(hostSock, 'game:question_result'),
      waitForEvent<QuestionResultPayload>(p1Sock, 'game:question_result'),
      waitForEvent<QuestionResultPayload>(p2Sock, 'game:question_result'),
    ]);

    // Süre dolduktan sonra P2 geç cevap göndermeyi dener -> reddedilmeli
    const p2LateAck = await emitAck(p2Sock, 'player:submit_answer', {
      pin: created.pin,
      questionIndex: 0,
      optionId: mcCorrectId,
    });
    expect(p2LateAck.ok).toBe(false);

    // İstemcinin gönderdiği 999999 puanı yok sayılmış olmalı (sunucu max 1000 verir)
    expect(q1ResP1.personalResult?.pointsAwarded).toBeGreaterThanOrEqual(500);
    expect(q1ResP1.personalResult?.pointsAwarded).toBeLessThanOrEqual(1000);
    expect(q1ResP1.personalResult?.totalScore).toBeLessThanOrEqual(1000);
    expect(q1ResP2.personalResult?.answered).toBe(false);
    expect(q1ResP2.personalResult?.pointsAwarded).toBe(0);
    expect(q1ResHost.leaderboard.map((e) => e.participantId)).toEqual(
      q1ResP1.leaderboard.map((e) => e.participantId),
    );

    // Soru 2 (TRUE_FALSE): P1 doğru, P2 yanlış, P3 boş bırakır
    const q2StartWait = waitForEvent<{ question: { index: number } }>(
      p1Sock,
      'game:question_started',
    );
    expect(
      (
        await emitAck(hostSock, 'host:next_question', {
          pin: created.pin,
          hostToken: created.hostToken,
        })
      ).ok,
    ).toBe(true);
    const q2Start = await q2StartWait;
    expect(q2Start.question.index).toBe(1);

    const tfCorrectId = quiz.questions[1]!.options.find((o) => o.isCorrect)!.id;
    const tfWrongId = quiz.questions[1]!.options.find((o) => !o.isCorrect)!.id;

    expect(
      (
        await emitAck(p1Sock, 'player:submit_answer', {
          pin: created.pin,
          questionIndex: 1,
          optionId: tfCorrectId,
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await emitAck(p2Sock, 'player:submit_answer', {
          pin: created.pin,
          questionIndex: 1,
          optionId: tfWrongId,
        })
      ).ok,
    ).toBe(true);

    const q2EndWait = waitForEvent<QuestionResultPayload>(p2Sock, 'game:question_result');
    expect(
      (
        await emitAck(hostSock, 'host:end_question', {
          pin: created.pin,
          hostToken: created.hostToken,
        })
      ).ok,
    ).toBe(true);
    const q2ResP2 = await q2EndWait;
    expect(q2ResP2.personalResult?.isCorrect).toBe(false);
    expect(q2ResP2.personalResult?.pointsAwarded).toBe(0);

    // Soru 3 (MULTI_SELECT + allowPartialCredit: true)
    const q3StartWait = waitForEvent<{ question: { index: number } }>(
      p1Sock,
      'game:question_started',
    );
    await emitAck(hostSock, 'host:next_question', {
      pin: created.pin,
      hostToken: created.hostToken,
    });
    expect((await q3StartWait).question.index).toBe(2);

    const q3Opts = quiz.questions[2]!.options;
    const q3Two = q3Opts.find((o) => o.text === '2')!.id;
    const q3Three = q3Opts.find((o) => o.text === '3')!.id;
    const q3Four = q3Opts.find((o) => o.text === '4')!.id;

    const q3ResWait = Promise.all([
      waitForEvent<QuestionResultPayload>(p1Sock, 'game:question_result'),
      waitForEvent<QuestionResultPayload>(p2Sock, 'game:question_result'),
      waitForEvent<QuestionResultPayload>(p3Sock, 'game:question_result'),
    ]);

    await emitAck(p1Sock, 'player:submit_answer', {
      pin: created.pin,
      questionIndex: 2,
      optionIds: [q3Two, q3Three],
    });
    await emitAck(p2Sock, 'player:submit_answer', {
      pin: created.pin,
      questionIndex: 2,
      optionIds: [q3Two],
    });
    await emitAck(p3Sock, 'player:submit_answer', {
      pin: created.pin,
      questionIndex: 2,
      optionIds: [q3Two, q3Four],
    });

    const [q3R1, q3R2, q3R3] = await q3ResWait;
    expect(q3R1.personalResult?.isCorrect).toBe(true);
    expect(q3R1.personalResult?.pointsAwarded).toBeGreaterThanOrEqual(500);
    expect(q3R2.personalResult?.isCorrect).toBe(false);
    expect(q3R2.personalResult?.isPartial).toBe(true);
    expect(q3R2.personalResult?.pointsAwarded).toBeGreaterThan(0);
    expect(q3R2.personalResult?.pointsAwarded).toBeLessThan(
      q3R1.personalResult!.pointsAwarded,
    );
    expect(q3R3.personalResult?.isCorrect).toBe(false);
    expect(q3R3.personalResult?.pointsAwarded).toBe(0);

    // Soru 4 (MULTI_SELECT + allowPartialCredit: false)
    const q4StartWait = waitForEvent<{ question: { index: number } }>(
      p1Sock,
      'game:question_started',
    );
    await emitAck(hostSock, 'host:next_question', {
      pin: created.pin,
      hostToken: created.hostToken,
    });
    expect((await q4StartWait).question.index).toBe(3);

    const q4Opts = quiz.questions[3]!.options;
    const q4Two = q4Opts.find((o) => o.text === '2')!.id;
    const q4Six = q4Opts.find((o) => o.text === '6')!.id;
    const q4Three = q4Opts.find((o) => o.text === '3')!.id;

    const q4ResWait = Promise.all([
      waitForEvent<QuestionResultPayload>(p1Sock, 'game:question_result'),
      waitForEvent<QuestionResultPayload>(p2Sock, 'game:question_result'),
      waitForEvent<QuestionResultPayload>(p3Sock, 'game:question_result'),
    ]);

    await emitAck(p1Sock, 'player:submit_answer', {
      pin: created.pin,
      questionIndex: 3,
      optionIds: [q4Two, q4Six],
    });
    await emitAck(p2Sock, 'player:submit_answer', {
      pin: created.pin,
      questionIndex: 3,
      optionIds: [q4Two],
    });
    await emitAck(p3Sock, 'player:submit_answer', {
      pin: created.pin,
      questionIndex: 3,
      optionIds: [q4Three],
    });

    const [q4R1, q4R2] = await q4ResWait;
    expect(q4R1.personalResult?.isCorrect).toBe(true);
    expect(q4R1.personalResult?.pointsAwarded).toBeGreaterThanOrEqual(500);
    expect(q4R2.personalResult?.isCorrect).toBe(false);
    expect(q4R2.personalResult?.isPartial).toBe(false);
    expect(q4R2.personalResult?.pointsAwarded).toBe(0);

    // Soru 5 (ORDERING)
    const q5StartWait = waitForEvent<{ question: { index: number } }>(
      p1Sock,
      'game:question_started',
    );
    await emitAck(hostSock, 'host:next_question', {
      pin: created.pin,
      hostToken: created.hostToken,
    });
    expect((await q5StartWait).question.index).toBe(4);

    const q5Opts = quiz.questions[4]!.options;
    const o10 = q5Opts.find((o) => o.text.includes('10'))!.id;
    const o20 = q5Opts.find((o) => o.text.includes('20'))!.id;
    const o30 = q5Opts.find((o) => o.text.includes('30'))!.id;

    const q5ResWait = Promise.all([
      waitForEvent<QuestionResultPayload>(p1Sock, 'game:question_result'),
      waitForEvent<QuestionResultPayload>(p2Sock, 'game:question_result'),
      waitForEvent<QuestionResultPayload>(p3Sock, 'game:question_result'),
    ]);

    await emitAck(p1Sock, 'player:submit_answer', {
      pin: created.pin,
      questionIndex: 4,
      orderedOptionIds: [o10, o20, o30],
    });
    await emitAck(p2Sock, 'player:submit_answer', {
      pin: created.pin,
      questionIndex: 4,
      orderedOptionIds: [o10, o30, o20],
    });
    await emitAck(p3Sock, 'player:submit_answer', {
      pin: created.pin,
      questionIndex: 4,
      orderedOptionIds: [o20, o30, o10],
    });

    const [q5R1, q5R2, q5R3] = await q5ResWait;
    expect(q5R1.personalResult?.isCorrect).toBe(true);
    expect(q5R1.personalResult?.pointsAwarded).toBeGreaterThanOrEqual(500);
    expect(q5R2.personalResult?.isCorrect).toBe(false);
    expect(q5R2.personalResult?.isPartial).toBe(false);
    expect(q5R2.personalResult?.pointsAwarded).toBe(0);
    expect(q5R3.personalResult?.pointsAwarded).toBe(0);

    // Yarışmayı tamamla ve veritabanındaki tüm puanları doğrula
    const finishedWait = waitForEvent<FinishedPayload>(hostSock, 'game:finished');
    await emitAck(hostSock, 'host:next_question', {
      pin: created.pin,
      hostToken: created.hostToken,
    });
    const finished = await finishedWait;
    expect(finished.leaderboard[0]?.nickname).toBe('Hizli_TamPuan');
    expect(finished.leaderboard[1]?.nickname).toBe('Kismi_ve_SureDoldu');
    expect(finished.leaderboard[2]?.nickname).toBe('Yanlis_ve_Bos');
    expect(finished.leaderboard[2]?.score).toBe(0);

    const dbResults = await prisma.gameResult.findMany({
      where: { sessionId: created.sessionId },
      orderBy: { rank: 'asc' },
    });
    expect(dbResults).toHaveLength(3);
    expect(dbResults[0]?.totalScore).toBe(finished.leaderboard[0]?.score);

    // Eşit puana sahip oyuncular için beraberlik bozma
    const { calculateAnswerPoints, rankParticipants } = await import(
      '../server/game/scoringService'
    );
    const rankedTie = rankParticipants([
      {
        id: 'slow',
        nickname: 'Yavas',
        score: calculateAnswerPoints({
          basePoints: 1000,
          isCorrect: true,
          remainingMs: 7000,
          totalDurationMs: 10000,
        }),
        correctCount: 1,
        wrongCount: 0,
        totalResponseMs: 3200,
        joinedAtMs: 100,
        lastDelta: 850,
      },
      {
        id: 'fast',
        nickname: 'Hizli',
        score: calculateAnswerPoints({
          basePoints: 1000,
          isCorrect: true,
          remainingMs: 7000,
          totalDurationMs: 10000,
        }),
        correctCount: 1,
        wrongCount: 0,
        totalResponseMs: 1400,
        joinedAtMs: 200,
        lastDelta: 850,
      },
    ]);
    expect(rankedTie.map((r) => r.participantId)).toEqual(['fast', 'slow']);
  });

  it('öğrenci, öğretmen ve projeksiyon bağlantı kopması + yeniden bağlanma kurtarmasını doğrular', async () => {
    const quizRes = await fetch(`${baseUrl}/api/quizzes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: teacherA.cookie,
        'X-CSRF-Token': teacherA.csrfToken,
      },
      body: JSON.stringify({
        status: 'PUBLISHED',
        title: 'Bağlantı Kurtarma Test Quizi',
        category: 'Teknoloji',
        questions: [
          {
            type: 'MULTIPLE_CHOICE',
            text: 'Soru 1?',
            timeLimitSec: 20,
            points: 1000,
            options: [
              { text: 'Doğru', isCorrect: true },
              { text: 'Yanlış', isCorrect: false },
            ],
          },
          {
            type: 'MULTIPLE_CHOICE',
            text: 'Soru 2?',
            timeLimitSec: 20,
            points: 1000,
            options: [
              { text: 'A', isCorrect: true },
              { text: 'B', isCorrect: false },
            ],
          },
        ],
      }),
    });
    expect(quizRes.status).toBe(201);
    const { quiz } = (await quizRes.json()) as {
      quiz: {
        id: string;
        questions: Array<{ options: Array<{ id: string; isCorrect: boolean }> }>;
      };
    };
    createdQuizIds.push(quiz.id);

    const createGame = await fetch(`${baseUrl}/api/games`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: teacherA.cookie,
        'X-CSRF-Token': teacherA.csrfToken,
      },
      body: JSON.stringify({ quizId: quiz.id, classroomMode: true }),
    });
    const created = (await createGame.json()) as CreateGameResponse;
    createdSessionIds.push(created.sessionId);

    const hostSock1 = trackSocket(await connectSocket(baseUrl, teacherA.cookie));
    const presSock1 = trackSocket(await connectSocket(baseUrl));
    const stuSock1 = trackSocket(await connectSocket(baseUrl));

    await emitAck(hostSock1, 'host:attach', {
      pin: created.pin,
      hostToken: created.hostToken,
    });
    await emitAck(presSock1, 'presenter:attach', {
      pin: created.pin,
      presenterToken: created.presenterToken,
    });
    const joinRes = await emitAck<{
      reconnectToken: string;
      snapshot: PlayerSessionSnapshot;
    }>(stuSock1, 'player:join', {
      pin: created.pin,
      nickname: 'KopupBaglanan',
    });
    expect(joinRes.ok).toBe(true);
    const reconnectToken = joinRes.ok ? joinRes.reconnectToken : '';
    const originalParticipantId = joinRes.ok ? joinRes.snapshot.participantId : '';

    const q1Wait = waitForEvent(stuSock1, 'game:question_started');
    await emitAck(hostSock1, 'host:start_game', {
      pin: created.pin,
      hostToken: created.hostToken,
    });
    await q1Wait;

    // Öğrenci S1'de doğru cevap verir -> sonra öğrenci, öğretmen ve projeksiyon bağlantıyı keser
    await emitAck(stuSock1, 'player:submit_answer', {
      pin: created.pin,
      questionIndex: 0,
      optionId: quiz.questions[0]!.options.find((o) => o.isCorrect)!.id,
    });
    await waitForEvent(hostSock1, 'game:question_result');

    stuSock1.disconnect();
    hostSock1.disconnect();
    presSock1.disconnect();

    // Tümü yeni soketle tekrar bağlanır
    const stuSock2 = trackSocket(await connectSocket(baseUrl));
    const hostSock2 = trackSocket(await connectSocket(baseUrl, teacherA.cookie));
    const presSock2 = trackSocket(await connectSocket(baseUrl));

    const stuReconn = await emitAck<{ snapshot: PlayerSessionSnapshot }>(
      stuSock2,
      'player:reconnect',
      { pin: created.pin, reconnectToken },
    );
    expect(stuReconn.ok).toBe(true);
    if (stuReconn.ok) {
      expect(stuReconn.snapshot.participantId).toBe(originalParticipantId);
      expect(stuReconn.snapshot.score).toBeGreaterThan(0);
      expect(stuReconn.snapshot.phase).toBe('QUESTION_RESULT');
    }

    const hostReconn = await emitAck<{ snapshot: HostSessionSnapshot }>(
      hostSock2,
      'host:attach',
      { pin: created.pin, hostToken: created.hostToken },
    );
    expect(hostReconn.ok).toBe(true);
    if (hostReconn.ok) {
      expect(hostReconn.snapshot.participants).toHaveLength(1);
      expect(hostReconn.snapshot.phase).toBe('QUESTION_RESULT');
    }

    const presReconn = await emitAck<{ snapshot: PresenterSessionSnapshot }>(
      presSock2,
      'presenter:attach',
      { pin: created.pin, presenterToken: created.presenterToken },
    );
    expect(presReconn.ok).toBe(true);
    if (presReconn.ok) {
      expect(presReconn.snapshot.phase).toBe('QUESTION_RESULT');
    }

    // Kurtarma sonrası öğretmen 2. soruyu açabilmeli ve yarışma normal bitmeli
    const q2Wait = waitForEvent(stuSock2, 'game:question_started');
    const nextRes = await emitAck(hostSock2, 'host:next_question', {
      pin: created.pin,
      hostToken: created.hostToken,
    });
    expect(nextRes.ok).toBe(true);
    await q2Wait;

    const finishWait = waitForEvent<FinishedPayload>(hostSock2, 'game:finished');
    await emitAck(stuSock2, 'player:submit_answer', {
      pin: created.pin,
      questionIndex: 1,
      optionId: quiz.questions[1]!.options.find((o) => o.isCorrect)!.id,
    });
    await waitForEvent(hostSock2, 'game:question_result');
    await emitAck(hostSock2, 'host:next_question', {
      pin: created.pin,
      hostToken: created.hostToken,
    });
    const fin = await finishWait;
    expect(fin.leaderboard).toHaveLength(1);
    expect(fin.leaderboard[0]?.participantId).toBe(originalParticipantId);
  });

  it('12 maddelik kapsamlı güvenlik matrisini yerel test ortamında doğrular', async () => {
    // (12) Oturum ve çerez güvenliği (HttpOnly + SameSite + CSRF koruması + logout invalidation)
    const sessionCookieLine = teacherA.rawSetCookies.find((c) =>
      c.startsWith('quizora_session='),
    );
    expect(sessionCookieLine).toBeDefined();
    expect(sessionCookieLine).toMatch(/HttpOnly/i);
    expect(sessionCookieLine).toMatch(/SameSite=Lax/i);

    const noCsrfMutation = await fetch(`${baseUrl}/api/quizzes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: teacherA.cookie,
      },
      body: JSON.stringify({ title: 'CSRF Yok', category: 'Genel', questions: [] }),
    });
    expect(noCsrfMutation.status).toBe(403);

    // (1) Yetkisiz öğretmen işlemleri (oturumsuz -> 401)
    expect((await fetch(`${baseUrl}/api/quizzes`)).status).toBe(401);
    expect(
      (
        await fetch(`${baseUrl}/api/games`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quizId: 'abc' }),
        })
      ).status,
    ).toBe(401);
    expect((await fetch(`${baseUrl}/api/games/history`)).status).toBe(401);

    // Öğretmen A quiz ve oyun oluşturur
    const createQuiz = await fetch(`${baseUrl}/api/quizzes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: teacherA.cookie,
        'X-CSRF-Token': teacherA.csrfToken,
      },
      body: JSON.stringify({
        status: 'PUBLISHED',
        title: 'Güvenlik Test Quizi',
        category: 'Tarih',
        questions: [
          {
            type: 'MULTIPLE_CHOICE',
            text: 'Güvenlik test sorusu?',
            timeLimitSec: 15,
            points: 1000,
            options: [
              { text: 'Doğru', isCorrect: true },
              { text: 'Yanlış', isCorrect: false },
            ],
          },
        ],
      }),
    });
    const { quiz } = (await createQuiz.json()) as {
      quiz: {
        id: string;
        questions: Array<{ id: string; options: Array<{ id: string }> }>;
      };
    };
    createdQuizIds.push(quiz.id);

    const startRes = await fetch(`${baseUrl}/api/games`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: teacherA.cookie,
        'X-CSRF-Token': teacherA.csrfToken,
      },
      body: JSON.stringify({ quizId: quiz.id }),
    });
    const createdGame = (await startRes.json()) as CreateGameResponse;
    createdSessionIds.push(createdGame.sessionId);

    // (2) Başka öğretmenin quizine erişim, düzenleme ve oyun başlatma reddi
    expect(
      (await fetch(`${baseUrl}/api/quizzes/${quiz.id}`, { headers: { Cookie: teacherB.cookie } }))
        .status,
    ).toBe(404);
    expect(
      (
        await fetch(`${baseUrl}/api/quizzes/${quiz.id}`, {
          method: 'DELETE',
          headers: { Cookie: teacherB.cookie, 'X-CSRF-Token': teacherB.csrfToken },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await fetch(`${baseUrl}/api/games`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: teacherB.cookie,
            'X-CSRF-Token': teacherB.csrfToken,
          },
          body: JSON.stringify({ quizId: quiz.id }),
        })
      ).status,
    ).toBe(404);

    // (3) Başka öğretmenin yarışma sonuçlarına/analizine/CSV/PDF'ine erişim reddi
    for (const suffixPath of ['', '/analytics', '/csv', '/pdf']) {
      const r = await fetch(
        `${baseUrl}/api/games/history/${createdGame.sessionId}${suffixPath}`,
        { headers: { Cookie: teacherB.cookie } },
      );
      expect(r.status).toBe(404);
    }

    // (4) Geçersiz PIN denemeleri
    expect((await fetch(`${baseUrl}/api/games/validate/000000`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/api/games/validate/abc`)).status).toBe(400);

    // (5) Sahte Socket.IO olayları + (8) Geçersiz soru/seçenek kimlikleri
    const attackerSocket = trackSocket(await connectSocket(baseUrl));
    const playerJoin = await emitAck<{
      reconnectToken: string;
      snapshot: PlayerSessionSnapshot;
    }>(attackerSocket, 'player:join', {
      pin: createdGame.pin,
      nickname: 'GuvenlikOyuncu',
    });
    expect(playerJoin.ok).toBe(true);

    const forgedStart = await emitAck(attackerSocket, 'host:start_game', {
      pin: createdGame.pin,
      hostToken: createdGame.hostToken,
    });
    expect(forgedStart.ok).toBe(false);

    const forgedEnd = await emitAck(attackerSocket, 'host:end_game', {
      pin: createdGame.pin,
      hostToken: 'sahte-host-token-en-az-16-karakter',
    });
    expect(forgedEnd.ok).toBe(false);

    const hostSocket = trackSocket(await connectSocket(baseUrl, teacherA.cookie));
    await emitAck(hostSocket, 'host:attach', {
      pin: createdGame.pin,
      hostToken: createdGame.hostToken,
    });
    const qStartWait = waitForEvent(attackerSocket, 'game:question_started');
    await emitAck(hostSocket, 'host:start_game', {
      pin: createdGame.pin,
      hostToken: createdGame.hostToken,
    });
    await qStartWait;

    const invalidOptionAck = await emitAck(attackerSocket, 'player:submit_answer', {
      pin: createdGame.pin,
      questionIndex: 0,
      optionId: 'non-existent-option-id-999',
    });
    expect(invalidOptionAck.ok).toBe(false);

    const invalidQIndexAck = await emitAck(attackerSocket, 'player:submit_answer', {
      pin: createdGame.pin,
      questionIndex: 99,
      optionId: quiz.questions[0]!.options[0]!.id,
    });
    expect(invalidQIndexAck.ok).toBe(false);

    // Oyunu temiz bitir
    const finWait = waitForEvent(hostSocket, 'game:finished');
    await emitAck(hostSocket, 'host:end_game', {
      pin: createdGame.pin,
      hostToken: createdGame.hostToken,
    });
    await finWait;

    // (9) Dosya yükleme doğrulaması: sahte magic-byte, SVG/HTML reddi, boyut aşımı, geçerli PNG kabul + nosniff
    const spoofForm = new FormData();
    spoofForm.append(
      'file',
      new Blob(['<html><script>alert(1)</script></html>'], { type: 'image/png' }),
      'spoof.png',
    );
    const spoofRes = await fetch(`${baseUrl}/api/uploads`, {
      method: 'POST',
      headers: { Cookie: teacherA.cookie, 'X-CSRF-Token': teacherA.csrfToken },
      body: spoofForm,
    });
    expect(spoofRes.status).toBe(400);

    const svgForm = new FormData();
    svgForm.append(
      'file',
      new Blob(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], {
        type: 'image/svg+xml',
      }),
      'xss.svg',
    );
    const svgRes = await fetch(`${baseUrl}/api/uploads`, {
      method: 'POST',
      headers: { Cookie: teacherA.cookie, 'X-CSRF-Token': teacherA.csrfToken },
      body: svgForm,
    });
    expect(svgRes.status).toBe(400);

    const bigBuffer = Buffer.alloc(5 * 1024 * 1024 + 512, 0xff);
    bigBuffer[0] = 0xff;
    bigBuffer[1] = 0xd8;
    bigBuffer[2] = 0xff;
    const bigForm = new FormData();
    bigForm.append('file', new Blob([bigBuffer], { type: 'image/jpeg' }), 'too-big.jpg');
    const bigRes = await fetch(`${baseUrl}/api/uploads`, {
      method: 'POST',
      headers: { Cookie: teacherA.cookie, 'X-CSRF-Token': teacherA.csrfToken },
      body: bigForm,
    });
    expect(bigRes.status).toBe(400);

    const validForm = new FormData();
    validForm.append('file', new Blob([VALID_PNG_BYTES], { type: 'image/png' }), 'ok.png');
    const validUpload = await fetch(`${baseUrl}/api/uploads`, {
      method: 'POST',
      headers: { Cookie: teacherA.cookie, 'X-CSRF-Token': teacherA.csrfToken },
      body: validForm,
    });
    expect(validUpload.status).toBe(201);
    const { url: uploadedUrl } = (await validUpload.json()) as { url: string };
    uploadedFilesToRemove.push(uploadedUrl);

    const fetchUploaded = await fetch(`${baseUrl}${uploadedUrl}`);
    expect(fetchUploaded.status).toBe(200);
    expect(fetchUploaded.headers.get('x-content-type-options')).toBe('nosniff');
    expect(fetchUploaded.headers.get('cache-control')).toContain('max-age=');

    // (11) Gizli API anahtarları sızmamalı
    const aiStatus = await fetch(`${baseUrl}/api/ai/status`, {
      headers: { Cookie: teacherA.cookie },
    });
    const aiText = await aiStatus.text();
    expect(aiText).not.toContain('AIza');
    expect(aiText).not.toContain('postgres://');

    const healthText = await (await fetch(`${baseUrl}/api/health`)).text();
    expect(healthText).not.toContain('DATABASE_URL');
    expect(healthText).not.toContain('GEMINI_API_KEY');

    // (10) API rate limiting doğrulaması (GET /api/games/validate/:pin 120 req/dk sonrası 429)
    let hit429 = false;
    for (let i = 0; i < 125; i += 1) {
      const r = await fetch(`${baseUrl}/api/games/validate/000000`);
      if (r.status === 429) {
        hit429 = true;
        break;
      }
    }
    expect(hit429).toBe(true);

    // (12b) Logout sonrası eski oturum çerezi iptal edilmiş olmalı
    const tempSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const tempTeacher = await registerTeacher(
      baseUrl,
      'Logout Test',
      `stage14-logout-${tempSuffix}@quizora.local`,
      'GucluSifre123!',
    );
    createdTeacherIds.push(tempTeacher.teacherId);

    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: tempTeacher.cookie,
        'X-CSRF-Token': tempTeacher.csrfToken,
      },
    });
    expect(logoutRes.status).toBe(200);
    const afterLogoutMe = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: tempTeacher.cookie },
    });
    expect(afterLogoutMe.status).toBe(401);
  });
});
