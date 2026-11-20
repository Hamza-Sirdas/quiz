import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import {
  CSRF_COOKIE_NAME,
  getServerConfig,
  isOriginAllowed,
  SESSION_COOKIE_NAME,
} from '../config/env';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length === 0 || bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function extractRequestOrigin(req: Request): string | undefined {
  const originHeader = req.get('origin');
  if (originHeader) return originHeader;

  const referer = req.get('referer');
  if (!referer) return undefined;

  try {
    return new URL(referer).origin;
  } catch {
    return 'invalid-referer';
  }
}

export function csrfProtection(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  const config = getServerConfig();
  const secFetchSite = req.get('sec-fetch-site');

  if (secFetchSite === 'cross-site') {
    const requestOrigin = extractRequestOrigin(req);
    if (
      !requestOrigin ||
      config.allowedOrigins.length === 0 ||
      !isOriginAllowed(requestOrigin, config.allowedOrigins)
    ) {
      res.status(403).json({
        code: 'CSRF_FORBIDDEN',
        message: 'Güvenlik doğrulaması başarısız oldu (cross-site istek engellendi).',
      });
      return;
    }
  }

  const requestOrigin = extractRequestOrigin(req);
  if (requestOrigin) {
    const hostHeader = req.get('host');
    let sameHostOrigin = false;
    if (hostHeader) {
      try {
        sameHostOrigin = new URL(requestOrigin).host === hostHeader;
      } catch {
        sameHostOrigin = false;
      }
    }

    if (
      !sameHostOrigin &&
      !isOriginAllowed(requestOrigin, config.allowedOrigins)
    ) {
      res.status(403).json({
        code: 'CSRF_FORBIDDEN',
        message: 'Güvenlik doğrulaması başarısız oldu (geçersiz kaynak).',
      });
      return;
    }
  }

  const hasSessionCookie = Boolean(
    req.cookies && typeof req.cookies[SESSION_COOKIE_NAME] === 'string' && req.cookies[SESSION_COOKIE_NAME],
  );

  if (!hasSessionCookie) {
    next();
    return;
  }

  const cookieToken =
    req.cookies && typeof req.cookies[CSRF_COOKIE_NAME] === 'string'
      ? req.cookies[CSRF_COOKIE_NAME]
      : '';
  const headerToken = req.get('x-csrf-token') ?? '';

  if (!cookieToken || !headerToken || !timingSafeEqualString(cookieToken, headerToken)) {
    res.status(403).json({
      code: 'CSRF_FORBIDDEN',
      message: 'Güvenlik doğrulaması (CSRF belirteci) başarısız oldu. Sayfayı yenileyip tekrar deneyin.',
    });
    return;
  }

  next();
}
