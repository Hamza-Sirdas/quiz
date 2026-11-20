import type { QuestionType } from './quizTypes';

export type AiGenerationMethod = 'TOPIC' | 'PDF' | 'TEXT';

export type AiDifficulty = 'EASY' | 'MEDIUM' | 'HARD' | 'MIXED';

export type AiQuestionDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export const AI_GENERATION_METHODS: readonly AiGenerationMethod[] = [
  'TOPIC',
  'PDF',
  'TEXT',
] as const;

export const AI_DIFFICULTIES: readonly AiDifficulty[] = [
  'EASY',
  'MEDIUM',
  'HARD',
  'MIXED',
] as const;

export const AI_QUESTION_DIFFICULTIES: readonly AiQuestionDifficulty[] = [
  'EASY',
  'MEDIUM',
  'HARD',
] as const;

export const AI_DIFFICULTY_LABELS: Record<AiDifficulty, string> = {
  EASY: 'Kolay',
  MEDIUM: 'Orta',
  HARD: 'Zor',
  MIXED: 'Karışık',
};

export const AI_QUESTION_DIFFICULTY_LABELS: Record<AiQuestionDifficulty, string> = {
  EASY: 'Kolay',
  MEDIUM: 'Orta',
  HARD: 'Zor',
};

export const AI_METHOD_LABELS: Record<AiGenerationMethod, string> = {
  TOPIC: 'Konudan Quiz Oluştur',
  PDF: "PDF'den Quiz Oluştur",
  TEXT: 'Metinden Quiz Oluştur',
};

export const AI_GRADE_LEVELS = [
  'İlkokul (1-4. Sınıf)',
  'Ortaokul (5-8. Sınıf)',
  'Lise (9-12. Sınıf)',
  'Üniversite',
  'Genel / Yetişkin',
] as const;

export const AI_LANGUAGES = [
  'Türkçe',
  'İngilizce',
  'Almanca',
  'Fransızca',
] as const;

export const AI_LIMITS = {
  MIN_QUESTIONS: 5,
  MAX_QUESTIONS: 30,
  MIN_TOPIC_CHARS: 3,
  MAX_TOPIC_CHARS: 200,
  MAX_PDF_SIZE_BYTES: 10 * 1024 * 1024,
  MIN_TEXT_CHARS: 120,
  MIN_TEXT_WORDS: 20,
  MAX_TEXT_CHARS: 40_000,
  MAX_AI_SOURCE_CHARS: 36_000,
  RATE_LIMIT_GENERATIONS_PER_HOUR: 15,
  RATE_LIMIT_REGENERATIONS_PER_HOUR: 30,
  RATE_LIMIT_PDF_EXTRACTIONS_PER_HOUR: 20,
} as const;

export interface AiServiceStatus {
  configured: boolean;
  provider: 'google-gemini';
  model: string;
  ocrSupported: false;
  maxPdfSizeBytes: number;
  minQuestions: number;
  maxQuestions: number;
  minTextChars: number;
  minTextWords: number;
  maxTextChars: number;
  rateLimitPerHour: number;
}

export interface PdfExtractionSummary {
  pdfSessionId: string;
  fileName: string;
  fileSizeBytes: number;
  totalPages: number;
  nonEmptyPages: number;
  analyzedPages: number[];
  extractedCharCount: number;
  estimatedTokens: number;
  truncated: boolean;
  ocrUsed: false;
  previewExcerpt: string;
  retentionNotice: string;
}

export interface AiGeneratedOption {
  text: string;
  isCorrect: boolean;
}

export interface AiGeneratedQuestion {
  type: QuestionType;
  text: string;
  explanation: string;
  allowPartialCredit: boolean;
  timeLimitSec: 10 | 15 | 20 | 30 | 60;
  points: number;
  difficulty: AiQuestionDifficulty;
  sourceReference: string | null;
  qualityWarnings: string[];
  options: AiGeneratedOption[];
}

export interface AiGeneratedQuizDraft {
  title: string;
  description: string;
  category: string;
  generationMethod: AiGenerationMethod;
  sourceType: string;
  sourceSummary: string;
  generatedAt: string;
  questions: AiGeneratedQuestion[];
  filteredDuplicatesCount: number;
  filteredInvalidCount: number;
  warnings: string[];
}

export interface AiUsageSummary {
  model: string;
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  durationMs: number;
}

export interface AiGenerateRequest {
  mode: AiGenerationMethod;
  topic?: string;
  pdfSessionId?: string;
  sourceText?: string;
  category: string;
  gradeLevel: string;
  difficulty: AiDifficulty;
  questionCount: number;
  questionTypes: QuestionType[];
  language: string;
  timeLimitSec: 10 | 15 | 20 | 30 | 60;
  points: number;
  consentAccepted: boolean;
}

export interface AiRegenerateQuestionRequest {
  mode: AiGenerationMethod;
  topic?: string;
  pdfSessionId?: string;
  sourceText?: string;
  category: string;
  gradeLevel: string;
  difficulty: AiDifficulty;
  questionType: QuestionType;
  language: string;
  timeLimitSec: 10 | 15 | 20 | 30 | 60;
  points: number;
  previousQuestionText: string;
  existingQuestionTexts: string[];
  consentAccepted: boolean;
}
