import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  CreateGameResponse,
  FinishedPayload,
  FrozenQuizSnapshot,
  GamePhase,
  HostSessionSnapshot,
  LeaderboardEntry,
  OptionStat,
  ParticipantPublic,
  PersonalQuestionResult,
  PlayerSessionSnapshot,
  PresenterResultFocus,
  PresenterSessionSnapshot,
  PublicOption,
  PublicQuestion,
  QuestionResultPayload,
  ServerToClientEvents,
  ValidatePinResponse,
} from '@shared/gameTypes';
import {
  validateAndEvaluateAnswer,
  type SubmittedAnswerPayload,
} from '../../shared/answerEvaluation';
import { shuffleOrderingIds } from '../../shared/quizTypes';
import { prisma } from '../lib/prisma';
import { validatePublishedQuizRecord } from '../schemas/quizSchema';
import {
  calculateAnswerPoints,
  rankParticipants,
  type RankedParticipant,
} from './scoringService';

export interface GameManagerOptions {
  countdownMs?: number;
  maxPlayers?: number;
  questionGraceMs?: number;
  roomRetentionMs?: number;
}

interface ActiveAnswer {
  participantId: string;
  questionIndex: number;
  selectedOptionId: string;
  selectedOptionIds?: string[];
  orderedOptionIds?: string[];
  isCorrect: boolean;
  isPartial: boolean;
  scoreRatio: number;
  responseTimeMs: number;
  pointsAwarded: number;
  answeredAt: Date;
}

interface ActiveParticipant {
  id: string;
  nickname: string;
  normalizedName: string;
  reconnectTokenHash: string;
  socketId: string | null;
  score: number;
  correctCount: number;
  wrongCount: number;
  totalResponseMs: number;
  lastDelta: number;
  kicked: boolean;
  joinedAt: Date;
  lastSeenAt: Date;
}

interface ActiveRoom {
  sessionId: string;
  pin: string;
  quizId: string | null;
  hostTeacherId: string;
  quizTitle: string;
  quizCategory: string;
  hostTokenHash: string;
  presenterTokenPlain: string;
  presenterTokenHash: string;
  classroomMode: boolean;
  presenterResultFocus: PresenterResultFocus;
  hostSocketId: string | null;
  presenterSocketIds: Set<string>;
  phase: GamePhase;
  maxPlayers: number;
  snapshot: FrozenQuizSnapshot;
  questionIndex: number;
  countdownEndsAtMs: number | null;
  questionStartedAtMs: number | null;
  questionEndsAtMs: number | null;
  isPaused: boolean;
  pausedRemainingMs: number | null;
  startedAt: Date | null;
  endedAt: Date | null;
  participants: Map<string, ActiveParticipant>;
  answersByQuestion: Map<number, Map<string, ActiveAnswer>>;
  shuffledOptionsByQuestion: Map<number, PublicOption[]>;
  lastQuestionResult: QuestionResultPayload | null;
  finalResult: FinishedPayload | null;
  countdownTimer: ReturnType<typeof setTimeout> | null;
  questionTimer: ReturnType<typeof setTimeout> | null;
  earlyCloseTimer: ReturnType<typeof setTimeout> | null;
  lobbyThrottleTimer: ReturnType<typeof setTimeout> | null;
  progressThrottleTimer: ReturnType<typeof setTimeout> | null;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
  persistedFinal: boolean;
}

export class GameDomainError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = 'GameDomainError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export type GameSocketServer = Server<ClientToServerEvents, ServerToClientEvents>;

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function verifyToken(plain: string, expectedHash: string): boolean {
  if (!plain || typeof plain !== 'string') return false;
  const candidate = hashToken(plain);
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function sanitizeNickname(raw: string): string {
  return raw
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeNickname(raw: string): string {
  return sanitizeNickname(raw).toLocaleLowerCase('tr-TR');
}

export class GameManager {
  private readonly roomsByPin = new Map<string, ActiveRoom>();
  private readonly socketIndex = new Map<
    string,
    { pin: string; role: 'host' | 'presenter' | 'player'; participantId?: string }
  >();
  private readonly countdownMs: number;
  private readonly defaultMaxPlayers: number;
  private readonly questionGraceMs: number;
  private readonly roomRetentionMs: number;
  private io: GameSocketServer | null = null;

  constructor(options: GameManagerOptions = {}) {
    this.countdownMs = options.countdownMs ?? 3000;
    this.defaultMaxPlayers = options.maxPlayers ?? 60;
    this.questionGraceMs = options.questionGraceMs ?? 150;
    this.roomRetentionMs = options.roomRetentionMs ?? 15 * 60 * 1000;
  }

  attachSocketServer(io: GameSocketServer): void {
    this.io = io;
  }

  getActiveRoomCount(): number {
    return this.roomsByPin.size;
  }

  async markStaleSessionsInterrupted(): Promise<number> {
    const result = await prisma.gameSession.updateMany({
      where: {
        status: {
          in: ['LOBBY', 'IN_PROGRESS'],
        },
      },
      data: {
        status: 'INTERRUPTED',
        endedAt: new Date(),
      },
    });
    return result.count;
  }

  private async generateUniquePin(): Promise<string> {
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const pin = String(crypto.randomInt(100000, 1000000));
      if (this.roomsByPin.has(pin)) continue;

      const existing = await prisma.gameSession.findFirst({
        where: {
          pin,
          status: { in: ['LOBBY', 'IN_PROGRESS'] },
        },
        select: { id: true },
      });

      if (!existing) {
        return pin;
      }
    }

    throw new GameDomainError(
      'PIN_GENERATION_FAILED',
      'Benzersiz oyun PIN kodu üretilemedi. Lütfen tekrar deneyin.',
      503,
    );
  }

  async createSession(
    quizId: string,
    hostTeacherId: string,
    options?: { classroomMode?: boolean },
  ): Promise<CreateGameResponse> {
    const classroomMode = Boolean(options?.classroomMode);
    const quiz = await prisma.quiz.findFirst({
      where: {
        id: quizId,
        ownerId: hostTeacherId,
      },
      include: {
        questions: {
          orderBy: { order: 'asc' },
          include: {
            options: {
              orderBy: { order: 'asc' },
            },
          },
        },
      },
    });

    if (!quiz) {
      throw new GameDomainError(
        'QUIZ_NOT_FOUND',
        'Seçilen quiz bulunamadı veya erişim yetkiniz yok.',
        404,
      );
    }

    if (quiz.status !== 'PUBLISHED') {
      throw new GameDomainError(
        'QUIZ_NOT_PUBLISHED',
        'Taslak durumundaki quizlerle canlı yarışma başlatılamaz. Önce quizi doğrulayıp Yayına Hazır durumuna getirin.',
        400,
      );
    }

    if (quiz.questions.length === 0) {
      throw new GameDomainError(
        'EMPTY_QUIZ',
        'Soru içermeyen bir quiz ile yarışma başlatılamaz.',
        400,
      );
    }

    const validationIssue = validatePublishedQuizRecord(quiz);
    if (validationIssue) {
      throw new GameDomainError('INVALID_QUIZ_FOR_LIVE', validationIssue, 400);
    }

    const snapshot: FrozenQuizSnapshot = {
      quizId: quiz.id,
      title: quiz.title,
      description: quiz.description,
      category: quiz.category,
      coverImageUrl: quiz.coverImageUrl,
      questions: quiz.questions.map((question) => ({
        id: question.id,
        order: question.order,
        type: question.type,
        text: question.text,
        explanation: question.explanation,
        allowPartialCredit: question.allowPartialCredit,
        imageUrl: question.imageUrl,
        timeLimitSec: question.timeLimitSec,
        points: question.points,
        options: question.options.map((option) => ({
          id: option.id,
          order: option.order,
          text: option.text,
          isCorrect: option.isCorrect,
        })),
      })),
    };

    const pin = await this.generateUniquePin();
    const hostToken = generateToken();
    const hostTokenHash = hashToken(hostToken);
    const presenterToken = generateToken();
    const presenterTokenHash = hashToken(presenterToken);

    const created = await prisma.gameSession.create({
      data: {
        pin,
        quizId: quiz.id,
        hostTeacherId,
        quizTitle: quiz.title,
        quizCategory: quiz.category,
        hostTokenHash,
        status: 'LOBBY',
        maxPlayers: this.defaultMaxPlayers,
        quizSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });

    const room: ActiveRoom = {
      sessionId: created.id,
      pin,
      quizId: quiz.id,
      hostTeacherId,
      quizTitle: quiz.title,
      quizCategory: quiz.category,
      hostTokenHash,
      presenterTokenPlain: presenterToken,
      presenterTokenHash,
      classroomMode,
      presenterResultFocus: 'DISTRIBUTION',
      hostSocketId: null,
      presenterSocketIds: new Set(),
      phase: 'LOBBY',
      maxPlayers: created.maxPlayers,
      snapshot,
      questionIndex: -1,
      countdownEndsAtMs: null,
      questionStartedAtMs: null,
      questionEndsAtMs: null,
      isPaused: false,
      pausedRemainingMs: null,
      startedAt: null,
      endedAt: null,
      participants: new Map(),
      answersByQuestion: new Map(),
      shuffledOptionsByQuestion: new Map(),
      lastQuestionResult: null,
      finalResult: null,
      countdownTimer: null,
      questionTimer: null,
      earlyCloseTimer: null,
      lobbyThrottleTimer: null,
      progressThrottleTimer: null,
      cleanupTimer: null,
      persistedFinal: false,
    };

    this.roomsByPin.set(pin, room);

    return {
      sessionId: created.id,
      pin,
      hostToken,
      presenterToken,
      classroomMode,
      quizTitle: quiz.title,
      quizCategory: quiz.category,
      joinPath: `/join?pin=${pin}`,
      presentPath: `/present/${pin}?token=${presenterToken}`,
    };
  }

  async validatePin(pin: string): Promise<ValidatePinResponse> {
    const cleanPin = pin.trim();
    if (!/^\d{6}$/.test(cleanPin)) {
      throw new GameDomainError(
        'INVALID_PIN_FORMAT',
        'Oyun PIN kodu 6 haneli rakamlardan oluşmalıdır.',
        400,
      );
    }

    const room = this.roomsByPin.get(cleanPin);
    if (!room) {
      const pastSession = await prisma.gameSession.findFirst({
        where: { pin: cleanPin },
        orderBy: { createdAt: 'desc' },
        select: { status: true },
      });

      if (pastSession) {
        throw new GameDomainError(
          'ROOM_CLOSED',
          'Bu oyun odası kapatılmış veya yarışma sona ermiş.',
          404,
        );
      }

      throw new GameDomainError(
        'ROOM_NOT_FOUND',
        'Bu PIN koduna ait aktif bir oyun odası bulunamadı.',
        404,
      );
    }

    if (room.phase !== 'LOBBY') {
      throw new GameDomainError(
        'ROOM_CLOSED',
        'Bu yarışma zaten başlamış veya kapatılmış.',
        409,
      );
    }

    const activeCount = this.getActiveParticipants(room).length;
    if (activeCount >= room.maxPlayers) {
      throw new GameDomainError(
        'ROOM_FULL',
        'Oyun odası maksimum katılımcı kapasitesine ulaşmış.',
        409,
      );
    }

    return {
      valid: true,
      pin: room.pin,
      quizTitle: room.quizTitle,
      quizCategory: room.quizCategory,
      questionCount: room.snapshot.questions.length,
      participantCount: activeCount,
      maxPlayers: room.maxPlayers,
    };
  }

  private getRoomOrThrow(pin: string): ActiveRoom {
    const room = this.roomsByPin.get(pin.trim());
    if (!room) {
      throw new GameDomainError(
        'ROOM_NOT_FOUND',
        'Bu PIN koduna ait aktif bir oyun odası bulunamadı.',
      );
    }
    return room;
  }

  private assertHostAuthorized(
    room: ActiveRoom,
    hostToken: string,
    hostTeacherId: string,
  ): void {
    if (
      !hostTeacherId ||
      room.hostTeacherId !== hostTeacherId ||
      !verifyToken(hostToken, room.hostTokenHash)
    ) {
      throw new GameDomainError(
        'UNAUTHORIZED_HOST',
        'Öğretmen yetkisi doğrulanamadı. Bu işlem yalnızca oturumu başlatan yetkili öğretmene aittir.',
      );
    }
  }

  private getActiveParticipants(room: ActiveRoom): ActiveParticipant[] {
    return Array.from(room.participants.values()).filter((p) => !p.kicked);
  }

  private toPublicParticipants(room: ActiveRoom): ParticipantPublic[] {
    return this.getActiveParticipants(room)
      .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime())
      .map((p) => ({
        id: p.id,
        nickname: p.nickname,
        connected: p.socketId !== null,
        score: p.score,
        joinedAt: p.joinedAt.toISOString(),
      }));
  }

  private toPublicQuestion(room: ActiveRoom): PublicQuestion | null {
    if (room.questionIndex < 0 || room.questionIndex >= room.snapshot.questions.length) {
      return null;
    }

    const q = room.snapshot.questions[room.questionIndex];
    let publicOptions: PublicOption[];

    if (q.type === 'ORDERING') {
      const existingShuffled = room.shuffledOptionsByQuestion.get(room.questionIndex);
      if (existingShuffled) {
        publicOptions = existingShuffled;
      } else {
        const sortedByExpected = [...q.options].sort((a, b) => a.order - b.order);
        publicOptions = shuffleOrderingIds(sortedByExpected).map((opt, idx) => ({
          id: opt.id,
          order: idx + 1,
          text: opt.text,
        }));
        room.shuffledOptionsByQuestion.set(room.questionIndex, publicOptions);
      }
    } else {
      publicOptions = q.options.map((opt) => ({
        id: opt.id,
        order: opt.order,
        text: opt.text,
      }));
    }

    return {
      index: room.questionIndex,
      totalQuestions: room.snapshot.questions.length,
      type: q.type,
      allowPartialCredit: q.allowPartialCredit,
      text: q.text,
      imageUrl: q.imageUrl,
      timeLimitSec: q.timeLimitSec,
      points: q.points,
      options: publicOptions,
    };
  }

  private buildHostSnapshot(room: ActiveRoom): HostSessionSnapshot {
    const active = this.getActiveParticipants(room);
    const connectedCount = active.filter((p) => p.socketId !== null).length;
    const questionAnswers = room.answersByQuestion.get(room.questionIndex);

    return {
      sessionId: room.sessionId,
      pin: room.pin,
      presenterToken: room.presenterTokenPlain,
      classroomMode: room.classroomMode,
      presenterResultFocus: room.presenterResultFocus,
      quizTitle: room.quizTitle,
      quizCategory: room.quizCategory,
      phase: room.phase,
      maxPlayers: room.maxPlayers,
      totalQuestions: room.snapshot.questions.length,
      questionIndex: room.questionIndex,
      serverNowMs: Date.now(),
      countdownEndsAtMs: room.countdownEndsAtMs,
      questionEndsAtMs: room.questionEndsAtMs,
      isPaused: room.isPaused,
      pausedRemainingMs: room.pausedRemainingMs,
      participants: this.toPublicParticipants(room),
      answeredCount: questionAnswers ? questionAnswers.size : 0,
      connectedCount,
      currentQuestion:
        room.phase === 'QUESTION' || room.phase === 'QUESTION_RESULT'
          ? this.toPublicQuestion(room)
          : null,
      lastQuestionResult:
        room.phase === 'QUESTION_RESULT' ? room.lastQuestionResult : null,
      finalResult: room.phase === 'FINISHED' ? room.finalResult : null,
    };
  }

  private buildPresenterSnapshot(room: ActiveRoom): PresenterSessionSnapshot {
    const active = this.getActiveParticipants(room);
    const connectedCount = active.filter((p) => p.socketId !== null).length;
    const questionAnswers = room.answersByQuestion.get(room.questionIndex);

    return {
      sessionId: room.sessionId,
      pin: room.pin,
      classroomMode: room.classroomMode,
      presenterResultFocus: room.presenterResultFocus,
      quizTitle: room.quizTitle,
      quizCategory: room.quizCategory,
      phase: room.phase,
      maxPlayers: room.maxPlayers,
      totalQuestions: room.snapshot.questions.length,
      questionIndex: room.questionIndex,
      serverNowMs: Date.now(),
      countdownEndsAtMs: room.countdownEndsAtMs,
      questionEndsAtMs: room.questionEndsAtMs,
      isPaused: room.isPaused,
      pausedRemainingMs: room.pausedRemainingMs,
      participants: this.toPublicParticipants(room),
      answeredCount: questionAnswers ? questionAnswers.size : 0,
      connectedCount,
      currentQuestion:
        room.phase === 'QUESTION' || room.phase === 'QUESTION_RESULT'
          ? this.toPublicQuestion(room)
          : null,
      lastQuestionResult:
        room.phase === 'QUESTION_RESULT'
          ? room.lastQuestionResult
            ? {
                ...room.lastQuestionResult,
                leaderboard: room.lastQuestionResult.leaderboard.slice(0, 10),
              }
            : null
          : null,
      finalResult:
        room.phase === 'FINISHED'
          ? room.finalResult
            ? {
                ...room.finalResult,
                leaderboard: room.finalResult.leaderboard.slice(0, 10),
              }
            : null
          : null,
    };
  }

  private buildPlayerSnapshot(
    room: ActiveRoom,
    participant: ActiveParticipant,
  ): PlayerSessionSnapshot {
    const currentAnswers = room.answersByQuestion.get(room.questionIndex);
    const myCurrentAnswer = currentAnswers?.get(participant.id);

    let lastQuestionResult: QuestionResultPayload | null = null;
    if (room.phase === 'QUESTION_RESULT' && room.lastQuestionResult) {
      const rankEntry = room.lastQuestionResult.leaderboard.find(
        (entry) => entry.participantId === participant.id,
      );
      lastQuestionResult = {
        ...room.lastQuestionResult,
        leaderboard: room.lastQuestionResult.leaderboard.slice(0, 10),
        personalResult: {
          answered: Boolean(myCurrentAnswer),
          selectedOptionId: myCurrentAnswer?.selectedOptionId ?? null,
          selectedOptionIds: myCurrentAnswer?.selectedOptionIds,
          orderedOptionIds: myCurrentAnswer?.orderedOptionIds,
          isCorrect: myCurrentAnswer?.isCorrect ?? false,
          isPartial: myCurrentAnswer?.isPartial ?? false,
          pointsAwarded: myCurrentAnswer?.pointsAwarded ?? 0,
          totalScore: participant.score,
          rank: rankEntry?.rank ?? 0,
        },
      };
    }

    let finalResult: FinishedPayload | null = null;
    if (room.phase === 'FINISHED' && room.finalResult) {
      const rankEntry = room.finalResult.leaderboard.find(
        (entry) => entry.participantId === participant.id,
      );
      finalResult = {
        ...room.finalResult,
        leaderboard: room.finalResult.leaderboard.slice(0, 20),
        personalResult: rankEntry
          ? {
              rank: rankEntry.rank,
              totalScore: rankEntry.score,
              correctCount: rankEntry.correctCount,
              wrongCount: rankEntry.wrongCount ?? participant.wrongCount,
              unansweredCount:
                rankEntry.unansweredCount ??
                Math.max(
                  0,
                  room.snapshot.questions.length -
                    rankEntry.correctCount -
                    (rankEntry.wrongCount ?? participant.wrongCount),
                ),
              totalQuestions: room.snapshot.questions.length,
              avgResponseMs: rankEntry.avgResponseMs,
            }
          : undefined,
      };
    }

    return {
      sessionId: room.sessionId,
      pin: room.pin,
      quizTitle: room.quizTitle,
      quizCategory: room.quizCategory,
      participantId: participant.id,
      nickname: participant.nickname,
      phase: room.phase,
      totalQuestions: room.snapshot.questions.length,
      questionIndex: room.questionIndex,
      serverNowMs: Date.now(),
      countdownEndsAtMs: room.countdownEndsAtMs,
      questionEndsAtMs: room.questionEndsAtMs,
      isPaused: room.isPaused,
      pausedRemainingMs: room.pausedRemainingMs,
      score: participant.score,
      hasAnsweredCurrent: Boolean(myCurrentAnswer),
      selectedOptionId: myCurrentAnswer?.selectedOptionId ?? null,
      selectedOptionIds: myCurrentAnswer?.selectedOptionIds,
      orderedOptionIds: myCurrentAnswer?.orderedOptionIds,
      currentQuestion:
        room.phase === 'QUESTION' || room.phase === 'QUESTION_RESULT'
          ? this.toPublicQuestion(room)
          : null,
      lastQuestionResult,
      finalResult,
    };
  }

  private emitLobbyUpdated(room: ActiveRoom): void {
    if (!this.io || room.lobbyThrottleTimer) return;

    room.lobbyThrottleTimer = setTimeout(() => {
      room.lobbyThrottleTimer = null;
      if (!this.io) return;

      const participants = this.toPublicParticipants(room);
      const connectedCount = participants.filter((p) => p.connected).length;

      this.io.to(this.roomChannel(room.pin)).emit('lobby:updated', {
        participants,
        connectedCount,
        totalCount: participants.length,
      });
    }, 40);
  }

  private emitAnswerProgress(room: ActiveRoom, questionIndex: number): void {
    if (
      !this.io ||
      (!room.hostSocketId && room.presenterSocketIds.size === 0) ||
      room.progressThrottleTimer
    ) {
      return;
    }

    room.progressThrottleTimer = setTimeout(() => {
      room.progressThrottleTimer = null;
      if (
        !this.io ||
        (!room.hostSocketId && room.presenterSocketIds.size === 0) ||
        room.questionIndex !== questionIndex
      ) {
        return;
      }

      const questionAnswers = room.answersByQuestion.get(questionIndex);
      const connectedCount = this.getActiveParticipants(room).filter(
        (p) => p.socketId !== null,
      ).length;
      const progressPayload = {
        questionIndex,
        answeredCount: questionAnswers ? questionAnswers.size : 0,
        connectedCount,
      };

      if (room.hostSocketId) {
        const hostSocket = this.io.sockets.sockets.get(room.hostSocketId);
        hostSocket?.emit('game:answer_progress', progressPayload);
      }

      for (const presenterSocketId of room.presenterSocketIds) {
        const presenterSocket = this.io.sockets.sockets.get(presenterSocketId);
        presenterSocket?.emit('game:answer_progress', progressPayload);
      }
    }, 60);
  }

  roomChannel(pin: string): string {
    return `game:${pin}`;
  }

  attachHost(
    pin: string,
    hostToken: string,
    socketId: string,
    hostTeacherId: string,
  ): HostSessionSnapshot {
    const room = this.getRoomOrThrow(pin);
    this.assertHostAuthorized(room, hostToken, hostTeacherId);

    room.hostSocketId = socketId;
    this.socketIndex.set(socketId, { pin: room.pin, role: 'host' });

    return this.buildHostSnapshot(room);
  }

  attachPresenter(
    pin: string,
    presenterToken: string,
    socketId: string,
  ): PresenterSessionSnapshot {
    const room = this.getRoomOrThrow(pin);
    if (!verifyToken(presenterToken, room.presenterTokenHash)) {
      throw new GameDomainError(
        'UNAUTHORIZED_PRESENTER',
        'Projeksiyon görüntüleme bağlantısı geçersiz veya öğretmen tarafından iptal edilmiş.',
      );
    }

    room.presenterSocketIds.add(socketId);
    this.socketIndex.set(socketId, { pin: room.pin, role: 'presenter' });

    return this.buildPresenterSnapshot(room);
  }

  rotatePresenterToken(
    pin: string,
    hostToken: string,
    hostTeacherId: string,
  ): { presenterToken: string } {
    const room = this.getRoomOrThrow(pin);
    this.assertHostAuthorized(room, hostToken, hostTeacherId);

    const nextToken = generateToken();
    room.presenterTokenPlain = nextToken;
    room.presenterTokenHash = hashToken(nextToken);

    if (this.io && room.presenterSocketIds.size > 0) {
      for (const sockId of room.presenterSocketIds) {
        this.socketIndex.delete(sockId);
        const sock = this.io.sockets.sockets.get(sockId);
        if (sock) {
          sock.emit('presenter:revoked', {
            message:
              'Projeksiyon bağlantısı öğretmen tarafından yenilendi veya kapatıldı.',
          });
          void sock.leave(this.roomChannel(room.pin));
        }
      }
      room.presenterSocketIds.clear();
    }

    return { presenterToken: nextToken };
  }

  setPresenterFocus(
    pin: string,
    hostToken: string,
    hostTeacherId: string,
    focus: PresenterResultFocus,
  ): { focus: PresenterResultFocus } {
    const room = this.getRoomOrThrow(pin);
    this.assertHostAuthorized(room, hostToken, hostTeacherId);

    room.presenterResultFocus = focus;

    if (this.io) {
      this.io.to(this.roomChannel(room.pin)).emit('game:presenter_focus', {
        focus,
      });
    }

    return { focus };
  }

  joinPlayer(
    pin: string,
    rawNickname: string,
    socketId: string,
  ): { reconnectToken: string; snapshot: PlayerSessionSnapshot; participantId: string } {
    const room = this.getRoomOrThrow(pin);

    if (room.phase !== 'LOBBY') {
      throw new GameDomainError(
        'ROOM_CLOSED',
        'Bu yarışma zaten başlamış veya kapatılmış; yeni katılım alınmıyor.',
      );
    }

    const nickname = sanitizeNickname(rawNickname);
    const normalized = normalizeNickname(rawNickname);

    if (nickname.length < 2 || nickname.length > 24) {
      throw new GameDomainError(
        'INVALID_NICKNAME',
        'Kullanıcı adı en az 2, en fazla 24 karakter olmalıdır.',
      );
    }

    const active = this.getActiveParticipants(room);
    if (active.length >= room.maxPlayers) {
      throw new GameDomainError(
        'ROOM_FULL',
        'Oyun odası dolu olduğu için katılım sağlanamıyor.',
      );
    }

    const duplicate = active.some((p) => p.normalizedName === normalized);
    if (duplicate) {
      throw new GameDomainError(
        'DUPLICATE_NICKNAME',
        'Bu kullanıcı adı bu odada zaten kullanılıyor. Lütfen başka bir ad seçin.',
      );
    }

    const participantId = crypto.randomUUID();
    const reconnectToken = generateToken();
    const now = new Date();

    const participant: ActiveParticipant = {
      id: participantId,
      nickname,
      normalizedName: normalized,
      reconnectTokenHash: hashToken(reconnectToken),
      socketId,
      score: 0,
      correctCount: 0,
      wrongCount: 0,
      totalResponseMs: 0,
      lastDelta: 0,
      kicked: false,
      joinedAt: now,
      lastSeenAt: now,
    };

    room.participants.set(participantId, participant);
    this.socketIndex.set(socketId, {
      pin: room.pin,
      role: 'player',
      participantId,
    });

    this.emitLobbyUpdated(room);

    return {
      reconnectToken,
      participantId,
      snapshot: this.buildPlayerSnapshot(room, participant),
    };
  }

  reconnectPlayer(
    pin: string,
    reconnectToken: string,
    socketId: string,
  ): { snapshot: PlayerSessionSnapshot; participantId: string } {
    const room = this.getRoomOrThrow(pin);

    if (room.phase === 'CANCELLED') {
      throw new GameDomainError('GAME_CANCELLED', 'Bu oyun öğretmen tarafından iptal edildi.');
    }

    const matched = Array.from(room.participants.values()).find((p) =>
      verifyToken(reconnectToken, p.reconnectTokenHash),
    );

    if (!matched) {
      throw new GameDomainError(
        'INVALID_RECONNECT_TOKEN',
        'Oturum belirteci doğrulanamadı. Lütfen oyuna yeniden katılın.',
      );
    }

    if (matched.kicked) {
      throw new GameDomainError(
        'PLAYER_KICKED',
        'Bu oyun odasından çıkarıldınız.',
      );
    }

    if (matched.socketId && matched.socketId !== socketId) {
      this.socketIndex.delete(matched.socketId);
    }

    matched.socketId = socketId;
    matched.lastSeenAt = new Date();

    this.socketIndex.set(socketId, {
      pin: room.pin,
      role: 'player',
      participantId: matched.id,
    });

    this.emitLobbyUpdated(room);

    return {
      participantId: matched.id,
      snapshot: this.buildPlayerSnapshot(room, matched),
    };
  }

  handleDisconnect(socketId: string): void {
    const binding = this.socketIndex.get(socketId);
    if (!binding) return;
    this.socketIndex.delete(socketId);

    const room = this.roomsByPin.get(binding.pin);
    if (!room) return;

    if (binding.role === 'host') {
      if (room.hostSocketId === socketId) {
        room.hostSocketId = null;
      }
      return;
    }

    if (binding.role === 'presenter') {
      room.presenterSocketIds.delete(socketId);
      return;
    }

    if (binding.participantId) {
      const participant = room.participants.get(binding.participantId);
      if (participant && participant.socketId === socketId) {
        participant.socketId = null;
        participant.lastSeenAt = new Date();
        this.emitLobbyUpdated(room);
      }
    }
  }

  kickPlayer(
    pin: string,
    hostToken: string,
    participantId: string,
    hostTeacherId: string,
  ): { kickedSocketId: string | null } {
    const room = this.getRoomOrThrow(pin);
    this.assertHostAuthorized(room, hostToken, hostTeacherId);

    if (room.phase !== 'LOBBY') {
      throw new GameDomainError(
        'INVALID_PHASE',
        'Yarışma başladıktan sonra oyuncu çıkarılamaz.',
      );
    }

    const participant = room.participants.get(participantId);
    if (!participant || participant.kicked) {
      throw new GameDomainError('PLAYER_NOT_FOUND', 'Oyuncu odada bulunamadı.');
    }

    const kickedSocketId = participant.socketId;
    participant.kicked = true;
    participant.socketId = null;
    participant.reconnectTokenHash = '';

    if (kickedSocketId) {
      this.socketIndex.delete(kickedSocketId);
      if (this.io) {
        const sock = this.io.sockets.sockets.get(kickedSocketId);
        if (sock) {
          sock.emit('player:kicked', {
            message: 'Öğretmen tarafından bekleme odasından çıkarıldınız.',
          });
          void sock.leave(this.roomChannel(room.pin));
        }
      }
    }

    this.emitLobbyUpdated(room);

    return { kickedSocketId };
  }

  async cancelGame(
    pin: string,
    hostToken: string,
    hostTeacherId: string,
  ): Promise<void> {
    const room = this.getRoomOrThrow(pin);
    this.assertHostAuthorized(room, hostToken, hostTeacherId);

    if (room.phase !== 'LOBBY') {
      throw new GameDomainError(
        'INVALID_PHASE',
        'Yalnızca henüz başlamamış bekleme odası iptal edilebilir.',
      );
    }

    this.clearRoomTimers(room);
    room.phase = 'CANCELLED';
    room.endedAt = new Date();

    await prisma.gameSession.update({
      where: { id: room.sessionId },
      data: {
        status: 'CANCELLED',
        endedAt: room.endedAt,
      },
    });

    if (this.io) {
      this.io.to(this.roomChannel(room.pin)).emit('game:cancelled', {
        message: 'Yarışma öğretmen tarafından iptal edildi.',
      });
    }

    this.scheduleRoomCleanup(room);
  }

  async startGame(
    pin: string,
    hostToken: string,
    hostTeacherId: string,
  ): Promise<void> {
    const room = this.getRoomOrThrow(pin);
    this.assertHostAuthorized(room, hostToken, hostTeacherId);

    if (room.phase !== 'LOBBY') {
      throw new GameDomainError(
        'INVALID_PHASE',
        'Bu yarışma zaten başlatılmış veya tamamlanmış.',
      );
    }

    const active = this.getActiveParticipants(room);
    if (active.length === 0) {
      throw new GameDomainError(
        'NO_PLAYERS',
        'Yarışmayı başlatmak için en az bir öğrenci katılmış olmalıdır.',
      );
    }

    const nowMs = Date.now();
    const countdownEndsAtMs = nowMs + this.countdownMs;

    room.phase = 'COUNTDOWN';
    room.startedAt = new Date(nowMs);
    room.countdownEndsAtMs = countdownEndsAtMs;

    await prisma.gameSession.update({
      where: { id: room.sessionId },
      data: {
        status: 'IN_PROGRESS',
        startedAt: room.startedAt,
      },
    });

    if (this.io) {
      this.io.to(this.roomChannel(room.pin)).emit('game:countdown', {
        serverNowMs: nowMs,
        countdownEndsAtMs,
        totalQuestions: room.snapshot.questions.length,
      });
    }

    room.countdownTimer = setTimeout(() => {
      room.countdownTimer = null;
      this.startQuestion(room, 0);
    }, this.countdownMs);
  }

  private startQuestion(room: ActiveRoom, index: number): void {
    if (room.phase === 'CANCELLED' || room.phase === 'FINISHED') return;

    const question = room.snapshot.questions[index];
    if (!question) {
      void this.finishGame(room);
      return;
    }

    this.clearQuestionTimers(room);

    for (const participant of this.getActiveParticipants(room)) {
      participant.lastDelta = 0;
    }

    const startedAtMs = Date.now();
    const endsAtMs = startedAtMs + question.timeLimitSec * 1000;

    room.phase = 'QUESTION';
    room.questionIndex = index;
    room.countdownEndsAtMs = null;
    room.questionStartedAtMs = startedAtMs;
    room.questionEndsAtMs = endsAtMs;
    room.isPaused = false;
    room.pausedRemainingMs = null;
    room.presenterResultFocus = 'DISTRIBUTION';
    room.lastQuestionResult = null;
    if (!room.answersByQuestion.has(index)) {
      room.answersByQuestion.set(index, new Map());
    }
    if (question.type === 'ORDERING' && !room.shuffledOptionsByQuestion.has(index)) {
      const sortedByExpected = [...question.options].sort((a, b) => a.order - b.order);
      const shuffled = shuffleOrderingIds(sortedByExpected).map((opt, idx) => ({
        id: opt.id,
        order: idx + 1,
        text: opt.text,
      }));
      room.shuffledOptionsByQuestion.set(index, shuffled);
    }

    const publicQuestion = this.toPublicQuestion(room);
    const connectedCount = this.getActiveParticipants(room).filter(
      (p) => p.socketId !== null,
    ).length;

    if (this.io && publicQuestion) {
      this.io.to(this.roomChannel(room.pin)).emit('game:question_started', {
        question: publicQuestion,
        serverNowMs: startedAtMs,
        questionStartedAtMs: startedAtMs,
        questionEndsAtMs: endsAtMs,
        connectedCount,
      });
    }

    room.questionTimer = setTimeout(() => {
      room.questionTimer = null;
      this.endCurrentQuestion(room);
    }, question.timeLimitSec * 1000 + this.questionGraceMs);
  }

  submitAnswer(
    pin: string,
    participantId: string,
    questionIndex: number,
    submission: string | SubmittedAnswerPayload,
  ): {
    accepted: true;
    questionIndex: number;
    selectedOptionId: string;
    selectedOptionIds?: string[];
    orderedOptionIds?: string[];
  } {
    const room = this.getRoomOrThrow(pin);

    if (room.phase !== 'QUESTION') {
      throw new GameDomainError(
        'QUESTION_CLOSED',
        'Bu soru için cevap süresi sona ermiş veya soru aktif değil.',
      );
    }

    if (room.isPaused) {
      throw new GameDomainError(
        'QUESTION_PAUSED',
        'Soru öğretmen tarafından duraklatıldı. Süre devam ettiğinde cevap gönderebilirsiniz.',
      );
    }

    if (questionIndex !== room.questionIndex) {
      throw new GameDomainError(
        'STALE_QUESTION',
        'Gönderilen cevap aktif soruyla eşleşmiyor.',
      );
    }

    const participant = room.participants.get(participantId);
    if (!participant || participant.kicked) {
      throw new GameDomainError(
        'UNAUTHORIZED_PLAYER',
        'Oyuncu oturumu doğrulanamadı.',
      );
    }

    const nowMs = Date.now();
    const startedAtMs = room.questionStartedAtMs ?? nowMs;
    const endsAtMs = room.questionEndsAtMs ?? nowMs;

    if (nowMs > endsAtMs) {
      throw new GameDomainError(
        'TIME_EXPIRED',
        'Süre dolduğu için cevabınız kabul edilmedi.',
      );
    }

    const question = room.snapshot.questions[room.questionIndex];
    if (!question) {
      throw new GameDomainError('QUESTION_NOT_FOUND', 'Aktif soru bulunamadı.');
    }

    let questionAnswers = room.answersByQuestion.get(room.questionIndex);
    if (!questionAnswers) {
      questionAnswers = new Map();
      room.answersByQuestion.set(room.questionIndex, questionAnswers);
    }

    if (questionAnswers.has(participantId)) {
      throw new GameDomainError(
        'ALREADY_ANSWERED',
        'Bu soru için zaten cevap gönderdiniz.',
      );
    }

    const payload: SubmittedAnswerPayload =
      typeof submission === 'string' ? { optionId: submission } : submission;

    const evaluated = validateAndEvaluateAnswer(question, payload);
    if (!evaluated.ok) {
      throw new GameDomainError(evaluated.code, evaluated.message);
    }

    const totalDurationMs = question.timeLimitSec * 1000;
    const elapsedMs = Math.max(0, Math.min(totalDurationMs, nowMs - startedAtMs));
    const remainingMs = Math.max(0, endsAtMs - nowMs);
    const pointsAwarded = calculateAnswerPoints({
      basePoints: question.points,
      isCorrect: evaluated.isCorrect,
      scoreRatio: evaluated.scoreRatio,
      remainingMs,
      totalDurationMs,
    });

    const answer: ActiveAnswer = {
      participantId,
      questionIndex: room.questionIndex,
      selectedOptionId: evaluated.primaryOptionId,
      selectedOptionIds: evaluated.selectedOptionIds,
      orderedOptionIds: evaluated.orderedOptionIds,
      isCorrect: evaluated.isCorrect,
      isPartial: evaluated.isPartial,
      scoreRatio: evaluated.scoreRatio,
      responseTimeMs: elapsedMs,
      pointsAwarded,
      answeredAt: new Date(nowMs),
    };

    questionAnswers.set(participantId, answer);

    participant.score += pointsAwarded;
    participant.lastDelta = pointsAwarded;
    if (evaluated.isCorrect) {
      participant.correctCount += 1;
      participant.totalResponseMs += elapsedMs;
    } else {
      participant.wrongCount += 1;
    }

    const activeConnected = this.getActiveParticipants(room).filter(
      (p) => p.socketId !== null,
    );
    const connectedCount = activeConnected.length;

    this.emitAnswerProgress(room, room.questionIndex);

    const allConnectedAnswered =
      connectedCount > 0 &&
      activeConnected.every((p) => questionAnswers.has(p.id));

    if (allConnectedAnswered && !room.earlyCloseTimer) {
      room.earlyCloseTimer = setTimeout(() => {
        room.earlyCloseTimer = null;
        if (room.phase === 'QUESTION' && room.questionIndex === questionIndex) {
          this.endCurrentQuestion(room);
        }
      }, 250);
    }

    return {
      accepted: true,
      questionIndex: room.questionIndex,
      selectedOptionId: evaluated.primaryOptionId,
      selectedOptionIds: evaluated.selectedOptionIds,
      orderedOptionIds: evaluated.orderedOptionIds,
    };
  }

  hostPauseQuestion(
    pin: string,
    hostToken: string,
    hostTeacherId: string,
  ): {
    questionIndex: number;
    pausedRemainingMs: number;
    serverNowMs: number;
  } {
    const room = this.getRoomOrThrow(pin);
    this.assertHostAuthorized(room, hostToken, hostTeacherId);

    if (room.phase !== 'QUESTION') {
      throw new GameDomainError(
        'INVALID_PHASE',
        'Yalnızca aktif bir soru devam ederken duraklatılabilir.',
      );
    }

    if (room.isPaused) {
      throw new GameDomainError(
        'ALREADY_PAUSED',
        'Bu soru zaten duraklatılmış durumda.',
      );
    }

    const nowMs = Date.now();
    const endsAtMs = room.questionEndsAtMs ?? nowMs;
    const remainingMs = Math.max(500, endsAtMs - nowMs);

    this.clearQuestionTimers(room);
    room.isPaused = true;
    room.pausedRemainingMs = remainingMs;
    room.questionEndsAtMs = null;

    const payload = {
      questionIndex: room.questionIndex,
      pausedRemainingMs: remainingMs,
      serverNowMs: nowMs,
    };

    if (this.io) {
      this.io.to(this.roomChannel(room.pin)).emit('game:question_paused', payload);
    }

    return payload;
  }

  hostResumeQuestion(
    pin: string,
    hostToken: string,
    hostTeacherId: string,
  ): {
    questionIndex: number;
    questionEndsAtMs: number;
    serverNowMs: number;
  } {
    const room = this.getRoomOrThrow(pin);
    this.assertHostAuthorized(room, hostToken, hostTeacherId);

    if (room.phase !== 'QUESTION') {
      throw new GameDomainError(
        'INVALID_PHASE',
        'Yalnızca aktif bir soru devam ettirilebilir.',
      );
    }

    if (!room.isPaused) {
      throw new GameDomainError(
        'NOT_PAUSED',
        'Soru şu anda duraklatılmış durumda değil.',
      );
    }

    const question = room.snapshot.questions[room.questionIndex];
    const totalDurationMs = (question?.timeLimitSec ?? 20) * 1000;
    const nowMs = Date.now();
    const remainingMs = Math.max(
      500,
      room.pausedRemainingMs ?? totalDurationMs,
    );
    const alreadyElapsedMs = Math.max(0, totalDurationMs - remainingMs);
    const nextEndsAtMs = nowMs + remainingMs;

    room.isPaused = false;
    room.pausedRemainingMs = null;
    room.questionStartedAtMs = nowMs - alreadyElapsedMs;
    room.questionEndsAtMs = nextEndsAtMs;

    room.questionTimer = setTimeout(() => {
      room.questionTimer = null;
      this.endCurrentQuestion(room);
    }, remainingMs + this.questionGraceMs);

    const payload = {
      questionIndex: room.questionIndex,
      questionEndsAtMs: nextEndsAtMs,
      serverNowMs: nowMs,
    };

    if (this.io) {
      this.io
        .to(this.roomChannel(room.pin))
        .emit('game:question_resumed', payload);
    }

    return payload;
  }

  hostEndQuestion(
    pin: string,
    hostToken: string,
    hostTeacherId: string,
  ): void {
    const room = this.getRoomOrThrow(pin);
    this.assertHostAuthorized(room, hostToken, hostTeacherId);

    if (room.phase !== 'QUESTION') {
      throw new GameDomainError(
        'INVALID_PHASE',
        'Şu anda sonlandırılacak aktif bir soru bulunmuyor.',
      );
    }

    this.endCurrentQuestion(room);
  }

  private toLeaderboardEntries(
    ranked: readonly RankedParticipant[],
    elapsedQuestions: number,
  ): LeaderboardEntry[] {
    return ranked.map((entry) => ({
      ...entry,
      unansweredCount: Math.max(
        0,
        elapsedQuestions - entry.correctCount - entry.wrongCount,
      ),
    }));
  }

  private endCurrentQuestion(room: ActiveRoom): void {
    if (room.phase !== 'QUESTION') return;

    this.clearQuestionTimers(room);
    room.isPaused = false;
    room.pausedRemainingMs = null;
    room.questionEndsAtMs = null;
    room.phase = 'QUESTION_RESULT';

    const question = room.snapshot.questions[room.questionIndex];
    if (!question) return;

    const answers = room.answersByQuestion.get(room.questionIndex) ?? new Map();
    const totalResponders = answers.size;
    let exactCorrectCount = 0;
    let partialCorrectCount = 0;

    for (const ans of answers.values()) {
      if (ans.isCorrect) exactCorrectCount += 1;
      else if (ans.isPartial) partialCorrectCount += 1;
    }

    let optionStats: OptionStat[];
    let correctOptionIds: string[];

    if (question.type === 'ORDERING') {
      const sortedExpected = [...question.options].sort((a, b) => a.order - b.order);
      correctOptionIds = sortedExpected.map((opt) => opt.id);
      optionStats = sortedExpected.map((expectedOpt, slotIdx) => {
        let exactSlotHits = 0;
        for (const ans of answers.values()) {
          if (ans.orderedOptionIds?.[slotIdx] === expectedOpt.id) {
            exactSlotHits += 1;
          }
        }
        return {
          optionId: expectedOpt.id,
          order: slotIdx + 1,
          text: expectedOpt.text,
          count: exactSlotHits,
          isCorrect: true,
        };
      });
    } else {
      correctOptionIds = question.options
        .filter((opt) => opt.isCorrect)
        .map((opt) => opt.id);

      const optionCounts = new Map<string, number>();
      for (const opt of question.options) {
        optionCounts.set(opt.id, 0);
      }

      for (const ans of answers.values()) {
        if (question.type === 'MULTI_SELECT' && Array.isArray(ans.selectedOptionIds)) {
          for (const optId of ans.selectedOptionIds) {
            optionCounts.set(optId, (optionCounts.get(optId) ?? 0) + 1);
          }
        } else {
          optionCounts.set(
            ans.selectedOptionId,
            (optionCounts.get(ans.selectedOptionId) ?? 0) + 1,
          );
        }
      }

      optionStats = question.options.map((opt) => ({
        optionId: opt.id,
        order: opt.order,
        text: opt.text,
        count: optionCounts.get(opt.id) ?? 0,
        isCorrect: opt.isCorrect,
      }));
    }

    const ranked = rankParticipants(
      this.getActiveParticipants(room).map((p) => ({
        id: p.id,
        nickname: p.nickname,
        score: p.score,
        correctCount: p.correctCount,
        wrongCount: p.wrongCount,
        totalResponseMs: p.totalResponseMs,
        joinedAtMs: p.joinedAt.getTime(),
        lastDelta: p.lastDelta,
      })),
    );
    const leaderboard = this.toLeaderboardEntries(ranked, room.questionIndex + 1);

    const basePayload: QuestionResultPayload = {
      questionIndex: room.questionIndex,
      totalQuestions: room.snapshot.questions.length,
      questionType: question.type,
      correctOptionId: correctOptionIds[0] ?? '',
      correctOptionIds,
      explanation: question.explanation?.trim() ? question.explanation.trim() : undefined,
      totalResponders,
      exactCorrectCount,
      partialCorrectCount,
      optionStats,
      leaderboard,
      isLastQuestion: room.questionIndex >= room.snapshot.questions.length - 1,
    };

    room.lastQuestionResult = basePayload;

    if (this.io) {
      if (room.hostSocketId) {
        const hostSocket = this.io.sockets.sockets.get(room.hostSocketId);
        hostSocket?.emit('game:question_result', basePayload);
      }

      for (const presenterSocketId of room.presenterSocketIds) {
        const presenterSocket = this.io.sockets.sockets.get(presenterSocketId);
        presenterSocket?.emit('game:question_result', {
          ...basePayload,
          leaderboard: basePayload.leaderboard.slice(0, 10),
        });
      }

      const leaderboardByParticipant = new Map(
        leaderboard.map((entry) => [entry.participantId, entry]),
      );

      for (const participant of this.getActiveParticipants(room)) {
        if (!participant.socketId) continue;
        const playerSocket = this.io.sockets.sockets.get(participant.socketId);
        if (!playerSocket) continue;

        const myAnswer = answers.get(participant.id);
        const rankEntry = leaderboardByParticipant.get(participant.id);

        const personalResult: PersonalQuestionResult = {
          answered: Boolean(myAnswer),
          selectedOptionId: myAnswer?.selectedOptionId ?? null,
          selectedOptionIds: myAnswer?.selectedOptionIds,
          orderedOptionIds: myAnswer?.orderedOptionIds,
          isCorrect: myAnswer?.isCorrect ?? false,
          isPartial: myAnswer?.isPartial ?? false,
          pointsAwarded: myAnswer?.pointsAwarded ?? 0,
          totalScore: participant.score,
          rank: rankEntry?.rank ?? 0,
        };

        playerSocket.emit('game:question_result', {
          ...basePayload,
          leaderboard: basePayload.leaderboard.slice(0, 10),
          personalResult,
        });
      }
    }
  }

  async nextQuestion(
    pin: string,
    hostToken: string,
    hostTeacherId: string,
  ): Promise<void> {
    const room = this.getRoomOrThrow(pin);
    this.assertHostAuthorized(room, hostToken, hostTeacherId);

    if (room.phase !== 'QUESTION_RESULT') {
      throw new GameDomainError(
        'INVALID_PHASE',
        'Sonraki soruya geçmek için mevcut sorunun sonuçlanması gerekir.',
      );
    }

    const nextIdx = room.questionIndex + 1;
    if (nextIdx >= room.snapshot.questions.length) {
      await this.finishGame(room);
      return;
    }

    this.startQuestion(room, nextIdx);
  }

  async hostEndGame(
    pin: string,
    hostToken: string,
    hostTeacherId: string,
  ): Promise<void> {
    const room = this.getRoomOrThrow(pin);
    this.assertHostAuthorized(room, hostToken, hostTeacherId);

    if (room.phase === 'LOBBY') {
      await this.cancelGame(pin, hostToken, hostTeacherId);
      return;
    }

    if (room.phase === 'FINISHED' || room.phase === 'CANCELLED') {
      throw new GameDomainError(
        'INVALID_PHASE',
        'Bu yarışma zaten tamamlanmış veya iptal edilmiş.',
      );
    }

    await this.finishGame(room);
  }

  private async finishGame(room: ActiveRoom): Promise<void> {
    if (room.phase === 'FINISHED') return;

    this.clearRoomTimers(room);
    room.phase = 'FINISHED';
    room.endedAt = new Date();

    const ranked = rankParticipants(
      this.getActiveParticipants(room).map((p) => ({
        id: p.id,
        nickname: p.nickname,
        score: p.score,
        correctCount: p.correctCount,
        wrongCount: p.wrongCount,
        totalResponseMs: p.totalResponseMs,
        joinedAtMs: p.joinedAt.getTime(),
        lastDelta: p.lastDelta,
      })),
    );
    const leaderboard = this.toLeaderboardEntries(
      ranked,
      room.snapshot.questions.length,
    );

    const finalPayload: FinishedPayload = {
      sessionId: room.sessionId,
      pin: room.pin,
      quizTitle: room.quizTitle,
      totalQuestions: room.snapshot.questions.length,
      podium: leaderboard.slice(0, 3),
      leaderboard,
    };

    room.finalResult = finalPayload;

    await this.persistFinishedRoom(room, ranked);

    if (this.io) {
      if (room.hostSocketId) {
        const hostSocket = this.io.sockets.sockets.get(room.hostSocketId);
        hostSocket?.emit('game:finished', finalPayload);
      }

      for (const presenterSocketId of room.presenterSocketIds) {
        const presenterSocket = this.io.sockets.sockets.get(presenterSocketId);
        presenterSocket?.emit('game:finished', {
          ...finalPayload,
          leaderboard: finalPayload.leaderboard.slice(0, 10),
        });
      }

      const leaderboardByParticipant = new Map(
        leaderboard.map((entry) => [entry.participantId, entry]),
      );

      for (const participant of this.getActiveParticipants(room)) {
        if (!participant.socketId) continue;
        const playerSocket = this.io.sockets.sockets.get(participant.socketId);
        if (!playerSocket) continue;

        const rankEntry = leaderboardByParticipant.get(participant.id);

        playerSocket.emit('game:finished', {
          ...finalPayload,
          leaderboard: finalPayload.leaderboard.slice(0, 20),
          personalResult: rankEntry
            ? {
                rank: rankEntry.rank,
                totalScore: rankEntry.score,
                correctCount: rankEntry.correctCount,
                wrongCount: rankEntry.wrongCount ?? participant.wrongCount,
                unansweredCount:
                  rankEntry.unansweredCount ??
                  Math.max(
                    0,
                    room.snapshot.questions.length -
                      rankEntry.correctCount -
                      (rankEntry.wrongCount ?? participant.wrongCount),
                  ),
                totalQuestions: room.snapshot.questions.length,
                avgResponseMs: rankEntry.avgResponseMs,
              }
            : undefined,
        });
      }
    }

    this.scheduleRoomCleanup(room);
  }

  private async persistFinishedRoom(
    room: ActiveRoom,
    leaderboard: RankedParticipant[],
  ): Promise<void> {
    if (room.persistedFinal) return;

    const allParticipants = Array.from(room.participants.values());
    const allAnswers: ActiveAnswer[] = [];
    for (const questionAnswers of room.answersByQuestion.values()) {
      for (const ans of questionAnswers.values()) {
        allAnswers.push(ans);
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.gameSession.update({
        where: { id: room.sessionId },
        data: {
          status: 'FINISHED',
          startedAt: room.startedAt,
          endedAt: room.endedAt,
        },
      });

      if (allParticipants.length > 0) {
        await tx.gameParticipant.createMany({
          data: allParticipants.map((p) => ({
            id: p.id,
            sessionId: room.sessionId,
            nickname: p.nickname,
            normalizedName: p.normalizedName,
            reconnectTokenHash: p.reconnectTokenHash || 'kicked',
            score: p.score,
            correctCount: p.correctCount,
            totalResponseMs: p.totalResponseMs,
            kicked: p.kicked,
            joinedAt: p.joinedAt,
            lastSeenAt: p.lastSeenAt,
          })),
          skipDuplicates: true,
        });
      }

      if (allAnswers.length > 0) {
        await tx.gameAnswer.createMany({
          data: allAnswers.map((ans) => ({
            sessionId: room.sessionId,
            participantId: ans.participantId,
            questionIndex: ans.questionIndex,
            selectedOptionId: ans.selectedOptionId,
            answerPayload: (ans.selectedOptionIds
              ? { optionIds: ans.selectedOptionIds }
              : ans.orderedOptionIds
                ? { orderedOptionIds: ans.orderedOptionIds }
                : { optionId: ans.selectedOptionId }) as Prisma.InputJsonValue,
            isCorrect: ans.isCorrect,
            isPartial: ans.isPartial,
            responseTimeMs: ans.responseTimeMs,
            pointsAwarded: ans.pointsAwarded,
            answeredAt: ans.answeredAt,
          })),
          skipDuplicates: true,
        });
      }

      if (leaderboard.length > 0) {
        await tx.gameResult.createMany({
          data: leaderboard.map((entry) => ({
            sessionId: room.sessionId,
            participantId: entry.participantId,
            nickname: entry.nickname,
            rank: entry.rank,
            totalScore: entry.score,
            correctCount: entry.correctCount,
            totalQuestions: room.snapshot.questions.length,
            avgResponseMs: entry.avgResponseMs,
          })),
          skipDuplicates: true,
        });
      }
    });

    room.persistedFinal = true;
  }

  private clearQuestionTimers(room: ActiveRoom): void {
    if (room.questionTimer) {
      clearTimeout(room.questionTimer);
      room.questionTimer = null;
    }
    if (room.earlyCloseTimer) {
      clearTimeout(room.earlyCloseTimer);
      room.earlyCloseTimer = null;
    }
    if (room.progressThrottleTimer) {
      clearTimeout(room.progressThrottleTimer);
      room.progressThrottleTimer = null;
    }
  }

  private clearRoomTimers(room: ActiveRoom): void {
    if (room.countdownTimer) {
      clearTimeout(room.countdownTimer);
      room.countdownTimer = null;
    }
    if (room.lobbyThrottleTimer) {
      clearTimeout(room.lobbyThrottleTimer);
      room.lobbyThrottleTimer = null;
    }
    this.clearQuestionTimers(room);
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
    }
  }

  async shutdownActiveRooms(reason = 'Sunucu bakım veya yeniden başlatma nedeniyle kapatılıyor.'): Promise<void> {
    const activeIds: string[] = [];

    for (const room of this.roomsByPin.values()) {
      this.clearRoomTimers(room);
      if (room.phase !== 'FINISHED' && room.phase !== 'CANCELLED') {
        activeIds.push(room.sessionId);
        if (this.io) {
          this.io.to(this.roomChannel(room.pin)).emit('game:cancelled', {
            message: reason,
          });
        }
      }
    }

    if (activeIds.length > 0) {
      await prisma.gameSession
        .updateMany({
          where: {
            id: { in: activeIds },
            status: { in: ['LOBBY', 'IN_PROGRESS'] },
          },
          data: {
            status: 'INTERRUPTED',
            endedAt: new Date(),
          },
        })
        .catch(() => undefined);
    }

    this.roomsByPin.clear();
    this.socketIndex.clear();
  }

  private scheduleRoomCleanup(room: ActiveRoom): void {
    if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
    room.cleanupTimer = setTimeout(() => {
      this.clearRoomTimers(room);
      this.roomsByPin.delete(room.pin);
      for (const [sockId, binding] of this.socketIndex.entries()) {
        if (binding.pin === room.pin) {
          this.socketIndex.delete(sockId);
        }
      }
    }, this.roomRetentionMs);
    room.cleanupTimer.unref?.();
  }

  dispose(): void {
    for (const room of this.roomsByPin.values()) {
      this.clearRoomTimers(room);
    }
    this.roomsByPin.clear();
    this.socketIndex.clear();
  }
}
