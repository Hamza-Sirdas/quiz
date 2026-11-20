import { Router } from 'express';
import { z } from 'zod';
import {
  AI_DIFFICULTIES,
  AI_GENERATION_METHODS,
  AI_LIMITS,
} from '../../shared/aiTypes';
import { SlidingWindowLimiter } from '../game/rateLimiter';
import { requireTeacher } from '../middleware/requireTeacher';
import {
  ALLOWED_TIME_LIMITS,
  QUESTION_TYPE_VALUES,
  QUIZ_CATEGORIES,
} from '../schemas/quizSchema';
import {
  commitDailyQuotaSlot,
  getTeacherDailyQuotaStatus,
  releaseDailyQuotaSlot,
  reserveDailyQuotaSlot,
} from '../services/aiDailyQuotaService';
import {
  AiDomainError,
  parseAndValidateAiQuizOutput,
  parseAndValidateSingleAiQuestion,
  type AllowedTimeLimit,
} from '../services/aiQuestionValidator';
import {
  createGeminiAiQuizProvider,
  type AiQuizProvider,
} from '../services/geminiProvider';
import {
  PdfExtractionError,
  PdfSessionStore,
  extractPdfTextFromBuffer,
  pdfUpload,
} from '../services/pdfExtractionService';

export interface CreateAiRouterOptions {
  aiQuizProvider?: AiQuizProvider;
  pdfSessionStore?: PdfSessionStore;
  rateLimitMax?: number;
  dailyLimitMax?: number;
  maxConcurrentGlobal?: number;
  nowFn?: () => Date;
}

const timeLimitSchema = z
  .number({ error: 'Soru süresi sayı olmalıdır.' })
  .int()
  .refine(
    (val): val is AllowedTimeLimit =>
      (ALLOWED_TIME_LIMITS as readonly number[]).includes(val),
    'Soru süresi yalnızca 10, 15, 20, 30 veya 60 saniye olabilir.',
  );

const aiSettingsBaseSchema = z.object({
  category: z
    .string({ error: 'Kategori seçilmelidir.' })
    .trim()
    .min(1, 'Kategori seçilmelidir.')
    .max(60)
    .default(QUIZ_CATEGORIES[0]),
  gradeLevel: z
    .string({ error: 'Sınıf seviyesi seçilmelidir.' })
    .trim()
    .min(1, 'Sınıf seviyesi seçilmelidir.')
    .max(60),
  difficulty: z.enum(AI_DIFFICULTIES, {
    error: 'Geçerli bir zorluk seviyesi seçilmelidir.',
  }),
  questionCount: z
    .number({ error: 'Soru sayısı sayı olmalıdır.' })
    .int('Soru sayısı tam sayı olmalıdır.')
    .min(
      AI_LIMITS.MIN_QUESTIONS,
      `Soru sayısı en az ${AI_LIMITS.MIN_QUESTIONS} olmalıdır.`,
    )
    .max(
      AI_LIMITS.MAX_QUESTIONS,
      `Soru sayısı en fazla ${AI_LIMITS.MAX_QUESTIONS} olabilir.`,
    ),
  questionTypes: z
    .array(z.enum(QUESTION_TYPE_VALUES), {
      error: 'En az bir soru türü seçilmelidir.',
    })
    .min(1, 'En az bir soru türü seçilmelidir.')
    .max(4)
    .transform((items) => Array.from(new Set(items))),
  language: z
    .string({ error: 'Soru dili seçilmelidir.' })
    .trim()
    .min(2, 'Soru dili seçilmelidir.')
    .max(40),
  timeLimitSec: timeLimitSchema,
  points: z
    .number({ error: 'Soru puanı sayı olmalıdır.' })
    .int('Soru puanı tam sayı olmalıdır.')
    .min(100, 'Soru puanı en az 100 olmalıdır.')
    .max(5000, 'Soru puanı en fazla 5000 olabilir.'),
  consentAccepted: z.boolean().refine((val) => val === true, {
    message:
      'İçeriğin soru üretimi için harici yapay zekâ servisine gönderilmesine onay vermelisiniz.',
  }),
});

const aiGenerateSchema = aiSettingsBaseSchema.extend({
  mode: z.enum(AI_GENERATION_METHODS),
  topic: z.string().trim().max(AI_LIMITS.MAX_TOPIC_CHARS).optional(),
  pdfSessionId: z.string().trim().max(120).optional(),
  sourceText: z.string().trim().max(AI_LIMITS.MAX_TEXT_CHARS).optional(),
});

const aiRegenerateSchema = z.object({
  mode: z.enum(AI_GENERATION_METHODS),
  topic: z.string().trim().max(AI_LIMITS.MAX_TOPIC_CHARS).optional(),
  pdfSessionId: z.string().trim().max(120).optional(),
  sourceText: z.string().trim().max(AI_LIMITS.MAX_TEXT_CHARS).optional(),
  category: z.string().trim().min(1).max(60),
  gradeLevel: z.string().trim().min(1).max(60),
  difficulty: z.enum(AI_DIFFICULTIES),
  questionType: z.enum(QUESTION_TYPE_VALUES),
  language: z.string().trim().min(2).max(40),
  timeLimitSec: timeLimitSchema,
  points: z.number().int().min(100).max(5000),
  previousQuestionText: z.string().trim().max(400).default(''),
  existingQuestionTexts: z.array(z.string().trim().max(400)).max(35).default([]),
  consentAccepted: z.boolean().refine((val) => val === true, {
    message:
      'İçeriğin soru yenileme için harici yapay zekâ servisine gönderilmesine onay vermelisiniz.',
  }),
});

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
}

export function createAiRouter(options: CreateAiRouterOptions = {}): Router {
  const router = Router();
  const provider = options.aiQuizProvider ?? createGeminiAiQuizProvider();
  const pdfSessions = options.pdfSessionStore ?? new PdfSessionStore();
  const getNow = options.nowFn ?? (() => new Date());

  const limiter = new SlidingWindowLimiter();
  const inFlightTeachers = new Set<string>();
  let globalInFlightCount = 0;
  const maxGlobalInFlight = options.maxConcurrentGlobal ?? 5;
  const hourWindowMs = 60 * 60 * 1000;
  const maxGenPerHour =
    options.rateLimitMax ?? AI_LIMITS.RATE_LIMIT_GENERATIONS_PER_HOUR;
  const dailyLimitMax =
    options.dailyLimitMax ?? AI_LIMITS.DAILY_QUIZ_LIMIT;
  const maxRegenPerHour = Math.max(
    AI_LIMITS.RATE_LIMIT_REGENERATIONS_PER_HOUR,
    maxGenPerHour * 2,
  );
  const maxPdfPerHour = Math.max(
    AI_LIMITS.RATE_LIMIT_PDF_EXTRACTIONS_PER_HOUR,
    maxGenPerHour * 2,
  );

  router.use(requireTeacher);

  router.get('/status', async (req, res) => {
    const teacherId = req.teacher!.id;
    const status = provider.getStatus();
    const dailyQuota = await getTeacherDailyQuotaStatus(
      teacherId,
      dailyLimitMax,
      getNow(),
    );

    res.json({
      ...status,
      rateLimitPerHour: maxGenPerHour,
      dailyLimit: dailyLimitMax,
      dailyQuota,
    });
  });

  router.post('/extract-pdf', pdfUpload.single('file'), async (req, res) => {
    const teacherId = req.teacher!.id;
    if (!limiter.check(`ai:pdf:${teacherId}`, hourWindowMs, maxPdfPerHour)) {
      res.status(429).json({
        code: 'RATE_LIMITED',
        message:
          'Saatlik PDF yükleme ve analiz sınırına ulaştınız. Lütfen biraz bekleyin.',
      });
      return;
    }

    if (!req.file?.buffer) {
      throw new PdfExtractionError(
        'PDF_FILE_REQUIRED',
        'Lütfen bir PDF dosyası seçin.',
        400,
      );
    }

    const extracted = await extractPdfTextFromBuffer(
      req.file.buffer,
      req.file.originalname,
    );
    const summary = pdfSessions.create(teacherId, extracted);

    res.status(200).json({ extraction: summary });
  });

  router.delete('/pdf-session/:pdfSessionId', (req, res) => {
    const teacherId = req.teacher!.id;
    const pdfSessionId = String(req.params.pdfSessionId ?? '').trim();
    const removed = pdfSessionId
      ? pdfSessions.remove(pdfSessionId, teacherId)
      : false;
    res.json({ deleted: removed });
  });

  router.post('/generate', async (req, res) => {
    const teacherId = req.teacher!.id;
    const payload = aiGenerateSchema.parse(req.body ?? {});

    let topic: string | undefined;
    let sourceText: string | undefined;
    let sourceFileName: string | undefined;
    let sourceType = 'Konu İstemi';
    let sourceSummary = '';
    let fallbackTitle = 'Yapay Zekâ Quizi';

    if (payload.mode === 'TOPIC') {
      const cleanTopic = (payload.topic ?? '').trim();
      if (cleanTopic.length < AI_LIMITS.MIN_TOPIC_CHARS) {
        throw new AiDomainError(
          'TOPIC_TOO_SHORT',
          `Lütfen en az ${AI_LIMITS.MIN_TOPIC_CHARS} karakterlik bir konu başlığı girin.`,
          400,
          false,
        );
      }
      topic = cleanTopic;
      sourceType = 'Konu İstemi';
      sourceSummary = cleanTopic.slice(0, 180);
      fallbackTitle = cleanTopic.slice(0, 120);
    } else if (payload.mode === 'TEXT') {
      const cleanText = (payload.sourceText ?? '').trim();
      const words = countWords(cleanText);
      if (
        cleanText.length < AI_LIMITS.MIN_TEXT_CHARS ||
        words < AI_LIMITS.MIN_TEXT_WORDS
      ) {
        throw new AiDomainError(
          'INSUFFICIENT_TEXT',
          `Sağlanan metin soru üretmek için yeterli değil. Lütfen en az ${AI_LIMITS.MIN_TEXT_CHARS} karakter ve ${AI_LIMITS.MIN_TEXT_WORDS} kelime içeren anlamlı bir ders notu ekleyin.`,
          400,
          false,
        );
      }
      sourceText = cleanText.slice(0, AI_LIMITS.MAX_AI_SOURCE_CHARS);
      sourceType = 'Ders Notu Metni';
      sourceSummary = `${cleanText.length.toLocaleString('tr-TR')} karakterlik yapıştırılmış metin`;
      fallbackTitle = `${payload.category} — Metin Quizi`;
    } else {
      const pdfSessionId = (payload.pdfSessionId ?? '').trim();
      if (!pdfSessionId) {
        throw new AiDomainError(
          'PDF_SESSION_REQUIRED',
          'Lütfen önce metni çıkarılmış bir PDF belgesi yükleyin.',
          400,
          false,
        );
      }
      const sessionData = pdfSessions.get(pdfSessionId, teacherId);
      if (!sessionData) {
        throw new AiDomainError(
          'PDF_SESSION_NOT_FOUND',
          'Yüklenen PDF oturumu bulunamadı veya süresi doldu. Lütfen PDF dosyasını yeniden yükleyin.',
          404,
          false,
        );
      }
      sourceText = sessionData.chunkedSourceText;
      sourceFileName = sessionData.fileName;
      sourceType = 'PDF Belgesi';
      sourceSummary = `${sessionData.fileName} (${sessionData.totalPages} sayfa)`.slice(
        0,
        200,
      );
      fallbackTitle = sessionData.fileName.replace(/\.pdf$/i, '').slice(0, 120);
    }

    if (!provider.getStatus().configured) {
      throw new AiDomainError(
        'AI_NOT_CONFIGURED',
        'Yapay zekâ servisi şu anda yapılandırılmamış. Sunucu .env dosyasında GEMINI_API_KEY tanımlandığında kullanılabilir.',
        503,
        false,
      );
    }

    if (!limiter.check(`ai:gen:${teacherId}`, hourWindowMs, maxGenPerHour)) {
      res.status(429).json({
        code: 'RATE_LIMITED',
        message:
          'Saatlik yapay zekâ quiz oluşturma limitine ulaşıldı. Lütfen bir süre sonra tekrar deneyin.',
      });
      return;
    }

    if (globalInFlightCount >= maxGlobalInFlight) {
      res.status(503).json({
        code: 'AI_SERVER_BUSY',
        message:
          'Yapay zekâ servisi şu anda yoğun. Lütfen birkaç saniye sonra tekrar deneyin.',
      });
      return;
    }

    // Atomik DB günlük kota + eşzamanlı istek kilidi (yalnızca başarılı olunca hak düşer)
    const { usageDate } = await reserveDailyQuotaSlot(
      teacherId,
      dailyLimitMax,
      getNow(),
    );

    inFlightTeachers.add(teacherId);
    globalInFlightCount += 1;
    let committed = false;

    const abortController = new AbortController();
    const onClose = () => {
      if (!res.writableFinished) {
        abortController.abort();
      }
    };
    res.on('close', onClose);

    try {
      const rawResult = await provider.generateQuiz(
        {
          mode: payload.mode,
          topic,
          sourceText,
          sourceFileName,
          gradeLevel: payload.gradeLevel,
          category: payload.category,
          difficulty: payload.difficulty,
          questionCount: payload.questionCount,
          questionTypes: payload.questionTypes,
          language: payload.language,
          timeLimitSec: payload.timeLimitSec,
          points: payload.points,
        },
        abortController.signal,
      );

      const draft = parseAndValidateAiQuizOutput(rawResult.rawJsonText, {
        mode: payload.mode,
        requestedCount: payload.questionCount,
        requestedDifficulty: payload.difficulty,
        requestedTypes: payload.questionTypes,
        defaultTimeLimitSec: payload.timeLimitSec,
        defaultPoints: payload.points,
        defaultCategory: payload.category,
        sourceType,
        sourceSummary,
        fallbackTitle,
      });

      const dailyQuota = await commitDailyQuotaSlot(
        teacherId,
        usageDate,
        rawResult.usage,
        dailyLimitMax,
      );
      committed = true;

      res.json({
        draft,
        usage: rawResult.usage,
        dailyQuota,
      });
    } finally {
      res.off('close', onClose);
      inFlightTeachers.delete(teacherId);
      globalInFlightCount = Math.max(0, globalInFlightCount - 1);
      if (!committed) {
        await releaseDailyQuotaSlot(teacherId, usageDate);
      }
    }
  });

  router.post(
    '/generate-from-pdf',
    pdfUpload.single('file'),
    async (req, res) => {
      const teacherId = req.teacher!.id;
      if (!req.file?.buffer) {
        throw new PdfExtractionError(
          'PDF_FILE_REQUIRED',
          'Lütfen bir PDF dosyası seçin.',
          400,
        );
      }

      let rawSettings: unknown = req.body ?? {};
      if (typeof req.body?.payload === 'string') {
        try {
          rawSettings = JSON.parse(req.body.payload);
        } catch {
          throw new AiDomainError(
            'INVALID_SETTINGS_JSON',
            'Ayarlar JSON formatı okunamadı.',
            400,
            false,
          );
        }
      }

      const settings = aiSettingsBaseSchema.parse(rawSettings);
      const extracted = await extractPdfTextFromBuffer(
        req.file.buffer,
        req.file.originalname,
      );

      if (!provider.getStatus().configured) {
        throw new AiDomainError(
          'AI_NOT_CONFIGURED',
          'Yapay zekâ servisi şu anda yapılandırılmamış. Sunucu .env dosyasında GEMINI_API_KEY tanımlandığında kullanılabilir.',
          503,
          false,
        );
      }

      if (!limiter.check(`ai:gen:${teacherId}`, hourWindowMs, maxGenPerHour)) {
        res.status(429).json({
          code: 'RATE_LIMITED',
          message:
            'Saatlik yapay zekâ quiz oluşturma limitine ulaşıldı. Lütfen bir süre sonra tekrar deneyin.',
        });
        return;
      }

      if (globalInFlightCount >= maxGlobalInFlight) {
        res.status(503).json({
          code: 'AI_SERVER_BUSY',
          message:
            'Yapay zekâ servisi şu anda yoğun. Lütfen birkaç saniye sonra tekrar deneyin.',
        });
        return;
      }

      const { usageDate } = await reserveDailyQuotaSlot(
        teacherId,
        dailyLimitMax,
        getNow(),
      );

      inFlightTeachers.add(teacherId);
      globalInFlightCount += 1;
      let committed = false;

      const abortController = new AbortController();
      const onClose = () => {
        if (!res.writableFinished) {
          abortController.abort();
        }
      };
      res.on('close', onClose);

      try {
        const rawResult = await provider.generateQuiz(
          {
            mode: 'PDF',
            sourceText: extracted.chunkedSourceText,
            sourceFileName: extracted.fileName,
            gradeLevel: settings.gradeLevel,
            category: settings.category,
            difficulty: settings.difficulty,
            questionCount: settings.questionCount,
            questionTypes: settings.questionTypes,
            language: settings.language,
            timeLimitSec: settings.timeLimitSec,
            points: settings.points,
          },
          abortController.signal,
        );

        const draft = parseAndValidateAiQuizOutput(rawResult.rawJsonText, {
          mode: 'PDF',
          requestedCount: settings.questionCount,
          requestedDifficulty: settings.difficulty,
          requestedTypes: settings.questionTypes,
          defaultTimeLimitSec: settings.timeLimitSec,
          defaultPoints: settings.points,
          defaultCategory: settings.category,
          sourceType: 'PDF Belgesi',
          sourceSummary: `${extracted.fileName} (${extracted.totalPages} sayfa)`.slice(
            0,
            200,
          ),
          fallbackTitle: extracted.fileName.replace(/\.pdf$/i, '').slice(0, 120),
        });

        const dailyQuota = await commitDailyQuotaSlot(
          teacherId,
          usageDate,
          rawResult.usage,
          dailyLimitMax,
        );
        committed = true;

        const summary = pdfSessions.create(teacherId, extracted);

        res.json({
          draft,
          extraction: summary,
          usage: rawResult.usage,
          dailyQuota,
        });
      } finally {
        res.off('close', onClose);
        inFlightTeachers.delete(teacherId);
        globalInFlightCount = Math.max(0, globalInFlightCount - 1);
        if (!committed) {
          await releaseDailyQuotaSlot(teacherId, usageDate);
        }
      }
    },
  );

  router.post('/regenerate-question', async (req, res) => {
    const teacherId = req.teacher!.id;
    const payload = aiRegenerateSchema.parse(req.body ?? {});

    let topic: string | undefined;
    let sourceText: string | undefined;
    let sourceFileName: string | undefined;

    if (payload.mode === 'TOPIC') {
      const cleanTopic = (payload.topic ?? '').trim();
      if (cleanTopic.length < AI_LIMITS.MIN_TOPIC_CHARS) {
        throw new AiDomainError(
          'TOPIC_TOO_SHORT',
          `Lütfen en az ${AI_LIMITS.MIN_TOPIC_CHARS} karakterlik bir konu girin.`,
          400,
          false,
        );
      }
      topic = cleanTopic;
    } else if (payload.mode === 'TEXT') {
      const cleanText = (payload.sourceText ?? '').trim();
      if (
        cleanText.length < AI_LIMITS.MIN_TEXT_CHARS ||
        countWords(cleanText) < AI_LIMITS.MIN_TEXT_WORDS
      ) {
        throw new AiDomainError(
          'INSUFFICIENT_TEXT',
          'Soruyu yenilemek için yeterli kaynak metin bulunmuyor.',
          400,
          false,
        );
      }
      sourceText = cleanText.slice(0, AI_LIMITS.MAX_AI_SOURCE_CHARS);
    } else {
      const pdfSessionId = (payload.pdfSessionId ?? '').trim();
      const sessionData = pdfSessionId
        ? pdfSessions.get(pdfSessionId, teacherId)
        : null;
      if (!sessionData) {
        throw new AiDomainError(
          'PDF_SESSION_NOT_FOUND',
          'PDF belgesi oturumunun süresi dolmuş. Soruyu yeniden oluşturmak için PDF dosyasını tekrar yükleyin.',
          404,
          false,
        );
      }
      sourceText = sessionData.chunkedSourceText;
      sourceFileName = sessionData.fileName;
    }

    if (!provider.getStatus().configured) {
      throw new AiDomainError(
        'AI_NOT_CONFIGURED',
        'Yapay zekâ servisi şu anda yapılandırılmamış. Sunucu .env dosyasında GEMINI_API_KEY tanımlandığında kullanılabilir.',
        503,
        false,
      );
    }

    if (
      !limiter.check(`ai:regen:${teacherId}`, hourWindowMs, maxRegenPerHour)
    ) {
      res.status(429).json({
        code: 'RATE_LIMITED',
        message:
          'Saatlik soru yenileme sınırına ulaşıldı. Lütfen bir süre sonra tekrar deneyin.',
      });
      return;
    }

    if (inFlightTeachers.has(teacherId)) {
      res.status(409).json({
        code: 'GENERATION_IN_PROGRESS',
        message: 'Devam eden başka bir yapay zekâ işleminiz var. Lütfen tamamlanmasını bekleyin.',
      });
      return;
    }

    inFlightTeachers.add(teacherId);
    const abortController = new AbortController();
    const onClose = () => {
      if (!res.writableFinished) {
        abortController.abort();
      }
    };
    res.on('close', onClose);

    try {
      const rawResult = await provider.regenerateQuestion(
        {
          mode: payload.mode,
          topic,
          sourceText,
          sourceFileName,
          gradeLevel: payload.gradeLevel,
          category: payload.category,
          difficulty: payload.difficulty,
          questionType: payload.questionType,
          language: payload.language,
          timeLimitSec: payload.timeLimitSec,
          points: payload.points,
          previousQuestionText: payload.previousQuestionText,
          existingQuestionTexts: payload.existingQuestionTexts,
        },
        abortController.signal,
      );

      const question = parseAndValidateSingleAiQuestion(
        rawResult.rawJsonText,
        {
          mode: payload.mode,
          requestedCount: 1,
          requestedDifficulty: payload.difficulty,
          requestedTypes: [payload.questionType],
          defaultTimeLimitSec: payload.timeLimitSec,
          defaultPoints: payload.points,
          defaultCategory: payload.category,
          sourceType: payload.mode,
          sourceSummary: sourceFileName ?? '',
          fallbackTitle: '',
        },
        payload.existingQuestionTexts,
      );

      res.json({
        question,
        usage: rawResult.usage,
      });
    } finally {
      res.off('close', onClose);
      inFlightTeachers.delete(teacherId);
    }
  });

  return router;
}
