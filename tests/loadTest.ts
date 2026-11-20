import './testDbEnv';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { io as ioClient, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  CreateGameResponse,
  FinishedPayload,
  HostSessionSnapshot,
  PlayerSessionSnapshot,
  QuestionResultPayload,
  ServerToClientEvents,
  SocketAck,
} from '@shared/gameTypes';
import { createServerApp } from '../server/app';
import { prisma } from '../server/lib/prisma';

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface LatencyStats {
  count: number;
  avgMs: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

interface QuestionSpec {
  index: number;
  type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'MULTI_SELECT' | 'ORDERING';
  correctOptionId?: string;
  wrongOptionId?: string;
  multiCorrectIds?: string[];
  multiPartialIds?: string[];
  orderingIds?: string[];
}

interface ScenarioMetrics {
  players: number;
  connectedPlayers: number;
  connectionSuccessRatePct: number;
  connectErrors: number;
  unexpectedDisconnects: number;
  joinSuccessCount: number;
  joinLatency: LatencyStats;
  questionBroadcastLatency: LatencyStats;
  answerLatency: LatencyStats;
  reconnectTested: number;
  reconnectSucceeded: number;
  reconnectLatency: LatencyStats;
  totalAnswersExpected: number;
  totalAnswersSucceeded: number;
  totalAnswersSavedDb: number;
  totalResultsSavedDb: number;
  failedRequests: number;
  answerSuccessRatePct: number;
  completionRatePct: number;
  dbPersistMs: number;
  dbQueryTimingsMs: {
    explore: number;
    dashboardSummary: number;
    gameHistory: number;
    sessionAnalytics: number;
  };
  scenarioDurationMs: number;
  cpuTimeMs: number;
  cpuUtilizationPct: number;
  rssMb: number;
  peakRssMb: number;
  heapUsedMb: number;
  heapDeltaMb: number;
}

function summarizeLatencies(values: number[]): LatencyStats {
  if (values.length === 0) {
    return { count: 0, avgMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const p95Idx = Math.min(
    sorted.length - 1,
    Math.floor((sorted.length - 1) * 0.95),
  );
  const p99Idx = Math.min(
    sorted.length - 1,
    Math.floor((sorted.length - 1) * 0.99),
  );
  return {
    count: sorted.length,
    avgMs: Number((sum / sorted.length).toFixed(2)),
    p95Ms: Number(sorted[p95Idx]!.toFixed(2)),
    p99Ms: Number(sorted[p99Idx]!.toFixed(2)),
    maxMs: Number(sorted[sorted.length - 1]!.toFixed(2)),
  };
}

function connectSocket(
  baseUrl: string,
  cookie?: string,
): Promise<{ socket: TestSocket | null; connectMs: number; error?: string }> {
  const start = performance.now();
  return new Promise((resolve) => {
    const socket: TestSocket = ioClient(baseUrl, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      timeout: 10000,
      extraHeaders: cookie ? { Cookie: cookie } : undefined,
    });

    const cleanup = () => {
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
    };

    const onConnect = () => {
      cleanup();
      resolve({ socket, connectMs: performance.now() - start });
    };

    const onError = (err: Error) => {
      cleanup();
      socket.disconnect();
      resolve({
        socket: null,
        connectMs: performance.now() - start,
        error: err.message,
      });
    };

    socket.once('connect', onConnect);
    socket.once('connect_error', onError);
  });
}

function emitAck<T extends object = object>(
  socket: TestSocket,
  event: keyof ClientToServerEvents,
  payload: unknown,
): Promise<{ res: SocketAck<T>; latencyMs: number }> {
  const start = performance.now();
  return new Promise((resolve) => {
    (
      socket as unknown as {
        emit: (e: string, p: unknown, cb: (r: SocketAck<T>) => void) => void;
      }
    ).emit(event, payload, (res) => {
      resolve({ res, latencyMs: performance.now() - start });
    });
  });
}

function waitForEvent<T>(
  socket: TestSocket,
  eventName: keyof ServerToClientEvents,
  timeoutMs = 15000,
): Promise<{ payload: T; receivedAt: number }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, handler as never);
      reject(new Error(`Timeout waiting for ${String(eventName)}`));
    }, timeoutMs);

    const handler = (payload: T) => {
      clearTimeout(timer);
      socket.off(eventName, handler as never);
      resolve({ payload, receivedAt: performance.now() });
    };

    socket.on(eventName, handler as never);
  });
}

async function timedFetch(
  url: string,
  headers?: Record<string, string>,
): Promise<{ status: number; durationMs: number }> {
  const start = performance.now();
  const res = await fetch(url, { headers });
  await res.text();
  return { status: res.status, durationMs: Number((performance.now() - start).toFixed(2)) };
}

async function runScenario(
  playerCount: number,
  baseUrl: string,
  teacherCookie: string,
  teacherCsrf: string,
  quizId: string,
  questions: QuestionSpec[],
  createdSessionIds: string[],
): Promise<ScenarioMetrics> {
  const memBefore = process.memoryUsage();
  const cpuBefore = process.cpuUsage();
  let peakRssBytes = memBefore.rss;
  const trackMem = () => {
    const cur = process.memoryUsage().rss;
    if (cur > peakRssBytes) peakRssBytes = cur;
  };
  const scenarioStart = performance.now();

  const createRes = await fetch(`${baseUrl}/api/games`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: teacherCookie,
      'X-CSRF-Token': teacherCsrf,
    },
    body: JSON.stringify({ quizId }),
  });

  if (createRes.status !== 201) {
    throw new Error(`POST /api/games failed (${createRes.status})`);
  }

  const created = (await createRes.json()) as CreateGameResponse;
  createdSessionIds.push(created.sessionId);

  const hostConn = await connectSocket(baseUrl, teacherCookie);
  if (!hostConn.socket) {
    throw new Error(`Host socket connection failed: ${hostConn.error}`);
  }
  const hostSocket = hostConn.socket;

  const hostAttach = await emitAck<{ snapshot: HostSessionSnapshot }>(
    hostSocket,
    'host:attach',
    { pin: created.pin, hostToken: created.hostToken },
  );
  if (!hostAttach.res.ok) {
    throw new Error(`Host attach failed: ${hostAttach.res.message}`);
  }

  let unexpectedDisconnects = 0;
  let expectingClose = false;
  const reconnectingIndices = new Set<number>();

  const connResults = await Promise.all(
    Array.from({ length: playerCount }, () => connectSocket(baseUrl)),
  );
  const playerSockets: TestSocket[] = [];
  let connectErrors = 0;

  connResults.forEach((item, idx) => {
    if (item.socket) {
      item.socket.on('disconnect', () => {
        if (!expectingClose && !reconnectingIndices.has(idx)) {
          unexpectedDisconnects += 1;
        }
      });
      playerSockets.push(item.socket);
    } else {
      connectErrors += 1;
    }
  });
  trackMem();

  const joinResults = await Promise.all(
    playerSockets.map((sock, idx) =>
      emitAck<{ reconnectToken: string; snapshot: PlayerSessionSnapshot }>(
        sock,
        'player:join',
        { pin: created.pin, nickname: `Load_${playerCount}_${idx + 1}` },
      ),
    ),
  );

  const joinLatencies: number[] = [];
  const reconnectTokens: string[] = [];
  let joinSuccessCount = 0;
  for (const { res, latencyMs } of joinResults) {
    joinLatencies.push(latencyMs);
    if (res.ok) {
      joinSuccessCount += 1;
      reconnectTokens.push(res.reconnectToken);
    } else {
      reconnectTokens.push('');
    }
  }
  trackMem();

  const allBroadcastLatencies: number[] = [];
  const allAnswerLatencies: number[] = [];
  const reconnectLatencies: number[] = [];
  let totalAnswersSucceeded = 0;
  let failedRequests = connectErrors + (playerSockets.length - joinSuccessCount);
  let reconnectTested = 0;
  let reconnectSucceeded = 0;

  for (let qIdx = 0; qIdx < questions.length; qIdx += 1) {
    const qSpec = questions[qIdx]!;

    // Q2 öncesi oyuncuların %20'sinde (en az 2 oyuncu) kopma + reconnect simülasyonu ve süre ölçümü
    if (qIdx === 1) {
      const targetCount = Math.max(2, Math.floor(playerSockets.length * 0.2));
      for (let i = 0; i < targetCount; i += 1) {
        reconnectingIndices.add(i);
        playerSockets[i]!.disconnect();
      }

      const reconnectTargets = Array.from(reconnectingIndices);
      reconnectTested = reconnectTargets.length;
      const reconnectedPairs = await Promise.all(
        reconnectTargets.map(async (playerIdx) => {
          const reconStart = performance.now();
          const newConn = await connectSocket(baseUrl);
          if (!newConn.socket) {
            return { ok: false, playerIdx, socket: null, latencyMs: performance.now() - reconStart };
          }
          const newSock = newConn.socket;
          newSock.on('disconnect', () => {
            if (!expectingClose && !reconnectingIndices.has(playerIdx)) {
              unexpectedDisconnects += 1;
            }
          });
          const ack = await emitAck<{ snapshot: PlayerSessionSnapshot }>(
            newSock,
            'player:reconnect',
            { pin: created.pin, reconnectToken: reconnectTokens[playerIdx] },
          );
          return {
            ok: ack.res.ok,
            playerIdx,
            socket: newSock,
            latencyMs: Number((performance.now() - reconStart).toFixed(2)),
          };
        }),
      );

      for (const item of reconnectedPairs) {
        reconnectingIndices.delete(item.playerIdx);
        reconnectLatencies.push(item.latencyMs);
        if (item.socket) {
          playerSockets[item.playerIdx] = item.socket;
        }
        if (item.ok) {
          reconnectSucceeded += 1;
        } else {
          failedRequests += 1;
        }
      }
    }

    const hostQStartWait = waitForEvent(hostSocket, 'game:question_started');
    const qPlayerWaits = playerSockets.map((sock) =>
      waitForEvent(sock, 'game:question_started'),
    );

    const triggerRes = await emitAck(
      hostSocket,
      qIdx === 0 ? 'host:start_game' : 'host:next_question',
      { pin: created.pin, hostToken: created.hostToken },
    );
    if (!triggerRes.res.ok) {
      throw new Error(`Question ${qIdx + 1} trigger failed: ${triggerRes.res.message}`);
    }

    const [hostStarted, playerStartedList] = await Promise.all([
      hostQStartWait,
      Promise.all(qPlayerWaits),
    ]);
    // Gerçek Socket.IO dağıtım yayılım gecikmesi: host olayı ile her öğrencinin alış farkı (countdown süresi dışlanır)
    for (const pEvent of playerStartedList) {
      allBroadcastLatencies.push(Math.max(0, pEvent.receivedAt - hostStarted.receivedAt));
    }

    const qResultWait = waitForEvent<QuestionResultPayload>(
      hostSocket,
      'game:question_result',
    );

    const answerResults = await Promise.all(
      playerSockets.map((sock, idx) => {
        if (qSpec.type === 'MULTI_SELECT') {
          const optionIds =
            idx % 2 === 0 ? qSpec.multiCorrectIds! : qSpec.multiPartialIds!;
          return emitAck(sock, 'player:submit_answer', {
            pin: created.pin,
            questionIndex: qIdx,
            optionIds,
          });
        }
        if (qSpec.type === 'ORDERING') {
          const orderedOptionIds =
            idx % 3 === 0
              ? qSpec.orderingIds!
              : [...qSpec.orderingIds!].reverse();
          return emitAck(sock, 'player:submit_answer', {
            pin: created.pin,
            questionIndex: qIdx,
            orderedOptionIds,
          });
        }
        const optionId =
          idx % 2 === 0 ? qSpec.correctOptionId! : qSpec.wrongOptionId!;
        return emitAck(sock, 'player:submit_answer', {
          pin: created.pin,
          questionIndex: qIdx,
          optionId,
        });
      }),
    );

    for (const { res, latencyMs } of answerResults) {
      allAnswerLatencies.push(latencyMs);
      if (res.ok) {
        totalAnswersSucceeded += 1;
      } else {
        failedRequests += 1;
      }
    }

    await qResultWait;
    trackMem();
  }

  // Yarışma bitişi ve PostgreSQL yazım süresi
  const finishWait = waitForEvent<FinishedPayload>(hostSocket, 'game:finished');
  const finishPlayersWait = Promise.all(
    playerSockets.map((sock) => waitForEvent<FinishedPayload>(sock, 'game:finished')),
  );

  const persistStart = performance.now();
  const nextFinish = await emitAck(hostSocket, 'host:next_question', {
    pin: created.pin,
    hostToken: created.hostToken,
  });
  if (!nextFinish.res.ok) {
    throw new Error(`host:next_question (Finish) failed: ${nextFinish.res.message}`);
  }

  await Promise.all([finishWait, finishPlayersWait]);
  const dbPersistMs = Number((performance.now() - persistStart).toFixed(2));
  trackMem();

  const persisted = await prisma.gameSession.findUnique({
    where: { id: created.sessionId },
    select: {
      status: true,
      _count: {
        select: {
          answers: true,
          results: true,
        },
      },
    },
  });

  if (!persisted || persisted.status !== 'FINISHED') {
    throw new Error(`DB session status mismatch for ${playerCount} players`);
  }

  // Gerçek HTTP API + Veritabanı sorgu süreleri ölçümü
  const [exploreTiming, dashboardTiming, historyTiming, analyticsTiming] =
    await Promise.all([
      timedFetch(`${baseUrl}/api/explore?page=1&pageSize=12`, { Cookie: teacherCookie }),
      timedFetch(`${baseUrl}/api/dashboard/summary`, { Cookie: teacherCookie }),
      timedFetch(`${baseUrl}/api/games/history`, { Cookie: teacherCookie }),
      timedFetch(`${baseUrl}/api/games/history/${created.sessionId}/analytics`, {
        Cookie: teacherCookie,
      }),
    ]);

  expectingClose = true;
  for (const sock of playerSockets) {
    sock.removeAllListeners();
    sock.disconnect();
  }
  hostSocket.removeAllListeners();
  hostSocket.disconnect();

  const cpuDelta = process.cpuUsage(cpuBefore);
  const memAfter = process.memoryUsage();
  const scenarioDurationMs = Number(
    (performance.now() - scenarioStart).toFixed(2),
  );
  const cpuTimeMs = Number(((cpuDelta.user + cpuDelta.system) / 1000).toFixed(2));
  const cpuUtilizationPct = Number(
    ((cpuTimeMs / Math.max(scenarioDurationMs, 1)) * 100).toFixed(2),
  );

  const totalAnswersExpected = playerCount * questions.length;
  const gameCompletedCleanly =
    persisted.status === 'FINISHED' &&
    persisted._count.results === playerCount &&
    unexpectedDisconnects === 0;

  return {
    players: playerCount,
    connectedPlayers: playerSockets.length,
    connectionSuccessRatePct: Number(
      ((playerSockets.length / playerCount) * 100).toFixed(2),
    ),
    connectErrors,
    unexpectedDisconnects,
    joinSuccessCount,
    joinLatency: summarizeLatencies(joinLatencies),
    questionBroadcastLatency: summarizeLatencies(allBroadcastLatencies),
    answerLatency: summarizeLatencies(allAnswerLatencies),
    reconnectTested,
    reconnectSucceeded,
    reconnectLatency: summarizeLatencies(reconnectLatencies),
    totalAnswersExpected,
    totalAnswersSucceeded,
    totalAnswersSavedDb: persisted._count.answers,
    totalResultsSavedDb: persisted._count.results,
    failedRequests,
    answerSuccessRatePct: Number(
      ((totalAnswersSucceeded / Math.max(totalAnswersExpected, 1)) * 100).toFixed(2),
    ),
    completionRatePct: gameCompletedCleanly
      ? 100
      : Number(
          ((persisted._count.results / Math.max(playerCount, 1)) * 100).toFixed(2),
        ),
    dbPersistMs,
    dbQueryTimingsMs: {
      explore: exploreTiming.durationMs,
      dashboardSummary: dashboardTiming.durationMs,
      gameHistory: historyTiming.durationMs,
      sessionAnalytics: analyticsTiming.durationMs,
    },
    scenarioDurationMs,
    cpuTimeMs,
    cpuUtilizationPct,
    rssMb: Number((memAfter.rss / (1024 * 1024)).toFixed(2)),
    peakRssMb: Number((peakRssBytes / (1024 * 1024)).toFixed(2)),
    heapUsedMb: Number((memAfter.heapUsed / (1024 * 1024)).toFixed(2)),
    heapDeltaMb: Number(
      ((memAfter.heapUsed - memBefore.heapUsed) / (1024 * 1024)).toFixed(2),
    ),
  };
}

async function main() {
  const { httpServer, gameManager, io } = createServerApp({
    countdownMs: 120,
    questionGraceMs: 40,
    maxPlayers: 60,
  });

  const createdSessionIds: string[] = [];
  let createdQuizId: string | null = null;
  let createdTeacherId: string | null = null;

  try {
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve());
    });

    const addr = httpServer.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const email = `loadtest-stage14-${Date.now()}@quizora.local`;
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Yük Testi Öğretmeni (Aşama 14)',
        email,
        password: 'LoadTestPassword123!',
        passwordConfirm: 'LoadTestPassword123!',
        acceptedTerms: true,
      }),
    });

    if (regRes.status !== 201) {
      throw new Error(`Teacher registration failed: ${regRes.status}`);
    }

    const regJson = (await regRes.json()) as {
      teacher: { id: string };
      csrfToken: string;
    };
    createdTeacherId = regJson.teacher.id;
    const rawCookies =
      typeof regRes.headers.getSetCookie === 'function'
        ? regRes.headers.getSetCookie()
        : [regRes.headers.get('set-cookie') ?? ''];
    const teacherCookie = rawCookies
      .map((c) => c.split(';')[0]?.trim())
      .filter(Boolean)
      .join('; ');
    const teacherCsrf = regJson.csrfToken;
    if (!teacherCookie || !teacherCsrf) {
      throw new Error('Missing session cookie or CSRF token');
    }

    const quiz = await prisma.quiz.create({
      data: {
        ownerId: createdTeacherId,
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        title: 'Aşama 14 Yük Testi Quizi (4 Soru Türü)',
        description: '10/30/50 eş zamanlı oyuncu yük ve veritabanı performans testi',
        category: 'Teknoloji',
        questions: {
          create: [
            {
              order: 1,
              type: 'MULTIPLE_CHOICE',
              text: 'HTTP 200 durum kodu neyi ifade eder?',
              timeLimitSec: 20,
              points: 1000,
              options: {
                create: [
                  { order: 1, text: 'Başarılı istek', isCorrect: true },
                  { order: 2, text: 'Bulunamadı', isCorrect: false },
                  { order: 3, text: 'Yetkisiz erişim', isCorrect: false },
                  { order: 4, text: 'Sunucu hatası', isCorrect: false },
                ],
              },
            },
            {
              order: 2,
              type: 'TRUE_FALSE',
              text: 'WebSocket TCP üzerinde tam çift yönlü iletişim sağlar.',
              timeLimitSec: 20,
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
              text: 'Hangileri ilişkisel veritabanıdır?',
              allowPartialCredit: true,
              timeLimitSec: 20,
              points: 1000,
              options: {
                create: [
                  { order: 1, text: 'PostgreSQL', isCorrect: true },
                  { order: 2, text: 'MySQL', isCorrect: true },
                  { order: 3, text: 'Redis', isCorrect: false },
                  { order: 4, text: 'Memcached', isCorrect: false },
                ],
              },
            },
            {
              order: 4,
              type: 'ORDERING',
              text: 'OSI katmanlarını aşağıdan yukarı sıralayın.',
              timeLimitSec: 20,
              points: 1000,
              options: {
                create: [
                  { order: 1, text: 'Fiziksel', isCorrect: true },
                  { order: 2, text: 'Veri Bağı', isCorrect: true },
                  { order: 3, text: 'Ağ', isCorrect: true },
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
    createdQuizId = quiz.id;

    const specs: QuestionSpec[] = quiz.questions.map((q, idx) => {
      if (q.type === 'MULTI_SELECT') {
        const corrects = q.options.filter((o) => o.isCorrect).map((o) => o.id);
        return {
          index: idx,
          type: 'MULTI_SELECT',
          multiCorrectIds: corrects,
          multiPartialIds: [corrects[0]!],
        };
      }
      if (q.type === 'ORDERING') {
        return {
          index: idx,
          type: 'ORDERING',
          orderingIds: [...q.options]
            .sort((a, b) => a.order - b.order)
            .map((o) => o.id),
        };
      }
      return {
        index: idx,
        type: q.type as 'MULTIPLE_CHOICE' | 'TRUE_FALSE',
        correctOptionId: q.options.find((o) => o.isCorrect)!.id,
        wrongOptionId: q.options.find((o) => !o.isCorrect)!.id,
      };
    });

    const hardware = {
      platform: `${os.type()} ${os.release()} (${os.arch()})`,
      cpuModel: os.cpus()[0]?.model ?? 'Unknown',
      cpuCores: os.cpus().length,
      totalRamGb: Number((os.totalmem() / (1024 ** 3)).toFixed(2)),
      nodeVersion: process.version,
      dbIsolationSchema: 'quizora_test',
    };

    const scenarios = [10, 30, 50];
    const results: ScenarioMetrics[] = [];

    for (const count of scenarios) {
      const metrics = await runScenario(
        count,
        baseUrl,
        teacherCookie,
        teacherCsrf,
        quiz.id,
        specs,
        createdSessionIds,
      );
      results.push(metrics);
    }

    console.log('\n=== QUIZORA Aşama 14 Yük Testi Raporu (10 / 30 / 50 Eş Zamanlı Oyuncu) ===');
    console.log(JSON.stringify({ hardware, scenarios: results }, null, 2));

    const hasFailure = results.some(
      (r) =>
        r.connectedPlayers !== r.players ||
        r.connectErrors > 0 ||
        r.unexpectedDisconnects > 0 ||
        r.joinSuccessCount !== r.players ||
        r.reconnectSucceeded !== r.reconnectTested ||
        r.totalAnswersSucceeded !== r.totalAnswersExpected ||
        r.totalAnswersSavedDb !== r.totalAnswersExpected ||
        r.totalResultsSavedDb !== r.players ||
        r.completionRatePct !== 100,
    );

    if (hasFailure) {
      console.error('Yük testinde eksik bağlantı/cevap/DB kaydı tespit edildi.');
      process.exitCode = 1;
    } else {
      console.log(
        '\nTüm 10, 30 ve 50 oyunculu yük senaryoları (4 soru türü + mid-game reconnect) %100 başarıyla tamamlandı.',
      );
    }
  } finally {
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
    if (createdQuizId) {
      await prisma.quiz.deleteMany({
        where: { id: createdQuizId },
      });
    }
    if (createdTeacherId) {
      await prisma.teacher.deleteMany({
        where: { id: createdTeacherId },
      });
    }
    await prisma.$disconnect();
  }
}

void main();
