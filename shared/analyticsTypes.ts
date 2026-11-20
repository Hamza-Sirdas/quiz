import type { QuestionType } from './quizTypes';

export interface QuestionOptionDistributionItem {
  optionId: string;
  label: string;
  order: number;
  text: string;
  isCorrect: boolean;
  count: number;
  percentageOfPlayers: number;
  percentageOfAnswers: number;
}

export interface QuestionAnalyticsItem {
  questionIndex: number;
  questionNumber: number;
  type: QuestionType;
  text: string;
  explanation: string;
  allowPartialCredit: boolean;
  timeLimitSec: number;
  points: number;
  correctAnswerText: string;
  answeredCount: number;
  correctCount: number;
  partialCount: number;
  wrongCount: number;
  unansweredCount: number;
  successRatePct: number | null;
  averageResponseMs: number | null;
  mostCommonWrongAnswer: string | null;
  optionDistribution: QuestionOptionDistributionItem[];
}

export interface HardestQuestionItem {
  questionIndex: number;
  questionNumber: number;
  type: QuestionType;
  text: string;
  successRatePct: number | null;
  answeredCount: number;
  totalParticipants: number;
  correctCount: number;
  partialCount: number;
  wrongCount: number;
  unansweredCount: number;
  mostCommonWrongAnswer: string | null;
  correctAnswerText: string;
}

export type ParticipantAnswerStatus =
  | 'CORRECT'
  | 'PARTIAL'
  | 'WRONG'
  | 'UNANSWERED';

export interface ParticipantQuestionBreakdown {
  questionIndex: number;
  questionNumber: number;
  questionText: string;
  questionType: QuestionType;
  status: ParticipantAnswerStatus;
  submittedAnswerText: string | null;
  correctAnswerText: string;
  pointsAwarded: number;
  maxPoints: number;
  responseTimeMs: number | null;
}

export interface ParticipantAnalyticsItem {
  participantId: string;
  nickname: string;
  rank: number;
  totalScore: number;
  correctCount: number;
  partialCount: number;
  wrongCount: number;
  unansweredCount: number;
  totalQuestions: number;
  successRatePct: number;
  avgResponseMs: number | null;
  questionBreakdown: ParticipantQuestionBreakdown[];
}

export interface QuestionChartPoint {
  questionNumber: number;
  label: string;
  shortTitle: string;
  type: QuestionType;
  successRatePct: number;
  avgResponseSec: number;
  answeredCount: number;
  correctCount: number;
  partialCount: number;
  wrongCount: number;
  unansweredCount: number;
}

export interface ScoreBucketPoint {
  bucketLabel: string;
  rangeLabel: string;
  count: number;
  percentage: number;
}

export interface GameSessionAnalyticsOverview {
  totalParticipants: number;
  totalAnswersSubmitted: number;
  averageSuccessRatePct: number | null;
  averageScore: number | null;
  highestScore: number | null;
  highestScorerNickname: string | null;
  averageResponseMs: number | null;
  hardestQuestion: {
    questionIndex: number;
    questionNumber: number;
    text: string;
    successRatePct: number;
  } | null;
}

export interface GameSessionAnalytics {
  id: string;
  pin: string;
  quizId: string | null;
  quizStillExists: boolean;
  quizTitle: string;
  quizCategory: string;
  status: 'FINISHED' | 'CANCELLED' | 'INTERRUPTED';
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  durationSec: number | null;
  totalQuestions: number;
  hasSnapshotQuestions: boolean;
  overview: GameSessionAnalyticsOverview;
  questions: QuestionAnalyticsItem[];
  hardestQuestions: HardestQuestionItem[];
  participants: ParticipantAnalyticsItem[];
  charts: {
    questionSuccessAndTime: QuestionChartPoint[];
    scoreDistribution: ScoreBucketPoint[];
  };
}
