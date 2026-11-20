import type { Prisma } from '@prisma/client';
import type {
  GameSessionAnalytics,
  HardestQuestionItem,
  ParticipantAnalyticsItem,
  ParticipantQuestionBreakdown,
  QuestionAnalyticsItem,
  QuestionChartPoint,
  QuestionOptionDistributionItem,
  ScoreBucketPoint,
} from '../../shared/analyticsTypes';
import type {
  FrozenQuestion,
  FrozenQuizSnapshot,
  GameHistorySummary,
} from '../../shared/gameTypes';
import {
  OPTION_LETTERS,
  QUESTION_TYPES,
  type QuestionType,
} from '../../shared/quizTypes';
import { prisma } from '../lib/prisma';

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function computeDurationSec(
  startedAt: Date | null,
  endedAt: Date | null,
): number | null {
  if (!startedAt || !endedAt) return null;
  const diffMs = endedAt.getTime() - startedAt.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return null;
  return Math.round(diffMs / 1000);
}

interface NormalizedSnapshotOption {
  id: string;
  order: number;
  text: string;
  isCorrect: boolean;
}

interface NormalizedSnapshotQuestion {
  id: string;
  order: number;
  type: QuestionType;
  text: string;
  explanation: string;
  allowPartialCredit: boolean;
  timeLimitSec: number;
  points: number;
  options: NormalizedSnapshotOption[];
}

function normalizeQuestionType(raw: unknown): QuestionType {
  if (
    typeof raw === 'string' &&
    (QUESTION_TYPES as readonly string[]).includes(raw)
  ) {
    return raw as QuestionType;
  }
  return 'MULTIPLE_CHOICE';
}

function normalizeSnapshotQuestions(
  rawSnapshot: Prisma.JsonValue | null | undefined,
): NormalizedSnapshotQuestion[] {
  if (!rawSnapshot || typeof rawSnapshot !== 'object') {
    return [];
  }

  const snapshot = rawSnapshot as unknown as Partial<FrozenQuizSnapshot>;
  if (!Array.isArray(snapshot.questions)) {
    return [];
  }

  return snapshot.questions.map((rawQ: Partial<FrozenQuestion>, qIdx: number) => {
    const rawOptions = Array.isArray(rawQ?.options) ? rawQ.options : [];
    const options: NormalizedSnapshotOption[] = rawOptions.map((opt, optIdx) => ({
      id:
        typeof opt?.id === 'string' && opt.id.trim()
          ? opt.id.trim()
          : `q${qIdx}-opt${optIdx}`,
      order:
        typeof opt?.order === 'number' && Number.isFinite(opt.order)
          ? opt.order
          : optIdx + 1,
      text: typeof opt?.text === 'string' ? opt.text : '',
      isCorrect: Boolean(opt?.isCorrect),
    }));

    return {
      id:
        typeof rawQ?.id === 'string' && rawQ.id.trim()
          ? rawQ.id.trim()
          : `q-${qIdx + 1}`,
      order:
        typeof rawQ?.order === 'number' && Number.isFinite(rawQ.order)
          ? rawQ.order
          : qIdx + 1,
      type: normalizeQuestionType(rawQ?.type),
      text: typeof rawQ?.text === 'string' ? rawQ.text : `Soru ${qIdx + 1}`,
      explanation: typeof rawQ?.explanation === 'string' ? rawQ.explanation : '',
      allowPartialCredit: Boolean(rawQ?.allowPartialCredit),
      timeLimitSec:
        typeof rawQ?.timeLimitSec === 'number' && Number.isFinite(rawQ.timeLimitSec)
          ? rawQ.timeLimitSec
          : 20,
      points:
        typeof rawQ?.points === 'number' && Number.isFinite(rawQ.points)
          ? rawQ.points
          : 1000,
      options,
    };
  });
}

interface AnswerRecordLike {
  participantId: string;
  questionIndex: number;
  selectedOptionId: string;
  answerPayload: Prisma.JsonValue | null;
  isCorrect: boolean;
  isPartial?: boolean;
  responseTimeMs: number;
  pointsAwarded: number;
}

function isAnswerPartialCredit(ans: AnswerRecordLike): boolean {
  if (ans.isCorrect) return false;
  return Boolean(ans.isPartial) || ans.pointsAwarded > 0;
}

function extractMultiSelectedIds(ans: AnswerRecordLike): string[] {
  if (ans.answerPayload && typeof ans.answerPayload === 'object') {
    const payload = ans.answerPayload as { optionIds?: unknown };
    if (Array.isArray(payload.optionIds)) {
      const ids = payload.optionIds
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim());
      if (ids.length > 0) return ids;
    }
  }
  return ans.selectedOptionId ? [ans.selectedOptionId] : [];
}

function extractOrderedIds(ans: AnswerRecordLike): string[] {
  if (ans.answerPayload && typeof ans.answerPayload === 'object') {
    const payload = ans.answerPayload as { orderedOptionIds?: unknown };
    if (Array.isArray(payload.orderedOptionIds)) {
      const ids = payload.orderedOptionIds
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim());
      if (ids.length > 0) return ids;
    }
  }
  return ans.selectedOptionId ? [ans.selectedOptionId] : [];
}

function formatCorrectAnswerText(question: NormalizedSnapshotQuestion): string {
  if (question.type === 'ORDERING') {
    const sorted = [...question.options].sort((a, b) => a.order - b.order);
    return sorted.map((opt, idx) => `${idx + 1}. ${opt.text}`).join(' → ') || '—';
  }

  const correctTexts = question.options
    .filter((opt) => opt.isCorrect)
    .map((opt) => opt.text.trim())
    .filter(Boolean);

  return correctTexts.length > 0 ? correctTexts.join(', ') : '—';
}

function formatSubmittedAnswerText(
  question: NormalizedSnapshotQuestion,
  answer: AnswerRecordLike | undefined,
): string | null {
  if (!answer) return null;
  const optionById = new Map(question.options.map((opt) => [opt.id, opt]));

  if (question.type === 'ORDERING') {
    const orderedIds = extractOrderedIds(answer);
    if (orderedIds.length === 0) return null;
    return orderedIds
      .map((id, idx) => `${idx + 1}. ${optionById.get(id)?.text ?? id}`)
      .join(' → ');
  }

  if (question.type === 'MULTI_SELECT') {
    const selectedIds = extractMultiSelectedIds(answer);
    if (selectedIds.length === 0) return null;
    return selectedIds
      .map((id) => optionById.get(id)?.text ?? id)
      .join(', ');
  }

  const single = optionById.get(answer.selectedOptionId);
  return single ? single.text : answer.selectedOptionId || null;
}

export interface ListGameHistoryOptions {
  search?: string;
  sort?: 'newest' | 'oldest';
  status?: string;
}

export async function listTeacherGameHistory(
  teacherId: string,
  options: ListGameHistoryOptions = {},
): Promise<GameHistorySummary[]> {
  const search = options.search?.trim() ?? '';
  const sort = options.sort === 'oldest' ? 'asc' : 'desc';
  const statusFilter = options.status?.trim() ?? '';

  const allowedStatuses: Array<'FINISHED' | 'CANCELLED' | 'INTERRUPTED'> =
    statusFilter === 'FINISHED' ||
    statusFilter === 'CANCELLED' ||
    statusFilter === 'INTERRUPTED'
      ? [statusFilter]
      : ['FINISHED', 'CANCELLED', 'INTERRUPTED'];

  const where: Prisma.GameSessionWhereInput = {
    hostTeacherId: teacherId,
    status: { in: allowedStatuses },
  };

  if (search) {
    where.OR = [
      { quizTitle: { contains: search, mode: 'insensitive' } },
      { quizCategory: { contains: search, mode: 'insensitive' } },
      { pin: { contains: search } },
    ];
  }

  const sessions = await prisma.gameSession.findMany({
    where,
    orderBy: { createdAt: sort },
    take: 100,
    select: {
      id: true,
      pin: true,
      quizId: true,
      quizTitle: true,
      quizCategory: true,
      status: true,
      quizSnapshot: true,
      startedAt: true,
      endedAt: true,
      createdAt: true,
      quiz: {
        select: { id: true },
      },
      results: {
        orderBy: { rank: 'asc' },
        select: {
          nickname: true,
          totalScore: true,
          correctCount: true,
          totalQuestions: true,
          rank: true,
        },
      },
      _count: {
        select: {
          participants: {
            where: { kicked: false },
          },
        },
      },
    },
  });

  return sessions.map((session) => {
    const snapshotQuestions = normalizeSnapshotQuestions(session.quizSnapshot);
    const questionCount = snapshotQuestions.length;
    const participantCount =
      session.results.length > 0
        ? session.results.length
        : session._count.participants;

    let averageSuccessRatePct: number | null = null;
    if (participantCount > 0 && questionCount > 0 && session.results.length > 0) {
      const totalCorrect = session.results.reduce(
        (sum, r) => sum + r.correctCount,
        0,
      );
      averageSuccessRatePct = round1(
        (totalCorrect / (session.results.length * questionCount)) * 100,
      );
    }

    const top = session.results[0];

    return {
      id: session.id,
      pin: session.pin,
      quizId: session.quizId,
      quizStillExists: Boolean(session.quiz?.id),
      quizTitle: session.quizTitle,
      quizCategory: session.quizCategory,
      status: session.status as 'FINISHED' | 'CANCELLED' | 'INTERRUPTED',
      participantCount,
      questionCount,
      averageSuccessRatePct,
      durationSec: computeDurationSec(session.startedAt, session.endedAt),
      startedAt: session.startedAt ? session.startedAt.toISOString() : null,
      endedAt: session.endedAt ? session.endedAt.toISOString() : null,
      createdAt: session.createdAt.toISOString(),
      winner: top
        ? {
            nickname: top.nickname,
            totalScore: top.totalScore,
          }
        : null,
    };
  });
}

export async function buildGameSessionAnalytics(
  sessionId: string,
  teacherId: string,
): Promise<GameSessionAnalytics | null> {
  const session = await prisma.gameSession.findFirst({
    where: {
      id: sessionId,
      hostTeacherId: teacherId,
    },
    include: {
      quiz: {
        select: { id: true },
      },
      participants: {
        where: { kicked: false },
        orderBy: { joinedAt: 'asc' },
      },
      results: {
        orderBy: { rank: 'asc' },
      },
      answers: {
        orderBy: [{ questionIndex: 'asc' }, { answeredAt: 'asc' }],
      },
    },
  });

  if (!session) {
    return null;
  }

  const snapshotQuestions = normalizeSnapshotQuestions(session.quizSnapshot);
  const totalQuestions = snapshotQuestions.length;
  const hasSnapshotQuestions = totalQuestions > 0;

  // Katılımcı listesini hem GameResult hem GameParticipant kayıtlarından tutarlı biçimde birleştir
  const answersByParticipant = new Map<string, Map<number, AnswerRecordLike>>();
  for (const ans of session.answers) {
    let byQ = answersByParticipant.get(ans.participantId);
    if (!byQ) {
      byQ = new Map();
      answersByParticipant.set(ans.participantId, byQ);
    }
    byQ.set(ans.questionIndex, ans);
  }

  interface UnifiedParticipantBase {
    participantId: string;
    nickname: string;
    rank: number;
    totalScore: number;
    correctCount: number;
  }

  const unifiedParticipants: UnifiedParticipantBase[] = [];
  const seenParticipantIds = new Set<string>();

  for (const resRow of session.results) {
    seenParticipantIds.add(resRow.participantId);
    unifiedParticipants.push({
      participantId: resRow.participantId,
      nickname: resRow.nickname,
      rank: resRow.rank,
      totalScore: resRow.totalScore,
      correctCount: resRow.correctCount,
    });
  }

  for (const partRow of session.participants) {
    if (seenParticipantIds.has(partRow.id)) continue;
    seenParticipantIds.add(partRow.id);
    unifiedParticipants.push({
      participantId: partRow.id,
      nickname: partRow.nickname,
      rank: unifiedParticipants.length + 1,
      totalScore: partRow.score,
      correctCount: partRow.correctCount,
    });
  }

  if (session.results.length === 0 && unifiedParticipants.length > 1) {
    unifiedParticipants.sort((a, b) => {
      if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
      if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
      return a.nickname.localeCompare(b.nickname, 'tr-TR');
    });
    unifiedParticipants.forEach((p, idx) => {
      p.rank = idx + 1;
    });
  }

  const totalParticipants = unifiedParticipants.length;
  const totalAnswersSubmitted = session.answers.length;

  const answersByQuestion = new Map<number, AnswerRecordLike[]>();
  for (const ans of session.answers) {
    const list = answersByQuestion.get(ans.questionIndex) ?? [];
    list.push(ans);
    answersByQuestion.set(ans.questionIndex, list);
  }

  const questions: QuestionAnalyticsItem[] = snapshotQuestions.map(
    (question, qIndex) => {
      const qAnswers = answersByQuestion.get(qIndex) ?? [];
      const answeredCount = qAnswers.length;
      let correctCount = 0;
      let partialCount = 0;
      let wrongCount = 0;
      let totalResponseMs = 0;

      for (const ans of qAnswers) {
        totalResponseMs += ans.responseTimeMs;
        if (ans.isCorrect) {
          correctCount += 1;
        } else {
          wrongCount += 1;
          if (isAnswerPartialCredit(ans)) {
            partialCount += 1;
          }
        }
      }

      const unansweredCount = Math.max(0, totalParticipants - answeredCount);
      const successRatePct =
        totalParticipants > 0
          ? round1((correctCount / totalParticipants) * 100)
          : null;
      const averageResponseMs =
        answeredCount > 0 ? Math.round(totalResponseMs / answeredCount) : null;

      const correctAnswerText = formatCorrectAnswerText(question);
      let optionDistribution: QuestionOptionDistributionItem[] = [];
      let mostCommonWrongAnswer: string | null = null;

      if (question.type === 'ORDERING') {
        const sortedExpected = [...question.options].sort(
          (a, b) => a.order - b.order,
        );
        optionDistribution = sortedExpected.map((expectedOpt, slotIdx) => {
          let exactSlotMatches = 0;
          for (const ans of qAnswers) {
            const orderedIds = extractOrderedIds(ans);
            if (orderedIds[slotIdx] === expectedOpt.id) {
              exactSlotMatches += 1;
            }
          }
          return {
            optionId: expectedOpt.id,
            label: `${slotIdx + 1}. Sıra`,
            order: slotIdx + 1,
            text: expectedOpt.text,
            isCorrect: true,
            count: exactSlotMatches,
            percentageOfPlayers:
              totalParticipants > 0
                ? round1((exactSlotMatches / totalParticipants) * 100)
                : 0,
            percentageOfAnswers:
              answeredCount > 0
                ? round1((exactSlotMatches / answeredCount) * 100)
                : 0,
          };
        });

        const wrongSequenceCounts = new Map<string, number>();
        for (const ans of qAnswers) {
          if (ans.isCorrect) continue;
          const formatted = formatSubmittedAnswerText(question, ans);
          if (formatted) {
            wrongSequenceCounts.set(
              formatted,
              (wrongSequenceCounts.get(formatted) ?? 0) + 1,
            );
          }
        }
        let bestCount = 0;
        for (const [seq, count] of wrongSequenceCounts.entries()) {
          if (count > bestCount) {
            bestCount = count;
            mostCommonWrongAnswer = seq;
          }
        }
      } else {
        const countsByOptionId = new Map<string, number>();
        for (const opt of question.options) {
          countsByOptionId.set(opt.id, 0);
        }

        for (const ans of qAnswers) {
          if (question.type === 'MULTI_SELECT') {
            for (const optId of extractMultiSelectedIds(ans)) {
              countsByOptionId.set(optId, (countsByOptionId.get(optId) ?? 0) + 1);
            }
          } else {
            countsByOptionId.set(
              ans.selectedOptionId,
              (countsByOptionId.get(ans.selectedOptionId) ?? 0) + 1,
            );
          }
        }

        optionDistribution = question.options.map((opt, optIdx) => {
          const count = countsByOptionId.get(opt.id) ?? 0;
          const label =
            question.type === 'TRUE_FALSE'
              ? opt.text
              : (OPTION_LETTERS[optIdx] ?? String(optIdx + 1));

          return {
            optionId: opt.id,
            label,
            order: opt.order,
            text: opt.text,
            isCorrect: opt.isCorrect,
            count,
            percentageOfPlayers:
              totalParticipants > 0
                ? round1((count / totalParticipants) * 100)
                : 0,
            percentageOfAnswers:
              answeredCount > 0 ? round1((count / answeredCount) * 100) : 0,
          };
        });

        let maxWrongOptionCount = 0;
        for (const item of optionDistribution) {
          if (!item.isCorrect && item.count > maxWrongOptionCount) {
            maxWrongOptionCount = item.count;
            mostCommonWrongAnswer = item.text;
          }
        }
      }

      return {
        questionIndex: qIndex,
        questionNumber: qIndex + 1,
        type: question.type,
        text: question.text,
        explanation: question.explanation,
        allowPartialCredit: question.allowPartialCredit,
        timeLimitSec: question.timeLimitSec,
        points: question.points,
        correctAnswerText,
        answeredCount,
        correctCount,
        partialCount,
        wrongCount,
        unansweredCount,
        successRatePct,
        averageResponseMs,
        mostCommonWrongAnswer,
        optionDistribution,
      };
    },
  );

  const hardestQuestions: HardestQuestionItem[] = [...questions]
    .map((q) => ({
      questionIndex: q.questionIndex,
      questionNumber: q.questionNumber,
      type: q.type,
      text: q.text,
      successRatePct: q.successRatePct,
      answeredCount: q.answeredCount,
      totalParticipants,
      correctCount: q.correctCount,
      partialCount: q.partialCount,
      wrongCount: q.wrongCount,
      unansweredCount: q.unansweredCount,
      mostCommonWrongAnswer: q.mostCommonWrongAnswer,
      correctAnswerText: q.correctAnswerText,
    }))
    .sort((a, b) => {
      if (a.successRatePct !== null && b.successRatePct !== null) {
        if (a.successRatePct !== b.successRatePct) {
          return a.successRatePct - b.successRatePct;
        }
      } else if (a.successRatePct !== null) {
        return -1;
      } else if (b.successRatePct !== null) {
        return 1;
      }

      if (a.correctCount !== b.correctCount) return a.correctCount - b.correctCount;
      if (b.wrongCount !== a.wrongCount) return b.wrongCount - a.wrongCount;
      return a.questionNumber - b.questionNumber;
    });

  const participants: ParticipantAnalyticsItem[] = unifiedParticipants.map((p) => {
    const pAnswers = answersByParticipant.get(p.participantId) ?? new Map();
    let correctCount = 0;
    let partialCount = 0;
    let wrongCount = 0;
    let answeredQuestionsCount = 0;
    let totalResponseMs = 0;

    const questionBreakdown: ParticipantQuestionBreakdown[] = snapshotQuestions.map(
      (question, qIndex) => {
        const ans = pAnswers.get(qIndex);
        const correctAnswerText = formatCorrectAnswerText(question);

        if (!ans) {
          return {
            questionIndex: qIndex,
            questionNumber: qIndex + 1,
            questionText: question.text,
            questionType: question.type,
            status: 'UNANSWERED',
            submittedAnswerText: null,
            correctAnswerText,
            pointsAwarded: 0,
            maxPoints: question.points,
            responseTimeMs: null,
          };
        }

        answeredQuestionsCount += 1;
        totalResponseMs += ans.responseTimeMs;
        const partial = isAnswerPartialCredit(ans);

        if (ans.isCorrect) {
          correctCount += 1;
        } else {
          wrongCount += 1;
          if (partial) {
            partialCount += 1;
          }
        }

        return {
          questionIndex: qIndex,
          questionNumber: qIndex + 1,
          questionText: question.text,
          questionType: question.type,
          status: ans.isCorrect ? 'CORRECT' : partial ? 'PARTIAL' : 'WRONG',
          submittedAnswerText: formatSubmittedAnswerText(question, ans),
          correctAnswerText,
          pointsAwarded: ans.pointsAwarded,
          maxPoints: question.points,
          responseTimeMs: ans.responseTimeMs,
        };
      },
    );

    // Eğer eski oturumda GameAnswer satırı yoksa ancak GameResult varsa doğru sayısını koru
    const effectiveCorrect =
      pAnswers.size > 0 ? correctCount : p.correctCount;
    const effectiveWrong =
      pAnswers.size > 0 ? wrongCount : 0;
    const effectiveUnanswered = Math.max(
      0,
      totalQuestions - effectiveCorrect - effectiveWrong,
    );

    const avgResponseMs =
      answeredQuestionsCount > 0
        ? Math.round(totalResponseMs / answeredQuestionsCount)
        : null;

    const successRatePct =
      totalQuestions > 0
        ? round1((effectiveCorrect / totalQuestions) * 100)
        : 0;

    return {
      participantId: p.participantId,
      nickname: p.nickname,
      rank: p.rank,
      totalScore: p.totalScore,
      correctCount: effectiveCorrect,
      partialCount,
      wrongCount: effectiveWrong,
      unansweredCount: effectiveUnanswered,
      totalQuestions,
      successRatePct,
      avgResponseMs,
      questionBreakdown,
    };
  });

  const averageSuccessRatePct =
    totalParticipants > 0 && totalQuestions > 0
      ? round1(
          (participants.reduce((sum, p) => sum + p.correctCount, 0) /
            (totalParticipants * totalQuestions)) *
            100,
        )
      : null;

  const averageScore =
    totalParticipants > 0
      ? Math.round(
          participants.reduce((sum, p) => sum + p.totalScore, 0) /
            totalParticipants,
        )
      : null;

  const highestScorer =
    totalParticipants > 0
      ? [...participants].sort((a, b) => b.totalScore - a.totalScore)[0] ?? null
      : null;

  const averageResponseMs =
    totalAnswersSubmitted > 0
      ? Math.round(
          session.answers.reduce((sum, ans) => sum + ans.responseTimeMs, 0) /
            totalAnswersSubmitted,
        )
      : null;

  const hardestCandidate =
    totalParticipants > 0 &&
    totalAnswersSubmitted > 0 &&
    hardestQuestions.length > 0 &&
    hardestQuestions[0]!.successRatePct !== null
      ? {
          questionIndex: hardestQuestions[0]!.questionIndex,
          questionNumber: hardestQuestions[0]!.questionNumber,
          text: hardestQuestions[0]!.text,
          successRatePct: hardestQuestions[0]!.successRatePct,
        }
      : null;

  const questionSuccessAndTime: QuestionChartPoint[] = questions.map((q) => ({
    questionNumber: q.questionNumber,
    label: `S${q.questionNumber}`,
    shortTitle:
      q.text.length > 36 ? `${q.text.slice(0, 34).trim()}...` : q.text,
    type: q.type,
    successRatePct: q.successRatePct ?? 0,
    avgResponseSec:
      q.averageResponseMs !== null
        ? Math.round((q.averageResponseMs / 1000) * 100) / 100
        : 0,
    answeredCount: q.answeredCount,
    correctCount: q.correctCount,
    partialCount: q.partialCount,
    wrongCount: q.wrongCount,
    unansweredCount: q.unansweredCount,
  }));

  const maxPossibleQuizScore = Math.max(
    1000,
    snapshotQuestions.reduce((sum, q) => sum + q.points, 0),
  );
  const bucketBounds = [
    { label: '%0–20', minRatio: 0, maxRatio: 0.2 },
    { label: '%21–40', minRatio: 0.2, maxRatio: 0.4 },
    { label: '%41–60', minRatio: 0.4, maxRatio: 0.6 },
    { label: '%61–80', minRatio: 0.6, maxRatio: 0.8 },
    { label: '%81–100', minRatio: 0.8, maxRatio: 1.01 },
  ];

  const scoreDistribution: ScoreBucketPoint[] =
    totalParticipants > 0
      ? bucketBounds.map((b, idx) => {
          const minPts =
            idx === 0 ? 0 : Math.floor(maxPossibleQuizScore * b.minRatio) + 1;
          const maxPts = Math.floor(
            maxPossibleQuizScore * Math.min(1, b.maxRatio),
          );
          const count = participants.filter((p) => {
            const ratio = Math.min(1, Math.max(0, p.totalScore / maxPossibleQuizScore));
            return idx === 0
              ? ratio <= b.maxRatio
              : ratio > b.minRatio && ratio <= b.maxRatio;
          }).length;

          return {
            bucketLabel: b.label,
            rangeLabel: `${minPts.toLocaleString('tr-TR')}–${maxPts.toLocaleString('tr-TR')} p`,
            count,
            percentage: round1((count / totalParticipants) * 100),
          };
        })
      : [];

  return {
    id: session.id,
    pin: session.pin,
    quizId: session.quizId,
    quizStillExists: Boolean(session.quiz?.id),
    quizTitle: session.quizTitle,
    quizCategory: session.quizCategory,
    status: session.status as 'FINISHED' | 'CANCELLED' | 'INTERRUPTED',
    startedAt: session.startedAt ? session.startedAt.toISOString() : null,
    endedAt: session.endedAt ? session.endedAt.toISOString() : null,
    createdAt: session.createdAt.toISOString(),
    durationSec: computeDurationSec(session.startedAt, session.endedAt),
    totalQuestions,
    hasSnapshotQuestions,
    overview: {
      totalParticipants,
      totalAnswersSubmitted,
      averageSuccessRatePct,
      averageScore,
      highestScore: highestScorer?.totalScore ?? null,
      highestScorerNickname: highestScorer?.nickname ?? null,
      averageResponseMs,
      hardestQuestion: hardestCandidate,
    },
    questions,
    hardestQuestions,
    participants,
    charts: {
      questionSuccessAndTime,
      scoreDistribution,
    },
  };
}
