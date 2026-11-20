import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import multer from 'multer';

export const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.cwd(), process.env.UPLOADS_DIR)
  : process.env.VERCEL === '1'
    ? path.join(os.tmpdir(), 'quizora-uploads')
    : path.resolve(process.cwd(), 'server', 'uploads');

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

const ALLOWED_MIME_SET = new Set<string>(ALLOWED_IMAGE_MIMES);

export class UploadValidationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'UploadValidationError';
    this.statusCode = statusCode;
  }
}

export interface DetectedImageSignature {
  ext: '.jpg' | '.png' | '.webp';
  mime: 'image/jpeg' | 'image/png' | 'image/webp';
}

/**
 * Dosya başlığındaki magic-byte imzasına göre gerçek JPEG, PNG veya WebP türünü doğrular.
 */
export function detectImageSignature(
  buffer: Buffer,
): DetectedImageSignature | null {
  if (!buffer || buffer.length < 12) {
    return null;
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: '.jpg', mime: 'image/jpeg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { ext: '.png', mime: 'image/png' };
  }

  // WebP: "RIFF" (0..3) + "WEBP" (8..11)
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { ext: '.webp', mime: 'image/webp' };
  }

  return null;
}

export async function checkUploadStorageWritable(
  dir: string = UPLOADS_DIR,
): Promise<boolean> {
  try {
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.access(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function saveValidatedImageUpload(
  buffer: Buffer,
  dir: string = UPLOADS_DIR,
): Promise<{ filename: string; url: string }> {
  const detected = detectImageSignature(buffer);
  if (!detected) {
    throw new UploadValidationError(
      'Dosya içeriği geçerli bir JPEG, PNG veya WebP görseli değil.',
      400,
    );
  }

  const writable = await checkUploadStorageWritable(dir);
  if (!writable) {
    throw new UploadValidationError(
      'Görsel depolama alanı şu anda yazılabilir durumda değil.',
      503,
    );
  }

  const filename = `${crypto.randomUUID()}${detected.ext}`;
  const targetPath = path.join(dir, filename);
  await fs.promises.writeFile(targetPath, buffer);

  return {
    filename,
    url: `/uploads/${filename}`,
  };
}

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_SIZE_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_SET.has(file.mimetype)) {
      cb(
        new UploadValidationError(
          'Desteklenmeyen dosya türü. Yalnızca JPEG, PNG veya WebP görselleri yüklenebilir.',
          400,
        ),
      );
      return;
    }
    cb(null, true);
  },
});
