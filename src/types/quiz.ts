import type { AiGenerationMethod } from '@shared/aiTypes';
import type { QuestionType, QuizStatus, QuizVisibility } from '@shared/quizTypes';

export type AllowedTimeLimit = 10 | 15 | 20 | 30 | 60;

export interface AnswerOptionInput {
  localId: string;
  id?: string;
  text: string;
  isCorrect: boolean;
}

export interface QuestionInput {
  localId: string;
  id?: string;
  type: QuestionType;
  text: string;
  explanation: string;
  sourceReference?: string | null;
  difficulty?: string | null;
  allowPartialCredit: boolean;
  imageUrl: string | null;
  timeLimitSec: AllowedTimeLimit;
  points: number;
  options: AnswerOptionInput[];
}

export interface QuizPayload {
  status: QuizStatus;
  visibility?: QuizVisibility;
  allowPublicPreview?: boolean;
  aiGenerated?: boolean;
  aiGenerationMethod?: AiGenerationMethod | null;
  aiSourceType?: string | null;
  aiSourceSummary?: string | null;
  aiGeneratedAt?: string | null;
  title: string;
  description: string;
  category: string;
  coverImageUrl: string | null;
  questions: Array<{
    type: QuestionType;
    text: string;
    explanation: string;
    sourceReference?: string | null;
    difficulty?: string | null;
    allowPartialCredit: boolean;
    imageUrl: string | null;
    timeLimitSec: AllowedTimeLimit;
    points: number;
    options: Array<{
      text: string;
      isCorrect: boolean;
    }>;
  }>;
}

export interface QuizSummary {
  id: string;
  status: QuizStatus;
  visibility: QuizVisibility;
  shareToken: string | null;
  allowPublicPreview: boolean;
  originalQuizId: string | null;
  originalQuizTitle?: string | null;
  aiGenerated?: boolean;
  aiGenerationMethod?: AiGenerationMethod | null;
  aiSourceType?: string | null;
  aiSourceSummary?: string | null;
  aiGeneratedAt?: string | null;
  title: string;
  description: string;
  category: string;
  coverImageUrl: string | null;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AnswerOptionRecord {
  id: string;
  questionId: string;
  order: number;
  text: string;
  isCorrect: boolean;
}

export interface QuestionRecord {
  id: string;
  quizId: string;
  order: number;
  type: QuestionType;
  text: string;
  explanation: string;
  sourceReference?: string | null;
  difficulty?: string | null;
  allowPartialCredit: boolean;
  imageUrl: string | null;
  timeLimitSec: number;
  points: number;
  createdAt: string;
  updatedAt: string;
  options: AnswerOptionRecord[];
}

export interface QuizDetail {
  id: string;
  status: QuizStatus;
  visibility: QuizVisibility;
  shareToken: string | null;
  allowPublicPreview: boolean;
  originalQuizId: string | null;
  originalQuizTitle?: string | null;
  aiGenerated?: boolean;
  aiGenerationMethod?: AiGenerationMethod | null;
  aiSourceType?: string | null;
  aiSourceSummary?: string | null;
  aiGeneratedAt?: string | null;
  title: string;
  description: string;
  category: string;
  coverImageUrl: string | null;
  createdAt: string;
  updatedAt: string;
  questions: QuestionRecord[];
}

export interface ExploreQuizItem {
  id: string;
  title: string;
  description: string;
  category: string;
  coverImageUrl: string | null;
  questionCount: number;
  authorName: string;
  isOwnQuiz: boolean;
  allowPublicPreview: boolean;
  visibility: QuizVisibility;
  createdAt: string;
  updatedAt: string;
}

export interface ExploreQuizDetail extends ExploreQuizItem {
  originalQuizId: string | null;
  originalQuizTitle: string | null;
  questions: QuestionRecord[];
}

export interface ExploreQuizzesResponse {
  quizzes: ExploreQuizItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

export interface QuizShareState {
  quizId: string;
  visibility: QuizVisibility;
  allowPublicPreview: boolean;
  shareToken: string | null;
}

export interface DashboardSummary {
  totalQuizzes: number;
  publishedCount: number;
  draftCount: number;
  totalQuestions: number;
  completedSessionsCount: number;
  totalParticipantsCount: number;
  lastUpdatedAt: string | null;
  recentQuizzes: QuizSummary[];
  quizzes: QuizSummary[];
}

export interface ApiValidationError {
  path: string;
  message: string;
}

export interface HealthStatus {
  ok: boolean;
  database: string;
}

export interface UploadStatusResponse {
  configured: boolean;
  maxSizeBytes: number;
  allowedTypes: string[];
}
