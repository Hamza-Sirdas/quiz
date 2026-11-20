export const SESSION_COOKIE_NAME = 'quizora_session';
export const CSRF_COOKIE_NAME = 'quizora_csrf';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

export function getServerConfig() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProd = nodeEnv === 'production';
  const port = Number(process.env.PORT || 3001);

  const rawCors = process.env.CORS_ORIGINS ?? '';
  const parsedOrigins = rawCors
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter(Boolean);

  const allowedOrigins =
    parsedOrigins.length > 0
      ? parsedOrigins
      : isProd
        ? []
        : ['http://localhost:5173', 'http://127.0.0.1:5173'];

  const cookieSameSite: 'lax' | 'none' =
    process.env.COOKIE_SAME_SITE === 'none' ? 'none' : 'lax';

  const cookieSecure = isProd || cookieSameSite === 'none';

  const appBaseUrl = (
    process.env.APP_BASE_URL?.trim() ||
    parsedOrigins[0] ||
    'http://localhost:5173'
  ).replace(/\/$/, '');

  const resendApiKey = process.env.RESEND_API_KEY?.trim() || '';
  const emailFrom = process.env.EMAIL_FROM?.trim() || '';

  const geminiApiKey = process.env.GEMINI_API_KEY?.trim() || '';
  const geminiModel = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite';
  const rawAiTimeout = Number(process.env.AI_REQUEST_TIMEOUT_MS || 45000);
  const aiRequestTimeoutMs = Number.isFinite(rawAiTimeout)
    ? Math.max(5000, Math.min(120000, Math.floor(rawAiTimeout)))
    : 45000;

  return {
    nodeEnv,
    isProd,
    port,
    allowedOrigins,
    cookieSameSite,
    cookieSecure,
    appBaseUrl,
    resendApiKey,
    emailFrom,
    geminiApiKey,
    geminiModel,
    aiRequestTimeoutMs,
  };
}

export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  if (!origin) return true;
  const normalized = origin.replace(/\/$/, '');
  return allowedOrigins.includes(normalized);
}
