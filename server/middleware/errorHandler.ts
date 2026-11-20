import { Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { GameDomainError } from '../game/GameManager';
import { logger } from '../lib/logger';
import { UploadValidationError } from '../middleware/upload';
import { AiDomainError } from '../services/aiQuestionValidator';
import { PdfExtractionError } from '../services/pdfExtractionService';

export interface FieldErrorItem {
  path: string;
  message: string;
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    const errors: FieldErrorItem[] = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));

    res.status(400).json({
      message: errors[0]?.message ?? 'Lütfen form alanlarını kontrol edin.',
      errors,
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    const isAiPdf = req.originalUrl.startsWith('/api/ai');
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? isAiPdf
          ? 'PDF dosya boyutu en fazla 10 MB olabilir.'
          : 'Görsel boyutu en fazla 5 MB olabilir.'
        : 'Dosya yüklenirken bir hata oluştu.';
    res.status(400).json({
      code: err.code === 'LIMIT_FILE_SIZE' && isAiPdf ? 'PDF_TOO_LARGE' : undefined,
      message,
    });
    return;
  }

  if (err instanceof PdfExtractionError) {
    res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
    });
    return;
  }

  if (err instanceof AiDomainError) {
    res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
      retryable: err.retryable,
    });
    return;
  }

  if (err instanceof UploadValidationError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }

  if (err instanceof GameDomainError) {
    res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
    });
    return;
  }

  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ message: 'Geçersiz JSON istek gövdesi gönderildi.' });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') {
      res.status(404).json({ message: 'İstenen kayıt bulunamadı.' });
      return;
    }
    if (err.code === 'P2002') {
      res.status(409).json({ message: 'Sıralama veya kayıt çakışması oluştu.' });
      return;
    }
  }

  logger.error('api_unhandled_error', {
    name: err instanceof Error ? err.name : 'UnknownError',
    message: err instanceof Error ? err.message : String(err),
  });

  res.status(500).json({
    message: 'Sunucu tarafında beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.',
  });
}
