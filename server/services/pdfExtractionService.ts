import crypto from 'node:crypto';
import path from 'node:path';
import multer from 'multer';
import { extractText } from 'unpdf';
import { AI_LIMITS, type PdfExtractionSummary } from '../../shared/aiTypes';

const ALLOWED_PDF_MIMES = new Set<string>([
  'application/pdf',
  'application/x-pdf',
  'application/acrobat',
]);

export class PdfExtractionError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = 'PdfExtractionError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function isPdfMagicSignature(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 5) {
    return false;
  }
  const head = buffer.subarray(0, Math.min(32, buffer.length)).toString('latin1');
  const trimmed = head.replace(/^\uFEFF/, '').trimStart();
  return trimmed.startsWith('%PDF-');
}

export function sanitizePdfFileName(fileName: string): string {
  const base = path.basename(fileName || 'belge.pdf').replace(/[\u0000-\u001F\u007F]/g, '');
  const trimmed = base.trim();
  return (trimmed || 'belge.pdf').slice(0, 120);
}

export function cleanExtractedPageText(raw: string): string {
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildControlledPdfChunks(
  rawPages: string[],
  maxTotalChars: number = AI_LIMITS.MAX_AI_SOURCE_CHARS,
): {
  chunkedSourceText: string;
  analyzedPages: number[];
  nonEmptyPages: number;
  extractedCharCount: number;
  truncated: boolean;
} {
  const cleanedPages = rawPages.map((pageText, index) => ({
    pageNumber: index + 1,
    text: cleanExtractedPageText(pageText),
  }));

  const populatedPages = cleanedPages.filter((page) => page.text.length > 0);
  const nonEmptyPages = populatedPages.length;
  const extractedCharCount = populatedPages.reduce(
    (sum, page) => sum + page.text.length,
    0,
  );

  const formattedPages = populatedPages.map((page) => ({
    pageNumber: page.pageNumber,
    block: `[Sayfa ${page.pageNumber}]\n${page.text}`,
  }));

  const fullText = formattedPages.map((item) => item.block).join('\n\n');
  if (fullText.length <= maxTotalChars) {
    return {
      chunkedSourceText: fullText,
      analyzedPages: formattedPages.map((item) => item.pageNumber),
      nonEmptyPages,
      extractedCharCount,
      truncated: false,
    };
  }

  // Büyük PDF'lerde belgenin baş, orta ve son kısımlarından dengeli sayfa seçimi yap
  const selectedIndices: number[] = [];
  const totalPopulated = formattedPages.length;

  if (totalPopulated === 1) {
    const single = formattedPages[0]!;
    return {
      chunkedSourceText: single.block.slice(0, maxTotalChars),
      analyzedPages: [single.pageNumber],
      nonEmptyPages,
      extractedCharCount,
      truncated: true,
    };
  }

  // Başlangıç, orta ve son indeksleri dengeli dağıtılmış sırayla ekle
  const candidateOrder: number[] = [];
  const added = new Set<number>();
  const addCandidate = (idx: number) => {
    if (idx >= 0 && idx < totalPopulated && !added.has(idx)) {
      added.add(idx);
      candidateOrder.push(idx);
    }
  };

  addCandidate(0);
  addCandidate(Math.floor(totalPopulated / 2));
  addCandidate(totalPopulated - 1);

  const stride = Math.max(1, Math.floor(totalPopulated / 12));
  for (let offset = stride; offset < totalPopulated; offset += stride) {
    addCandidate(offset);
  }
  for (let idx = 0; idx < totalPopulated; idx += 1) {
    addCandidate(idx);
  }

  let accumulatedChars = 0;
  for (const idx of candidateOrder) {
    const block = formattedPages[idx]!.block;
    const sepCost = selectedIndices.length > 0 ? 2 : 0;
    if (accumulatedChars + sepCost + block.length <= maxTotalChars) {
      selectedIndices.push(idx);
      accumulatedChars += sepCost + block.length;
    } else if (selectedIndices.length === 0) {
      selectedIndices.push(idx);
      accumulatedChars = maxTotalChars;
      break;
    }
  }

  selectedIndices.sort((a, b) => a - b);
  const selectedBlocks = selectedIndices.map((idx) => formattedPages[idx]!.block);
  const joined = selectedBlocks.join('\n\n').slice(0, maxTotalChars);

  return {
    chunkedSourceText: joined,
    analyzedPages: selectedIndices.map((idx) => formattedPages[idx]!.pageNumber),
    nonEmptyPages,
    extractedCharCount,
    truncated: true,
  };
}

export interface ExtractedPdfContent {
  fileName: string;
  fileSizeBytes: number;
  totalPages: number;
  nonEmptyPages: number;
  analyzedPages: number[];
  extractedCharCount: number;
  estimatedTokens: number;
  truncated: boolean;
  previewExcerpt: string;
  chunkedSourceText: string;
}

export async function extractPdfTextFromBuffer(
  buffer: Buffer,
  fileName: string,
): Promise<ExtractedPdfContent> {
  const safeName = sanitizePdfFileName(fileName);

  if (!buffer || buffer.length === 0) {
    throw new PdfExtractionError(
      'PDF_EMPTY_FILE',
      'Yüklenen PDF dosyası boş.',
      400,
    );
  }

  if (buffer.length > AI_LIMITS.MAX_PDF_SIZE_BYTES) {
    throw new PdfExtractionError(
      'PDF_TOO_LARGE',
      'PDF dosya boyutu en fazla 10 MB olabilir.',
      400,
    );
  }

  if (!isPdfMagicSignature(buffer)) {
    throw new PdfExtractionError(
      'INVALID_PDF_SIGNATURE',
      'Yüklenen dosya geçerli bir PDF belgesi değil (%PDF başlığı bulunamadı).',
      400,
    );
  }

  let parsed: { totalPages: number; text: string[] };
  try {
    parsed = await extractText(new Uint8Array(buffer), { mergePages: false });
  } catch {
    throw new PdfExtractionError(
      'PDF_PARSE_FAILED',
      'PDF dosyası okunamadı. Belge şifreli, bozuk veya desteklenmeyen bir yapıda olabilir.',
      422,
    );
  }

  const chunkResult = buildControlledPdfChunks(
    Array.isArray(parsed.text) ? parsed.text : [],
    AI_LIMITS.MAX_AI_SOURCE_CHARS,
  );

  const meaningfulChars = (
    chunkResult.chunkedSourceText.match(/[\p{L}\p{N}]/gu) ?? []
  ).length;

  if (meaningfulChars < 80) {
    throw new PdfExtractionError(
      'PDF_SCANNED_OR_EMPTY',
      'Bu PDF dosyasından seçilebilir metin çıkarılamadı. Belge taranmış görsellerden oluşuyor veya çok az metin içeriyor olabilir. QUIZORA şu anda OCR (görselden metin okuma) desteği sunmamaktadır; metni kopyalayıp "Metinden Quiz Oluştur" sekmesini kullanabilirsiniz.',
      422,
    );
  }

  const firstPageText =
    parsed.text
      .map(cleanExtractedPageText)
      .find((text) => text.length > 0) ?? chunkResult.chunkedSourceText;

  const previewExcerpt =
    firstPageText.length > 360
      ? `${firstPageText.slice(0, 360).trim()}...`
      : firstPageText;

  return {
    fileName: safeName,
    fileSizeBytes: buffer.length,
    totalPages: parsed.totalPages || parsed.text.length || 1,
    nonEmptyPages: chunkResult.nonEmptyPages,
    analyzedPages: chunkResult.analyzedPages,
    extractedCharCount: chunkResult.extractedCharCount,
    estimatedTokens: Math.ceil(chunkResult.chunkedSourceText.length / 4),
    truncated: chunkResult.truncated,
    previewExcerpt,
    chunkedSourceText: chunkResult.chunkedSourceText,
  };
}

interface StoredPdfSession {
  pdfSessionId: string;
  teacherId: string;
  createdAtMs: number;
  expiresAtMs: number;
  content: ExtractedPdfContent;
}

const PDF_RETENTION_NOTICE =
  'PDF dosyanız sunucu diskine kaydedilmez; yalnızca bellek üzerinde metni çıkarılır ve 15 dakika sonra veya oturum sonlandığında otomatik olarak silinir.';

export class PdfSessionStore {
  private readonly sessions = new Map<string, StoredPdfSession>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(ttlMs = 15 * 60 * 1000, maxEntries = 200) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  create(teacherId: string, content: ExtractedPdfContent): PdfExtractionSummary {
    this.pruneExpired();

    if (this.sessions.size >= this.maxEntries) {
      const oldestKey = this.sessions.keys().next().value;
      if (oldestKey) {
        this.sessions.delete(oldestKey);
      }
    }

    const pdfSessionId = crypto.randomUUID();
    const now = Date.now();
    this.sessions.set(pdfSessionId, {
      pdfSessionId,
      teacherId,
      createdAtMs: now,
      expiresAtMs: now + this.ttlMs,
      content,
    });

    return {
      pdfSessionId,
      fileName: content.fileName,
      fileSizeBytes: content.fileSizeBytes,
      totalPages: content.totalPages,
      nonEmptyPages: content.nonEmptyPages,
      analyzedPages: content.analyzedPages,
      extractedCharCount: content.extractedCharCount,
      estimatedTokens: content.estimatedTokens,
      truncated: content.truncated,
      ocrUsed: false,
      previewExcerpt: content.previewExcerpt,
      retentionNotice: PDF_RETENTION_NOTICE,
    };
  }

  get(pdfSessionId: string, teacherId: string): ExtractedPdfContent | null {
    this.pruneExpired();
    const entry = this.sessions.get(pdfSessionId);
    if (!entry) return null;
    if (entry.teacherId !== teacherId) return null;
    if (entry.expiresAtMs <= Date.now()) {
      this.sessions.delete(pdfSessionId);
      return null;
    }
    return entry.content;
  }

  remove(pdfSessionId: string, teacherId: string): boolean {
    const entry = this.sessions.get(pdfSessionId);
    if (!entry || entry.teacherId !== teacherId) {
      return false;
    }
    return this.sessions.delete(pdfSessionId);
  }

  size(): number {
    this.pruneExpired();
    return this.sessions.size;
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.sessions.entries()) {
      if (entry.expiresAtMs <= now) {
        this.sessions.delete(key);
      }
    }
  }
}

export const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: AI_LIMITS.MAX_PDF_SIZE_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const mimeOk = ALLOWED_PDF_MIMES.has(file.mimetype);
    const extOk = file.originalname.toLowerCase().endsWith('.pdf');
    if (!mimeOk && !extOk) {
      cb(
        new PdfExtractionError(
          'INVALID_PDF_MIME',
          'Desteklenmeyen dosya türü. Yalnızca PDF belgeleri (.pdf) yüklenebilir.',
          400,
        ),
      );
      return;
    }
    if (!mimeOk && file.mimetype !== 'application/octet-stream') {
      cb(
        new PdfExtractionError(
          'INVALID_PDF_MIME',
          'Desteklenmeyen dosya türü. Yalnızca PDF belgeleri yüklenebilir.',
          400,
        ),
      );
      return;
    }
    cb(null, true);
  },
});
