import { z } from 'zod';
import {
  AI_LIMITS,
  type AiDifficulty,
  type AiGeneratedOption,
  type AiGeneratedQuestion,
  type AiGeneratedQuizDraft,
  type AiGenerationMethod,
  type AiQuestionDifficulty,
} from '../../shared/aiTypes';
import {
  CANONICAL_QUIZ_CATEGORIES,
  MAX_CHOICE_OPTIONS,
  MAX_ORDERING_ITEMS,
  MIN_CHOICE_OPTIONS,
  MIN_ORDERING_ITEMS,
  QUESTION_TYPES,
  type QuestionType,
} from '../../shared/quizTypes';
import { ALLOWED_TIME_LIMITS, validatePublishedQuestion } from '../schemas/quizSchema';

export type AllowedTimeLimit = (typeof ALLOWED_TIME_LIMITS)[number];

export class AiDomainError extends Error {
  code: string;
  statusCode: number;
  retryable: boolean;

  constructor(
    code: string,
    message: string,
    statusCode = 400,
    retryable = false,
  ) {
    super(message);
    this.name = 'AiDomainError';
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

export function sanitizeUserTextForPrompt(raw: string): string {
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/<\/?(KAYNAK_BELGE|KAYNAK_METIN|KONU|SISTEM|TALIMAT)>/gi, '[$1]')
    .trim();
}

function normalizeComparisonText(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeForSimilarity(text: string): Set<string> {
  const normalized = normalizeComparisonText(text);
  const tokens = normalized.split(' ').filter((tok) => tok.length >= 2);
  return new Set(tokens);
}

export function areQuestionsNearDuplicates(a: string, b: string): boolean {
  const normA = normalizeComparisonText(a);
  const normB = normalizeComparisonText(b);
  if (!normA || !normB) return false;
  if (normA === normB) return true;

  const setA = tokenizeForSimilarity(normA);
  const setB = tokenizeForSimilarity(normB);
  if (setA.size === 0 || setB.size === 0) return false;

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection += 1;
    }
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 && intersection / union >= 0.82;
}

function extractJsonText(rawText: string): string {
  const trimmed = rawText.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1]!.trim() : trimmed;

  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return candidate.slice(firstBrace, lastBrace + 1);
  }
  return candidate;
}

function snapTimeLimit(
  value: unknown,
  fallback: AllowedTimeLimit,
): AllowedTimeLimit {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  if ((ALLOWED_TIME_LIMITS as readonly number[]).includes(value)) {
    return value as AllowedTimeLimit;
  }
  let closest: AllowedTimeLimit = fallback;
  let minDiff = Number.POSITIVE_INFINITY;
  for (const allowed of ALLOWED_TIME_LIMITS) {
    const diff = Math.abs(allowed - value);
    if (diff < minDiff) {
      minDiff = diff;
      closest = allowed;
    }
  }
  return closest;
}

function clampPoints(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  const rounded = Math.round(value / 50) * 50;
  return Math.max(100, Math.min(5000, rounded));
}

function normalizeQuestionDifficulty(
  raw: unknown,
  requestedDifficulty: AiDifficulty,
): AiQuestionDifficulty {
  const fallback: AiQuestionDifficulty =
    requestedDifficulty === 'MIXED' ? 'MEDIUM' : requestedDifficulty;
  if (typeof raw !== 'string') return fallback;
  const upper = raw.trim().toLocaleUpperCase('en-US');
  if (upper === 'EASY' || upper === 'KOLAY') return 'EASY';
  if (upper === 'MEDIUM' || upper === 'ORTA') return 'MEDIUM';
  if (upper === 'HARD' || upper === 'ZOR') return 'HARD';
  return fallback;
}

function normalizeQuestionType(raw: unknown): QuestionType | null {
  if (typeof raw !== 'string') return null;
  const upper = raw.trim().toLocaleUpperCase('en-US');
  if ((QUESTION_TYPES as readonly string[]).includes(upper)) {
    return upper as QuestionType;
  }
  return null;
}

function detectQualityWarnings(
  question: {
    type: QuestionType;
    text: string;
    options: AiGeneratedOption[];
    sourceReference: string | null;
  },
  mode: AiGenerationMethod,
): string[] {
  const warnings: string[] = [];

  if (question.text.trim().length < 15) {
    warnings.push(
      'Soru metni oldukça kısa; öğrencinin net anlaması için bağlam eklemeyi değerlendirin.',
    );
  }

  const ambiguousPatterns = [
    /yukarıdakilerin\s+hepsi/i,
    /hepsi\s+doğru/i,
    /hiçbiri/i,
    /yukarıdakilerden\s+hiçbiri/i,
    /all\s+of\s+the\s+above/i,
    /none\s+of\s+the\s+above/i,
  ];
  if (
    question.options.some((opt) =>
      ambiguousPatterns.some((rx) => rx.test(opt.text)),
    )
  ) {
    warnings.push(
      'Seçeneklerde "hepsi / hiçbiri" gibi konuma bağlı veya yoruma açık bir ifade yer alıyor.',
    );
  }

  if (question.type === 'MULTIPLE_CHOICE') {
    const correctOpt = question.options.find((opt) => opt.isCorrect);
    const wrongLengths = question.options
      .filter((opt) => !opt.isCorrect)
      .map((opt) => opt.text.trim().length);
    const minWrong =
      wrongLengths.length > 0 ? Math.min(...wrongLengths) : Number.MAX_SAFE_INTEGER;
    if (
      correctOpt &&
      correctOpt.text.trim().length > 45 &&
      minWrong > 0 &&
      correctOpt.text.trim().length >= minWrong * 3.5
    ) {
      warnings.push(
        'Doğru cevap diğer seçeneklerden belirgin biçimde uzun görünüyor; çeldiricileri dengelemeyi değerlendirin.',
      );
    }
  }

  if (
    question.type === 'MULTI_SELECT' &&
    question.options.every((opt) => opt.isCorrect)
  ) {
    warnings.push(
      'Çoklu doğru cevap sorusundaki tüm seçenekler doğru işaretli; en az bir çeldirici eklemeniz önerilir.',
    );
  }

  if ((mode === 'PDF' || mode === 'TEXT') && !question.sourceReference) {
    warnings.push(
      'Bu soru için kaynak sayfa veya bölüm referansı belirtilmedi; kaynak metinle tutarlılığını kontrol edin.',
    );
  }

  return warnings;
}

const rawOptionSchema = z.object({
  text: z.string(),
  isCorrect: z.boolean(),
});

const rawQuestionSchema = z.object({
  type: z.string(),
  text: z.string(),
  explanation: z.string().nullable().optional(),
  allowPartialCredit: z.boolean().nullable().optional(),
  timeLimitSec: z.number().nullable().optional(),
  points: z.number().nullable().optional(),
  difficulty: z.string().nullable().optional(),
  sourceReference: z.string().nullable().optional(),
  options: z.array(rawOptionSchema),
});

const rawQuizSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  questions: z.array(rawQuestionSchema),
});

export interface AiValidationContext {
  mode: AiGenerationMethod;
  requestedCount: number;
  requestedDifficulty: AiDifficulty;
  requestedTypes: QuestionType[];
  defaultTimeLimitSec: AllowedTimeLimit;
  defaultPoints: number;
  defaultCategory: string;
  sourceType: string;
  sourceSummary: string;
  fallbackTitle: string;
}

function sanitizeAndValidateSingleRawQuestion(
  raw: z.infer<typeof rawQuestionSchema>,
  context: AiValidationContext,
  acceptedTexts: string[],
  qIndexForCheck: number,
):
  | { status: 'OK'; question: AiGeneratedQuestion }
  | { status: 'DUPLICATE' }
  | { status: 'INVALID' } {
  const type = normalizeQuestionType(raw.type);
  if (!type) {
    return { status: 'INVALID' };
  }

  if (
    context.requestedTypes.length > 0 &&
    !context.requestedTypes.includes(type)
  ) {
    return { status: 'INVALID' };
  }

  const text = raw.text.replace(/\s+/g, ' ').trim().slice(0, 400);
  if (text.length < 5) {
    return { status: 'INVALID' };
  }

  if (acceptedTexts.some((existing) => areQuestionsNearDuplicates(existing, text))) {
    return { status: 'DUPLICATE' };
  }

  const maxOpts =
    type === 'ORDERING' ? MAX_ORDERING_ITEMS : MAX_CHOICE_OPTIONS;
  const minOpts =
    type === 'ORDERING' ? MIN_ORDERING_ITEMS : MIN_CHOICE_OPTIONS;

  const dedupedOptions: AiGeneratedOption[] = [];
  const seenOptionTexts = new Set<string>();
  for (const rawOpt of raw.options) {
    const cleanText = rawOpt.text.replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!cleanText) continue;
    const key = normalizeComparisonText(cleanText);
    if (!key || seenOptionTexts.has(key)) continue;
    seenOptionTexts.add(key);
    dedupedOptions.push({
      text: cleanText,
      isCorrect: type === 'ORDERING' ? true : Boolean(rawOpt.isCorrect),
    });
    if (dedupedOptions.length >= maxOpts) break;
  }

  if (dedupedOptions.length < minOpts) {
    return { status: 'INVALID' };
  }

  if (type === 'TRUE_FALSE' && dedupedOptions.length !== 2) {
    return { status: 'INVALID' };
  }

  const issues = validatePublishedQuestion(
    {
      type,
      text,
      options: dedupedOptions,
    },
    qIndexForCheck,
  );
  if (issues.length > 0) {
    return { status: 'INVALID' };
  }

  const explanation = (raw.explanation ?? '').replace(/\s+/g, ' ').trim().slice(0, 600);
  const rawSourceRef =
    typeof raw.sourceReference === 'string'
      ? raw.sourceReference.replace(/\s+/g, ' ').trim().slice(0, 200)
      : '';
  const sourceReference =
    context.mode === 'TOPIC'
      ? null
      : rawSourceRef.length > 0
        ? rawSourceRef
        : null;

  const validated: AiGeneratedQuestion = {
    type,
    text,
    explanation,
    allowPartialCredit:
      type === 'MULTI_SELECT' ? Boolean(raw.allowPartialCredit ?? true) : false,
    timeLimitSec: snapTimeLimit(raw.timeLimitSec, context.defaultTimeLimitSec),
    points: clampPoints(raw.points, context.defaultPoints),
    difficulty: normalizeQuestionDifficulty(
      raw.difficulty,
      context.requestedDifficulty,
    ),
    sourceReference,
    qualityWarnings: [],
    options: dedupedOptions,
  };

  validated.qualityWarnings = detectQualityWarnings(validated, context.mode);

  return { status: 'OK', question: validated };
}

function resolveCanonicalCategory(rawCategory: string | undefined, fallback: string): string {
  const trimmed = (rawCategory ?? '').trim();
  const matched = (CANONICAL_QUIZ_CATEGORIES as readonly string[]).find(
    (cat) => cat.toLocaleLowerCase('tr-TR') === trimmed.toLocaleLowerCase('tr-TR'),
  );
  if (matched) return matched;

  const fallbackMatched = (CANONICAL_QUIZ_CATEGORIES as readonly string[]).find(
    (cat) =>
      cat.toLocaleLowerCase('tr-TR') === fallback.trim().toLocaleLowerCase('tr-TR'),
  );
  return fallbackMatched ?? CANONICAL_QUIZ_CATEGORIES[0];
}

export function parseAndValidateAiQuizOutput(
  rawJsonText: string,
  context: AiValidationContext,
): AiGeneratedQuizDraft {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extractJsonText(rawJsonText));
  } catch {
    throw new AiDomainError(
      'AI_INVALID_OUTPUT',
      'Yapay zekâ servisinden geçerli bir JSON yanıtı alınamadı. Lütfen yeniden deneyin.',
      502,
      true,
    );
  }

  const parsedResult = rawQuizSchema.safeParse(parsedJson);
  if (!parsedResult.success || parsedResult.data.questions.length === 0) {
    throw new AiDomainError(
      'AI_INVALID_OUTPUT',
      'Yapay zekâ yanıtı beklenen quiz yapısıyla eşleşmiyor veya hiç soru içermiyor. Lütfen yeniden deneyin.',
      502,
      true,
    );
  }

  const data = parsedResult.data;
  const acceptedQuestions: AiGeneratedQuestion[] = [];
  const acceptedTexts: string[] = [];
  let filteredDuplicatesCount = 0;
  let filteredInvalidCount = 0;

  for (const rawQ of data.questions) {
    if (acceptedQuestions.length >= AI_LIMITS.MAX_QUESTIONS) {
      break;
    }
    const outcome = sanitizeAndValidateSingleRawQuestion(
      rawQ,
      context,
      acceptedTexts,
      acceptedQuestions.length,
    );
    if (outcome.status === 'OK') {
      acceptedQuestions.push(outcome.question);
      acceptedTexts.push(outcome.question.text);
    } else if (outcome.status === 'DUPLICATE') {
      filteredDuplicatesCount += 1;
    } else {
      filteredInvalidCount += 1;
    }
  }

  if (acceptedQuestions.length === 0) {
    throw new AiDomainError(
      'AI_INVALID_OUTPUT',
      'Yapay zekâ çıktısındaki sorular doğrulama ve kalite kurallarını geçemedi. Lütfen konuyu/metni netleştirip tekrar deneyin.',
      502,
      true,
    );
  }

  const trimmedQuestions = acceptedQuestions.slice(0, context.requestedCount);
  const warnings: string[] = [
    'Yapay zekâ tarafından oluşturulan soru, seçenek, açıklama ve kaynak referanslarında hata olabilir; kaydetmeden ve yayına almadan önce mutlaka kontrol edin.',
  ];

  if (trimmedQuestions.length < context.requestedCount) {
    warnings.push(
      `İstenen ${context.requestedCount} soru yerine kalite ve tekrar filtresinden geçen ${trimmedQuestions.length} geçerli soru hazırlandı.`,
    );
  }
  if (filteredDuplicatesCount > 0) {
    warnings.push(
      `${filteredDuplicatesCount} adet tekrar eden veya aşırı benzer soru otomatik olarak ayıklandı.`,
    );
  }
  if (filteredInvalidCount > 0) {
    warnings.push(
      `${filteredInvalidCount} adet eksik seçenekli veya format dışı soru otomatik olarak elendi.`,
    );
  }

  const rawTitle = (data.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const title = rawTitle.length >= 3 ? rawTitle : context.fallbackTitle.slice(0, 120);
  const description = (data.description ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
  const category = resolveCanonicalCategory(
    data.category,
    context.defaultCategory,
  );

  return {
    title,
    description,
    category,
    generationMethod: context.mode,
    sourceType: context.sourceType,
    sourceSummary: context.sourceSummary.slice(0, 200),
    generatedAt: new Date().toISOString(),
    questions: trimmedQuestions,
    filteredDuplicatesCount,
    filteredInvalidCount,
    warnings,
  };
}

export function parseAndValidateSingleAiQuestion(
  rawJsonText: string,
  context: AiValidationContext,
  existingQuestionTexts: string[],
): AiGeneratedQuestion {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extractJsonText(rawJsonText));
  } catch {
    throw new AiDomainError(
      'AI_INVALID_OUTPUT',
      'Yenilenen soru için geçerli JSON çıktısı alınamadı. Lütfen tekrar deneyin.',
      502,
      true,
    );
  }

  let candidateRaw: unknown = parsedJson;
  if (parsedJson && typeof parsedJson === 'object') {
    const obj = parsedJson as Record<string, unknown>;
    if (obj.question && typeof obj.question === 'object') {
      candidateRaw = obj.question;
    } else if (Array.isArray(obj.questions) && obj.questions.length > 0) {
      candidateRaw = obj.questions[0];
    }
  }

  const parsedRaw = rawQuestionSchema.safeParse(candidateRaw);
  if (!parsedRaw.success) {
    throw new AiDomainError(
      'AI_INVALID_OUTPUT',
      'Yenilenen soru beklenen formatta üretilemedi. Lütfen tekrar deneyin.',
      502,
      true,
    );
  }

  const outcome = sanitizeAndValidateSingleRawQuestion(
    parsedRaw.data,
    context,
    existingQuestionTexts,
    0,
  );
  if (outcome.status === 'DUPLICATE') {
    throw new AiDomainError(
      'AI_DUPLICATE_QUESTION',
      'Üretilen soru mevcut sorularla çok benzer olduğu için reddedildi. Lütfen tekrar deneyin.',
      502,
      true,
    );
  }
  if (outcome.status !== 'OK') {
    throw new AiDomainError(
      'AI_INVALID_OUTPUT',
      'Yenilenen soru geçerli soru ve seçenek kurallarını karşılamadı. Lütfen tekrar deneyin.',
      502,
      true,
    );
  }

  return outcome.question;
}
