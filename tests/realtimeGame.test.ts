import type { AddressInfo } from 'node:net';
import { io as ioClient, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  ClientToServerEvents,
  CreateGameResponse,
  FinishedPayload,
  GameHistoryDetail,
  GameHistorySummary,
  HostSessionSnapshot,
  PlayerSessionSnapshot,
  QuestionResultPayload,
  ServerToClientEvents,
  SocketAck,
  ValidatePinResponse,
} from '@shared/gameTypes';
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
    (socket as unknown as { emit: (e: string, p: unknown, cb: (r: SocketAck<T>) => void) => void }).emit(
      event,
      payload,
      (res) => resolve(res),
    );
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
  const body = (await res.json()) as { teacher: { id: string }; csrfToken: string };
  const cookieList =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie') ?? ''];
  const cookie = cookieList
    .map((c) => c.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');
  if (!cookie || !body.csrfToken) {
    throw new Error('Auth cookies/CSRF missing from /api/auth/register');
  }
  return { teacherId: body.teacher.id, cookie, csrfToken: body.csrfToken };
}

describe('Gerçek Zamanlı Çok Oyunculu Yarışma Sistemi (Socket.IO + PostgreSQL)', () => {
  const { httpServer, gameManager, io } = createServerApp({
    countdownMs: 120,
    questionGraceMs: 40,
    maxPlayers: 60,
  });

  let baseUrl = '';
  let teacherAId = '';
  let teacherACookie = '';
  let teacherACsrf = '';
  let teacherBCookie = '';
  let teacherBCsrf = '';
  const createdQuizIds: string[] = [];
  const createdSessionIds: string[] = [];
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

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const a = await registerTestTeacher(
      baseUrl,
      'Öğretmen A',
      `teacher-a-${suffix}@quizora.local`,
      'GucluSifre123!',
    );
    teacherAId = a.teacherId;
    teacherACookie = a.cookie;
    teacherACsrf = a.csrfToken;
    createdTeacherIds.push(a.teacherId);

    const b = await registerTestTeacher(
      baseUrl,
      'Öğretmen B',
      `teacher-b-${suffix}@quizora.local`,
      'GucluSifre123!',
    );
    teacherBCookie = b.cookie;
    teacherBCsrf = b.csrfToken;
    createdTeacherIds.push(b.teacherId);
  });

  afterAll(async () => {
    for (const sock of activeSockets) {
      sock.removeAllListeners();
      sock.disconnect();
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

  it('kimlik doğrulama, sahiplik izolasyonu ve sağlık kontrolünü doğrular', async () => {
    const healthRes = await fetch(`${baseUrl}/api/health`);
    expect(healthRes.status).toBe(200);
    const healthJson = (await healthRes.json()) as {
      ok: boolean;
      database: string;
    };
    expect(healthJson.ok).toBe(true);
    expect(healthJson.database).toBe('connected');

    // Oturumsuz erişim 401 döndürmeli
    expect((await fetch(`${baseUrl}/api/quizzes`)).status).toBe(401);
    expect((await fetch(`${baseUrl}/api/dashboard/summary`)).status).toBe(401);
    expect((await fetch(`${baseUrl}/api/games/history`)).status).toBe(401);
    expect(
      (
        await fetch(`${baseUrl}/api/games`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quizId: 'non-existent' }),
        })
      ).status,
    ).toBe(401);

    // Öğretmen A quiz oluşturur -> Öğretmen B erişemez (404)
    const quizRes = await fetch(`${baseUrl}/api/quizzes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: teacherACookie,
        'X-CSRF-Token': teacherACsrf,
      },
      body: JSON.stringify({
        title: 'Yetki İzolasyon Quizi',
        description: 'Sahiplik testi',
        category: 'Fen',
        questions: [
          {
            text: 'Su kaç derecede kaynar?',
            timeLimitSec: 20,
            points: 1000,
            options: [
              { text: '100', isCorrect: true },
              { text: '50', isCorrect: false },
              { text: '0', isCorrect: false },
              { text: '150', isCorrect: false },
            ],
          },
        ],
      }),
    });
    expect(quizRes.status).toBe(201);
    const { quiz } = (await quizRes.json()) as { quiz: { id: string } };
    createdQuizIds.push(quiz.id);

    const bGetQuiz = await fetch(`${baseUrl}/api/quizzes/${quiz.id}`, {
      headers: { Cookie: teacherBCookie },
    });
    expect(bGetQuiz.status).toBe(404);

    const bDeleteQuiz = await fetch(`${baseUrl}/api/quizzes/${quiz.id}`, {
      method: 'DELETE',
      headers: { Cookie: teacherBCookie, 'X-CSRF-Token': teacherBCsrf },
    });
    expect(bDeleteQuiz.status).toBe(404);

    const bCreateGame = await fetch(`${baseUrl}/api/games`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: teacherBCookie,
        'X-CSRF-Token': teacherBCsrf,
      },
      body: JSON.stringify({ quizId: quiz.id }),
    });
    expect(bCreateGame.status).toBe(404);
  });

  it('35 eşzamanlı oyuncu ile lobi, güvenlik, geri sayım, senkronize sorular, puanlama, yeniden bağlanma, dondurulmuş snapshot ve DB kaydını yürütür', async () => {
    // Test için 2 sorulu quiz oluştur (Öğretmen A'ya ait)
    const quiz = await prisma.quiz.create({
      data: {
        ownerId: teacherAId,
        title: 'E2E Canlı Yarışma Quizi',
        description: '35 eşzamanlı oyuncu doğrulama quizi',
        category: 'Coğrafya',
        questions: {
          create: [
            {
              order: 1,
              text: 'Türkiye Cumhuriyeti başkenti hangisidir?',
              timeLimitSec: 15,
              points: 1000,
              options: {
                create: [
                  { order: 1, text: 'İstanbul', isCorrect: false },
                  { order: 2, text: 'Ankara', isCorrect: true },
                  { order: 3, text: 'İzmir', isCorrect: false },
                  { order: 4, text: 'Bursa', isCorrect: false },
                ],
              },
            },
            {
              order: 2,
              text: 'Dünyanın en yüksek dağı hangisidir?',
              timeLimitSec: 15,
              points: 1000,
              options: {
                create: [
                  { order: 1, text: 'Everest', isCorrect: true },
                  { order: 2, text: 'Ağrı', isCorrect: false },
                  { order: 3, text: 'Mont Blanc', isCorrect: false },
                  { order: 4, text: 'K2', isCorrect: false },
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

    // 1. Öğretmen oyun oturumu oluşturur + benzersiz 6 haneli PIN ve QR yolu alır
    const createRes = await fetch(`${baseUrl}/api/games`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: teacherACookie,
        'X-CSRF-Token': teacherACsrf,
      },
      body: JSON.stringify({ quizId: quiz.id }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as CreateGameResponse;
    createdSessionIds.push(created.sessionId);

    expect(created.pin).toMatch(/^\d{6}$/);
    expect(created.joinPath).toBe(`/join?pin=${created.pin}`);
    expect(created.hostToken.length).toBeGreaterThanOrEqual(32);

    // 2. PIN doğrulama (geçerli ve geçersiz)
    const validPinRes = await fetch(`${baseUrl}/api/games/validate/${created.pin}`);
    expect(validPinRes.status).toBe(200);
    const validPinData = (await validPinRes.json()) as ValidatePinResponse;
    expect(validPinData.valid).toBe(true);
    expect(validPinData.questionCount).toBe(2);

    const invalidPinRes = await fetch(`${baseUrl}/api/games/validate/000000`);
    expect(invalidPinRes.status).toBe(404);

    // Öğretmen B oturum çereziyle bile Öğretmen A'nın odasına host olarak bağlanamaz
    const rogueTeacherSocket = trackSocket(await connectSocket(baseUrl, teacherBCookie));
    const crossTeacherAttach = await emitAck(rogueTeacherSocket, 'host:attach', {
      pin: created.pin,
      hostToken: created.hostToken,
    });
    expect(crossTeacherAttach.ok).toBe(false);
    if (!crossTeacherAttach.ok) {
      expect(crossTeacherAttach.code).toBe('UNAUTHORIZED_HOST');
    }

    // Oturum çerezi olmayan soket hostToken bilse dahi öğretmen yetkisi alamaz
    const unauthSocket = trackSocket(await connectSocket(baseUrl));
    const unauthAttach = await emitAck(unauthSocket, 'host:attach', {
      pin: created.pin,
      hostToken: created.hostToken,
    });
    expect(unauthAttach.ok).toBe(false);
    if (!unauthAttach.ok) {
      expect(unauthAttach.code).toBe('UNAUTHORIZED_HOST');
    }

    // Öğretmen A yetkili soketini bağlar
    const hostSocket = trackSocket(await connectSocket(baseUrl, teacherACookie));
    const hostAttach = await emitAck<{ snapshot: HostSessionSnapshot }>(
      hostSocket,
      'host:attach',
      { pin: created.pin, hostToken: created.hostToken },
    );
    expect(hostAttach.ok).toBe(true);

    // 3. 35 eşzamanlı gerçek Socket.IO oyuncusu odaya katılır
    const PLAYER_COUNT = 35;
    const playerSockets = await Promise.all(
      Array.from({ length: PLAYER_COUNT }, () => connectSocket(baseUrl).then(trackSocket)),
    );

    const joinResults = await Promise.all(
      playerSockets.map((sock, idx) =>
        emitAck<{ reconnectToken: string; snapshot: PlayerSessionSnapshot }>(
          sock,
          'player:join',
          { pin: created.pin, nickname: `Ogrenci_${idx + 1}` },
        ),
      ),
    );

    const playerTokens = joinResults.map((res) => {
      expect(res.ok).toBe(true);
      if (!res.ok) throw new Error(res.message);
      return res.reconnectToken;
    });

    // 4. Aynı odada aynı kullanıcı adıyla (büyük/küçük harf duyarsız) katılım reddedilir
    const dupSocket = trackSocket(await connectSocket(baseUrl));
    const dupRes = await emitAck(dupSocket, 'player:join', {
      pin: created.pin,
      nickname: 'ogrenci_1',
    });
    expect(dupRes.ok).toBe(false);
    if (!dupRes.ok) {
      expect(dupRes.code).toBe('DUPLICATE_NICKNAME');
    }

    // 5. Yetkisiz öğretmen işlemleri (PIN bilinse bile geçersiz token ile) engellenir
    const rogueStart = await emitAck(dupSocket, 'host:start_game', {
      pin: created.pin,
      hostToken: 'wrong-token-1234567890123456',
    });
    expect(rogueStart.ok).toBe(false);
    if (!rogueStart.ok) {
      expect(rogueStart.code).toBe('UNAUTHORIZED_HOST');
    }

    // Öğretmenin geçici oyuncu ekleyip bekleme odasından çıkarması (kick)
    const tempKickSocket = trackSocket(await connectSocket(baseUrl));
    const tempJoin = await emitAck<{
      reconnectToken: string;
      snapshot: PlayerSessionSnapshot;
    }>(tempKickSocket, 'player:join', {
      pin: created.pin,
      nickname: 'Cikarilacak',
    });
    expect(tempJoin.ok).toBe(true);
    if (!tempJoin.ok) throw new Error(tempJoin.message);

    const kickedEventPromise = waitForEvent<{ message: string }>(
      tempKickSocket,
      'player:kicked',
    );
    const kickAck = await emitAck(hostSocket, 'host:kick_player', {
      pin: created.pin,
      hostToken: created.hostToken,
      participantId: tempJoin.snapshot.participantId,
    });
    expect(kickAck.ok).toBe(true);
    await kickedEventPromise;

    // 6. Yarışma başlatılır -> oda kapanır -> geri sayım ve 1. soru senkronize yayınlanır
    const q1HostPromise = waitForEvent<{
      question: {
        index: number;
        options: Array<{ id: string; text: string; isCorrect?: unknown }>;
      };
    }>(hostSocket, 'game:question_started');

    const q1PlayerPromises = playerSockets.map((sock) =>
      waitForEvent<{
        question: {
          index: number;
          options: Array<{ id: string; text: string; isCorrect?: unknown }>;
        };
      }>(sock, 'game:question_started'),
    );

    const startRes = await emitAck(hostSocket, 'host:start_game', {
      pin: created.pin,
      hostToken: created.hostToken,
    });
    expect(startRes.ok).toBe(true);

    // Oyun başladıktan sonra yeni katılımcı reddedilir
    const lateJoin = await emitAck(dupSocket, 'player:join', {
      pin: created.pin,
      nickname: 'GecKalan',
    });
    expect(lateJoin.ok).toBe(false);
    if (!lateJoin.ok) {
      expect(lateJoin.code).toBe('ROOM_CLOSED');
    }

    // Kaynak quizi şimdi DB'de değiştir -> dondurulmuş snapshot bozulmamalı
    await prisma.quiz.update({
      where: { id: quiz.id },
      data: { title: 'Degistirilmis Baslik' },
    });

    await q1HostPromise;
    const q1Events = await Promise.all(q1PlayerPromises);

    // Öğrenciye giden soruda asla isCorrect alanı olmamalı
    for (const opt of q1Events[0].question.options) {
      expect(opt.isCorrect).toBeUndefined();
    }

    const q1CorrectOptionId = quiz.questions[0].options.find((o) => o.isCorrect)!.id;
    const q1WrongOptionId = quiz.questions[0].options.find((o) => !o.isCorrect)!.id;

    // 7. Oyuncu 0 hızlı doğru cevap gönderir, oyuncu 1 biraz sonra doğru gönderir, kalanlar yanlış gönderir
    const fastAnswer = await emitAck(playerSockets[0], 'player:submit_answer', {
      pin: created.pin,
      questionIndex: 0,
      optionId: q1CorrectOptionId,
    });
    expect(fastAnswer.ok).toBe(true);

    // Aynı oyuncunun aynı soruya 2. kez cevap vermesi engellenir
    const duplicateAnswer = await emitAck(playerSockets[0], 'player:submit_answer', {
      pin: created.pin,
      questionIndex: 0,
      optionId: q1WrongOptionId,
    });
    expect(duplicateAnswer.ok).toBe(false);
    if (!duplicateAnswer.ok) {
      expect(duplicateAnswer.code).toBe('ALREADY_ANSWERED');
    }

    // 8. Oyuncu 0'ın bağlantısı kopar ve reconnectToken ile geri bağlanır (cevabı kilitli kalır)
    playerSockets[0].disconnect();
    const reconnectedPlayer0 = trackSocket(await connectSocket(baseUrl));
    const reconnectAck = await emitAck<{ snapshot: PlayerSessionSnapshot }>(
      reconnectedPlayer0,
      'player:reconnect',
      { pin: created.pin, reconnectToken: playerTokens[0] },
    );
    expect(reconnectAck.ok).toBe(true);
    if (reconnectAck.ok) {
      expect(reconnectAck.snapshot.hasAnsweredCurrent).toBe(true);
      expect(reconnectAck.snapshot.selectedOptionId).toBe(q1CorrectOptionId);
      expect(reconnectAck.snapshot.quizTitle).toBe('E2E Canlı Yarışma Quizi');
    }
    playerSockets[0] = reconnectedPlayer0;

    // Öğrenci tekrar cevap göndermeyi denerse yine reddedilir
    const postReconnectDup = await emitAck(
      reconnectedPlayer0,
      'player:submit_answer',
      { pin: created.pin, questionIndex: 0, optionId: q1WrongOptionId },
    );
    expect(postReconnectDup.ok).toBe(false);

    // Kalan 34 oyuncudan: Oyuncu 1 doğru (biraz gecikmeli), diğer 33 yanlış gönderir
    await new Promise((r) => setTimeout(r, 80));

    const q1ResultHostPromise = waitForEvent<QuestionResultPayload>(
      hostSocket,
      'game:question_result',
    );
    const q1ResultPlayer0Promise = waitForEvent<QuestionResultPayload>(
      playerSockets[0],
      'game:question_result',
    );

    const remainingQ1Promises = playerSockets.slice(1).map((sock, idx) =>
      emitAck(sock, 'player:submit_answer', {
        pin: created.pin,
        questionIndex: 0,
        optionId: idx === 0 ? q1CorrectOptionId : q1WrongOptionId,
      }),
    );
    const remainingQ1Acks = await Promise.all(remainingQ1Promises);
    for (const ack of remainingQ1Acks) {
      expect(ack.ok).toBe(true);
    }

    const q1HostResult = await q1ResultHostPromise;
    const q1P0Result = await q1ResultPlayer0Promise;

    expect(q1HostResult.correctOptionId).toBe(q1CorrectOptionId);
    expect(q1HostResult.leaderboard).toHaveLength(PLAYER_COUNT);
    expect(q1HostResult.leaderboard[0]?.nickname).toBe('Ogrenci_1');
    expect(q1HostResult.leaderboard[0]?.score).toBeGreaterThanOrEqual(
      q1HostResult.leaderboard[1]?.score ?? 0,
    );
    expect(q1P0Result.personalResult?.isCorrect).toBe(true);
    expect(q1P0Result.personalResult?.pointsAwarded).toBeGreaterThan(0);
    expect(q1P0Result.leaderboard.length).toBeLessThanOrEqual(10);

    // 9. Öğretmen bağlantısı kopup yeniden bağlanınca oyun durumu korunur
    hostSocket.disconnect();
    const reconnectedHost = trackSocket(await connectSocket(baseUrl, teacherACookie));
    const hostReattach = await emitAck<{ snapshot: HostSessionSnapshot }>(
      reconnectedHost,
      'host:attach',
      { pin: created.pin, hostToken: created.hostToken },
    );
    expect(hostReattach.ok).toBe(true);
    if (hostReattach.ok) {
      expect(hostReattach.snapshot.phase).toBe('QUESTION_RESULT');
      expect(hostReattach.snapshot.quizTitle).toBe('E2E Canlı Yarışma Quizi');
    }

    // 10. 2. soruya geç -> tüm 35 oyuncu cevaplasın -> yarışma bitsin
    const q2PlayerPromises = playerSockets.map((sock) =>
      waitForEvent(sock, 'game:question_started'),
    );
    const nextRes = await emitAck(reconnectedHost, 'host:next_question', {
      pin: created.pin,
      hostToken: created.hostToken,
    });
    expect(nextRes.ok).toBe(true);
    await Promise.all(q2PlayerPromises);

    const q2CorrectOptionId = quiz.questions[1].options.find((o) => o.isCorrect)!.id;
    const q2WrongOptionId = quiz.questions[1].options.find((o) => !o.isCorrect)!.id;

    const q2ResultHostPromise = waitForEvent<QuestionResultPayload>(
      reconnectedHost,
      'game:question_result',
    );
    await Promise.all(
      playerSockets.map((sock, idx) =>
        emitAck(sock, 'player:submit_answer', {
          pin: created.pin,
          questionIndex: 1,
          optionId: idx < 5 ? q2CorrectOptionId : q2WrongOptionId,
        }),
      ),
    );
    await q2ResultHostPromise;

    const finishHostPromise = waitForEvent<FinishedPayload>(
      reconnectedHost,
      'game:finished',
    );
    const finishP0Promise = waitForEvent<FinishedPayload>(
      playerSockets[0],
      'game:finished',
    );

    const finishNextAck = await emitAck(reconnectedHost, 'host:next_question', {
      pin: created.pin,
      hostToken: created.hostToken,
    });
    expect(finishNextAck.ok).toBe(true);

    const hostFinished = await finishHostPromise;
    const p0Finished = await finishP0Promise;

    expect(hostFinished.podium).toHaveLength(3);
    expect(hostFinished.leaderboard).toHaveLength(PLAYER_COUNT);
    expect(p0Finished.leaderboard.length).toBeLessThanOrEqual(20);
    expect(p0Finished.personalResult?.rank).toBe(hostFinished.leaderboard[0]?.rank);

    // Yarışma bittikten sonra gelen geç cevap reddedilir
    const afterFinishAnswer = await emitAck(playerSockets[0], 'player:submit_answer', {
      pin: created.pin,
      questionIndex: 1,
      optionId: q2CorrectOptionId,
    });
    expect(afterFinishAnswer.ok).toBe(false);

    // 11. Veritabanında sonuçların ve geçmiş API'nin kaydedildiği (ve Öğretmen B'ye sızmadığı) doğrulanır
    const historyRes = await fetch(`${baseUrl}/api/games/history`, {
      headers: { Cookie: teacherACookie },
    });
    expect(historyRes.status).toBe(200);
    const historyJson = (await historyRes.json()) as { history: GameHistorySummary[] };
    const matched = historyJson.history.find((h) => h.id === created.sessionId);
    expect(matched).toBeDefined();
    expect(matched?.status).toBe('FINISHED');
    expect(matched?.quizTitle).toBe('E2E Canlı Yarışma Quizi');
    expect(matched?.winner?.nickname).toBe(hostFinished.podium[0]?.nickname);

    const bHistoryRes = await fetch(`${baseUrl}/api/games/history`, {
      headers: { Cookie: teacherBCookie },
    });
    expect(bHistoryRes.status).toBe(200);
    const bHistoryJson = (await bHistoryRes.json()) as { history: GameHistorySummary[] };
    expect(bHistoryJson.history.find((h) => h.id === created.sessionId)).toBeUndefined();

    const detailRes = await fetch(`${baseUrl}/api/games/history/${created.sessionId}`, {
      headers: { Cookie: teacherACookie },
    });
    expect(detailRes.status).toBe(200);
    const detailJson = (await detailRes.json()) as { session: GameHistoryDetail };
    expect(detailJson.session.results).toHaveLength(PLAYER_COUNT);

    const bDetailRes = await fetch(`${baseUrl}/api/games/history/${created.sessionId}`, {
      headers: { Cookie: teacherBCookie },
    });
    expect(bDetailRes.status).toBe(404);

    // 12. CSV dışa aktarma uç noktası kimlik doğrulama, sahiplik ve DB tutarlılığını doğrular
    const unauthCsv = await fetch(`${baseUrl}/api/games/history/${created.sessionId}/csv`);
    expect(unauthCsv.status).toBe(401);

    const bCsv = await fetch(`${baseUrl}/api/games/history/${created.sessionId}/csv`, {
      headers: { Cookie: teacherBCookie },
    });
    expect(bCsv.status).toBe(404);

    const csvRes = await fetch(`${baseUrl}/api/games/history/${created.sessionId}/csv`, {
      headers: { Cookie: teacherACookie },
    });
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers.get('content-type')).toContain('text/csv');
    const csvBytes = Buffer.from(await csvRes.arrayBuffer());
    expect(csvBytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(true);
    const csvText = csvBytes.toString('utf8');
    expect(csvText).toContain('"Ogrenci_1"');
    expect(csvText).toContain('"2","0","0","2"');
    expect(csvText).toContain('"0","2","0","2"');
  });

  it('yetkili öğretmen host:end_game ile yarışmayı erken sonlandırır, yetkisiz çağrıyı reddeder', async () => {
    const twoQQuiz = await prisma.quiz.create({
      data: {
        ownerId: teacherAId,
        title: 'Erken Bitirme Test Quizi',
        description: '',
        category: 'Bilim',
        questions: {
          create: [
            {
              order: 1,
              text: 'Birinci soru?',
              timeLimitSec: 15,
              points: 1000,
              options: {
                create: [
                  { order: 1, text: 'Doğru 1', isCorrect: true },
                  { order: 2, text: 'Yanlış 1', isCorrect: false },
                  { order: 3, text: 'Yanlış 2', isCorrect: false },
                  { order: 4, text: 'Yanlış 3', isCorrect: false },
                ],
              },
            },
            {
              order: 2,
              text: 'İkinci soru?',
              timeLimitSec: 15,
              points: 1000,
              options: {
                create: [
                  { order: 1, text: 'Doğru 2', isCorrect: true },
                  { order: 2, text: 'Yanlış A', isCorrect: false },
                  { order: 3, text: 'Yanlış B', isCorrect: false },
                  { order: 4, text: 'Yanlış C', isCorrect: false },
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
    createdQuizIds.push(twoQQuiz.id);

    const createRes = await fetch(`${baseUrl}/api/games`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: teacherACookie,
        'X-CSRF-Token': teacherACsrf,
      },
      body: JSON.stringify({ quizId: twoQQuiz.id }),
    });
    expect(createRes.status).toBe(201);
    const session = (await createRes.json()) as CreateGameResponse;
    createdSessionIds.push(session.sessionId);

    const host = trackSocket(await connectSocket(baseUrl, teacherACookie));
    await emitAck(host, 'host:attach', {
      pin: session.pin,
      hostToken: session.hostToken,
    });

    const player = trackSocket(await connectSocket(baseUrl));
    await emitAck(player, 'player:join', {
      pin: session.pin,
      nickname: 'ErkenOyuncu',
    });

    const q1Started = waitForEvent(player, 'game:question_started');
    await emitAck(host, 'host:start_game', {
      pin: session.pin,
      hostToken: session.hostToken,
    });
    await q1Started;

    // 1. soruyu doğru cevapla
    const q1Ended = waitForEvent<QuestionResultPayload>(host, 'game:question_result');
    await emitAck(player, 'player:submit_answer', {
      pin: session.pin,
      questionIndex: 0,
      optionId: twoQQuiz.questions[0].options[0].id,
    });
    await q1Ended;

    // Yetkisiz (veya doğru hostToken'a sahip öğrenci) host:end_game çağrısı engellenmeli
    const rogueEnd = await emitAck(player, 'host:end_game', {
      pin: session.pin,
      hostToken: session.hostToken,
    });
    expect(rogueEnd.ok).toBe(false);
    if (!rogueEnd.ok) {
      expect(rogueEnd.code).toBe('UNAUTHORIZED_HOST');
    }

    // Yetkili öğretmen 2. soruya geçmeden yarışmayı sonlandırır
    const finishHostPromise = waitForEvent<FinishedPayload>(host, 'game:finished');
    const finishPlayerPromise = waitForEvent<FinishedPayload>(player, 'game:finished');

    const endAck = await emitAck(host, 'host:end_game', {
      pin: session.pin,
      hostToken: session.hostToken,
    });
    expect(endAck.ok).toBe(true);

    const [hostFinished, playerFinished] = await Promise.all([
      finishHostPromise,
      finishPlayerPromise,
    ]);

    expect(hostFinished.leaderboard[0]?.correctCount).toBe(1);
    expect(hostFinished.leaderboard[0]?.wrongCount).toBe(0);
    expect(hostFinished.leaderboard[0]?.unansweredCount).toBe(1);
    expect(playerFinished.personalResult?.correctCount).toBe(1);
    expect(playerFinished.personalResult?.unansweredCount).toBe(1);

    const dbDetailRes = await fetch(`${baseUrl}/api/games/history/${session.sessionId}`, {
      headers: { Cookie: teacherACookie },
    });
    expect(dbDetailRes.status).toBe(200);
    const dbDetail = (await dbDetailRes.json()) as { session: GameHistoryDetail };
    expect(dbDetail.session.status).toBe('FINISHED');
    expect(dbDetail.session.results[0]?.correctCount).toBe(1);
    expect(dbDetail.session.results[0]?.wrongCount).toBe(0);
    expect(dbDetail.session.results[0]?.unansweredCount).toBe(1);
  });

  it('soru süresi dolduğunda gelen cevapları reddeder ve lobi iptalini yönetir', async () => {
    const shortQuiz = await prisma.quiz.create({
      data: {
        ownerId: teacherAId,
        title: 'Süre Aşımı Test Quizi',
        description: '',
        category: 'Tarih',
        questions: {
          create: {
            order: 1,
            text: '1 saniyelik süre testi sorusu?',
            timeLimitSec: 1,
            points: 1000,
            options: {
              create: [
                { order: 1, text: 'Doğru', isCorrect: true },
                { order: 2, text: 'Yanlış 1', isCorrect: false },
                { order: 3, text: 'Yanlış 2', isCorrect: false },
                { order: 4, text: 'Yanlış 3', isCorrect: false },
              ],
            },
          },
        },
      },
      include: {
        questions: { include: { options: true } },
      },
    });
    createdQuizIds.push(shortQuiz.id);

    // Süre aşımı testi
    const res1 = await fetch(`${baseUrl}/api/games`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: teacherACookie,
        'X-CSRF-Token': teacherACsrf,
      },
      body: JSON.stringify({ quizId: shortQuiz.id }),
    });
    const session1 = (await res1.json()) as CreateGameResponse;
    createdSessionIds.push(session1.sessionId);

    const host = trackSocket(await connectSocket(baseUrl, teacherACookie));
    await emitAck(host, 'host:attach', {
      pin: session1.pin,
      hostToken: session1.hostToken,
    });

    const player = trackSocket(await connectSocket(baseUrl));
    await emitAck(player, 'player:join', {
      pin: session1.pin,
      nickname: 'Bekleyen',
    });

    const qStarted = waitForEvent(player, 'game:question_started');
    const qEnded = waitForEvent<QuestionResultPayload>(player, 'game:question_result');

    await emitAck(host, 'host:start_game', {
      pin: session1.pin,
      hostToken: session1.hostToken,
    });
    await qStarted;

    // 1.25 sn bekle -> soru süresi sunucu tarafından kapatılır
    const result = await qEnded;
    expect(result.personalResult?.answered).toBe(false);
    expect(result.personalResult?.pointsAwarded).toBe(0);

    // Süre bittikten sonra gönderilen cevap reddedilir
    const lateAnswer = await emitAck(player, 'player:submit_answer', {
      pin: session1.pin,
      questionIndex: 0,
      optionId: shortQuiz.questions[0].options[0].id,
    });
    expect(lateAnswer.ok).toBe(false);

    // İptal testi (ikinci oturum)
    const res2 = await fetch(`${baseUrl}/api/games`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: teacherACookie,
        'X-CSRF-Token': teacherACsrf,
      },
      body: JSON.stringify({ quizId: shortQuiz.id }),
    });
    const session2 = (await res2.json()) as CreateGameResponse;
    createdSessionIds.push(session2.sessionId);

    const host2 = trackSocket(await connectSocket(baseUrl, teacherACookie));
    await emitAck(host2, 'host:attach', {
      pin: session2.pin,
      hostToken: session2.hostToken,
    });

    const player2 = trackSocket(await connectSocket(baseUrl));
    await emitAck(player2, 'player:join', {
      pin: session2.pin,
      nickname: 'IptalOyuncusu',
    });

    const cancelledEvent = waitForEvent<{ message: string }>(
      player2,
      'game:cancelled',
    );
    const cancelAck = await emitAck(host2, 'host:cancel_game', {
      pin: session2.pin,
      hostToken: session2.hostToken,
    });
    expect(cancelAck.ok).toBe(true);
    await cancelledEvent;
  });

  it('Aşama 8: 4 soru türünü canlı Socket.IO yarışmasında doğrular, karıştırır, kısmi puanlar ve DB ye yazar', async () => {
    const createRes = await fetch(`${baseUrl}/api/quizzes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: teacherACookie,
        'X-CSRF-Token': teacherACsrf,
      },
      body: JSON.stringify({
        status: 'PUBLISHED',
        title: 'Canlı Yeni Soru Türleri Quizi',
        description: 'Gerçek zamanlı 4 tür',
        category: 'Matematik',
        questions: [
          {
            type: 'MULTIPLE_CHOICE',
            text: 'Asal sayı hangisidir?',
            explanation: '7 asal sayıdır.',
            timeLimitSec: 15,
            points: 1000,
            options: [
              { text: '4', isCorrect: false },
              { text: '6', isCorrect: false },
              { text: '8', isCorrect: false },
              { text: '9', isCorrect: false },
              { text: '7', isCorrect: true },
            ],
          },
          {
            type: 'TRUE_FALSE',
            text: 'Üçgenin iç açıları toplamı 180 derecedir.',
            explanation: 'Öklid geometrisinde 180 derecedir.',
            timeLimitSec: 15,
            points: 1000,
            options: [
              { text: 'Doğru', isCorrect: true },
              { text: 'Yanlış', isCorrect: false },
            ],
          },
          {
            type: 'MULTI_SELECT',
            text: 'Hangileri çift sayıdır?',
            allowPartialCredit: true,
            explanation: '2 ve 4 çift sayılardır.',
            timeLimitSec: 20,
            points: 1000,
            options: [
              { text: '2', isCorrect: true },
              { text: '4', isCorrect: true },
              { text: '3', isCorrect: false },
              { text: '5', isCorrect: false },
            ],
          },
          {
            type: 'ORDERING',
            text: 'Küçükten büyüğe sıralayın.',
            explanation: 'Doğru sıra 10, 20, 30 şeklindedir.',
            timeLimitSec: 20,
            points: 1000,
            options: [
              { text: '10', isCorrect: true },
              { text: '20', isCorrect: true },
              { text: '30', isCorrect: true },
            ],
          },
        ],
      }),
    });
    expect(createRes.status).toBe(201);
    const { quiz } = (await createRes.json()) as {
      quiz: {
        id: string;
        questions: Array<{
          id: string;
          type: string;
          options: Array<{ id: string; text: string; isCorrect: boolean }>;
        }>;
      };
    };
    createdQuizIds.push(quiz.id);

    const gameRes = await fetch(`${baseUrl}/api/games`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: teacherACookie,
        'X-CSRF-Token': teacherACsrf,
      },
      body: JSON.stringify({ quizId: quiz.id }),
    });
    expect(gameRes.status).toBe(201);
    const session = (await gameRes.json()) as CreateGameResponse;
    createdSessionIds.push(session.sessionId);

    const host = trackSocket(await connectSocket(baseUrl, teacherACookie));
    await emitAck(host, 'host:attach', { pin: session.pin, hostToken: session.hostToken });

    const p1 = trackSocket(await connectSocket(baseUrl));
    const p2 = trackSocket(await connectSocket(baseUrl));
    const p1Join = await emitAck(p1, 'player:join', { pin: session.pin, nickname: 'TamDogru' });
    const p2Join = await emitAck(p2, 'player:join', { pin: session.pin, nickname: 'KismiOyuncu' });
    expect(p1Join.ok && p2Join.ok).toBe(true);
    const p2Token = p2Join.ok ? p2Join.reconnectToken : '';

    // Q1: 5 seçenekli MC
    const q1Promise = waitForEvent<{
      question: {
        type: string;
        options: Array<{ id: string; isCorrect?: boolean }>;
        explanation?: string;
      };
    }>(p1, 'game:question_started');
    await emitAck(host, 'host:start_game', { pin: session.pin, hostToken: session.hostToken });
    const q1 = await q1Promise;
    expect(q1.question.type).toBe('MULTIPLE_CHOICE');
    expect(q1.question.options).toHaveLength(5);
    expect(q1.question.explanation).toBeUndefined();
    expect('isCorrect' in q1.question.options[0]!).toBe(false);

    const q1ResPromise = waitForEvent<QuestionResultPayload>(p1, 'game:question_result');
    await emitAck(p1, 'player:submit_answer', {
      pin: session.pin,
      questionIndex: 0,
      optionId: quiz.questions[0]!.options[4]!.id,
    });
    await emitAck(p2, 'player:submit_answer', {
      pin: session.pin,
      questionIndex: 0,
      optionId: quiz.questions[0]!.options[0]!.id,
    });
    const q1Res = await q1ResPromise;
    expect(q1Res.explanation).toBe('7 asal sayıdır.');
    expect(q1Res.personalResult?.isCorrect).toBe(true);

    // Q2: TRUE_FALSE
    const q2Promise = waitForEvent<{ question: { type: string; options: Array<{ id: string }> } }>(
      p1,
      'game:question_started',
    );
    await emitAck(host, 'host:next_question', { pin: session.pin, hostToken: session.hostToken });
    const q2 = await q2Promise;
    expect(q2.question.type).toBe('TRUE_FALSE');
    expect(q2.question.options).toHaveLength(2);

    const q2Done = waitForEvent<QuestionResultPayload>(host, 'game:question_result');
    await emitAck(p1, 'player:submit_answer', {
      pin: session.pin,
      questionIndex: 1,
      optionId: quiz.questions[1]!.options[0]!.id,
    });
    await emitAck(p2, 'player:submit_answer', {
      pin: session.pin,
      questionIndex: 1,
      optionId: quiz.questions[1]!.options[1]!.id,
    });
    await q2Done;

    // Q3: MULTI_SELECT (kısmi puanlama + geçersiz format reddi + yeniden bağlanma)
    const q3Promise = waitForEvent<{ question: { type: string; allowPartialCredit: boolean } }>(
      p1,
      'game:question_started',
    );
    await emitAck(host, 'host:next_question', { pin: session.pin, hostToken: session.hostToken });
    const q3 = await q3Promise;
    expect(q3.question.type).toBe('MULTI_SELECT');
    expect(q3.question.allowPartialCredit).toBe(true);

    // Geçersiz biçim (boş liste) sunucu tarafından reddedilmeli
    const invalidMulti = await emitAck(p1, 'player:submit_answer', {
      pin: session.pin,
      questionIndex: 2,
      optionIds: [],
    });
    expect(invalidMulti.ok).toBe(false);
    if (!invalidMulti.ok) expect(invalidMulti.code).toBe('INVALID_ANSWER_FORMAT');

    const msOpts = quiz.questions[2]!.options;
    await emitAck(p2, 'player:submit_answer', {
      pin: session.pin,
      questionIndex: 2,
      optionIds: [msOpts[0]!.id],
    });
    p2.disconnect();

    // KismiOyuncu yeniden bağlandığında çoklu seçiminin korunduğunu doğrula
    const reconnectedP2 = trackSocket(await connectSocket(baseUrl));
    const reAck = await emitAck(reconnectedP2, 'player:reconnect', {
      pin: session.pin,
      reconnectToken: p2Token,
    });
    expect(reAck.ok).toBe(true);
    if (reAck.ok) {
      expect(reAck.snapshot.hasAnsweredCurrent).toBe(true);
      expect(reAck.snapshot.selectedOptionIds).toEqual([msOpts[0]!.id]);
    }

    const q3P2ResultPromise = waitForEvent<QuestionResultPayload>(
      reconnectedP2,
      'game:question_result',
    );
    await emitAck(p1, 'player:submit_answer', {
      pin: session.pin,
      questionIndex: 2,
      optionIds: [msOpts[0]!.id, msOpts[1]!.id],
    });

    const q3P2Res = await q3P2ResultPromise;
    expect(q3P2Res.partialCorrectCount).toBe(1);
    expect(q3P2Res.exactCorrectCount).toBe(1);
    expect(q3P2Res.personalResult?.isPartial).toBe(true);
    expect(q3P2Res.personalResult?.pointsAwarded).toBeGreaterThan(0);

    // Q4: ORDERING (karıştırılmış başlangıç + doğru sıra gönderimi + hatalı biçim reddi)
    const q4Promise = waitForEvent<{
      question: { type: string; options: Array<{ id: string; text: string }> };
    }>(p1, 'game:question_started');
    await emitAck(host, 'host:next_question', { pin: session.pin, hostToken: session.hostToken });
    const q4 = await q4Promise;
    expect(q4.question.type).toBe('ORDERING');
    const canonicalIds = quiz.questions[3]!.options.map((o) => o.id);
    expect(q4.question.options.map((o) => o.id)).not.toEqual(canonicalIds);

    const badOrdering = await emitAck(p1, 'player:submit_answer', {
      pin: session.pin,
      questionIndex: 3,
      orderedOptionIds: [canonicalIds[0]!],
    });
    expect(badOrdering.ok).toBe(false);

    const q4ResultHostPromise = waitForEvent<QuestionResultPayload>(host, 'game:question_result');
    await emitAck(p1, 'player:submit_answer', {
      pin: session.pin,
      questionIndex: 3,
      orderedOptionIds: canonicalIds,
    });
    await emitAck(reconnectedP2, 'player:submit_answer', {
      pin: session.pin,
      questionIndex: 3,
      orderedOptionIds: [canonicalIds[1]!, canonicalIds[0]!, canonicalIds[2]!],
    });
    const q4HostRes = await q4ResultHostPromise;
    expect(q4HostRes.correctOptionIds).toEqual(canonicalIds);
    expect(q4HostRes.exactCorrectCount).toBe(1);

    const finishPromise = waitForEvent<FinishedPayload>(host, 'game:finished');
    await emitAck(host, 'host:next_question', { pin: session.pin, hostToken: session.hostToken });
    const finished = await finishPromise;
    expect(finished.leaderboard[0]?.nickname).toBe('TamDogru');

    // DB'deki GameAnswer.answerPayload kayıtlarını doğrula
    const storedAnswers = await prisma.gameAnswer.findMany({
      where: { sessionId: session.sessionId },
      orderBy: [{ questionIndex: 'asc' }, { answeredAt: 'asc' }],
    });
    expect(storedAnswers.some((a) => a.questionIndex === 3 && Boolean(a.answerPayload))).toBe(
      true,
    );
  });
});
