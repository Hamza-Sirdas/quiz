import { z } from 'zod';
import { AI_GENERATION_METHODS } from '../../shared/aiTypes';
import {
  MAX_CHOICE_OPTIONS,
  MAX_ORDERING_ITEMS,
  MIN_CHOICE_OPTIONS,
  MIN_ORDERING_ITEMS,
  OPTION_LETTERS,
  type QuestionType,
} from '../../shared/quizTypes';

export const QUIZ_CATEGORIES = [
  'Genel Kültür',
  'Matematik',
  'Türkçe',
  'Fen Bilimleri',
  'Tarih',
  'Coğrafya',
  'İngilizce',
  'Teknoloji',
  'Diğer',
  // Eski kayıtlarla uyumluluk
  'Türkçe ve Edebiyat',
  'Bilgisayar ve Teknoloji',
  'Yabancı Dil',
] as const;

export const ALLOWED_TIME_LIMITS = [10, 15, 20, 30, 60] as const;

export const QUESTION_TYPE_VALUES = [
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
  'MULTI_SELECT',
  'ORDERING',
] as const;

export const QUIZ_STATUS_VALUES = ['DRAFT', 'PUBLISHED'] as const;

export const QUIZ_VISIBILITY_VALUES = [
  'PRIVATE',
  'UNLISTED',
  'PUBLIC',
] as const;

function isSafeImageUrl(value: string): boolean {
  if (value.startsWith('/uploads/')) {
    return !value.includes('..') && /^\/uploads\/[a-zA-Z0-9._-]+$/.test(value);
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const optionalImageSchema = z
  .string()
  .nullable()
  .optional()
  .transform((val) => {
    if (typeof val !== 'string') return null;
    const trimmed = val.trim();
    return trimmed.length === 0 ? null : trimmed;
  })
  .refine(
    (val) => val === null || val.length <= 500,
    'Görsel adresi en fazla 500 karakter olabilir.',
  )
  .refine(
    (val) => val === null || isSafeImageUrl(val),
    'Geçersiz görsel adresi. Yalnızca yüklenen görseller veya http(s) bağlantıları kabul edilir.',
  );

const answerOptionSchema = z.object({
  text: z
    .string({ error: 'Cevap seçeneği metni gereklidir.' })
    .trim()
    .max(200, 'Cevap seçeneği en fazla 200 karakter olabilir.'),
  isCorrect: z.boolean({ error: 'Doğru cevap seçimi geçersiz.' }),
});

const questionSchema = z.object({
  type: z.enum(QUESTION_TYPE_VALUES).default('MULTIPLE_CHOICE'),
  text: z
    .string({ error: 'Soru metni gereklidir.' })
    .trim()
    .max(400, 'Soru metni en fazla 400 karakter olabilir.'),
  explanation: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (typeof val === 'string' ? val.trim() : ''))
    .refine(
      (val) => val.length <= 600,
      'Soru açıklaması en fazla 600 karakter olabilir.',
    ),
  sourceReference: z
    .string()
    .nullable()
    .optional()
    .transform((val) => {
      if (typeof val !== 'string') return null;
      const trimmed = val.trim();
      return trimmed.length === 0 ? null : trimmed.slice(0, 200);
    }),
  difficulty: z
    .string()
    .nullable()
    .optional()
    .transform((val) => {
      if (typeof val !== 'string') return null;
      const trimmed = val.trim();
      return trimmed.length === 0 ? null : trimmed.slice(0, 20);
    }),
  allowPartialCredit: z.boolean().optional().default(false),
  imageUrl: optionalImageSchema,
  timeLimitSec: z
    .number({ error: 'Soru süresi sayı olmalıdır.' })
    .int('Soru süresi tam sayı olmalıdır.')
    .refine(
      (val) => (ALLOWED_TIME_LIMITS as readonly number[]).includes(val),
      'Soru süresi yalnızca 10, 15, 20, 30 veya 60 saniye olabilir.',
    )
    .default(20),
  points: z
    .number({ error: 'Soru puanı sayı olmalıdır.' })
    .int('Soru puanı tam sayı olmalıdır.')
    .min(100, 'Soru puanı en az 100 olmalıdır.')
    .max(5000, 'Soru puanı en fazla 5000 olabilir.')
    .default(1000),
  options: z
    .array(answerOptionSchema, { error: 'Cevap seçenekleri liste olmalıdır.' })
    .max(
      MAX_CHOICE_OPTIONS,
      `Bir soruda en fazla ${MAX_CHOICE_OPTIONS} cevap seçeneği bulunabilir.`,
    ),
});

export interface PublishedQuestionValidationIssue {
  path: Array<string | number>;
  message: string;
}

export interface QuestionValidationTarget {
  type: QuestionType;
  text: string;
  options: Array<{ text: string; isCorrect: boolean }>;
}

/**
 * Yayına hazır durumundaki tek bir soruyu soru türüne göre kurallara karşı doğrular.
 */
export function validatePublishedQuestion(
  question: QuestionValidationTarget,
  qIndex: number,
): PublishedQuestionValidationIssue[] {
  const issues: PublishedQuestionValidationIssue[] = [];
  const labelPrefix = `${qIndex + 1}. soru`;

  if (!question.text.trim()) {
    issues.push({
      path: ['questions', qIndex, 'text'],
      message: `${labelPrefix} metni boş bırakılamaz.`,
    });
  }

  if (question.type === 'MULTIPLE_CHOICE') {
    if (
      question.options.length < MIN_CHOICE_OPTIONS ||
      question.options.length > MAX_CHOICE_OPTIONS
    ) {
      issues.push({
        path: ['questions', qIndex, 'options'],
        message: `${labelPrefix} için ${MIN_CHOICE_OPTIONS} ile ${MAX_CHOICE_OPTIONS} arasında cevap seçeneği bulunmalıdır.`,
      });
    }

    const correctCount = question.options.filter((opt) => opt.isCorrect).length;
    if (correctCount !== 1) {
      issues.push({
        path: ['questions', qIndex, 'options'],
        message: `${labelPrefix} için yalnızca bir doğru cevap seçilmelidir.`,
      });
    }

    question.options.forEach((opt, optIdx) => {
      if (!opt.text.trim()) {
        const letter = OPTION_LETTERS[optIdx] ?? String(optIdx + 1);
        issues.push({
          path: ['questions', qIndex, 'options', optIdx, 'text'],
          message: `${labelPrefix} ${letter} seçeneği boş bırakılamaz.`,
        });
      }
    });
  } else if (question.type === 'TRUE_FALSE') {
    if (question.options.length !== 2) {
      issues.push({
        path: ['questions', qIndex, 'options'],
        message: `${labelPrefix} (Doğru / Yanlış) için tam olarak 2 seçenek bulunmalıdır.`,
      });
    }

    const correctCount = question.options.filter((opt) => opt.isCorrect).length;
    if (correctCount !== 1) {
      issues.push({
        path: ['questions', qIndex, 'options'],
        message: `${labelPrefix} için Doğru veya Yanlış seçeneklerinden biri doğru işaretlenmelidir.`,
      });
    }

    question.options.forEach((opt, optIdx) => {
      if (!opt.text.trim()) {
        issues.push({
          path: ['questions', qIndex, 'options', optIdx, 'text'],
          message: `${labelPrefix} seçeneği boş bırakılamaz.`,
        });
      }
    });
  } else if (question.type === 'MULTI_SELECT') {
    if (
      question.options.length < MIN_CHOICE_OPTIONS ||
      question.options.length > MAX_CHOICE_OPTIONS
    ) {
      issues.push({
        path: ['questions', qIndex, 'options'],
        message: `${labelPrefix} için ${MIN_CHOICE_OPTIONS} ile ${MAX_CHOICE_OPTIONS} arasında cevap seçeneği bulunmalıdır.`,
      });
    }

    const correctCount = question.options.filter((opt) => opt.isCorrect).length;
    if (correctCount < 2) {
      issues.push({
        path: ['questions', qIndex, 'options'],
        message: `${labelPrefix} (Çoklu Doğru Cevap) için en az 2 doğru cevap işaretlenmelidir.`,
      });
    }

    question.options.forEach((opt, optIdx) => {
      if (!opt.text.trim()) {
        const letter = OPTION_LETTERS[optIdx] ?? String(optIdx + 1);
        issues.push({
          path: ['questions', qIndex, 'options', optIdx, 'text'],
          message: `${labelPrefix} ${letter} seçeneği boş bırakılamaz.`,
        });
      }
    });
  } else if (question.type === 'ORDERING') {
    if (
      question.options.length < MIN_ORDERING_ITEMS ||
      question.options.length > MAX_ORDERING_ITEMS
    ) {
      issues.push({
        path: ['questions', qIndex, 'options'],
        message: `${labelPrefix} (Sıralama) için ${MIN_ORDERING_ITEMS} ile ${MAX_ORDERING_ITEMS} arasında öğe tanımlanmalıdır.`,
      });
    }

    question.options.forEach((opt, optIdx) => {
      if (!opt.text.trim()) {
        issues.push({
          path: ['questions', qIndex, 'options', optIdx, 'text'],
          message: `${labelPrefix} ${optIdx + 1}. sıra öğesi boş bırakılamaz.`,
        });
      }
    });
  }

  return issues;
}

export function validatePublishedQuizRecord(quiz: {
  title: string;
  category: string;
  questions: QuestionValidationTarget[];
}): string | null {
  if (!quiz.title.trim()) {
    return 'Quiz başlığı boş bırakılamaz.';
  }
  if (!quiz.category.trim()) {
    return 'Kategori seçimi boş bırakılamaz.';
  }
  if (quiz.questions.length === 0) {
    return 'Canlı yarışma başlatmak için en az bir soru eklemelisiniz.';
  }

  for (let i = 0; i < quiz.questions.length; i += 1) {
    const issues = validatePublishedQuestion(quiz.questions[i]!, i);
    if (issues.length > 0) {
      return issues[0]!.message;
    }
  }

  return null;
}

export const quizPayloadSchema = z
  .object({
    status: z.enum(QUIZ_STATUS_VALUES).default('PUBLISHED'),
    visibility: z.enum(QUIZ_VISIBILITY_VALUES).default('PRIVATE'),
    allowPublicPreview: z.boolean().optional().default(true),
    aiGenerated: z.boolean().optional(),
    aiGenerationMethod: z.enum(AI_GENERATION_METHODS).nullable().optional(),
    aiSourceType: z
      .string()
      .nullable()
      .optional()
      .transform((val) => {
        if (typeof val !== 'string') return null;
        const trimmed = val.trim();
        return trimmed.length === 0 ? null : trimmed.slice(0, 60);
      }),
    aiSourceSummary: z
      .string()
      .nullable()
      .optional()
      .transform((val) => {
        if (typeof val !== 'string') return null;
        const trimmed = val.trim();
        return trimmed.length === 0 ? null : trimmed.slice(0, 200);
      }),
    aiGeneratedAt: z
      .string()
      .nullable()
      .optional()
      .transform((val) => {
        if (typeof val !== 'string' || !val.trim()) return null;
        const parsed = new Date(val);
        return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
      }),
    title: z
      .string({ error: 'Quiz başlığı gereklidir.' })
      .trim()
      .max(120, 'Quiz başlığı en fazla 120 karakter olabilir.'),
    description: z
      .string()
      .nullable()
      .optional()
      .transform((val) => (typeof val === 'string' ? val.trim() : ''))
      .refine(
        (val) => val.length <= 500,
        'Quiz açıklaması en fazla 500 karakter olabilir.',
      ),
    category: z
      .string({ error: 'Kategori seçimi gereklidir.' })
      .trim()
      .max(60, 'Kategori adı en fazla 60 karakter olabilir.'),
    coverImageUrl: optionalImageSchema,
    questions: z
      .array(questionSchema, { error: 'Sorular liste olmalıdır.' })
      .max(100, 'Bir quizde en fazla 100 soru bulunabilir.'),
  })
  .superRefine((data, ctx) => {
    if (data.status === 'DRAFT') {
      return;
    }

    if (!data.title.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['title'],
        message: 'Quiz başlığı boş bırakılamaz.',
      });
    }

    if (!data.category.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['category'],
        message: 'Kategori seçimi boş bırakılamaz.',
      });
    }

    if (data.questions.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['questions'],
        message: 'Yayına hazır quiz için en az bir soru eklemelisiniz.',
      });
    }

    data.questions.forEach((question, qIndex) => {
      const issues = validatePublishedQuestion(question, qIndex);
      for (const issue of issues) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: issue.path,
          message: issue.message,
        });
      }
    });
  });

export type ValidatedQuizPayload = z.infer<typeof quizPayloadSchema>;
