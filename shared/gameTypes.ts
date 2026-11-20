import type { QuestionType } from './quizTypes';

export type GamePhase =
  | 'LOBBY'
  | 'COUNTDOWN'
  | 'QUESTION'
  | 'QUESTION_RESULT'
  | 'FINISHED'
  | 'CANCELLED';

export type PresenterResultFocus = 'DISTRIBUTION' | 'LEADERBOARD';

export interface FrozenOption {
  id: string;
  order: number;
  text: string;
  isCorrect: boolean;
}

export interface FrozenQuestion {
  id: string;
  order: number;
  type: QuestionType;
  text: string;
  explanation: string;
  allowPartialCredit: boolean;
  imageUrl: string | null;
  timeLimitSec: number;
  points: number;
  options: FrozenOption[];
}

export interface FrozenQuizSnapshot {
  quizId: string;
  title: string;
  description: string;
  category: string;
  coverImageUrl: string | null;
  questions: FrozenQuestion[];
}

export interface PublicOption {
  id: string;
  order: number;
  text: string;
}

export interface PublicQuestion {
  index: number;
  totalQuestions: number;
  type: QuestionType;
  allowPartialCredit: boolean;
  text: string;
  imageUrl: string | null;
  timeLimitSec: number;
  points: number;
  options: PublicOption[];
}

export interface ParticipantPublic {
  id: string;
  nickname: string;
  connected: boolean;
  score: number;
  joinedAt: string;
}

export interface LeaderboardEntry {
  participantId: string;
  nickname: string;
  score: number;
  rank: number;
  correctCount: number;
  wrongCount?: number;
  unansweredCount?: number;
  totalResponseMs: number;
  avgResponseMs: number;
  lastDelta: number;
}

export interface OptionStat {
  optionId: string;
  order: number;
  text: string;
  count: number;
  isCorrect: boolean;
}

export interface PersonalQuestionResult {
  answered: boolean;
  selectedOptionId: string | null;
  selectedOptionIds?: string[];
  orderedOptionIds?: string[];
  isCorrect: boolean;
  isPartial?: boolean;
  pointsAwarded: number;
  totalScore: number;
  rank: number;
}

export interface QuestionResultPayload {
  questionIndex: number;
  totalQuestions: number;
  questionType: QuestionType;
  correctOptionId: string;
  correctOptionIds: string[];
  explanation?: string;
  totalResponders: number;
  exactCorrectCount: number;
  partialCorrectCount: number;
  optionStats: OptionStat[];
  leaderboard: LeaderboardEntry[];
  isLastQuestion: boolean;
  personalResult?: PersonalQuestionResult;
}

export interface FinishedPayload {
  sessionId: string;
  pin: string;
  quizTitle: string;
  totalQuestions: number;
  podium: LeaderboardEntry[];
  leaderboard: LeaderboardEntry[];
  personalResult?: {
    rank: number;
    totalScore: number;
    correctCount: number;
    wrongCount?: number;
    unansweredCount?: number;
    totalQuestions: number;
    avgResponseMs: number;
  };
}

export interface HostSessionSnapshot {
  sessionId: string;
  pin: string;
  presenterToken: string;
  classroomMode: boolean;
  presenterResultFocus: PresenterResultFocus;
  quizTitle: string;
  quizCategory: string;
  phase: GamePhase;
  maxPlayers: number;
  totalQuestions: number;
  questionIndex: number;
  serverNowMs: number;
  countdownEndsAtMs: number | null;
  questionEndsAtMs: number | null;
  isPaused: boolean;
  pausedRemainingMs: number | null;
  participants: ParticipantPublic[];
  answeredCount: number;
  connectedCount: number;
  currentQuestion: PublicQuestion | null;
  lastQuestionResult: QuestionResultPayload | null;
  finalResult: FinishedPayload | null;
}

export interface PresenterSessionSnapshot {
  sessionId: string;
  pin: string;
  classroomMode: boolean;
  presenterResultFocus: PresenterResultFocus;
  quizTitle: string;
  quizCategory: string;
  phase: GamePhase;
  maxPlayers: number;
  totalQuestions: number;
  questionIndex: number;
  serverNowMs: number;
  countdownEndsAtMs: number | null;
  questionEndsAtMs: number | null;
  isPaused: boolean;
  pausedRemainingMs: number | null;
  participants: ParticipantPublic[];
  answeredCount: number;
  connectedCount: number;
  currentQuestion: PublicQuestion | null;
  lastQuestionResult: QuestionResultPayload | null;
  finalResult: FinishedPayload | null;
}

export interface PlayerSessionSnapshot {
  sessionId: string;
  pin: string;
  quizTitle: string;
  quizCategory: string;
  participantId: string;
  nickname: string;
  phase: GamePhase;
  totalQuestions: number;
  questionIndex: number;
  serverNowMs: number;
  countdownEndsAtMs: number | null;
  questionEndsAtMs: number | null;
  isPaused: boolean;
  pausedRemainingMs: number | null;
  score: number;
  hasAnsweredCurrent: boolean;
  selectedOptionId: string | null;
  selectedOptionIds?: string[];
  orderedOptionIds?: string[];
  currentQuestion: PublicQuestion | null;
  lastQuestionResult: QuestionResultPayload | null;
  finalResult: FinishedPayload | null;
}

export type SocketAck<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; code: string; message: string };

export interface ClientToServerEvents {
  'time:sync': (
    payload: { clientSentMs: number },
    ack: (res: { clientSentMs: number; serverNowMs: number }) => void,
  ) => void;
  'host:attach': (
    payload: { pin: string; hostToken: string },
    ack: (res: SocketAck<{ snapshot: HostSessionSnapshot }>) => void,
  ) => void;
  'presenter:attach': (
    payload: { pin: string; presenterToken: string },
    ack: (res: SocketAck<{ snapshot: PresenterSessionSnapshot }>) => void,
  ) => void;
  'host:start_game': (
    payload: { pin: string; hostToken: string },
    ack: (res: SocketAck) => void,
  ) => void;
  'host:pause_question': (
    payload: { pin: string; hostToken: string },
    ack: (
      res: SocketAck<{
        questionIndex: number;
        pausedRemainingMs: number;
        serverNowMs: number;
      }>,
    ) => void,
  ) => void;
  'host:resume_question': (
    payload: { pin: string; hostToken: string },
    ack: (
      res: SocketAck<{
        questionIndex: number;
        questionEndsAtMs: number;
        serverNowMs: number;
      }>,
    ) => void,
  ) => void;
  'host:set_presenter_focus': (
    payload: {
      pin: string;
      hostToken: string;
      focus: PresenterResultFocus;
    },
    ack: (res: SocketAck<{ focus: PresenterResultFocus }>) => void,
  ) => void;
  'host:rotate_presenter_token': (
    payload: { pin: string; hostToken: string },
    ack: (res: SocketAck<{ presenterToken: string }>) => void,
  ) => void;
  'host:end_question': (
    payload: { pin: string; hostToken: string },
    ack: (res: SocketAck) => void,
  ) => void;
  'host:next_question': (
    payload: { pin: string; hostToken: string },
    ack: (res: SocketAck) => void,
  ) => void;
  'host:kick_player': (
    payload: { pin: string; hostToken: string; participantId: string },
    ack: (res: SocketAck) => void,
  ) => void;
  'host:cancel_game': (
    payload: { pin: string; hostToken: string },
    ack: (res: SocketAck) => void,
  ) => void;
  'host:end_game': (
    payload: { pin: string; hostToken: string },
    ack: (res: SocketAck) => void,
  ) => void;
  'player:join': (
    payload: { pin: string; nickname: string },
    ack: (
      res: SocketAck<{
        reconnectToken: string;
        snapshot: PlayerSessionSnapshot;
      }>,
    ) => void,
  ) => void;
  'player:reconnect': (
    payload: { pin: string; reconnectToken: string },
    ack: (res: SocketAck<{ snapshot: PlayerSessionSnapshot }>) => void,
  ) => void;
  'player:submit_answer': (
    payload: {
      pin: string;
      questionIndex: number;
      optionId?: string;
      optionIds?: string[];
      orderedOptionIds?: string[];
    },
    ack: (
      res: SocketAck<{
        accepted: true;
        questionIndex: number;
        selectedOptionId: string;
        selectedOptionIds?: string[];
        orderedOptionIds?: string[];
      }>,
    ) => void,
  ) => void;
}

export interface ServerToClientEvents {
  'lobby:updated': (payload: {
    participants: ParticipantPublic[];
    connectedCount: number;
    totalCount: number;
  }) => void;
  'game:countdown': (payload: {
    serverNowMs: number;
    countdownEndsAtMs: number;
    totalQuestions: number;
  }) => void;
  'game:question_started': (payload: {
    question: PublicQuestion;
    serverNowMs: number;
    questionStartedAtMs: number;
    questionEndsAtMs: number;
    connectedCount: number;
  }) => void;
  'game:question_paused': (payload: {
    questionIndex: number;
    pausedRemainingMs: number;
    serverNowMs: number;
  }) => void;
  'game:question_resumed': (payload: {
    questionIndex: number;
    questionEndsAtMs: number;
    serverNowMs: number;
  }) => void;
  'game:answer_progress': (payload: {
    questionIndex: number;
    answeredCount: number;
    connectedCount: number;
  }) => void;
  'game:question_result': (payload: QuestionResultPayload) => void;
  'game:presenter_focus': (payload: { focus: PresenterResultFocus }) => void;
  'presenter:revoked': (payload: { message: string }) => void;
  'game:finished': (payload: FinishedPayload) => void;
  'game:cancelled': (payload: { message: string }) => void;
  'player:kicked': (payload: { message: string }) => void;
}

export interface CreateGameResponse {
  sessionId: string;
  pin: string;
  hostToken: string;
  presenterToken: string;
  classroomMode: boolean;
  quizTitle: string;
  quizCategory: string;
  joinPath: string;
  presentPath: string;
}

export interface ValidatePinResponse {
  valid: true;
  pin: string;
  quizTitle: string;
  quizCategory: string;
  questionCount: number;
  participantCount: number;
  maxPlayers: number;
}

export interface GameHistorySummary {
  id: string;
  pin: string;
  quizId?: string | null;
  quizStillExists?: boolean;
  quizTitle: string;
  quizCategory: string;
  status: 'FINISHED' | 'CANCELLED' | 'INTERRUPTED';
  participantCount: number;
  questionCount: number;
  averageSuccessRatePct?: number | null;
  durationSec?: number | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  winner: {
    nickname: string;
    totalScore: number;
  } | null;
}

export interface GameHistoryResultRow {
  id: string;
  participantId: string;
  nickname: string;
  rank: number;
  totalScore: number;
  correctCount: number;
  wrongCount?: number;
  unansweredCount?: number;
  totalQuestions: number;
  avgResponseMs: number;
}

export interface GameHistoryDetail {
  id: string;
  pin: string;
  quizTitle: string;
  quizCategory: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  results: GameHistoryResultRow[];
}
