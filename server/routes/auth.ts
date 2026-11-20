import type { CookieOptions, Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import {
  evaluatePasswordRules,
  normalizeEmail,
  PASSWORD_POLICY_ERROR,
} from '../../shared/authValidation';
import {
  CSRF_COOKIE_NAME,
  getServerConfig,
  PASSWORD_RESET_TTL_MS,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
} from '../config/env';
import { createHttpRateLimiter } from '../game/rateLimiter';
import { logger } from '../lib/logger';
import {
  generateCsrfToken,
  generatePasswordResetToken,
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  needsPasswordRehash,
  verifyPassword,
} from '../lib/password';
import { prisma } from '../lib/prisma';
import {
  extractSessionToken,
  requireTeacher,
} from '../middleware/requireTeacher';
import {
  createDefaultEmailSender,
  type EmailSender,
} from '../services/emailService';

const emailSchema = z
  .string({ error: 'E-posta adresi gereklidir.' })
  .trim()
  .transform(normalizeEmail)
  .pipe(
    z
      .string()
      .email('Geçerli bir e-posta adresi girin.')
      .max(160, 'E-posta adresi en fazla 160 karakter olabilir.'),
  );

const nameSchema = z
  .string({ error: 'Ad soyad gereklidir.' })
  .trim()
  .min(2, 'Ad soyad en az 2 karakter olmalıdır.')
  .max(80, 'Ad soyad en fazla 80 karakter olabilir.');

const strongPasswordSchema = z
  .string({ error: 'Şifre gereklidir.' })
  .refine((val) => evaluatePasswordRules(val).valid, {
    message: PASSWORD_POLICY_ERROR,
  });

const registerSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: strongPasswordSchema,
    passwordConfirm: z.string({ error: 'Şifre tekrarı gereklidir.' }),
    acceptedTerms: z.literal(true, {
      error: 'Devam etmek için kullanım koşullarını onaylamalısınız.',
    }),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: 'Girdiğiniz şifreler birbiriyle eşleşmiyor.',
    path: ['passwordConfirm'],
  });

const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string({ error: 'Şifre gereklidir.' })
    .min(1, 'Şifre boş bırakılamaz.')
    .max(128, 'Şifre en fazla 128 karakter olabilir.'),
});

const updateProfileSchema = z.object({
  name: nameSchema,
  email: emailSchema,
});

const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ error: 'Mevcut şifreniz gereklidir.' })
      .min(1, 'Mevcut şifreniz boş bırakılamaz.')
      .max(128, 'Şifre en fazla 128 karakter olabilir.'),
    newPassword: strongPasswordSchema,
    newPasswordConfirm: z.string({ error: 'Yeni şifre tekrarı gereklidir.' }),
  })
  .refine((data) => data.newPassword === data.newPasswordConfirm, {
    message: 'Yeni şifreler birbiriyle eşleşmiyor.',
    path: ['newPasswordConfirm'],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: 'Yeni şifre mevcut şifrenizden farklı olmalıdır.',
    path: ['newPassword'],
  });

const forgotPasswordSchema = z.object({
  email: emailSchema,
});

const verifyResetTokenSchema = z.object({
  token: z
    .string({ error: 'Sıfırlama belirteci gereklidir.' })
    .trim()
    .min(16, 'Geçersiz sıfırlama belirteci.')
    .max(256, 'Geçersiz sıfırlama belirteci.'),
});

const resetPasswordSchema = z
  .object({
    token: z
      .string({ error: 'Sıfırlama belirteci gereklidir.' })
      .trim()
      .min(16, 'Geçersiz sıfırlama belirteci.')
      .max(256, 'Geçersiz sıfırlama belirteci.'),
    newPassword: strongPasswordSchema,
    newPasswordConfirm: z.string({ error: 'Şifre tekrarı gereklidir.' }),
  })
  .refine((data) => data.newPassword === data.newPasswordConfirm, {
    message: 'Yeni şifreler birbiriyle eşleşmiyor.',
    path: ['newPasswordConfirm'],
  });

function buildCookieOptions(): CookieOptions {
  const { cookieSameSite, cookieSecure } = getServerConfig();
  return {
    httpOnly: true,
    sameSite: cookieSameSite,
    secure: cookieSecure,
    path: '/',
    maxAge: SESSION_TTL_MS,
  };
}

function clearAuthCookies(res: Response): void {
  const { cookieSameSite, cookieSecure } = getServerConfig();
  const clearOpts: CookieOptions = {
    httpOnly: true,
    sameSite: cookieSameSite,
    secure: cookieSecure,
    path: '/',
  };
  res.clearCookie(SESSION_COOKIE_NAME, clearOpts);
  res.clearCookie(CSRF_COOKIE_NAME, clearOpts);
}

function issueSessionCookies(
  res: Response,
  sessionToken: string,
  csrfToken: string,
): void {
  const opts = buildCookieOptions();
  res.cookie(SESSION_COOKIE_NAME, sessionToken, opts);
  res.cookie(CSRF_COOKIE_NAME, csrfToken, opts);
}

function extractUserAgent(req: Request): string | null {
  const raw = req.get('user-agent')?.trim();
  return raw ? raw.slice(0, 256) : null;
}

async function invalidateIncomingSession(req: Request): Promise<void> {
  const existingToken = extractSessionToken(req);
  if (!existingToken) return;
  const tokenHash = hashSessionToken(existingToken);
  await prisma.teacherSession
    .deleteMany({ where: { tokenHash } })
    .catch(() => undefined);
}

export function createAuthRouter(
  emailSender: EmailSender = createDefaultEmailSender(),
): Router {
  const router = Router();

  const loginLimiter = createHttpRateLimiter({
    windowMs: 15 * 60_000,
    max: 25,
    message: 'Çok fazla oturum açma denemesi. Lütfen bir süre bekleyip tekrar deneyin.',
  });

  const registerLimiter = createHttpRateLimiter({
    windowMs: 60 * 60_000,
    max: 20,
    message: 'Çok fazla hesap oluşturma denemesi. Lütfen daha sonra tekrar deneyin.',
  });

  const resetRequestLimiter = createHttpRateLimiter({
    windowMs: 15 * 60_000,
    max: 15,
    message: 'Çok fazla şifre sıfırlama talebi. Lütfen biraz bekleyin.',
  });

  const resetConfirmLimiter = createHttpRateLimiter({
    windowMs: 15 * 60_000,
    max: 60,
    message: 'Çok fazla şifre sıfırlama doğrulama isteği. Lütfen biraz bekleyin.',
  });

  router.get('/csrf', (req, res) => {
    const existing =
      req.cookies && typeof req.cookies[CSRF_COOKIE_NAME] === 'string'
        ? req.cookies[CSRF_COOKIE_NAME].trim()
        : '';

    const csrfToken = existing || generateCsrfToken();
    if (!existing) {
      res.cookie(CSRF_COOKIE_NAME, csrfToken, buildCookieOptions());
    }
    res.json({ csrfToken });
  });

  router.get('/password-reset-status', (_req, res) => {
    res.json({
      emailDeliveryConfigured: emailSender.isConfigured(),
    });
  });

  router.post('/register', registerLimiter, async (req, res) => {
    const payload = registerSchema.parse(req.body);

    // Oturum sabitleme koruması: mevcut oturum varsa sonlandır
    await invalidateIncomingSession(req);

    const existing = await prisma.teacher.findUnique({
      where: { email: payload.email },
      select: { id: true },
    });

    if (existing) {
      res.status(409).json({
        code: 'EMAIL_EXISTS',
        message: 'Bu e-posta adresiyle zaten kayıtlı bir hesap bulunuyor.',
      });
      return;
    }

    const plainToken = generateSessionToken();
    const tokenHash = hashSessionToken(plainToken);
    const csrfToken = generateCsrfToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const userAgent = extractUserAgent(req);

    const teacher = await prisma.$transaction(async (tx) => {
      const created = await tx.teacher.create({
        data: {
          name: payload.name,
          email: payload.email,
          passwordHash: hashPassword(payload.password),
          termsAcceptedAt: new Date(),
        },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
        },
      });

      await tx.teacherSession.create({
        data: {
          teacherId: created.id,
          tokenHash,
          userAgent,
          expiresAt,
        },
      });

      return created;
    });

    issueSessionCookies(res, plainToken, csrfToken);
    res.status(201).json({
      teacher: {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        createdAt: teacher.createdAt.toISOString(),
      },
      csrfToken,
    });
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const payload = loginSchema.parse(req.body);

    // Oturum sabitleme koruması: yeni girişte eski oturum geçersiz kılınır
    await invalidateIncomingSession(req);

    const teacher = await prisma.teacher.findUnique({
      where: { email: payload.email },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        createdAt: true,
      },
    });

    if (!teacher || !verifyPassword(payload.password, teacher.passwordHash)) {
      res.status(401).json({
        code: 'INVALID_CREDENTIALS',
        message: 'E-posta adresi veya şifre hatalı.',
      });
      return;
    }

    if (needsPasswordRehash(teacher.passwordHash)) {
      await prisma.teacher
        .update({
          where: { id: teacher.id },
          data: { passwordHash: hashPassword(payload.password) },
        })
        .catch(() => undefined);
    }

    const plainToken = generateSessionToken();
    const tokenHash = hashSessionToken(plainToken);
    const csrfToken = generateCsrfToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await prisma.teacherSession.create({
      data: {
        teacherId: teacher.id,
        tokenHash,
        userAgent: extractUserAgent(req),
        expiresAt,
      },
    });

    issueSessionCookies(res, plainToken, csrfToken);
    res.json({
      teacher: {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        createdAt: teacher.createdAt.toISOString(),
      },
      csrfToken,
    });
  });

  router.post('/logout', async (req, res) => {
    await invalidateIncomingSession(req);
    clearAuthCookies(res);
    res.json({ ok: true });
  });

  router.post('/logout-all', requireTeacher, async (req, res) => {
    await prisma.teacherSession.deleteMany({
      where: { teacherId: req.teacher!.id },
    });
    clearAuthCookies(res);
    res.json({ ok: true });
  });

  router.get('/me', requireTeacher, (req, res) => {
    const existingCsrf =
      req.cookies && typeof req.cookies[CSRF_COOKIE_NAME] === 'string'
        ? req.cookies[CSRF_COOKIE_NAME].trim()
        : '';
    const csrfToken = existingCsrf || generateCsrfToken();
    if (!existingCsrf) {
      res.cookie(CSRF_COOKIE_NAME, csrfToken, buildCookieOptions());
    }

    res.json({
      teacher: req.teacher,
      csrfToken,
    });
  });

  router.patch('/profile', requireTeacher, async (req, res) => {
    const payload = updateProfileSchema.parse(req.body);
    const teacherId = req.teacher!.id;

    const duplicate = await prisma.teacher.findFirst({
      where: {
        email: payload.email,
        id: { not: teacherId },
      },
      select: { id: true },
    });

    if (duplicate) {
      res.status(409).json({
        code: 'EMAIL_EXISTS',
        message: 'Bu e-posta adresi başka bir öğretmen hesabı tarafından kullanılıyor.',
      });
      return;
    }

    const updated = await prisma.teacher.update({
      where: { id: teacherId },
      data: {
        name: payload.name,
        email: payload.email,
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });

    res.json({
      teacher: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        createdAt: updated.createdAt.toISOString(),
      },
    });
  });

  router.post('/change-password', requireTeacher, async (req, res) => {
    const payload = changePasswordSchema.parse(req.body);
    const teacherId = req.teacher!.id;

    const current = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { id: true, passwordHash: true },
    });

    if (!current || !verifyPassword(payload.currentPassword, current.passwordHash)) {
      res.status(400).json({
        code: 'INVALID_CURRENT_PASSWORD',
        message: 'Mevcut şifreniz doğrulanamadı.',
      });
      return;
    }

    const plainToken = generateSessionToken();
    const tokenHash = hashSessionToken(plainToken);
    const csrfToken = generateCsrfToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await prisma.$transaction(async (tx) => {
      await tx.teacher.update({
        where: { id: teacherId },
        data: { passwordHash: hashPassword(payload.newPassword) },
      });

      await tx.teacherSession.deleteMany({
        where: { teacherId },
      });

      await tx.teacherSession.create({
        data: {
          teacherId,
          tokenHash,
          userAgent: extractUserAgent(req),
          expiresAt,
        },
      });
    });

    issueSessionCookies(res, plainToken, csrfToken);
    res.json({
      ok: true,
      csrfToken,
      message: 'Şifreniz güncellendi ve diğer cihazlardaki oturumlar sonlandırıldı.',
    });
  });

  router.post('/forgot-password', resetRequestLimiter, async (req, res) => {
    const { email } = forgotPasswordSchema.parse(req.body);

    if (!emailSender.isConfigured()) {
      res.status(503).json({
        code: 'EMAIL_SERVICE_UNCONFIGURED',
        message:
          'E-posta gönderim servisi şu anda yapılandırılmamış olduğundan şifre sıfırlama e-postası gönderilemiyor.',
      });
      return;
    }

    const genericSuccessMessage =
      'Bu e-posta adresi sistemde kayıtlıysa şifre sıfırlama bağlantısı gönderildi.';

    const teacher = await prisma.teacher.findUnique({
      where: { email },
      select: { id: true, name: true, email: true },
    });

    if (teacher) {
      const rawToken = generatePasswordResetToken();
      const tokenHash = hashSessionToken(rawToken);
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

      await prisma.$transaction(async (tx) => {
        await tx.passwordResetToken.deleteMany({
          where: { teacherId: teacher.id },
        });
        await tx.passwordResetToken.create({
          data: {
            teacherId: teacher.id,
            tokenHash,
            expiresAt,
          },
        });
      });

      const { appBaseUrl } = getServerConfig();
      const resetUrl = `${appBaseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

      try {
        await emailSender.sendPasswordResetEmail({
          to: teacher.email,
          name: teacher.name,
          resetUrl,
          expiresMinutes: Math.round(PASSWORD_RESET_TTL_MS / 60_000),
        });
      } catch (err) {
        logger.error('password_reset_email_failed', {
          message: err instanceof Error ? err.message : 'email_error',
        });
        await prisma.passwordResetToken
          .deleteMany({ where: { tokenHash } })
          .catch(() => undefined);
        res.status(502).json({
          code: 'EMAIL_DELIVERY_FAILED',
          message:
            'Şifre sıfırlama e-postası gönderilemedi. Lütfen biraz sonra tekrar deneyin.',
        });
        return;
      }
    }

    res.json({ ok: true, message: genericSuccessMessage });
  });

  router.post('/reset-password/verify', resetConfirmLimiter, async (req, res) => {
    const parsed = verifyResetTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      res.json({ valid: false });
      return;
    }

    const tokenHash = hashSessionToken(parsed.data.token);
    const record = await prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });

    res.json({ valid: Boolean(record) });
  });

  router.post('/reset-password', resetConfirmLimiter, async (req, res) => {
    const payload = resetPasswordSchema.parse(req.body);
    const tokenHash = hashSessionToken(payload.token);
    const now = new Date();

    const succeeded = await prisma.$transaction(async (tx) => {
      const existing = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
        select: { id: true, teacherId: true },
      });

      if (!existing) return false;

      const claimed = await tx.passwordResetToken.updateMany({
        where: {
          id: existing.id,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });

      if (claimed.count !== 1) {
        return false;
      }

      await tx.teacher.update({
        where: { id: existing.teacherId },
        data: { passwordHash: hashPassword(payload.newPassword) },
      });

      await tx.teacherSession.deleteMany({
        where: { teacherId: existing.teacherId },
      });

      return true;
    });

    if (!succeeded) {
      res.status(400).json({
        code: 'INVALID_OR_EXPIRED_TOKEN',
        message: 'Şifre sıfırlama bağlantısı geçersiz, daha önce kullanılmış veya süresi dolmuş.',
      });
      return;
    }

    clearAuthCookies(res);
    res.json({
      ok: true,
      message: 'Şifreniz başarıyla sıfırlandı. Yeni şifrenizle oturum açabilirsiniz.',
    });
  });

  return router;
}

export const authRouter = createAuthRouter();
