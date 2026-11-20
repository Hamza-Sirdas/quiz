import type { AiGenerationMethod } from '@shared/aiTypes';
import {
  CANONICAL_QUIZ_CATEGORIES,
  MAX_CHOICE_OPTIONS,
  TRUE_FALSE_OPTIONS,
  type QuestionType,
  type QuizStatus,
  type QuizVisibility,
} from '@shared/quizTypes';
import type {
  AllowedTimeLimit,
  AnswerOptionInput,
  QuestionInput,
  QuizDetail,
} from '@/types/quiz';

export const QUIZ_CATEGORIES = CANONICAL_QUIZ_CATEGORIES;

export const TIME_LIMIT_OPTIONS: readonly AllowedTimeLimit[] = [10, 15, 20, 30, 60];

export const DEFAULT_POINTS = 1000;
export const MIN_POINTS = 100;
export const MAX_POINTS = 5000;
export const NEW_QUIZ_DRAFT_KEY = 'quizora:draft:new-quiz';

export function createLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createOption(text = '', isCorrect = false): AnswerOptionInput {
  return {
    localId: createLocalId(),
    text,
    isCorrect,
  };
}

export function createEmptyQuestion(
  type: QuestionType = 'MULTIPLE_CHOICE',
): QuestionInput {
  if (type === 'TRUE_FALSE') {
    return {
      localId: createLocalId(),
      type,
      text: '',
      explanation: '',
      allowPartialCredit: false,
      imageUrl: null,
      timeLimitSec: 20,
      points: DEFAULT_POINTS,
      options: [
        createOption(TRUE_FALSE_OPTIONS[0], true),
        createOption(TRUE_FALSE_OPTIONS[1], false),
      ],
    };
  }

  if (type === 'MULTI_SELECT') {
    return {
      localId: createLocalId(),
      type,
      text: '',
      explanation: '',
      allowPartialCredit: false,
      imageUrl: null,
      timeLimitSec: 20,
      points: DEFAULT_POINTS,
      options: [
        createOption('', true),
        createOption('', true),
        createOption('', false),
        createOption('', false),
      ],
    };
  }

  if (type === 'ORDERING') {
    return {
      localId: createLocalId(),
      type,
      text: '',
      explanation: '',
      allowPartialCredit: false,
      imageUrl: null,
      timeLimitSec: 30,
      points: DEFAULT_POINTS,
      options: [
        createOption('', true),
        createOption('', true),
        createOption('', true),
      ],
    };
  }

  return {
    localId: createLocalId(),
    type: 'MULTIPLE_CHOICE',
    text: '',
    explanation: '',
    allowPartialCredit: false,
    imageUrl: null,
    timeLimitSec: 20,
    points: DEFAULT_POINTS,
    options: [
      createOption('', true),
      createOption('', false),
      createOption('', false),
      createOption('', false),
    ],
  };
}

export function duplicateQuestionInput(question: QuestionInput): QuestionInput {
  return {
    ...question,
    localId: createLocalId(),
    id: undefined,
    options: question.options.map((opt) => ({
      localId: createLocalId(),
      text: opt.text,
      isCorrect: opt.isCorrect,
    })),
  };
}

export function willQuestionTypeChangeLoseData(
  question: QuestionInput,
  targetType: QuestionType,
): { losesData: boolean; reason: string } {
  if (question.type === targetType) {
    return { losesData: false, reason: '' };
  }

  const hasNonDefaultOptionText = question.options.some((opt, idx) => {
    const trimmed = opt.text.trim();
    if (!trimmed) return false;
    if (question.type === 'TRUE_FALSE' && trimmed === TRUE_FALSE_OPTIONS[idx]) {
      return false;
    }
    return true;
  });

  if (targetType === 'TRUE_FALSE' && (hasNonDefaultOptionText || question.options.length > 2)) {
    const filledCount = question.options.filter((o) => o.text.trim().length > 0).length;
    if (filledCount > 0 || question.type === 'MULTI_SELECT') {
      return {
        losesData: true,
        reason:
          'Doğru / Yanlış soru türüne geçildiğinde mevcut cevap seçenekleriniz sıfırlanacak ve seçenekler "Doğru" ile "Yanlış" olarak ayarlanacaktır.',
      };
    }
  }

  const correctCount = question.options.filter((o) => o.isCorrect).length;
  if (
    question.type === 'MULTI_SELECT' &&
    targetType === 'MULTIPLE_CHOICE' &&
    (correctCount > 1 || question.allowPartialCredit)
  ) {
    return {
      losesData: true,
      reason:
        'Çoktan Seçmeli soru türü yalnızca tek doğru cevabı destekler. Fazladan seçili doğru cevaplar ve kısmi puanlama ayarı kaldırılacaktır.',
    };
  }

  if (
    targetType === 'ORDERING' &&
    question.type !== 'ORDERING' &&
    hasNonDefaultOptionText
  ) {
    return {
      losesData: true,
      reason:
        'Sıralama sorusuna geçildiğinde doğru/yanlış cevap işaretlemeleri yerine öğelerin listedeki sırası doğru kabul edilecektir.',
    };
  }

  if (
    question.type === 'ORDERING' &&
    (targetType === 'MULTIPLE_CHOICE' || targetType === 'MULTI_SELECT') &&
    hasNonDefaultOptionText
  ) {
    return {
      losesData: true,
      reason:
        'Seçmeli soru türüne geçildiğinde öğeler için doğru cevap seçeneklerini yeniden işaretlemeniz gerekecektir.',
    };
  }

  return { losesData: false, reason: '' };
}

export function convertQuestionType(
  question: QuestionInput,
  targetType: QuestionType,
): QuestionInput {
  if (question.type === targetType) {
    return question;
  }

  if (targetType === 'TRUE_FALSE') {
    const preferFalse =
      question.options.length === 2 &&
      !question.options[0]?.isCorrect &&
      Boolean(question.options[1]?.isCorrect);

    return {
      ...question,
      type: 'TRUE_FALSE',
      allowPartialCredit: false,
      options: [
        createOption(TRUE_FALSE_OPTIONS[0], !preferFalse),
        createOption(TRUE_FALSE_OPTIONS[1], preferFalse),
      ],
    };
  }

  if (targetType === 'ORDERING') {
    const allEmpty = question.options.every((opt) => !opt.text.trim());
    if (allEmpty) {
      return {
        ...question,
        type: 'ORDERING',
        allowPartialCredit: false,
        options: [
          createOption('', true),
          createOption('', true),
          createOption('', true),
        ],
      };
    }

    const baseOptions = question.options
      .slice(0, MAX_CHOICE_OPTIONS)
      .map((opt) => ({
        localId: opt.localId || createLocalId(),
        text: question.type === 'TRUE_FALSE' ? '' : opt.text,
        isCorrect: true,
      }));
    while (baseOptions.length < 2) {
      baseOptions.push(createOption('', true));
    }
    return {
      ...question,
      type: 'ORDERING',
      allowPartialCredit: false,
      options: baseOptions,
    };
  }

  if (targetType === 'MULTI_SELECT') {
    const baseOptions = question.options
      .slice(0, MAX_CHOICE_OPTIONS)
      .map((opt) => ({
        localId: opt.localId || createLocalId(),
        text: opt.text,
        isCorrect: question.type === 'ORDERING' ? false : opt.isCorrect,
      }));
    while (baseOptions.length < 2) {
      baseOptions.push(createOption('', false));
    }
    if (baseOptions.filter((o) => o.isCorrect).length < 2) {
      let assigned = baseOptions.filter((o) => o.isCorrect).length;
      for (let i = 0; i < baseOptions.length && assigned < 2; i += 1) {
        if (!baseOptions[i]!.isCorrect) {
          baseOptions[i] = { ...baseOptions[i]!, isCorrect: true };
          assigned += 1;
        }
      }
    }
    return {
      ...question,
      type: 'MULTI_SELECT',
      options: baseOptions,
    };
  }

  // MULTIPLE_CHOICE
  const baseOptions = question.options
    .slice(0, MAX_CHOICE_OPTIONS)
    .map((opt) => ({
      localId: opt.localId || createLocalId(),
      text: opt.text,
      isCorrect: question.type === 'ORDERING' ? false : opt.isCorrect,
    }));
  while (baseOptions.length < 2) {
    baseOptions.push(createOption('', false));
  }
  const firstCorrectIdx = Math.max(
    0,
    baseOptions.findIndex((opt) => opt.isCorrect),
  );
  return {
    ...question,
    type: 'MULTIPLE_CHOICE',
    allowPartialCredit: false,
    options: baseOptions.map((opt, idx) => ({
      ...opt,
      isCorrect: idx === firstCorrectIdx,
    })),
  };
}

export interface QuizFormState {
  status: QuizStatus;
  visibility: QuizVisibility;
  allowPublicPreview: boolean;
  aiGenerated?: boolean;
  aiGenerationMethod?: AiGenerationMethod | null;
  aiSourceType?: string | null;
  aiSourceSummary?: string | null;
  aiGeneratedAt?: string | null;
  title: string;
  description: string;
  category: string;
  coverImageUrl: string | null;
  questions: QuestionInput[];
}

export function createEmptyQuizForm(): QuizFormState {
  return {
    status: 'DRAFT',
    visibility: 'PRIVATE',
    allowPublicPreview: true,
    aiGenerated: false,
    aiGenerationMethod: null,
    aiSourceType: null,
    aiSourceSummary: null,
    aiGeneratedAt: null,
    title: '',
    description: '',
    category: QUIZ_CATEGORIES[0],
    coverImageUrl: null,
    questions: [createEmptyQuestion('MULTIPLE_CHOICE')],
  };
}

export function quizDetailToFormState(quiz: QuizDetail): QuizFormState {
  const mappedQuestions: QuestionInput[] = quiz.questions.map((question) => {
    const timeLimit = (TIME_LIMIT_OPTIONS as readonly number[]).includes(
      question.timeLimitSec,
    )
      ? (question.timeLimitSec as AllowedTimeLimit)
      : 20;

    const qType = question.type ?? 'MULTIPLE_CHOICE';
    const rawOptions: AnswerOptionInput[] = question.options
      .slice(0, MAX_CHOICE_OPTIONS)
      .map((opt) => ({
        localId: opt.id || createLocalId(),
        id: opt.id,
        text: opt.text,
        isCorrect: opt.isCorrect,
      }));

    if (qType === 'TRUE_FALSE') {
      while (rawOptions.length < 2) {
        rawOptions.push(
          createOption(TRUE_FALSE_OPTIONS[rawOptions.length] ?? 'Seçenek', false),
        );
      }
      if (!rawOptions.some((o) => o.isCorrect)) {
        rawOptions[0] = { ...rawOptions[0]!, isCorrect: true };
      }
    } else if (qType === 'ORDERING') {
      while (rawOptions.length < 2) {
        rawOptions.push(createOption('', true));
      }
    } else {
      while (rawOptions.length < 2) {
        rawOptions.push(createOption('', false));
      }
    }

    return {
      localId: question.id || createLocalId(),
      id: question.id,
      type: qType,
      text: question.text,
      explanation: question.explanation ?? '',
      sourceReference: question.sourceReference ?? null,
      difficulty: question.difficulty ?? null,
      allowPartialCredit: Boolean(question.allowPartialCredit),
      imageUrl: question.imageUrl,
      timeLimitSec: timeLimit,
      points: question.points,
      options: rawOptions,
    };
  });

  return {
    status: quiz.status ?? 'PUBLISHED',
    visibility: quiz.visibility ?? 'PRIVATE',
    allowPublicPreview:
      typeof quiz.allowPublicPreview === 'boolean'
        ? quiz.allowPublicPreview
        : true,
    aiGenerated: Boolean(quiz.aiGenerated),
    aiGenerationMethod: quiz.aiGenerationMethod ?? null,
    aiSourceType: quiz.aiSourceType ?? null,
    aiSourceSummary: quiz.aiSourceSummary ?? null,
    aiGeneratedAt: quiz.aiGeneratedAt ?? null,
    title: quiz.title,
    description: quiz.description,
    category: quiz.category || QUIZ_CATEGORIES[0],
    coverImageUrl: quiz.coverImageUrl,
    questions:
      mappedQuestions.length > 0
        ? mappedQuestions
        : [createEmptyQuestion('MULTIPLE_CHOICE')],
  };
}
