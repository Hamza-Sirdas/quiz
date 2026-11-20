import type { NextFunction, Request, Response } from 'express';
import { getServerConfig } from '../config/env';

export function isRequestHttps(req: Request): boolean {
  if (req.secure) return true;
  const forwardedProto = req.get('x-forwarded-proto');
  if (!forwardedProto) return false;
  const firstProto = forwardedProto.split(',')[0]?.trim().toLowerCase();
  return firstProto === 'https';
}

export function enforceHttps(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const { isProd } = getServerConfig();
  if (!isProd || req.path === '/api/health') {
    next();
    return;
  }

  if (!isRequestHttps(req)) {
    res.status(403).json({
      code: 'HTTPS_REQUIRED',
      message: 'Üretim ortamında tüm işlemler yalnızca güvenli HTTPS bağlantısı üzerinden yapılabilir.',
    });
    return;
  }

  next();
}
