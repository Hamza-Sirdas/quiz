import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServerApp } from '../server/app';
import {
  hashPassword,
  hashSessionToken,
  needsPasswordRehash,
  verifyPassword,
} from '../server/lib/password';
import { prisma } from '../server/lib/prisma';
import { enforceHttps } from '../server/middleware/enforceHttps';
import type {
  EmailSender,
  PasswordResetEmailPayload,
} from '../server/services/emailService';

function parseCookies(res: Response): {
  cookieHeader: string;
  rawHeaders: string[];
} {
  const rawHeaders =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : [res.headers.get('set-cookie') ?? ''].filter(Boolean);

  const cookieHeader = rawHeaders
    .map((line) => line.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');

  return { cookieHeader, rawHeaders };
}

describe('Kimlik Doğrulama, Argon2id, CSRF, Şifre Sıfırlama ve Profil Sistemi', () => {
  const sentEmails: PasswordResetEmailPayload[] = [];
  let emailConfigured = true;

  const stubEmailSender: EmailSender = {
    isConfigured: () => emailConfigured,
    async sendPasswordResetEmail(payload) {
      sentEmails.push(payload);
    },
  };

  const { httpServer, gameManager, io } = createServerApp({
    emailSender: stubEmailSender,
  });

  let baseUrl = '';
  const createdTeacherIds: string[] = [];

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = httpServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    gameManager.dispose();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    if (httpServer.listening) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }

    if (createdTeacherIds.length > 0) {
      await prisma.teacher.deleteMany({
        where: { id: { in: createdTeacherIds } },
      });
    }
    await prisma.$disconnect();
  });

  it('Argon2id hash üretir, doğrular ve eski scrypt hashlerini girişte yükseltir', async () => {
    const hash = hashPassword('GucluSifre1!');
    expect(hash.startsWith('$argon2id$m=65536,t=3,p=1$')).toBe(true);
    expect(verifyPassword('GucluSifre1!', hash)).toBe(true);
    expect(verifyPassword('Yanlis1!', hash)).toBe(false);
    expect(needsPasswordRehash(hash)).toBe(false);

    // Eski scrypt formatında bir öğretmen oluştur ve girişte Argon2id'ye yükseltildiğini doğrula
    const legacyPassword = 'LegacyPassword1!';
    const salt = crypto.randomBytes(16).toString('hex');
    const scryptKey = crypto.scryptSync(legacyPassword, salt, 64).toString('hex');
    const legacyEmail = `legacy-${Date.now()}@quizora.local`;

    const legacyTeacher = await prisma.teacher.create({
      data: {
        name: 'Eski Hesap',
        email: legacyEmail,
        passwordHash: `${salt}:${scryptKey}`,
      },
    });
    createdTeacherIds.push(legacyTeacher.id);
    expect(needsPasswordRehash(legacyTeacher.passwordHash)).toBe(true);

    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: legacyEmail,
        password: legacyPassword,
      }),
    });
    expect(loginRes.status).toBe(200);

    const upgraded = await prisma.teacher.findUnique({
      where: { id: legacyTeacher.id },
      select: { passwordHash: true },
    });
    expect(upgraded?.passwordHash.startsWith('$argon2id$')).toBe(true);
  });

  it('kayıt doğrulama, e-posta normalizasyonu, oturum sabitleme koruması, CSRF, profil, şifre değişimi ve çıkışı yürütür', async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const rawEmail = `  Ogretmen.${unique}@Okul.EDU.TR `;
    const normalizedEmail = `ogretmen.${unique}@okul.edu.tr`;

    // Şifre tekrarı uyuşmazlığı ve koşul onayı eksikliği reddedilmeli
    const invalidConfirm = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Ayşe Yılmaz',
        email: normalizedEmail,
        password: 'GucluSifre1!',
        passwordConfirm: 'FarkliSifre1!',
        acceptedTerms: true,
      }),
    });
    expect(invalidConfirm.status).toBe(400);

    const noTerms = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Ayşe Yılmaz',
        email: normalizedEmail,
        password: 'GucluSifre1!',
        passwordConfirm: 'GucluSifre1!',
        acceptedTerms: false,
      }),
    });
    expect(noTerms.status).toBe(400);

    // Başarılı kayıt (HttpOnly + SameSite cookie kontrolü)
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Ayşe Yılmaz',
        email: rawEmail,
        password: 'GucluSifre1!',
        passwordConfirm: 'GucluSifre1!',
        acceptedTerms: true,
      }),
    });
    expect(regRes.status).toBe(201);
    const regJson = (await regRes.json()) as {
      teacher: { id: string; email: string; name: string };
      csrfToken: string;
    };
    createdTeacherIds.push(regJson.teacher.id);
    expect(regJson.teacher.email).toBe(normalizedEmail);

    const { cookieHeader: cookie1, rawHeaders: raw1 } = parseCookies(regRes);
    const sessionCookieLine = raw1.find((h) => h.startsWith('quizora_session='));
    expect(sessionCookieLine).toContain('HttpOnly');
    expect(sessionCookieLine).toContain('SameSite=Lax');

    // Aynı e-posta ile (büyük harf/boşluk farkıyla bile) ikinci kayıt engellenmeli
    const dupReg = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Başka İsim',
        email: normalizedEmail.toUpperCase(),
        password: 'GucluSifre1!',
        passwordConfirm: 'GucluSifre1!',
        acceptedTerms: true,
      }),
    });
    expect(dupReg.status).toBe(409);

    // CSRF başlığı olmadan mutasyon isteği engellenmeli (403 CSRF_FORBIDDEN)
    const missingCsrfRes = await fetch(`${baseUrl}/api/auth/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie1,
      },
      body: JSON.stringify({
        name: 'Saldırı Denemesi',
        email: normalizedEmail,
      }),
    });
    expect(missingCsrfRes.status).toBe(403);

    // İzinli olmayan Origin başlığıyla istek engellenmeli
    const badOriginRes = await fetch(`${baseUrl}/api/auth/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie1,
        'X-CSRF-Token': regJson.csrfToken,
        Origin: 'https://evil.example',
      },
      body: JSON.stringify({
        name: 'Saldırı Denemesi',
        email: normalizedEmail,
      }),
    });
    expect(badOriginRes.status).toBe(403);

    // Hatalı şifreyle giriş -> 401
    const badLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: normalizedEmail,
        password: 'YanlisPassword1!',
      }),
    });
    expect(badLogin.status).toBe(401);

    // Oturum sabitleme koruması: mevcut cookie1 gönderilerek yeniden giriş yapıldığında cookie1 sunucuda geçersiz kılınmalı
    const login2 = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie1,
        'X-CSRF-Token': regJson.csrfToken,
      },
      body: JSON.stringify({
        email: normalizedEmail,
        password: 'GucluSifre1!',
      }),
    });
    expect(login2.status).toBe(200);
    const login2Json = (await login2.json()) as { csrfToken: string };
    const { cookieHeader: cookie2 } = parseCookies(login2);
    expect(cookie2).not.toBe(cookie1);

    const oldSessionCheck = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Cookie: cookie1 },
    });
    expect(oldSessionCheck.status).toBe(401);

    // Profil güncelleme
    const updatedEmail = `guncel.${unique}@okul.edu.tr`;
    const profRes = await fetch(`${baseUrl}/api/auth/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie2,
        'X-CSRF-Token': login2Json.csrfToken,
      },
      body: JSON.stringify({
        name: 'Dr. Ayşe Yılmaz',
        email: updatedEmail,
      }),
    });
    expect(profRes.status).toBe(200);
    const profJson = (await profRes.json()) as {
      teacher: { name: string; email: string };
    };
    expect(profJson.teacher.name).toBe('Dr. Ayşe Yılmaz');
    expect(profJson.teacher.email).toBe(updatedEmail);

    // Şifre değiştirme -> oturum döngüsü (eski cookie2 iptal, yeni cookie3 aktif)
    const chPwdRes = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie2,
        'X-CSRF-Token': login2Json.csrfToken,
      },
      body: JSON.stringify({
        currentPassword: 'GucluSifre1!',
        newPassword: 'YeniGucluSifre2!',
        newPasswordConfirm: 'YeniGucluSifre2!',
      }),
    });
    expect(chPwdRes.status).toBe(200);
    const chPwdJson = (await chPwdRes.json()) as { csrfToken: string };
    const { cookieHeader: cookie3 } = parseCookies(chPwdRes);

    expect(
      (await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie2 } })).status,
    ).toBe(401);
    expect(
      (await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie3 } })).status,
    ).toBe(200);

    // Çıkış yap -> sunucudaki oturum silinir -> /me 401 döner
    const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Cookie: cookie3,
        'X-CSRF-Token': chPwdJson.csrfToken,
      },
    });
    expect(logoutRes.status).toBe(200);

    expect(
      (await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie3 } })).status,
    ).toBe(401);
  });

  it('şifre sıfırlama akışını, tek kullanımlık belirteci ve yapılandırılmamış e-posta durumunu doğrular', async () => {
    const email = `reset-${Date.now()}@quizora.local`;
    const reg = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Sıfırlama Öğretmeni',
        email,
        password: 'IlkSifre123!',
        passwordConfirm: 'IlkSifre123!',
        acceptedTerms: true,
      }),
    });
    expect(reg.status).toBe(201);
    const regJson = (await reg.json()) as { teacher: { id: string } };
    createdTeacherIds.push(regJson.teacher.id);
    const { cookieHeader: activeSessionCookie } = parseCookies(reg);

    // E-posta servisi yapılandırılmadığında dürüstçe 503 döndürür
    emailConfigured = false;
    const statusOff = await fetch(`${baseUrl}/api/auth/password-reset-status`);
    expect((await statusOff.json()) as { emailDeliveryConfigured: boolean }).toEqual({
      emailDeliveryConfigured: false,
    });
    const forgotOff = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    expect(forgotOff.status).toBe(503);

    // Servis aktifken var olan ve olmayan e-posta için aynı yanıtı verir (anti-enumeration)
    emailConfigured = true;
    sentEmails.length = 0;

    const forgotMissing = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'olmayan-hesap@quizora.local' }),
    });
    const forgotExisting = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    expect(forgotMissing.status).toBe(200);
    expect(forgotExisting.status).toBe(200);
    expect(await forgotMissing.json()).toEqual(await forgotExisting.json());
    expect(sentEmails).toHaveLength(1);

    const resetUrl = new URL(sentEmails[0]!.resetUrl);
    const rawToken = resetUrl.searchParams.get('token')!;
    expect(rawToken.length).toBeGreaterThanOrEqual(32);

    // DB'de düz token değil SHA-256 hash saklanır
    const dbToken = await prisma.passwordResetToken.findFirst({
      where: { teacherId: regJson.teacher.id },
    });
    expect(dbToken).not.toBeNull();
    expect(dbToken?.tokenHash).toBe(hashSessionToken(rawToken));
    expect(dbToken?.tokenHash).not.toBe(rawToken);

    // Token doğrulama
    const verifyRes = await fetch(`${baseUrl}/api/auth/reset-password/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rawToken }),
    });
    expect((await verifyRes.json()) as { valid: boolean }).toEqual({ valid: true });

    // Yeni şifre belirle
    const doReset = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: rawToken,
        newPassword: 'SifirlanmisSifre9!',
        newPasswordConfirm: 'SifirlanmisSifre9!',
      }),
    });
    expect(doReset.status).toBe(200);

    // Aktif tüm oturumlar sıfırlama sonrası iptal edilmeli
    expect(
      (await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: activeSessionCookie } }))
        .status,
    ).toBe(401);

    // Aynı token ikinci kez kullanılamamalı
    const reuseReset = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: rawToken,
        newPassword: 'BaskaSifre9!',
        newPasswordConfirm: 'BaskaSifre9!',
      }),
    });
    expect(reuseReset.status).toBe(400);

    // Yeni şifre ile giriş çalışmalı
    const loginNew = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'SifirlanmisSifre9!',
      }),
    });
    expect(loginNew.status).toBe(200);
  });

  it('üretim modunda HTTPS zorunluluğu ara katmanını uygular', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const testApp = express();
    testApp.use(enforceHttps);
    testApp.get('/api/health', (_req, res) => res.json({ ok: true }));
    testApp.get('/api/auth/me', (_req, res) => res.json({ ok: true }));

    const srv = testApp.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => srv.once('listening', () => resolve()));
    const port = (srv.address() as AddressInfo).port;

    try {
      const httpAttempt = await fetch(`http://127.0.0.1:${port}/api/auth/me`);
      expect(httpAttempt.status).toBe(403);

      const httpsProxyAttempt = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
        headers: { 'x-forwarded-proto': 'https' },
      });
      expect(httpsProxyAttempt.status).toBe(200);

      const healthExempt = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(healthExempt.status).toBe(200);
    } finally {
      process.env.NODE_ENV = prevEnv;
      await new Promise<void>((resolve) => srv.close(() => resolve()));
    }
  });
});
