import type { NextFunction, Request, Response } from 'express';
import { SESSION_COOKIE_NAME } from '../config/env';
import { hashSessionToken } from '../lib/password';
import { prisma } from '../lib/prisma';

export interface AuthenticatedTeacher {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

declare global {
  namespace Express {
    interface Request {
      teacher?: AuthenticatedTeacher;
      sessionId?: string;
    }
  }
}

export function parseCookieHeader(
  rawCookie: string | undefined,
): Record<string, string> {
  if (!rawCookie) return {};
  const result: Record<string, string> = {};

  for (const part of rawCookie.split(';')) {
    const eqIndex = part.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = part.slice(0, eqIndex).trim();
    const rawVal = part.slice(eqIndex + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(rawVal);
    } catch {
      result[key] = rawVal;
    }
  }

  return result;
}

export function extractSessionToken(req: Request): string | null {
  const cookieToken =
    req.cookies && typeof req.cookies[SESSION_COOKIE_NAME] === 'string'
      ? req.cookies[SESSION_COOKIE_NAME]
      : null;

  if (cookieToken && cookieToken.trim().length > 0) {
    return cookieToken.trim();
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer.length > 0) return bearer;
  }

  return null;
}

export async function resolveTeacherIdFromCookieHeader(
  rawCookieHeader: string | undefined,
): Promise<string | null> {
  const cookies = parseCookieHeader(rawCookieHeader);
  const token = cookies[SESSION_COOKIE_NAME]?.trim();
  if (!token) return null;

  const tokenHash = hashSessionToken(token);
  const session = await prisma.teacherSession.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      teacherId: true,
      expiresAt: true,
    },
  });

  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.teacherSession
      .delete({ where: { id: session.id } })
      .catch(() => undefined);
    return null;
  }

  return session.teacherId;
}

export async function requireTeacher(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = extractSessionToken(req);
  if (!token) {
    res.status(401).json({
      code: 'UNAUTHORIZED',
      message: 'Bu işlem için oturum açmanız gerekiyor.',
    });
    return;
  }

  const tokenHash = hashSessionToken(token);
  const session = await prisma.teacherSession.findUnique({
    where: { tokenHash },
    include: {
      teacher: {
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
        },
      },
    },
  });

  if (!session) {
    res.status(401).json({
      code: 'UNAUTHORIZED',
      message: 'Oturumunuz geçersiz veya sona ermiş. Lütfen tekrar oturum açın.',
    });
    return;
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.teacherSession
      .delete({ where: { id: session.id } })
      .catch(() => undefined);
    res.status(401).json({
      code: 'SESSION_EXPIRED',
      message: 'Oturum süreniz doldu. Lütfen yeniden oturum açın.',
    });
    return;
  }

  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  if (session.lastUsedAt.getTime() < fiveMinutesAgo) {
    void prisma.teacherSession
      .update({
        where: { id: session.id },
        data: { lastUsedAt: new Date() },
      })
      .catch(() => undefined);
  }

  req.sessionId = session.id;
  req.teacher = {
    id: session.teacher.id,
    name: session.teacher.name,
    email: session.teacher.email,
    createdAt: session.teacher.createdAt.toISOString(),
  };
  next();
}

export async function optionalTeacher(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = extractSessionToken(req);
  if (!token) {
    next();
    return;
  }

  try {
    const tokenHash = hashSessionToken(token);
    const session = await prisma.teacherSession.findUnique({
      where: { tokenHash },
      include: {
        teacher: {
          select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
          },
        },
      },
    });

    if (session && session.expiresAt.getTime() > Date.now()) {
      req.sessionId = session.id;
      req.teacher = {
        id: session.teacher.id,
        name: session.teacher.name,
        email: session.teacher.email,
        createdAt: session.teacher.createdAt.toISOString(),
      };
    }
  } catch {
    // Oturum çözümlenemezse anonim ziyaretçi olarak devam et
  }

  next();
}
