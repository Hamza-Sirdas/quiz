import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  ExploreQuizDetail,
  ExploreQuizzesResponse,
  QuizDetail,
  QuizShareState,
  QuizSummary,
} from '../src/types/quiz';
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

describe('Aşama 10: Quiz Kütüphanesi, Keşfet, Gizlilik, Paylaşım ve Kopyalama Sistemi', () => {
  const { httpServer, gameManager, io } = createServerApp();

  let baseUrl = '';
  let teacherAId = '';
  let teacherACookie = '';
  let teacherACsrf = '';
  let teacherBId = '';
  let teacherBCookie = '';
  let teacherBCsrf = '';

  let publicQuizId = '';
  let privateQuizId = '';
  let unlistedQuizId = '';
  let unlistedShareToken = '';

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
      'Kütüphane Öğretmeni A',
      `kutuphane.a.${suffix}@quizora.test`,
      'GucluSifre123',
    );
    teacherAId = tA.teacherId;
    teacherACookie = tA.cookie;
    teacherACsrf = tA.csrfToken;
    createdTeacherIds.push(teacherAId);

    const tB = await registerTestTeacher(
      baseUrl,
      'Kütüphane Öğretmeni B',
      `kutuphane.b.${suffix}@quizora.test`,
      'GucluSifre123',
    );
    teacherBId = tB.teacherId;
    teacherBCookie = tB.cookie;
    teacherBCsrf = tB.csrfToken;
    createdTeacherIds.push(teacherBId);
  });

  afterAll(async () => {
    gameManager.dispose();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));

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

  it('1. Eski quizler ve görünürlük belirtilmeyen yeni quizler varsayılan olarak Özel (PRIVATE) oluşturulur', async () => {
    const res = await fetch(`${baseUrl}/api/quizzes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: teacherACookie,
        'X-CSRF-Token': teacherACsrf,
      },
      body: JSON.stringify({
        title: 'Varsayılan Özel Quiz',
        description: 'Görünürlük alanı gönderilmeden oluşturuldu',
        category: 'Matematik',
        status: 'PUBLISHED',
        questions: [
          {
            type: 'MULTIPLE_CHOICE',
            text: '5 + 7 kaçtır?',
            timeLimitSec: 20,
            points: 1000,
            options: [
              { text: '12', isCorrect: true },
              { text: '11', isCorrect: false },
            ],
          },
        ],
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { quiz: QuizDetail };
    privateQuizId = body.quiz.id;
    createdQuizIds.push(privateQuizId);
    expect(body.quiz.visibility).toBe('PRIVATE');
    expect(body.quiz.shareToken).toBeNull();
  });

  it('2. Herkese açık (PUBLIC) ve Bağlantıya Özel (UNLISTED) quiz oluşturulabilir, tahmin edilmesi zor shareToken üretilir', async () => {
    // PUBLIC quiz
    const pubRes = await fetch(`${baseUrl}/api/quizzes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: teacherACookie,
        'X-CSRF-Token': teacherACsrf,
      },
      body: JSON.stringify({
        title: 'Aşama 10 Herkese Açık Teknoloji Quizi',
        description: 'Algoritma ve veri yapıları üzerine açık bilgi yarışması',
        category: 'Teknoloji',
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
        allowPublicPreview: true,
        questions: [
          {
            type: 'MULTIPLE_CHOICE',
            text: 'İkili arama (Binary Search) karmaşıklığı nedir?',
            explanation: 'Her adımda arama uzayı yarıya iner.',
            timeLimitSec: 20,
            points: 1200,
            options: [
              { text: 'O(log n)', isCorrect: true },
              { text: 'O(n^2)', isCorrect: false },
            ],
          },
          {
            type: 'TRUE_FALSE',
            text: 'TCP bağlantı yönelimli bir protokoldür.',
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
    expect(pubRes.status).toBe(201);
    const pubBody = (await pubRes.json()) as { quiz: QuizDetail };
    publicQuizId = pubBody.quiz.id;
    createdQuizIds.push(publicQuizId);
    expect(pubBody.quiz.visibility).toBe('PUBLIC');

    // UNLISTED quiz
    const unlRes = await fetch(`${baseUrl}/api/quizzes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: teacherACookie,
        'X-CSRF-Token': teacherACsrf,
      },
      body: JSON.stringify({
        title: 'Bağlantıya Özel İngilizce Quizi',
        description: 'Yalnızca bağlantı sahiplerine açık',
        category: 'İngilizce',
        status: 'PUBLISHED',
        visibility: 'UNLISTED',
        allowPublicPreview: true,
        questions: [
          {
            type: 'MULTIPLE_CHOICE',
            text: '"Book" kelimesinin Türkçe karşılığı nedir?',
            timeLimitSec: 15,
            points: 1000,
            options: [
              { text: 'Kitap', isCorrect: true },
              { text: 'Defter', isCorrect: false },
            ],
          },
        ],
      }),
    });
    expect(unlRes.status).toBe(201);
    const unlBody = (await unlRes.json()) as { quiz: QuizDetail };
    unlistedQuizId = unlBody.quiz.id;
    unlistedShareToken = unlBody.quiz.shareToken ?? '';
    createdQuizIds.push(unlistedQuizId);

    expect(unlBody.quiz.visibility).toBe('UNLISTED');
    expect(unlistedShareToken.length).toBeGreaterThanOrEqual(24);
  });

  it('3. Keşfet (/api/explore) yalnızca PUBLIC quizleri listeler; PRIVATE ve UNLISTED quizler aramada gizlenir, öğretmenin e-postası sızdırılmaz', async () => {
    const exploreRes = await fetch(
      `${baseUrl}/api/explore?search=${encodeURIComponent('Aşama 10 Herkese Açık')}`,
    );
    expect(exploreRes.status).toBe(200);
    const exploreBody = (await exploreRes.json()) as ExploreQuizzesResponse;

    expect(exploreBody.quizzes).toHaveLength(1);
    const item = exploreBody.quizzes[0]!;
    expect(item.id).toBe(publicQuizId);
    expect(item.authorName).toBe('Kütüphane Öğretmeni A');
    expect(JSON.stringify(item)).not.toContain('quizora.test');

    // Özel veya bağlantıya özel quiz aramada çıkmamalı
    const unlistedSearch = await fetch(
      `${baseUrl}/api/explore?search=${encodeURIComponent('Bağlantıya Özel İngilizce')}`,
    );
    const unlistedSearchBody =
      (await unlistedSearch.json()) as ExploreQuizzesResponse;
    expect(unlistedSearchBody.quizzes).toHaveLength(0);

    // Kategori ve soru sayısı filtresi
    const catRes = await fetch(
      `${baseUrl}/api/explore?category=${encodeURIComponent('Teknoloji')}&minQuestions=2&maxQuestions=5`,
    );
    const catBody = (await catRes.json()) as ExploreQuizzesResponse;
    expect(catBody.quizzes.some((q) => q.id === publicQuizId)).toBe(true);
  });

  it('4. Özel quize yetkisiz erişim (403) engellenir; bağlantıya özel quize yalnızca geçerli token ile erişilir ve token iptal edildiğinde erişim kapanır', async () => {
    // PRIVATE quiz başka öğretmene 403 döner
    const privDetailRes = await fetch(
      `${baseUrl}/api/explore/${privateQuizId}`,
      { headers: { Cookie: teacherBCookie } },
    );
    expect(privDetailRes.status).toBe(403);

    // UNLISTED quiz tokensiz 403 döner
    const unlNoTokenRes = await fetch(
      `${baseUrl}/api/explore/${unlistedQuizId}`,
      { headers: { Cookie: teacherBCookie } },
    );
    expect(unlNoTokenRes.status).toBe(403);

    // UNLISTED quiz geçerli token ile 200 döner
    const unlWithTokenRes = await fetch(
      `${baseUrl}/api/explore/${unlistedQuizId}?token=${encodeURIComponent(unlistedShareToken)}`,
      { headers: { Cookie: teacherBCookie } },
    );
    expect(unlWithTokenRes.status).toBe(200);
    const unlDetail = (await unlWithTokenRes.json()) as {
      quiz: ExploreQuizDetail;
    };
    expect(unlDetail.quiz.title).toBe('Bağlantıya Özel İngilizce Quizi');
    expect(unlDetail.quiz.questions).toHaveLength(1);

    // Öğretmen A paylaşımı kapatır (REVOKE_LINK)
    const revokeRes = await fetch(
      `${baseUrl}/api/quizzes/${unlistedQuizId}/share`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: teacherACookie,
          'X-CSRF-Token': teacherACsrf,
        },
        body: JSON.stringify({ action: 'REVOKE_LINK' }),
      },
    );
    expect(revokeRes.status).toBe(200);
    const revokeBody = (await revokeRes.json()) as { share: QuizShareState };
    expect(revokeBody.share.shareToken).toBeNull();
    expect(revokeBody.share.visibility).toBe('PRIVATE');

    // Eski paylaşım bağlantısı artık 403 dönmeli
    const revokedAccessRes = await fetch(
      `${baseUrl}/api/explore/${unlistedQuizId}?token=${encodeURIComponent(unlistedShareToken)}`,
      { headers: { Cookie: teacherBCookie } },
    );
    expect(revokedAccessRes.status).toBe(403);
  });

  it('5. Kütüphaneme Ekle (clone) işlemi yeni kimlik, yeni sahip, Özel görünürlük ve originalQuizId ile bağımsız kopya üretir; kopyayı düzenlemek orijinali değiştirmez', async () => {
    // Özel quiz başka öğretmen tarafından kopyalanamaz (403)
    const forbiddenClone = await fetch(
      `${baseUrl}/api/quizzes/${privateQuizId}/clone`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: teacherBCookie,
          'X-CSRF-Token': teacherBCsrf,
        },
        body: JSON.stringify({}),
      },
    );
    expect(forbiddenClone.status).toBe(403);

    // Herkese açık quiz Öğretmen B tarafından kütüphaneye kopyalanır
    const cloneRes = await fetch(
      `${baseUrl}/api/quizzes/${publicQuizId}/clone`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: teacherBCookie,
          'X-CSRF-Token': teacherBCsrf,
        },
        body: JSON.stringify({}),
      },
    );
    expect(cloneRes.status).toBe(201);
    const { quiz: clonedQuiz } = (await cloneRes.json()) as {
      quiz: QuizDetail;
    };
    createdQuizIds.push(clonedQuiz.id);

    expect(clonedQuiz.id).not.toBe(publicQuizId);
    expect(clonedQuiz.visibility).toBe('PRIVATE');
    expect(clonedQuiz.originalQuizId).toBe(publicQuizId);
    expect(clonedQuiz.originalQuizTitle).toBe(
      'Aşama 10 Herkese Açık Teknoloji Quizi',
    );
    expect(clonedQuiz.questions).toHaveLength(2);
    expect(clonedQuiz.questions[0]?.points).toBe(1200);

    // Öğretmen B kopyayı düzenler
    const editCloneRes = await fetch(
      `${baseUrl}/api/quizzes/${clonedQuiz.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: teacherBCookie,
          'X-CSRF-Token': teacherBCsrf,
        },
        body: JSON.stringify({
          title: 'Öğretmen B Düzenlenmiş Kopya',
          description: 'Yalnızca kopya değişti',
          category: 'Teknoloji',
          status: 'PUBLISHED',
          visibility: 'PRIVATE',
          questions: [
            {
              type: 'MULTIPLE_CHOICE',
              text: 'Kopyadaki yeni soru metni?',
              timeLimitSec: 30,
              points: 1500,
              options: [
                { text: 'Evet', isCorrect: true },
                { text: 'Hayır', isCorrect: false },
              ],
            },
          ],
        }),
      },
    );
    expect(editCloneRes.status).toBe(200);

    // Orijinal quiz (Öğretmen A) hiç etkilenmemiş olmalı
    const originalCheckRes = await fetch(
      `${baseUrl}/api/quizzes/${publicQuizId}`,
      { headers: { Cookie: teacherACookie } },
    );
    expect(originalCheckRes.status).toBe(200);
    const { quiz: originalQuiz } = (await originalCheckRes.json()) as {
      quiz: QuizDetail;
    };
    expect(originalQuiz.title).toBe('Aşama 10 Herkese Açık Teknoloji Quizi');
    expect(originalQuiz.questions).toHaveLength(2);
    expect(originalQuiz.questions[0]?.text).toBe(
      'İkili arama (Binary Search) karmaşıklığı nedir?',
    );
  });

  it('6. Paylaşılan Quizler filtresi (visibility=SHARED) öğretmenin paylaştığı quizleri listeler', async () => {
    const sharedRes = await fetch(
      `${baseUrl}/api/quizzes?visibility=SHARED`,
      { headers: { Cookie: teacherACookie } },
    );
    expect(sharedRes.status).toBe(200);
    const sharedBody = (await sharedRes.json()) as { quizzes: QuizSummary[] };
    expect(sharedBody.quizzes.some((q) => q.id === publicQuizId)).toBe(true);
    expect(sharedBody.quizzes.some((q) => q.id === privateQuizId)).toBe(false);
  });
});
