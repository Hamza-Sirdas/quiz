import type { QuestionType } from './quizTypes';

export interface SubmittedAnswerPayload {
  optionId?: string;
  optionIds?: string[];
  orderedOptionIds?: string[];
}

export interface AnswerEvaluationOption {
  id: string;
  order: number;
  text: string;
  isCorrect: boolean;
}

export interface AnswerEvaluationQuestion {
  type: QuestionType;
  allowPartialCredit: boolean;
  options: AnswerEvaluationOption[];
}

export type AnswerEvaluationResult =
  | {
      ok: false;
      code: 'INVALID_ANSWER_FORMAT' | 'INVALID_OPTION';
      message: string;
    }
  | {
      ok: true;
      isCorrect: boolean;
      isPartial: boolean;
      scoreRatio: number;
      primaryOptionId: string;
      selectedOptionIds?: string[];
      orderedOptionIds?: string[];
    };

/**
 * Öğrenciden gelen cevabın biçimini ve doğruluğunu soru türüne göre sunucu/önizleme tarafında değerlendirir.
 */
export function validateAndEvaluateAnswer(
  question: AnswerEvaluationQuestion,
  submission: SubmittedAnswerPayload,
): AnswerEvaluationResult {
  const optionById = new Map(question.options.map((opt) => [opt.id, opt]));

  if (
    question.type === 'MULTIPLE_CHOICE' ||
    question.type === 'TRUE_FALSE'
  ) {
    const optionId =
      typeof submission.optionId === 'string' ? submission.optionId.trim() : '';

    if (!optionId) {
      return {
        ok: false,
        code: 'INVALID_ANSWER_FORMAT',
        message: 'Seçilen cevap kimliği gereklidir.',
      };
    }

    const selectedOption = optionById.get(optionId);
    if (!selectedOption) {
      return {
        ok: false,
        code: 'INVALID_OPTION',
        message: 'Seçilen cevap seçeneği geçersiz.',
      };
    }

    return {
      ok: true,
      isCorrect: selectedOption.isCorrect,
      isPartial: false,
      scoreRatio: selectedOption.isCorrect ? 1 : 0,
      primaryOptionId: selectedOption.id,
    };
  }

  if (question.type === 'MULTI_SELECT') {
    if (!Array.isArray(submission.optionIds)) {
      return {
        ok: false,
        code: 'INVALID_ANSWER_FORMAT',
        message: 'Çoklu doğru cevap soruları için en az bir seçenek seçilmelidir.',
      };
    }

    const normalizedIds = submission.optionIds.map((id) =>
      typeof id === 'string' ? id.trim() : '',
    );

    if (
      normalizedIds.length < 1 ||
      normalizedIds.length > question.options.length ||
      normalizedIds.some((id) => !id)
    ) {
      return {
        ok: false,
        code: 'INVALID_ANSWER_FORMAT',
        message: 'Gönderilen cevap seçenekleri geçerli sayıda olmalıdır.',
      };
    }

    const uniqueIds = new Set(normalizedIds);
    if (uniqueIds.size !== normalizedIds.length) {
      return {
        ok: false,
        code: 'INVALID_ANSWER_FORMAT',
        message: 'Aynı seçenek birden fazla kez gönderilemez.',
      };
    }

    for (const optionId of normalizedIds) {
      if (!optionById.has(optionId)) {
        return {
          ok: false,
          code: 'INVALID_OPTION',
          message: 'Seçilen cevap seçeneklerinden biri bu soruya ait değil.',
        };
      }
    }

    const correctIds = new Set(
      question.options.filter((opt) => opt.isCorrect).map((opt) => opt.id),
    );
    let correctSelected = 0;
    let wrongSelected = 0;

    for (const optionId of uniqueIds) {
      if (correctIds.has(optionId)) {
        correctSelected += 1;
      } else {
        wrongSelected += 1;
      }
    }

    const isExact =
      correctSelected === correctIds.size && wrongSelected === 0 && correctIds.size > 0;

    if (isExact) {
      return {
        ok: true,
        isCorrect: true,
        isPartial: false,
        scoreRatio: 1,
        primaryOptionId: normalizedIds[0]!,
        selectedOptionIds: normalizedIds,
      };
    }

    if (question.allowPartialCredit && correctIds.size > 0) {
      const net = Math.max(0, correctSelected - wrongSelected);
      const scoreRatio = net / correctIds.size;
      const isPartial = scoreRatio > 0 && scoreRatio < 1;

      return {
        ok: true,
        isCorrect: false,
        isPartial,
        scoreRatio,
        primaryOptionId: normalizedIds[0]!,
        selectedOptionIds: normalizedIds,
      };
    }

    return {
      ok: true,
      isCorrect: false,
      isPartial: false,
      scoreRatio: 0,
      primaryOptionId: normalizedIds[0]!,
      selectedOptionIds: normalizedIds,
    };
  }

  // ORDERING
  if (!Array.isArray(submission.orderedOptionIds)) {
    return {
      ok: false,
      code: 'INVALID_ANSWER_FORMAT',
      message: 'Sıralama sorusu için tüm öğelerin sırası gönderilmelidir.',
    };
  }

  const orderedIds = submission.orderedOptionIds.map((id) =>
    typeof id === 'string' ? id.trim() : '',
  );

  if (
    orderedIds.length !== question.options.length ||
    orderedIds.some((id) => !id)
  ) {
    return {
      ok: false,
      code: 'INVALID_ANSWER_FORMAT',
      message: 'Sıralama cevabı sorudaki tüm öğeleri eksiksiz içermelidir.',
    };
  }

  const uniqueOrdered = new Set(orderedIds);
  if (uniqueOrdered.size !== question.options.length) {
    return {
      ok: false,
      code: 'INVALID_ANSWER_FORMAT',
      message: 'Sıralama cevabında yinelenen öğe bulunamaz.',
    };
  }

  for (const optionId of orderedIds) {
    if (!optionById.has(optionId)) {
      return {
        ok: false,
        code: 'INVALID_OPTION',
        message: 'Gönderilen sıralama öğelerinden biri geçersiz.',
      };
    }
  }

  const expectedOrderIds = [...question.options]
    .sort((a, b) => a.order - b.order)
    .map((opt) => opt.id);

  const isExactSequence = expectedOrderIds.every(
    (expectedId, idx) => orderedIds[idx] === expectedId,
  );

  return {
    ok: true,
    isCorrect: isExactSequence,
    isPartial: false,
    scoreRatio: isExactSequence ? 1 : 0,
    primaryOptionId: orderedIds[0]!,
    orderedOptionIds: orderedIds,
  };
}
