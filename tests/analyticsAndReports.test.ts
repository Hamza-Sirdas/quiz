import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GameSessionAnalytics } from '../shared/analyticsTypes';
import type { GameHistorySummary } from '../shared/gameTypes';
import { createServerApp } from '../server/app';
import { prisma } from '../server/lib/prisma';

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

describe('Aşama 9: Gelişmiş İstatistikler, Yarışma Analizleri ve Rapor İndirme (CSV / PDF)', () => {
  const { httpServer, gameManager, io } = createServerApp({
    countdownMs: 80,
    questionGraceMs: 30,
  });

  let baseUrl = '';
  let teacherAId = '';
  let teacherACookie = '';
  let teacherACsrf = '';
  let teacherBId = '';
  let teacherBCookie = '';

  let quizId = '';
  let richSessionId = '';
  let emptySessionId = '';
  let zeroAnswerSessionId = '';

  const createdSessionIds: string[] = [];
  const createdQuizIds: string[] = [];
  const createdTeacherIds: string[] = [];

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = httpServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const tA = await registerTestTeacher(
      baseUrl,
      'Analiz Öğretmeni A',
      `analiz.a.${suffix}@quizora.test`,
      'GucluSifre123',
    );
    teacherAId = tA.teacherId;
    teacherACookie = tA.cookie;
    teacherACsrf = tA.csrfToken;
    createdTeacherIds.push(teacherAId);

    const tB = await registerTestTeacher(
      baseUrl,
      'Analiz Öğretmeni B',
      `analiz.b.${suffix}@quizora.test`,
      'GucluSifre123',
    );
    teacherBId = tB.teacherId;
    teacherBCookie = tB.cookie;
    createdTeacherIds.push(teacherBId);

    // 4 farklı soru türü içeren gerçek bir quiz oluştur
    const quizRes = await fetch(`${baseUrl}/api/quizzes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: teacherACookie,
        'X-CSRF-Token': teacherACsrf,
      },
      body: JSON.stringify({
        title: 'Aşama 9 Kapsamlı Analiz Quizi',
        description: '4 soru türünü içeren analiz doğrulama quizi',
        category: 'Bilgisayar ve Teknoloji',
        status: 'PUBLISHED',
        questions: [
          {
            order: 0,
            type: 'MULTIPLE_CHOICE',
            text: 'Güneş sisteminin en büyük gezegeni hangisidir?',
            explanation: 'Jüpiter en büyük gezegendir.',
            allowPartialCredit: false,
            timeLimitSec: 20,
            points: 1000,
            options: [
              { order: 0, text: 'Mars', isCorrect: false },
              { order: 1, text: 'Jüpiter', isCorrect: true },
              { order: 2, text: 'Satürn', isCorrect: false },
              { order: 3, text: 'Venüs', isCorrect: false },
            ],
          },
          {
            order: 1,
            type: 'TRUE_FALSE',
            text: 'Su deniz seviyesinde 100 derecede kaynar.',
            explanation: 'Standart atmosfer basıncında 100°C.',
            allowPartialCredit: false,
            timeLimitSec: 15,
            points: 1000,
            options: [
              { order: 0, text: 'Doğru', isCorrect: true },
              { order: 1, text: 'Yanlış', isCorrect: false },
            ],
          },
          {
            order: 2,
            type: 'MULTI_SELECT',
            text: 'Hangileri asal sayıdır?',
            explanation: '2 ve 3 asal sayıdır.',
            allowPartialCredit: true,
            timeLimitSec: 30,
            points: 1000,
            options: [
              { order: 0, text: '2', isCorrect: true },
              { order: 1, text: '3', isCorrect: true },
              { order: 2, text: '4', isCorrect: false },
              { order: 3, text: '9', isCorrect: false },
            ],
          },
          {
            order: 3,
            type: 'ORDERING',
            text: 'Sayıları küçükten büyüğe sıralayın.',
            explanation: '10 -> 20 -> 30',
            allowPartialCredit: false,
            timeLimitSec: 30,
            points: 1000,
            options: [
              { order: 0, text: '10', isCorrect: true },
              { order: 1, text: '20', isCorrect: true },
              { order: 2, text: '30', isCorrect: true },
            ],
          },
        ],
      }),
    });
    expect(quizRes.status).toBe(201);
    const quizBody = (await quizRes.json()) as {
      quiz: {
        id: string;
        title: string;
        description: string;
        category: string;
        questions: Array<{
          id: string;
          order: number;
          type: string;
          text: string;
          explanation: string;
          allowPartialCredit: boolean;
          timeLimitSec: number;
          points: number;
          options: Array<{
            id: string;
            order: number;
            text: string;
            isCorrect: boolean;
          }>;
        }>;
      };
    };
    quizId = quizBody.quiz.id;
    createdQuizIds.push(quizId);

    const q0 = quizBody.quiz.questions[0]!;
    const q1 = quizBody.quiz.questions[1]!;
    const q2 = quizBody.quiz.questions[2]!;
    const q3 = quizBody.quiz.questions[3]!;

    const pAhmet = `part_ahmet_${suffix}`;
    const pZeynep = `part_zeynep_${suffix}`;
    const pMehmet = `part_mehmet_${suffix}`;

    // 1. Zengin tamamlanmış yarışma oturumu (3 katılımcı, 4 soru türü)
    const richSession = await prisma.gameSession.create({
      data: {
        pin: String(Math.floor(100000 + Math.random() * 899999)),
        hostTokenHash: `host_hash_rich_${suffix}`,
        quizId,
        hostTeacherId: teacherAId,
        quizTitle: quizBody.quiz.title,
        quizCategory: quizBody.quiz.category,
        status: 'FINISHED',
        startedAt: new Date('2026-11-19T18:00:00.000Z'),
        endedAt: new Date('2026-11-19T18:04:00.000Z'),
        createdAt: new Date('2026-11-19T18:00:00.000Z'),
        quizSnapshot: {
          title: quizBody.quiz.title,
          description: quizBody.quiz.description,
          category: quizBody.quiz.category,
          questions: quizBody.quiz.questions,
        },
        participants: {
          create: [
            {
              id: pAhmet,
              nickname: 'Ahmet Yılmaz',
              normalizedName: 'ahmet yılmaz',
              reconnectTokenHash: `tok_ahmet_${suffix}`,
              score: 4650,
              correctCount: 4,
              totalResponseMs: 6400,
            },
            {
              id: pZeynep,
              nickname: 'Zeynep Şahin',
              normalizedName: 'zeynep şahin',
              reconnectTokenHash: `tok_zeynep_${suffix}`,
              score: 1850,
              correctCount: 1,
              totalResponseMs: 9200,
            },
            {
              id: pMehmet,
              nickname: 'Mehmet Kaya',
              normalizedName: 'mehmet kaya',
              reconnectTokenHash: `tok_mehmet_${suffix}`,
              score: 0,
              correctCount: 0,
              totalResponseMs: 5000,
            },
          ],
        },
        results: {
          create: [
            {
              participantId: pAhmet,
              nickname: 'Ahmet Yılmaz',
              rank: 1,
              totalScore: 4650,
              correctCount: 4,
              totalQuestions: 4,
              avgResponseMs: 1600,
            },
            {
              participantId: pZeynep,
              nickname: 'Zeynep Şahin',
              rank: 2,
              totalScore: 1850,
              correctCount: 1,
              totalQuestions: 4,
              avgResponseMs: 2300,
            },
            {
              participantId: pMehmet,
              nickname: 'Mehmet Kaya',
              rank: 3,
              totalScore: 0,
              correctCount: 0,
              totalQuestions: 4,
              avgResponseMs: 2500,
            },
          ],
        },
      },
    });
    richSessionId = richSession.id;
    createdSessionIds.push(richSessionId);

    // Soru yanıtlarını kaydet
    await prisma.gameAnswer.createMany({
      data: [
        // Soru 1 (MULTIPLE_CHOICE): Ahmet doğru (Jüpiter), Zeynep yanlış (Satürn), Mehmet yanlış (Satürn)
        {
          sessionId: richSessionId,
          participantId: pAhmet,
          questionIndex: 0,
          selectedOptionId: q0.options[1]!.id,
          isCorrect: true,
          isPartial: false,
          responseTimeMs: 1200,
          pointsAwarded: 1300,
        },
        {
          sessionId: richSessionId,
          participantId: pZeynep,
          questionIndex: 0,
          selectedOptionId: q0.options[2]!.id,
          isCorrect: false,
          isPartial: false,
          responseTimeMs: 2400,
          pointsAwarded: 0,
        },
        {
          sessionId: richSessionId,
          participantId: pMehmet,
          questionIndex: 0,
          selectedOptionId: q0.options[2]!.id,
          isCorrect: false,
          isPartial: false,
          responseTimeMs: 3000,
          pointsAwarded: 0,
        },

        // Soru 2 (TRUE_FALSE): Ahmet doğru, Zeynep doğru, Mehmet boş (kayıt yok)
        {
          sessionId: richSessionId,
          participantId: pAhmet,
          questionIndex: 1,
          selectedOptionId: q1.options[0]!.id,
          isCorrect: true,
          isPartial: false,
          responseTimeMs: 1000,
          pointsAwarded: 1250,
        },
        {
          sessionId: richSessionId,
          participantId: pZeynep,
          questionIndex: 1,
          selectedOptionId: q1.options[0]!.id,
          isCorrect: true,
          isPartial: false,
          responseTimeMs: 1800,
          pointsAwarded: 1200,
        },

        // Soru 3 (MULTI_SELECT): Ahmet tam doğru ([2, 3]), Zeynep kısmi doğru ([2]), Mehmet yanlış ([4])
        {
          sessionId: richSessionId,
          participantId: pAhmet,
          questionIndex: 2,
          selectedOptionId: q2.options[0]!.id,
          answerPayload: {
            type: 'MULTI_SELECT',
            optionIds: [q2.options[0]!.id, q2.options[1]!.id],
          },
          isCorrect: true,
          isPartial: false,
          responseTimeMs: 2000,
          pointsAwarded: 1100,
        },
        {
          sessionId: richSessionId,
          participantId: pZeynep,
          questionIndex: 2,
          selectedOptionId: q2.options[0]!.id,
          answerPayload: {
            type: 'MULTI_SELECT',
            optionIds: [q2.options[0]!.id],
          },
          isCorrect: false,
          isPartial: true,
          responseTimeMs: 2200,
          pointsAwarded: 650,
        },
        {
          sessionId: richSessionId,
          participantId: pMehmet,
          questionIndex: 2,
          selectedOptionId: q2.options[2]!.id,
          answerPayload: {
            type: 'MULTI_SELECT',
            optionIds: [q2.options[2]!.id],
          },
          isCorrect: false,
          isPartial: false,
          responseTimeMs: 2000,
          pointsAwarded: 0,
        },

        // Soru 4 (ORDERING): Ahmet tam doğru ([10,20,30]), Zeynep 1. sıra doğru ([10,30,20]), Mehmet boş
        {
          sessionId: richSessionId,
          participantId: pAhmet,
          questionIndex: 3,
          selectedOptionId: q3.options[0]!.id,
          answerPayload: {
            type: 'ORDERING',
            orderedOptionIds: [
              q3.options[0]!.id,
              q3.options[1]!.id,
              q3.options[2]!.id,
            ],
          },
          isCorrect: true,
          isPartial: false,
          responseTimeMs: 2200,
          pointsAwarded: 1000,
        },
        {
          sessionId: richSessionId,
          participantId: pZeynep,
          questionIndex: 3,
          selectedOptionId: q3.options[0]!.id,
          answerPayload: {
            type: 'ORDERING',
            orderedOptionIds: [
              q3.options[0]!.id,
              q3.options[2]!.id,
              q3.options[1]!.id,
            ],
          },
          isCorrect: false,
          isPartial: false,
          responseTimeMs: 2800,
          pointsAwarded: 0,
        },
      ],
    });

    // 2. Katılımcısız oturum (0 oyuncu)
    const emptySession = await prisma.gameSession.create({
      data: {
        pin: String(Math.floor(100000 + Math.random() * 899999)),
        hostTokenHash: `host_hash_empty_${suffix}`,
        quizId,
        hostTeacherId: teacherAId,
        quizTitle: 'Katılımcısız Test Yarışması',
        quizCategory: 'Genel Kültür',
        status: 'CANCELLED',
        startedAt: new Date('2026-11-18T10:00:00.000Z'),
        endedAt: new Date('2026-11-18T10:01:00.000Z'),
        createdAt: new Date('2026-11-18T10:00:00.000Z'),
        quizSnapshot: {
          title: 'Katılımcısız Test Yarışması',
          category: 'Genel Kültür',
          questions: [q0],
        },
      },
    });
    emptySessionId = emptySession.id;
    createdSessionIds.push(emptySessionId);

    // 3. Katılımcılı fakat 0 yanıtlı oturum
    const pSilent = `part_silent_${suffix}`;
    const zeroAnsSession = await prisma.gameSession.create({
      data: {
        pin: String(Math.floor(100000 + Math.random() * 899999)),
        hostTokenHash: `host_hash_zero_${suffix}`,
        quizId,
        hostTeacherId: teacherAId,
        quizTitle: 'Sıfır Yanıtlı Yarışma',
        quizCategory: 'Tarih',
        status: 'INTERRUPTED',
        startedAt: new Date('2026-11-17T10:00:00.000Z'),
        endedAt: new Date('2026-11-17T10:02:00.000Z'),
        createdAt: new Date('2026-11-17T10:00:00.000Z'),
        quizSnapshot: {
          title: 'Sıfır Yanıtlı Yarışma',
          category: 'Tarih',
          questions: [q0],
        },
        participants: {
          create: [
            {
              id: pSilent,
              nickname: 'Sessiz Oyuncu',
              normalizedName: 'sessiz oyuncu',
              reconnectTokenHash: `tok_silent_${suffix}`,
              score: 0,
              correctCount: 0,
              totalResponseMs: 0,
            },
          ],
        },
        results: {
          create: [
            {
              participantId: pSilent,
              nickname: 'Sessiz Oyuncu',
              rank: 1,
              totalScore: 0,
              correctCount: 0,
              totalQuestions: 1,
              avgResponseMs: 0,
            },
          ],
        },
      },
    });
    zeroAnswerSessionId = zeroAnsSession.id;
    createdSessionIds.push(zeroAnswerSessionId);
  });

  afterAll(async () => {
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

  it('1. Yarışma geçmişi listesi, quiz adına göre arama ve tarihe göre sıralamayı destekler', async () => {
    const listRes = await fetch(`${baseUrl}/api/games/history`, {
      headers: { Cookie: teacherACookie },
    });
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as { history: GameHistorySummary[] };
    expect(listBody.history.length).toBeGreaterThanOrEqual(3);

    const richSummary = listBody.history.find((h) => h.id === richSessionId);
    expect(richSummary).toBeDefined();
    expect(richSummary?.participantCount).toBe(3);
    expect(richSummary?.questionCount).toBe(4);
    expect(richSummary?.durationSec).toBe(240);
    expect(richSummary?.averageSuccessRatePct).toBe(41.7);

    // Arama filtresi
    const searchRes = await fetch(
      `${baseUrl}/api/games/history?search=${encodeURIComponent('Kapsamlı Analiz')}`,
      { headers: { Cookie: teacherACookie } },
    );
    expect(searchRes.status).toBe(200);
    const searchBody = (await searchRes.json()) as {
      history: GameHistorySummary[];
    };
    expect(searchBody.history).toHaveLength(1);
    expect(searchBody.history[0]?.id).toBe(richSessionId);

    // En eski sıralaması
    const oldestRes = await fetch(`${baseUrl}/api/games/history?sort=oldest`, {
      headers: { Cookie: teacherACookie },
    });
    expect(oldestRes.status).toBe(200);
    const oldestBody = (await oldestRes.json()) as {
      history: GameHistorySummary[];
    };
    expect(oldestBody.history[0]?.id).toBe(zeroAnswerSessionId);
  });

  it('2. Yetkisiz erişim (401) ve başka öğretmenin yarışma analizine/raporuna erişim (404) engellenir', async () => {
    const unauthRes = await fetch(
      `${baseUrl}/api/games/history/${richSessionId}/analytics`,
    );
    expect(unauthRes.status).toBe(401);

    const otherAnalyticsRes = await fetch(
      `${baseUrl}/api/games/history/${richSessionId}/analytics`,
      { headers: { Cookie: teacherBCookie } },
    );
    expect(otherAnalyticsRes.status).toBe(404);

    const otherCsvRes = await fetch(
      `${baseUrl}/api/games/history/${richSessionId}/csv`,
      { headers: { Cookie: teacherBCookie } },
    );
    expect(otherCsvRes.status).toBe(404);

    const otherPdfRes = await fetch(
      `${baseUrl}/api/games/history/${richSessionId}/pdf`,
      { headers: { Cookie: teacherBCookie } },
    );
    expect(otherPdfRes.status).toBe(404);
  });

  it('3. Detaylı analiz endpointi genel özet, 4 soru türü dağılımı, zor sorular ve öğrenci dökümünü eksiksiz hesaplar', async () => {
    const res = await fetch(
      `${baseUrl}/api/games/history/${richSessionId}/analytics`,
      { headers: { Cookie: teacherACookie } },
    );
    expect(res.status).toBe(200);
    const { analytics } = (await res.json()) as {
      analytics: GameSessionAnalytics;
    };

    // Genel özet
    expect(analytics.overview.totalParticipants).toBe(3);
    expect(analytics.overview.totalAnswersSubmitted).toBe(10);
    expect(analytics.overview.highestScore).toBe(4650);
    expect(analytics.overview.highestScorerNickname).toBe('Ahmet Yılmaz');
    expect(analytics.overview.averageScore).toBe(2167);
    expect(analytics.overview.averageSuccessRatePct).toBe(41.7);
    expect(analytics.overview.averageResponseMs).toBe(2060);
    expect(analytics.overview.hardestQuestion).not.toBeNull();

    // Soru 1: Çoktan Seçmeli
    const qMc = analytics.questions[0]!;
    expect(qMc.type).toBe('MULTIPLE_CHOICE');
    expect(qMc.correctCount).toBe(1);
    expect(qMc.wrongCount).toBe(2);
    expect(qMc.unansweredCount).toBe(0);
    expect(qMc.successRatePct).toBe(33.3);
    expect(qMc.mostCommonWrongAnswer).toContain('Satürn');
    expect(qMc.optionDistribution).toHaveLength(4);

    // Soru 2: Doğru / Yanlış
    const qTf = analytics.questions[1]!;
    expect(qTf.type).toBe('TRUE_FALSE');
    expect(qTf.correctCount).toBe(2);
    expect(qTf.unansweredCount).toBe(1);
    expect(qTf.successRatePct).toBe(66.7);

    // Soru 3: Çoklu Seçim (kısmi puanlı)
    const qMs = analytics.questions[2]!;
    expect(qMs.type).toBe('MULTI_SELECT');
    expect(qMs.correctCount).toBe(1);
    expect(qMs.partialCount).toBe(1);
    expect(qMs.wrongCount).toBe(2);
    expect(qMs.optionDistribution[0]?.count).toBe(2); // "2" seçeneği Ahmet ve Zeynep tarafından seçildi

    // Soru 4: Sıralama (ORDERING)
    const qOrd = analytics.questions[3]!;
    expect(qOrd.type).toBe('ORDERING');
    expect(qOrd.correctCount).toBe(1);
    expect(qOrd.wrongCount).toBe(1);
    expect(qOrd.unansweredCount).toBe(1);
    // 1. sıra ("10") hem Ahmet hem Zeynep tarafından doğru yerleştirildi (2 öğrenci)
    expect(qOrd.optionDistribution[0]?.count).toBe(2);
    // 2. sıra ("20") yalnız Ahmet tarafından doğru yerleştirildi (1 öğrenci)
    expect(qOrd.optionDistribution[1]?.count).toBe(1);

    // Öğrenci soru bazlı dökümü
    const zeynep = analytics.participants.find(
      (p) => p.nickname === 'Zeynep Şahin',
    );
    expect(zeynep).toBeDefined();
    expect(zeynep?.partialCount).toBe(1);
    expect(zeynep?.questionBreakdown).toHaveLength(4);
    expect(zeynep?.questionBreakdown[2]?.status).toBe('PARTIAL');

    // Grafik serileri
    expect(analytics.charts.questionSuccessAndTime).toHaveLength(4);
    expect(analytics.charts.scoreDistribution).toHaveLength(5);
  });

  it('4. Quizi sonradan düzenlemek geçmiş yarışmanın dondurulmuş (snapshot) analiz verilerini bozmaz', async () => {
    const updateRes = await fetch(`${baseUrl}/api/quizzes/${quizId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: teacherACookie,
        'X-CSRF-Token': teacherACsrf,
      },
      body: JSON.stringify({
        title: 'Düzenlenmiş Yeni Quiz Başlığı',
        category: 'Bilgisayar ve Teknoloji',
        questions: [
          {
            order: 0,
            type: 'MULTIPLE_CHOICE',
            text: 'Tamamen değiştirilmiş yeni soru metni?',
            timeLimitSec: 20,
            points: 1000,
            options: [
              { order: 0, text: 'Yeni A', isCorrect: true },
              { order: 1, text: 'Yeni B', isCorrect: false },
            ],
          },
        ],
      }),
    });
    expect(updateRes.status).toBe(200);

    // Geçmiş yarışma analizi hâlâ oynandığı andaki 4 soruyu ve orijinal metinleri korumalıdır
    const analyticsRes = await fetch(
      `${baseUrl}/api/games/history/${richSessionId}/analytics`,
      { headers: { Cookie: teacherACookie } },
    );
    expect(analyticsRes.status).toBe(200);
    const { analytics } = (await analyticsRes.json()) as {
      analytics: GameSessionAnalytics;
    };
    expect(analytics.totalQuestions).toBe(4);
    expect(analytics.questions[0]?.text).toBe(
      'Güneş sisteminin en büyük gezegeni hangisidir?',
    );
  });

  it('5. Katılımcısız (0 oyuncu) ve sıfır yanıtlı yarışmalarda sahte sayı üretmeden null güvenli yanıt döner', async () => {
    const emptyRes = await fetch(
      `${baseUrl}/api/games/history/${emptySessionId}/analytics`,
      { headers: { Cookie: teacherACookie } },
    );
    expect(emptyRes.status).toBe(200);
    const emptyBody = (await emptyRes.json()) as {
      analytics: GameSessionAnalytics;
    };
    expect(emptyBody.analytics.overview.totalParticipants).toBe(0);
    expect(emptyBody.analytics.overview.averageSuccessRatePct).toBeNull();
    expect(emptyBody.analytics.overview.averageScore).toBeNull();
    expect(emptyBody.analytics.overview.highestScore).toBeNull();
    expect(emptyBody.analytics.overview.averageResponseMs).toBeNull();
    expect(emptyBody.analytics.overview.hardestQuestion).toBeNull();

    const zeroAnsRes = await fetch(
      `${baseUrl}/api/games/history/${zeroAnswerSessionId}/analytics`,
      { headers: { Cookie: teacherACookie } },
    );
    expect(zeroAnsRes.status).toBe(200);
    const zeroAnsBody = (await zeroAnsRes.json()) as {
      analytics: GameSessionAnalytics;
    };
    expect(zeroAnsBody.analytics.overview.totalParticipants).toBe(1);
    expect(zeroAnsBody.analytics.overview.totalAnswersSubmitted).toBe(0);
    expect(zeroAnsBody.analytics.overview.averageResponseMs).toBeNull();
    expect(zeroAnsBody.analytics.questions[0]?.averageResponseMs).toBeNull();
  });

  it('6. CSV ve A4 PDF rapor dışa aktarma endpointleri Türkçe karakterlerle geçerli dosya üretir', async () => {
    const csvRes = await fetch(
      `${baseUrl}/api/games/history/${richSessionId}/csv`,
      { headers: { Cookie: teacherACookie } },
    );
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers.get('content-type')).toContain('text/csv');
    const csvBuffer = Buffer.from(await csvRes.arrayBuffer());
    expect(csvBuffer.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(
      true,
    );
    const csvText = csvBuffer.toString('utf8');
    expect(csvText).toContain('"BÖLÜM","YARIŞMA BİLGİLERİ"');
    expect(csvText).toContain('"BÖLÜM","KATILIMCI SONUÇLARI"');
    expect(csvText).toContain('"BÖLÜM","SORU BAZLI İSTATİSTİKLER"');
    expect(csvText).toContain('"Ahmet Yılmaz"');
    expect(csvText).toContain('"Zeynep Şahin"');

    const pdfRes = await fetch(
      `${baseUrl}/api/games/history/${richSessionId}/pdf`,
      { headers: { Cookie: teacherACookie } },
    );
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers.get('content-type')).toContain('application/pdf');
    const pdfBytes = Buffer.from(await pdfRes.arrayBuffer());
    expect(pdfBytes.byteLength).toBeGreaterThan(2000);
    expect(pdfBytes.subarray(0, 7).toString('ascii')).toBe('%PDF-1.');
  });

  it('7. Öğretmen paneli özeti (GET /api/dashboard/summary) gerçek tamamlanan yarışma ve katılımcı sayısını döndürür', async () => {
    const resA = await fetch(`${baseUrl}/api/dashboard/summary`, {
      headers: { Cookie: teacherACookie },
    });
    expect(resA.status).toBe(200);
    const bodyA = (await resA.json()) as {
      totalQuizzes: number;
      completedSessionsCount: number;
      totalParticipantsCount: number;
    };
    expect(bodyA.totalQuizzes).toBeGreaterThanOrEqual(1);
    expect(bodyA.completedSessionsCount).toBe(1);
    expect(bodyA.totalParticipantsCount).toBe(3);

    const resB = await fetch(`${baseUrl}/api/dashboard/summary`, {
      headers: { Cookie: teacherBCookie },
    });
    expect(resB.status).toBe(200);
    const bodyB = (await resB.json()) as {
      completedSessionsCount: number;
      totalParticipantsCount: number;
    };
    expect(bodyB.completedSessionsCount).toBe(0);
    expect(bodyB.totalParticipantsCount).toBe(0);
  });
});
