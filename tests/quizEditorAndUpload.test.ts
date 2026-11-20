import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServerApp } from '../server/app';
import { prisma } from '../server/lib/prisma';
import { UPLOADS_DIR } from '../server/middleware/upload';

function parseCookies(res: Response): string {
  const raw =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie') ?? ''].filter(Boolean);

  return raw
    .map((line) => line.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');
}

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

const VALID_JPEG_HEADER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);

const VALID_WEBP_HEADER = Buffer.from('RIFF\x24\x00\x00\x00WEBPVP8 ', 'latin1');

describe('Aşama 8: Gelişmiş Quiz Editörü, Soru Türleri, Taslaklar ve Medya Yükleme', () => {
  const { httpServer, gameManager, io } = createServerApp();
  let baseUrl = '';
  let teacherCookie = '';
  let csrfToken = '';
  const createdTeacherIds: string[] = [];
  const createdQuizIds: string[] = [];
  const createdUploadFiles: string[] = [];

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = httpServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const reg = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Editör Test Öğretmeni',
        email: `editor-test-${suffix}@quizora.local`,
        password: 'GucluSifre123!',
        passwordConfirm: 'GucluSifre123!',
        acceptedTerms: true,
      }),
    });
    const regJson = (await reg.json()) as {
      teacher: { id: string };
      csrfToken: string;
    };
    teacherCookie = parseCookies(reg);
    csrfToken = regJson.csrfToken;
    createdTeacherIds.push(regJson.teacher.id);
  });

  afterAll(async () => {
    for (const relUrl of createdUploadFiles) {
      const filename = path.basename(relUrl);
      await fs.promises.unlink(path.join(UPLOADS_DIR, filename)).catch(() => undefined);
    }
    gameManager.dispose();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    if (httpServer.listening) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
    if (createdQuizIds.length > 0) {
      await prisma.quiz.deleteMany({ where: { id: { in: createdQuizIds } } });
    }
    if (createdTeacherIds.length > 0) {
      await prisma.teacher.deleteMany({ where: { id: { in: createdTeacherIds } } });
    }
    await prisma.$disconnect();
  });

  it('taslak kaydetme, eksik taslağı yarışmada engelleme, yayına alma ve eski şemayla uyumluluğu doğrular', async () => {
    // 1. Eski payload formatı (status/type/explanation olmadan) otomatik PUBLISHED + MULTIPLE_CHOICE olarak kaydedilmeli
    const legacyRes = await fetch(`${baseUrl}/api/quizzes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: teacherCookie,
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({
        title: 'Eski Uyumluluk Quizi',
        description: '',
        category: 'Genel Kültür',
        questions: [
          {
            text: 'Klasik soru?',
            timeLimitSec: 20,
            points: 1000,
            options: [
              { text: 'Doğru', isCorrect: true },
              { text: 'Yanlış 1', isCorrect: false },
              { text: 'Yanlış 2', isCorrect: false },
              { text: 'Yanlış 3', isCorrect: false },
            ],
          },
        ],
      }),
    });
    expect(legacyRes.status).toBe(201);
    const { quiz: legacyQuiz } = (await legacyRes.json()) as {
      quiz: { id: string; status: string; questions: Array<{ type: string }> };
    };
    createdQuizIds.push(legacyQuiz.id);
    expect(legacyQuiz.status).toBe('PUBLISHED');
    expect(legacyQuiz.questions[0]?.type).toBe('MULTIPLE_CHOICE');

    // 2. Eksik sorular içeren taslak kaydedilebilmeli
    const draftRes = await fetch(`${baseUrl}/api/quizzes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: teacherCookie,
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({
        status: 'DRAFT',
        title: 'Tamamlanmamış Taslak',
        category: 'Matematik',
        questions: [
          {
            type: 'MULTIPLE_CHOICE',
            text: '',
            options: [
              { text: '', isCorrect: false },
              { text: '', isCorrect: false },
            ],
          },
        ],
      }),
    });
    expect(draftRes.status).toBe(201);
    const { quiz: draftQuiz } = (await draftRes.json()) as {
      quiz: { id: string; status: string };
    };
    createdQuizIds.push(draftQuiz.id);
    expect(draftQuiz.status).toBe('DRAFT');

    // Taslak durumundaki quiz ile canlı yarışma başlatılamamalı
    const blockedGameRes = await fetch(`${baseUrl}/api/games`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: teacherCookie,
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({ quizId: draftQuiz.id }),
    });
    expect(blockedGameRes.status).toBe(400);
    const blockedJson = (await blockedGameRes.json()) as { code: string };
    expect(blockedJson.code).toBe('QUIZ_NOT_PUBLISHED');

    // Eksik sorularla yayına almaya çalışıldığında 400 dönmeli
    const invalidPublishRes = await fetch(`${baseUrl}/api/quizzes/${draftQuiz.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: teacherCookie,
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({
        status: 'PUBLISHED',
        title: 'Eksik Yayın Denemesi',
        category: 'Matematik',
        questions: [
          {
            type: 'MULTI_SELECT',
            text: 'Soru metni var',
            options: [
              { text: 'Tek doğru', isCorrect: true },
              { text: 'Yanlış', isCorrect: false },
            ],
          },
        ],
      }),
    });
    expect(invalidPublishRes.status).toBe(400);

    // Tüm soruları düzelterek yayına alma -> dashboard sayıları tutarlı olmalı
    const validPublishRes = await fetch(`${baseUrl}/api/quizzes/${draftQuiz.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: teacherCookie,
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({
        status: 'PUBLISHED',
        title: 'Yayınlanan Quiz',
        category: 'Matematik',
        questions: [
          {
            type: 'TRUE_FALSE',
            text: '2 + 2 = 4 ifadesi doğrudur.',
            explanation: 'Temel toplama işlemi.',
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
    expect(validPublishRes.status).toBe(200);
    const publishedBody = (await validPublishRes.json()) as {
      quiz: { status: string; questions: Array<{ explanation: string }> };
    };
    expect(publishedBody.quiz.status).toBe('PUBLISHED');
    expect(publishedBody.quiz.questions[0]?.explanation).toBe('Temel toplama işlemi.');
  });

  it('4 yeni soru türünü ve görsel yükleme güvenli depolama kurallarını doğrular', async () => {
    // Oturumsuz görsel yükleme 401 dönmeli
    const unauthForm = new FormData();
    unauthForm.append('file', new Blob([VALID_PNG_BYTES], { type: 'image/png' }), 'test.png');
    const unauthUpload = await fetch(`${baseUrl}/api/uploads`, {
      method: 'POST',
      body: unauthForm,
    });
    expect(unauthUpload.status).toBe(401);

    // Durum uç noktası
    const statusRes = await fetch(`${baseUrl}/api/uploads/status`, {
      headers: { Cookie: teacherCookie },
    });
    expect(statusRes.status).toBe(200);
    const statusJson = (await statusRes.json()) as { configured: boolean };
    expect(statusJson.configured).toBe(true);

    // Sahte PNG (metin içeriğiyle PNG mimetype) magic-byte kontrolünden 400 ile reddedilmeli
    const spoofForm = new FormData();
    spoofForm.append(
      'file',
      new Blob(['<script>alert(1)</script>'], { type: 'image/png' }),
      'fake.png',
    );
    const spoofRes = await fetch(`${baseUrl}/api/uploads`, {
      method: 'POST',
      headers: { Cookie: teacherCookie, 'X-CSRF-Token': csrfToken },
      body: spoofForm,
    });
    expect(spoofRes.status).toBe(400);

    // Gerçek PNG, JPEG ve WebP kabul edilmeli
    for (const sample of [
      { bytes: VALID_PNG_BYTES, mime: 'image/png', name: 'ok.png', ext: '.png' },
      { bytes: VALID_JPEG_HEADER, mime: 'image/jpeg', name: 'ok.jpg', ext: '.jpg' },
      { bytes: VALID_WEBP_HEADER, mime: 'image/webp', name: 'ok.webp', ext: '.webp' },
    ]) {
      const fd = new FormData();
      fd.append('file', new Blob([sample.bytes], { type: sample.mime }), sample.name);
      const up = await fetch(`${baseUrl}/api/uploads`, {
        method: 'POST',
        headers: { Cookie: teacherCookie, 'X-CSRF-Token': csrfToken },
        body: fd,
      });
      expect(up.status).toBe(201);
      const upJson = (await up.json()) as { url: string };
      expect(upJson.url.endsWith(sample.ext)).toBe(true);
      createdUploadFiles.push(upJson.url);
    }

    const questionImageUrl = createdUploadFiles[0]!;

    // 4 soru türünü tek quizde kaydet
    const createAllRes = await fetch(`${baseUrl}/api/quizzes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: teacherCookie,
        'X-CSRF-Token': csrfToken,
      },
      body: JSON.stringify({
        status: 'PUBLISHED',
        title: 'Aşama 8 Tam Kapsam Quizi',
        description: 'Tüm soru türleri',
        category: 'Bilgisayar ve Teknoloji',
        questions: [
          {
            type: 'MULTIPLE_CHOICE',
            text: '6 seçenekli soru?',
            explanation: 'Doğru seçenek E.',
            imageUrl: questionImageUrl,
            timeLimitSec: 20,
            points: 1000,
            options: [
              { text: 'S1', isCorrect: false },
              { text: 'S2', isCorrect: false },
              { text: 'S3', isCorrect: false },
              { text: 'S4', isCorrect: false },
              { text: 'S5', isCorrect: true },
              { text: 'S6', isCorrect: false },
            ],
          },
          {
            type: 'TRUE_FALSE',
            text: 'HTTP protokolü durumsuz (stateless) çalışır.',
            timeLimitSec: 15,
            points: 1000,
            options: [
              { text: 'Doğru', isCorrect: true },
              { text: 'Yanlış', isCorrect: false },
            ],
          },
          {
            type: 'MULTI_SELECT',
            text: 'Hangileri programlama dilidir?',
            allowPartialCredit: true,
            explanation: 'TypeScript ve Python programlama dilidir.',
            timeLimitSec: 30,
            points: 1500,
            options: [
              { text: 'TypeScript', isCorrect: true },
              { text: 'Python', isCorrect: true },
              { text: 'PNG', isCorrect: false },
              { text: 'JPEG', isCorrect: false },
            ],
          },
          {
            type: 'ORDERING',
            text: 'Veri birimlerini küçükten büyüğe sıralayın.',
            explanation: 'Bit -> Byte -> Kilobyte -> Megabyte.',
            timeLimitSec: 30,
            points: 1200,
            options: [
              { text: 'Bit', isCorrect: true },
              { text: 'Byte', isCorrect: true },
              { text: 'Kilobyte', isCorrect: true },
              { text: 'Megabyte', isCorrect: true },
            ],
          },
        ],
      }),
    });

    expect(createAllRes.status).toBe(201);
    const { quiz: fullQuiz } = (await createAllRes.json()) as {
      quiz: {
        id: string;
        questions: Array<{ id: string; type: string; allowPartialCredit: boolean; imageUrl: string | null; options: unknown[] }>;
      };
    };
    createdQuizIds.push(fullQuiz.id);

    expect(fullQuiz.questions).toHaveLength(4);
    expect(fullQuiz.questions[0]?.options).toHaveLength(6);
    expect(fullQuiz.questions[0]?.imageUrl).toBe(questionImageUrl);
    expect(fullQuiz.questions[1]?.type).toBe('TRUE_FALSE');
    expect(fullQuiz.questions[2]?.type).toBe('MULTI_SELECT');
    expect(fullQuiz.questions[2]?.allowPartialCredit).toBe(true);
    expect(fullQuiz.questions[3]?.type).toBe('ORDERING');
  });
});
