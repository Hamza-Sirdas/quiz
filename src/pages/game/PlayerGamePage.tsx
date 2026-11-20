import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { QUESTION_TYPE_LABELS } from '@shared/quizTypes';
import type { PlayerSessionSnapshot, PublicOption } from '@shared/gameTypes';
import { QuizoraLogo } from '@/components/brand/QuizoraLogo';
import { AnimatedScoreCounter } from '@/components/game/AnimatedScoreCounter';
import { CelebrationConfetti } from '@/components/game/CelebrationConfetti';
import { LeaderboardTable } from '@/components/game/LeaderboardTable';
import { PodiumView } from '@/components/game/PodiumView';
import { SoundToggleButton } from '@/components/game/SoundToggleButton';
import {
  SyncedBigCountdown,
  SyncedCountdownBadge,
  SyncedProgressBar,
} from '@/components/game/SyncedTimerDisplay';
import { AlertCircleIcon, CheckIcon, ClockIcon, CloseIcon } from '@/components/ui/Icons';
import { SafeImage } from '@/components/ui/SafeImage';
import { SortableList } from '@/components/ui/SortableList';
import { resolveMediaUrl } from '@/config/runtime';
import { useGameSound } from '@/hooks/useGameSound';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import {
  createGameSocket,
  measureClockOffset,
  type GameSocket,
} from '@/services/gameSocket';
import { cn } from '@/utils/cn';
import {
  clearPlayerToken,
  formatPinDisplay,
  readPlayerToken,
} from '@/utils/gameStorage';

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
const SUBMIT_ACK_TIMEOUT_MS = 6000;

export function PlayerGamePage() {
  const { pin = '' } = useParams<{ pin: string }>();
  const navigate = useNavigate();
  const reducedMotion = usePrefersReducedMotion();
  const { playSound } = useGameSound();
  const playSoundRef = useRef(playSound);
  playSoundRef.current = playSound;

  const [snapshot, setSnapshot] = useState<PlayerSessionSnapshot | null>(null);
  const [previousScore, setPreviousScore] = useState(0);
  const [previousRanks, setPreviousRanks] = useState<Record<string, number>>({});
  const [confettiActive, setConfettiActive] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const [fatalMessage, setFatalMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [connectionLost, setConnectionLost] = useState(false);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [socketRef, setSocketRef] = useState<GameSocket | null>(null);
  const [submittingOptionId, setSubmittingOptionId] = useState<string | null>(null);
  const [selectedMultiIds, setSelectedMultiIds] = useState<string[]>([]);
  const [orderingItems, setOrderingItems] = useState<PublicOption[]>([]);
  const submittingLockRef = useRef(false);
  const submitSeqRef = useRef(0);
  const submitTimeoutRef = useRef<number | null>(null);
  const lastVisibilitySyncRef = useRef(0);
  const scoreSoundTimerRef = useRef<number | null>(null);

  const clearPendingSubmission = useCallback((invalidateSeq = false) => {
    if (invalidateSeq) {
      submitSeqRef.current += 1;
    }
    if (submitTimeoutRef.current !== null) {
      window.clearTimeout(submitTimeoutRef.current);
      submitTimeoutRef.current = null;
    }
    submittingLockRef.current = false;
    setSubmittingOptionId(null);
  }, []);

  useEffect(() => {
    setPreviousScore(0);
    setPreviousRanks({});
    setConfettiActive(false);
    setSelectedMultiIds([]);
    setOrderingItems([]);
    clearPendingSubmission(true);

    if (!/^\d{6}$/.test(pin)) {
      navigate('/join', { replace: true });
      return;
    }

    const reconnectToken = readPlayerToken(pin);
    if (!reconnectToken) {
      navigate(`/join?pin=${pin}`, { replace: true });
      return;
    }

    const socket = createGameSocket();
    setSocketRef(socket);

    const syncSession = () => {
      void measureClockOffset(socket).then((offset) => {
        setClockOffsetMs(offset);
      });

      socket.emit('player:reconnect', { pin, reconnectToken }, (res) => {
        clearPendingSubmission(true);
        if (!res.ok) {
          if (
            res.code === 'INVALID_RECONNECT_TOKEN' ||
            res.code === 'PLAYER_KICKED' ||
            res.code === 'GAME_CANCELLED' ||
            res.code === 'ROOM_NOT_FOUND'
          ) {
            clearPlayerToken(pin);
          }
          setFatalMessage(res.message);
          return;
        }
        setFatalMessage(null);
        setConnectionLost(false);
        setPreviousScore(res.snapshot.score);
        setSnapshot(res.snapshot);

        const q = res.snapshot.currentQuestion;
        if (q?.type === 'MULTI_SELECT') {
          setSelectedMultiIds(res.snapshot.selectedOptionIds ?? []);
        } else {
          setSelectedMultiIds([]);
        }
        if (q?.type === 'ORDERING') {
          if (res.snapshot.orderedOptionIds?.length) {
            const byId = new Map(q.options.map((opt) => [opt.id, opt]));
            const restored = res.snapshot.orderedOptionIds
              .map((id) => byId.get(id))
              .filter((item): item is PublicOption => Boolean(item));
            setOrderingItems(restored.length === q.options.length ? restored : [...q.options]);
          } else {
            setOrderingItems([...q.options]);
          }
        } else {
          setOrderingItems([]);
        }
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || !socket.connected) return;
      const now = Date.now();
      if (now - lastVisibilitySyncRef.current < 800) return;
      lastVisibilitySyncRef.current = now;
      syncSession();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    socket.on('connect', syncSession);

    socket.on('disconnect', () => {
      clearPendingSubmission(true);
      setConnectionLost(true);
    });

    socket.on('game:countdown', ({ countdownEndsAtMs, totalQuestions }) => {
      playSoundRef.current('gameStart');
      setConfettiActive(false);
      setPreviousRanks({});
      setLiveAnnouncement('Yarışma başlamak üzere.');
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              phase: 'COUNTDOWN',
              countdownEndsAtMs,
              totalQuestions,
              questionEndsAtMs: null,
            }
          : prev,
      );
    });

    socket.on('game:question_started', ({ question, questionEndsAtMs }) => {
      setActionError(null);
      clearPendingSubmission(true);
      setSelectedMultiIds([]);
      setOrderingItems(question.type === 'ORDERING' ? [...question.options] : []);
      setLiveAnnouncement(
        `Soru ${question.index + 1} / ${question.totalQuestions}: ${question.text}`,
      );
      setSnapshot((prev) => {
        if (!prev) return prev;
        setPreviousScore(prev.score);
        if (prev.lastQuestionResult) {
          const rankMap: Record<string, number> = {};
          for (const entry of prev.lastQuestionResult.leaderboard) {
            rankMap[entry.participantId] = entry.rank;
          }
          setPreviousRanks(rankMap);
        } else if (question.index === 0) {
          setPreviousRanks({});
        }
        return {
          ...prev,
          phase: 'QUESTION',
          questionIndex: question.index,
          currentQuestion: question,
          questionEndsAtMs,
          isPaused: false,
          pausedRemainingMs: null,
          countdownEndsAtMs: null,
          hasAnsweredCurrent: false,
          selectedOptionId: null,
          selectedOptionIds: undefined,
          orderedOptionIds: undefined,
          lastQuestionResult: null,
        };
      });
    });

    socket.on('game:question_paused', ({ questionIndex, pausedRemainingMs }) => {
      setLiveAnnouncement('Soru öğretmen tarafından duraklatıldı.');
      setSnapshot((prev) =>
        prev && prev.questionIndex === questionIndex
          ? {
              ...prev,
              isPaused: true,
              pausedRemainingMs,
              questionEndsAtMs: null,
            }
          : prev,
      );
    });

    socket.on('game:question_resumed', ({ questionIndex, questionEndsAtMs }) => {
      setActionError(null);
      setLiveAnnouncement('Soru devam ediyor.');
      setSnapshot((prev) =>
        prev && prev.questionIndex === questionIndex
          ? {
              ...prev,
              isPaused: false,
              pausedRemainingMs: null,
              questionEndsAtMs,
            }
          : prev,
      );
    });

    socket.on('game:question_result', (result) => {
      clearPendingSubmission(true);

      if (scoreSoundTimerRef.current !== null) {
        window.clearTimeout(scoreSoundTimerRef.current);
        scoreSoundTimerRef.current = null;
      }

      if (result.personalResult) {
        if (!result.personalResult.answered) {
          playSoundRef.current('questionEnd');
          setLiveAnnouncement('Süre doldu. Bu sorudan 0 puan aldınız.');
        } else if (result.personalResult.isCorrect) {
          playSoundRef.current('correct');
          if (result.personalResult.pointsAwarded > 0) {
            scoreSoundTimerRef.current = window.setTimeout(() => {
              scoreSoundTimerRef.current = null;
              playSoundRef.current('scoreGain');
            }, 180);
          }
          setLiveAnnouncement(
            `Doğru cevap! ${result.personalResult.pointsAwarded} puan kazandınız. Toplam puan: ${result.personalResult.totalScore}.`,
          );
        } else if (result.personalResult.isPartial) {
          playSoundRef.current('correct');
          if (result.personalResult.pointsAwarded > 0) {
            scoreSoundTimerRef.current = window.setTimeout(() => {
              scoreSoundTimerRef.current = null;
              playSoundRef.current('scoreGain');
            }, 180);
          }
          setLiveAnnouncement(
            `Kısmi doğru! ${result.personalResult.pointsAwarded} puan kazandınız. Toplam puan: ${result.personalResult.totalScore}.`,
          );
        } else {
          playSoundRef.current('wrong');
          setLiveAnnouncement('Yanlış cevap. Doğru seçenek ekranda gösteriliyor.');
        }
      } else {
        playSoundRef.current('questionEnd');
      }

      setSnapshot((prev) => {
        if (!prev) return prev;
        setPreviousScore(prev.score);
        return {
          ...prev,
          phase: 'QUESTION_RESULT',
          questionEndsAtMs: null,
          score: result.personalResult?.totalScore ?? prev.score,
          lastQuestionResult: result,
        };
      });
    });

    socket.on('game:finished', (finalResult) => {
      clearPendingSubmission(true);
      setLiveAnnouncement(
        finalResult.personalResult
          ? `Yarışma bitti. ${finalResult.personalResult.rank}. sırada tamamladınız. Toplam puan: ${finalResult.personalResult.totalScore}.`
          : 'Yarışma sona erdi. Final sonuçları açıklandı.',
      );
      setSnapshot((prev) => {
        if (!prev) return prev;
        setPreviousScore(prev.score);
        if (prev.lastQuestionResult) {
          const rankMap: Record<string, number> = {};
          for (const entry of prev.lastQuestionResult.leaderboard) {
            rankMap[entry.participantId] = entry.rank;
          }
          setPreviousRanks(rankMap);
        }
        return {
          ...prev,
          phase: 'FINISHED',
          questionEndsAtMs: null,
          score: finalResult.personalResult?.totalScore ?? prev.score,
          finalResult,
        };
      });
    });

    socket.on('player:kicked', ({ message }) => {
      clearPlayerToken(pin);
      setFatalMessage(message);
    });

    socket.on('game:cancelled', ({ message }) => {
      clearPlayerToken(pin);
      setFatalMessage(message);
    });

    socket.connect();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearPendingSubmission(true);
      if (scoreSoundTimerRef.current !== null) {
        window.clearTimeout(scoreSoundTimerRef.current);
        scoreSoundTimerRef.current = null;
      }
      socket.removeAllListeners();
      socket.disconnect();
      setSocketRef(null);
    };
  }, [pin, navigate, clearPendingSubmission]);

  const isOnline = useNetworkStatus();
  const [questionExpired, setQuestionExpired] = useState(false);

  useEffect(() => {
    setQuestionExpired(false);
    if (
      snapshot?.phase !== 'QUESTION' ||
      snapshot.isPaused ||
      !snapshot.questionEndsAtMs
    ) {
      return;
    }

    const remainingMs = Math.max(
      0,
      snapshot.questionEndsAtMs - (Date.now() + clockOffsetMs),
    );
    const timer = window.setTimeout(() => {
      setQuestionExpired(true);
    }, remainingMs);

    return () => window.clearTimeout(timer);
  }, [
    snapshot?.phase,
    snapshot?.isPaused,
    snapshot?.questionEndsAtMs,
    clockOffsetMs,
  ]);

  const handleCountdownTick = useCallback(() => {
    playSoundRef.current('countdownTick');
  }, []);

  const handleWinnerRevealed = useCallback(() => {
    setConfettiActive(true);
    playSoundRef.current('podiumCelebration');
  }, []);

  const emitAnswerSubmission = (
    payload: {
      optionId?: string;
      optionIds?: string[];
      orderedOptionIds?: string[];
    },
    pendingMarker: string,
  ) => {
    const expiredNow =
      snapshot?.questionEndsAtMs !== null &&
      snapshot?.questionEndsAtMs !== undefined &&
      Date.now() + clockOffsetMs > snapshot.questionEndsAtMs;

    if (
      submittingLockRef.current ||
      !socketRef ||
      !snapshot ||
      snapshot.phase !== 'QUESTION' ||
      snapshot.isPaused ||
      snapshot.hasAnsweredCurrent ||
      submittingOptionId !== null ||
      questionExpired ||
      expiredNow
    ) {
      return;
    }

    if (!navigator.onLine || !socketRef.connected) {
      setActionError(
        'Bağlantı kesildi veya sunucuya ulaşılamıyor. İnternet bağlantınız sağlandığında cevabınızı tekrar gönderebilirsiniz.',
      );
      return;
    }

    submittingLockRef.current = true;
    setActionError(null);
    setSubmittingOptionId(pendingMarker);

    const seq = ++submitSeqRef.current;
    if (submitTimeoutRef.current !== null) {
      window.clearTimeout(submitTimeoutRef.current);
    }
    submitTimeoutRef.current = window.setTimeout(() => {
      if (submitSeqRef.current !== seq) return;
      clearPendingSubmission(true);
      setActionError(
        'Cevabın sunucuya ulaşmadı (bağlantı zaman aşımı). Bağlantını kontrol edip tekrar dene.',
      );
    }, SUBMIT_ACK_TIMEOUT_MS);

    socketRef.emit(
      'player:submit_answer',
      {
        pin,
        questionIndex: snapshot.questionIndex,
        ...payload,
      },
      (res) => {
        if (submitSeqRef.current !== seq) return;
        clearPendingSubmission(false);
        if (!res.ok) {
          setActionError(res.message);
          return;
        }
        playSoundRef.current('answerSelect');
        setLiveAnnouncement('Cevabınız sunucu tarafından onaylandı.');
        setSnapshot((prev) =>
          prev
            ? {
                ...prev,
                hasAnsweredCurrent: true,
                selectedOptionId: res.selectedOptionId,
                selectedOptionIds: res.selectedOptionIds,
                orderedOptionIds: res.orderedOptionIds,
              }
            : prev,
        );
      },
    );
  };

  const handleAnswerSelect = (optionId: string) => {
    emitAnswerSubmission({ optionId }, optionId);
  };

  const handleMultiSelectSubmit = () => {
    if (selectedMultiIds.length === 0) return;
    emitAnswerSubmission({ optionIds: selectedMultiIds }, 'multi-submit');
  };

  const handleOrderingSubmit = () => {
    if (orderingItems.length === 0) return;
    emitAnswerSubmission(
      { orderedOptionIds: orderingItems.map((item) => item.id) },
      'ordering-submit',
    );
  };

  if (fatalMessage) {
    return (
      <div className="min-h-dvh flex flex-col bg-cream-100 text-navy-900">
        <header className="bg-cream-50 border-b border-cream-300 px-4 py-3.5">
          <div className="max-w-lg mx-auto flex items-center justify-between gap-2">
            <Link to="/">
              <QuizoraLogo size="md" />
            </Link>
            <SoundToggleButton />
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4">
          <div
            role="alert"
            className="w-full max-w-md rounded-2xl bg-cream-50 border border-burgundy-500 p-6 sm:p-8 text-center shadow-card"
          >
            <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-burgundy-50 border border-burgundy-500/40 text-burgundy-600">
              <AlertCircleIcon />
            </div>
            <h1 className="mt-4 font-display font-bold text-xl text-navy-900">
              Oturum Sonlandı
            </h1>
            <p className="mt-2 text-sm text-navy-600">{fatalMessage}</p>
            <Link
              to="/join"
              className="mt-6 inline-flex items-center justify-center rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-5 py-2.5 text-sm font-semibold text-cream-50"
            >
              Oyuna Katıl Ekranına Dön
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const phaseKey = !snapshot
    ? 'loading'
    : snapshot.phase === 'QUESTION'
      ? `question-${snapshot.currentQuestion?.index ?? snapshot.questionIndex}`
      : snapshot.phase === 'QUESTION_RESULT'
        ? `result-${snapshot.lastQuestionResult?.questionIndex ?? snapshot.questionIndex}`
        : snapshot.phase;

  const phaseTransitionProps = reducedMotion
    ? {
        initial: { opacity: 1, y: 0 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 1, y: 0 },
        transition: { duration: 0 },
      }
    : {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -8 },
        transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
      };

  const correctAnswerSummary = (() => {
    if (snapshot?.phase !== 'QUESTION_RESULT' || !snapshot.lastQuestionResult) {
      return undefined;
    }
    const res = snapshot.lastQuestionResult;
    if (res.questionType === 'ORDERING') {
      return res.optionStats.map((stat, idx) => `${idx + 1}. ${stat.text}`).join(' → ');
    }
    const texts = res.optionStats
      .filter((stat) => stat.isCorrect)
      .map((stat) => stat.text);
    return texts.length > 0 ? texts.join(', ') : undefined;
  })();

  const currentRank =
    snapshot?.phase === 'FINISHED'
      ? snapshot.finalResult?.personalResult?.rank
      : snapshot?.phase === 'QUESTION_RESULT'
        ? snapshot.lastQuestionResult?.personalResult?.rank
        : undefined;

  return (
    <div className="min-h-dvh flex flex-col bg-cream-100 text-navy-900 overflow-x-clip">
      <CelebrationConfetti active={confettiActive} />

      <div role="status" aria-live="polite" className="sr-only">
        {liveAnnouncement}
      </div>

      <header className="bg-cream-50 border-b border-cream-300 px-3 sm:px-4 py-2.5 sm:py-3">
        <div className="max-w-lg mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <QuizoraLogo size="sm" />
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                !isOnline || connectionLost
                  ? 'bg-burgundy-50 border-burgundy-500/40 text-burgundy-700'
                  : 'bg-cream-100 border-cream-300 text-navy-700',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'h-1.5 w-1.5 rounded-full',
                  !isOnline || connectionLost ? 'bg-burgundy-600' : 'bg-navy-900',
                )}
              />
              <span>
                {!isOnline
                  ? 'Çevrimdışı'
                  : connectionLost
                    ? 'Yeniden bağlanıyor'
                    : 'Bağlı'}
              </span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {snapshot && (
              <>
                <span className="rounded-lg bg-cream-200 border border-cream-300 px-2.5 py-1 text-xs font-semibold text-navy-900 truncate max-w-[110px] sm:max-w-[150px]">
                  {snapshot.nickname}
                </span>
                <span className="rounded-lg bg-powder-100 border border-powder-200 px-2.5 py-1 text-xs font-bold tabular-nums text-burgundy-700">
                  <AnimatedScoreCounter from={previousScore} to={snapshot.score} suffix=" p" />
                </span>
                {typeof currentRank === 'number' && currentRank > 0 && (
                  <span className="rounded-lg bg-navy-900 px-2 py-1 text-xs font-bold tabular-nums text-cream-50">
                    #{currentRank}
                  </span>
                )}
              </>
            )}
            <SoundToggleButton className="min-h-8 px-2.5 py-1" />
          </div>
        </div>
      </header>

      {(!isOnline || connectionLost) && (
        <div
          role="alert"
          aria-live="assertive"
          className="bg-burgundy-600 text-cream-50 px-4 py-2.5 text-center text-xs sm:text-sm font-semibold"
        >
          {!isOnline
            ? 'İnternet bağlantınız kesildi. Bağlantı sağlandığında otomatik devam edilecektir.'
            : 'Bağlantı koptu. Otomatik yeniden bağlanılıyor...'}
        </div>
      )}

      <main className="flex-1 w-full max-w-lg mx-auto px-3 sm:px-4 py-5 sm:py-6 flex flex-col justify-center">
        <AnimatePresence mode="wait">
          {!snapshot ? (
            <motion.div
              key="loading"
              {...phaseTransitionProps}
              className="rounded-2xl bg-cream-50 border border-cream-300 p-8 text-center shadow-card"
            >
              <p className="font-display font-bold text-base text-navy-900">
                Oyun odasına bağlanılıyor...
              </p>
            </motion.div>
          ) : snapshot.phase === 'LOBBY' ? (
            <motion.section
              key={phaseKey}
              {...phaseTransitionProps}
              className="rounded-3xl bg-powder-300 border border-powder-400/70 p-6 sm:p-7 text-center shadow-card"
            >
              <span className="inline-flex items-center rounded-full bg-cream-50/75 border border-navy-900/15 px-3 py-1 text-xs font-semibold tabular-nums text-navy-900">
                Oyun Kodu: {formatPinDisplay(snapshot.pin)}
              </span>
              <h1 className="mt-4 font-display font-extrabold text-2xl text-navy-900">
                Bekleme Odasındasın
              </h1>
              <p className="mt-2 text-sm font-semibold text-burgundy-600">
                {snapshot.quizTitle}
              </p>
              <p className="mt-3 text-sm text-navy-700">
                Merhaba <strong className="font-semibold">{snapshot.nickname}</strong>!
                Öğretmenin yarışmayı başlatması bekleniyor.
              </p>
            </motion.section>
          ) : snapshot.phase === 'COUNTDOWN' ? (
            <motion.section
              key={phaseKey}
              {...phaseTransitionProps}
              className="rounded-3xl bg-powder-300 border border-powder-400/70 p-8 sm:p-10 text-center shadow-card"
            >
              <p className="text-sm font-semibold text-navy-700">Hazır Ol!</p>
              <SyncedBigCountdown
                endsAtMs={snapshot.countdownEndsAtMs}
                totalDurationMs={3000}
                clockOffsetMs={clockOffsetMs}
                onTick={handleCountdownTick}
              />
              <p className="mt-3 text-sm text-navy-700">İlk soru başlamak üzere</p>
            </motion.section>
          ) : snapshot.phase === 'QUESTION' && snapshot.currentQuestion ? (
            <motion.section
              key={phaseKey}
              {...phaseTransitionProps}
              className="rounded-2xl bg-cream-50 border border-cream-300 p-4 sm:p-6 shadow-card space-y-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center rounded-lg bg-cream-200 border border-cream-300 px-3 py-1 text-xs font-semibold tabular-nums text-navy-900">
                    Soru {snapshot.currentQuestion.index + 1} /{' '}
                    {snapshot.currentQuestion.totalQuestions}
                  </span>
                  <span className="inline-flex items-center rounded-lg bg-powder-100 border border-powder-200 px-2.5 py-1 text-[11px] font-semibold text-burgundy-700">
                    {QUESTION_TYPE_LABELS[snapshot.currentQuestion.type]}
                  </span>
                </div>
                <SyncedCountdownBadge
                  endsAtMs={snapshot.questionEndsAtMs}
                  totalDurationMs={snapshot.currentQuestion.timeLimitSec * 1000}
                  clockOffsetMs={clockOffsetMs}
                  isPaused={snapshot.isPaused}
                  pausedRemainingMs={snapshot.pausedRemainingMs}
                />
              </div>

              <SyncedProgressBar
                endsAtMs={snapshot.questionEndsAtMs}
                totalDurationMs={snapshot.currentQuestion.timeLimitSec * 1000}
                clockOffsetMs={clockOffsetMs}
                isPaused={snapshot.isPaused}
                pausedRemainingMs={snapshot.pausedRemainingMs}
              />

              {snapshot.isPaused && (
                <div
                  role="status"
                  className="rounded-xl bg-powder-100 border border-burgundy-600 px-3.5 py-2.5 text-center text-xs sm:text-sm font-semibold text-burgundy-800"
                >
                  Soru öğretmen tarafından duraklatıldı. Süre devam ettirildiğinde cevap gönderebilirsiniz.
                </div>
              )}

              {snapshot.currentQuestion.imageUrl && (
                <div className="overflow-hidden rounded-xl border border-cream-300 bg-cream-100">
                  <SafeImage
                    src={resolveMediaUrl(snapshot.currentQuestion.imageUrl)}
                    alt={`Soru ${snapshot.currentQuestion.index + 1} görseli`}
                    fetchPriority="high"
                    className="w-full max-h-48 object-contain"
                    fallbackClassName="rounded-none"
                  />
                </div>
              )}

              <h1 className="font-display font-bold text-xl sm:text-2xl leading-snug text-navy-900 break-words">
                {snapshot.currentQuestion.text}
              </h1>

              {actionError && (
                <div
                  role="alert"
                  className="rounded-xl bg-burgundy-50 border border-burgundy-500 px-3.5 py-2.5 text-xs font-medium text-burgundy-800"
                >
                  {actionError}
                </div>
              )}

              {snapshot.currentQuestion.type === 'TRUE_FALSE' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {snapshot.currentQuestion.options.map((opt) => {
                    const isConfirmedSelected =
                      snapshot.hasAnsweredCurrent && snapshot.selectedOptionId === opt.id;
                    const isPendingConfirm =
                      !snapshot.hasAnsweredCurrent && submittingOptionId === opt.id;
                    const locked =
                      snapshot.hasAnsweredCurrent ||
                      snapshot.isPaused ||
                      submittingOptionId !== null ||
                      questionExpired;

                    return (
                      <motion.button
                        key={opt.id}
                        type="button"
                        disabled={locked}
                        aria-pressed={isConfirmedSelected}
                        onClick={() => handleAnswerSelect(opt.id)}
                        className={cn(
                          'min-h-[88px] sm:min-h-[104px] w-full rounded-xl border px-5 py-4 font-display font-bold text-lg sm:text-xl flex items-center justify-center gap-2.5 transition-colors duration-200 touch-manipulation select-none',
                          isConfirmedSelected
                            ? 'bg-burgundy-600 border-burgundy-700 text-cream-50'
                            : isPendingConfirm
                              ? 'bg-powder-200 border-burgundy-600 text-navy-900'
                              : locked
                                ? 'bg-cream-100 border-cream-300 text-navy-500 opacity-75'
                                : cn(
                                    'bg-cream-200 border-cream-300 text-navy-900 hover:bg-powder-100 hover:border-powder-500 cursor-pointer',
                                    !reducedMotion && 'active:scale-[0.99]',
                                  ),
                        )}
                      >
                        <span>{opt.text}</span>
                        {isConfirmedSelected && <CheckIcon className="h-5 w-5 shrink-0" />}
                      </motion.button>
                    );
                  })}
                </div>
              )}

              {snapshot.currentQuestion.type === 'MULTIPLE_CHOICE' && (
                <div className="grid gap-3">
                  {snapshot.currentQuestion.options.map((opt, idx) => {
                    const isConfirmedSelected =
                      snapshot.hasAnsweredCurrent && snapshot.selectedOptionId === opt.id;
                    const isPendingConfirm =
                      !snapshot.hasAnsweredCurrent && submittingOptionId === opt.id;
                    const locked =
                      snapshot.hasAnsweredCurrent ||
                      snapshot.isPaused ||
                      submittingOptionId !== null ||
                      questionExpired;

                    return (
                      <motion.button
                        key={opt.id}
                        type="button"
                        disabled={locked}
                        aria-pressed={isConfirmedSelected}
                        onClick={() => handleAnswerSelect(opt.id)}
                        initial={
                          reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }
                        }
                        animate={{
                          opacity: 1,
                          y: 0,
                          scale: isConfirmedSelected && !reducedMotion ? [1, 0.985, 1] : 1,
                        }}
                        transition={{
                          duration: reducedMotion ? 0 : 0.2,
                          delay:
                            isConfirmedSelected || reducedMotion ? 0 : idx * 0.035,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        className={cn(
                          'min-h-[68px] sm:min-h-[76px] w-full rounded-xl border px-4 py-3.5 text-start font-display font-semibold text-base sm:text-lg leading-snug flex items-center justify-between gap-3 transition-colors duration-200 touch-manipulation select-none',
                          isConfirmedSelected
                            ? 'bg-burgundy-600 border-burgundy-700 text-cream-50'
                            : isPendingConfirm
                              ? 'bg-powder-200 border-burgundy-600 text-navy-900'
                              : locked
                                ? 'bg-cream-100 border-cream-300 text-navy-500 opacity-75'
                                : cn(
                                    'bg-cream-200 border-cream-300 text-navy-900 hover:bg-powder-100 hover:border-powder-500 cursor-pointer',
                                    !reducedMotion && 'active:scale-[0.99]',
                                  ),
                        )}
                      >
                        <span className="inline-flex items-center gap-3 min-w-0">
                          <span
                            className={cn(
                              'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold',
                              isConfirmedSelected
                                ? 'bg-burgundy-800 text-cream-50'
                                : isPendingConfirm
                                  ? 'bg-burgundy-600 text-cream-50'
                                  : 'bg-cream-50 border border-cream-300 text-navy-700',
                            )}
                          >
                            {OPTION_LETTERS[idx] ?? idx + 1}
                          </span>
                          <span className="break-words">{opt.text}</span>
                        </span>

                        {isPendingConfirm && (
                          <span className="text-xs font-bold text-burgundy-700 shrink-0">
                            Gönderiliyor...
                          </span>
                        )}
                        {isConfirmedSelected && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-cream-50/15 px-2 py-0.5 text-xs font-bold shrink-0">
                            <CheckIcon className="h-4 w-4" />
                            <span>Seçildi</span>
                          </span>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
              )}

              {snapshot.currentQuestion.type === 'MULTI_SELECT' && (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-navy-600">
                    Uygun gördüğünüz tüm seçenekleri işaretleyin ve Cevabı Gönder düğmesine dokunun.{' '}
                    {snapshot.currentQuestion.allowPartialCredit
                      ? '(Kısmi puanlama aktif)'
                      : '(Tam eşleşme gerekir)'}
                  </p>

                  <div className="grid gap-3">
                    {snapshot.currentQuestion.options.map((opt, idx) => {
                      const locked =
                        snapshot.hasAnsweredCurrent ||
                        snapshot.isPaused ||
                        submittingOptionId !== null ||
                        questionExpired;
                      const isChecked = snapshot.hasAnsweredCurrent
                        ? (snapshot.selectedOptionIds?.includes(opt.id) ?? false)
                        : selectedMultiIds.includes(opt.id);

                      return (
                        <button
                          key={opt.id}
                          type="button"
                          disabled={locked}
                          aria-pressed={isChecked}
                          onClick={() => {
                            if (locked) return;
                            setSelectedMultiIds((prev) =>
                              prev.includes(opt.id)
                                ? prev.filter((item) => item !== opt.id)
                                : [...prev, opt.id],
                            );
                          }}
                          className={cn(
                            'min-h-[64px] w-full rounded-xl border px-4 py-3 text-start font-display font-semibold text-base flex items-center justify-between gap-3 transition-colors duration-150 touch-manipulation select-none',
                            isChecked
                              ? 'bg-burgundy-600 border-burgundy-700 text-cream-50'
                              : locked
                                ? 'bg-cream-100 border-cream-300 text-navy-500 opacity-75'
                                : 'bg-cream-200 border-cream-300 text-navy-900 hover:bg-powder-100 hover:border-powder-500 cursor-pointer',
                          )}
                        >
                          <span className="inline-flex items-center gap-3 min-w-0">
                            <span
                              className={cn(
                                'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold',
                                isChecked
                                  ? 'bg-burgundy-800 text-cream-50'
                                  : 'bg-cream-50 border border-cream-300 text-navy-700',
                              )}
                            >
                              {OPTION_LETTERS[idx] ?? idx + 1}
                            </span>
                            <span className="break-words">{opt.text}</span>
                          </span>
                          {isChecked && <CheckIcon className="h-4 w-4 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>

                  {!snapshot.hasAnsweredCurrent && (
                    <button
                      type="button"
                      disabled={
                        snapshot.isPaused ||
                        submittingOptionId !== null ||
                        questionExpired ||
                        selectedMultiIds.length === 0
                      }
                      onClick={handleMultiSelectSubmit}
                      className="min-h-12 w-full rounded-xl bg-navy-900 hover:bg-navy-950 px-5 py-3 text-base font-semibold text-cream-50 transition-colors duration-150 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                    >
                      {submittingOptionId === 'multi-submit'
                        ? 'Gönderiliyor...'
                        : `Cevabı Gönder (${selectedMultiIds.length} seçim)`}
                    </button>
                  )}
                </div>
              )}

              {snapshot.currentQuestion.type === 'ORDERING' && (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-navy-600">
                    Öğeleri sürükleyerek veya yukarı/aşağı düğmeleriyle doğru sıraya dizip gönderin.
                  </p>

                  <SortableList
                    items={orderingItems}
                    getId={(item) => item.id}
                    getLabel={(item, idx) => item.text || `${idx + 1}. Öğe`}
                    onReorder={setOrderingItems}
                    disabled={
                      snapshot.hasAnsweredCurrent ||
                      snapshot.isPaused ||
                      submittingOptionId !== null ||
                      questionExpired
                    }
                    ariaLabel="Öğeleri doğru sıraya dizin"
                    renderContent={(item, controls) => (
                      <div className="flex items-center gap-2.5 py-1.5">
                        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cream-200 text-xs font-bold tabular-nums text-navy-900">
                          {controls.index + 1}
                        </span>
                        <span className="font-display font-semibold text-sm sm:text-base text-navy-900 break-words">
                          {item.text}
                        </span>
                      </div>
                    )}
                  />

                  {!snapshot.hasAnsweredCurrent && (
                    <button
                      type="button"
                      disabled={
                        snapshot.isPaused ||
                        submittingOptionId !== null ||
                        questionExpired ||
                        orderingItems.length === 0
                      }
                      onClick={handleOrderingSubmit}
                      className="min-h-12 w-full rounded-xl bg-navy-900 hover:bg-navy-950 px-5 py-3 text-base font-semibold text-cream-50 transition-colors duration-150 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                    >
                      {submittingOptionId === 'ordering-submit'
                        ? 'Gönderiliyor...'
                        : 'Sıralamayı Gönder'}
                    </button>
                  )}
                </div>
              )}

              {snapshot.hasAnsweredCurrent && (
                <div
                  role="status"
                  className="rounded-xl bg-powder-100 border border-powder-200 px-4 py-3 text-center text-sm font-semibold text-burgundy-700 flex items-center justify-center gap-2"
                >
                  <CheckIcon className="h-4 w-4 shrink-0" />
                  <span>Cevabın kaydedildi. Diğer oyuncular bekleniyor...</span>
                </div>
              )}
            </motion.section>
          ) : snapshot.phase === 'QUESTION_RESULT' && snapshot.lastQuestionResult ? (
            <motion.section
              key={phaseKey}
              {...phaseTransitionProps}
              className="rounded-2xl bg-cream-50 border border-cream-300 p-5 sm:p-6 shadow-card space-y-5"
            >
              {snapshot.lastQuestionResult.personalResult && (
                <motion.div
                  initial={
                    reducedMotion
                      ? { opacity: 1, scale: 1, x: 0 }
                      : snapshot.lastQuestionResult.personalResult.isCorrect
                        ? { opacity: 0, scale: 0.96, x: 0 }
                        : { opacity: 1, scale: 1, x: 0 }
                  }
                  animate={
                    reducedMotion
                      ? { opacity: 1, scale: 1, x: 0 }
                      : !snapshot.lastQuestionResult.personalResult.answered
                        ? { opacity: 1, scale: 1, x: 0 }
                        : snapshot.lastQuestionResult.personalResult.isCorrect
                          ? { opacity: 1, scale: 1, x: 0 }
                          : { opacity: 1, scale: 1, x: [0, -5, 4, -2, 0] }
                  }
                  transition={{ duration: reducedMotion ? 0 : 0.28 }}
                  className={cn(
                    'rounded-2xl border p-5 text-center',
                    !snapshot.lastQuestionResult.personalResult.answered
                      ? 'bg-cream-200 border-cream-300'
                      : snapshot.lastQuestionResult.personalResult.isCorrect ||
                          snapshot.lastQuestionResult.personalResult.isPartial
                        ? 'bg-powder-100 border-burgundy-600'
                        : 'bg-cream-200 border-burgundy-500/50',
                  )}
                >
                  <div className="inline-flex items-center justify-center gap-2">
                    {!snapshot.lastQuestionResult.personalResult.answered ? (
                      <ClockIcon className="h-6 w-6 text-navy-700" />
                    ) : snapshot.lastQuestionResult.personalResult.isCorrect ||
                        snapshot.lastQuestionResult.personalResult.isPartial ? (
                      <CheckIcon className="h-6 w-6 text-burgundy-600" />
                    ) : (
                      <CloseIcon className="h-6 w-6 text-burgundy-700" />
                    )}
                    <p className="font-display font-extrabold text-xl text-navy-900">
                      {!snapshot.lastQuestionResult.personalResult.answered
                        ? 'Süre Doldu'
                        : snapshot.lastQuestionResult.personalResult.isCorrect
                          ? 'Doğru Cevap!'
                          : snapshot.lastQuestionResult.personalResult.isPartial
                            ? 'Kısmi Doğru!'
                            : 'Yanlış Cevap'}
                    </p>
                  </div>

                  {correctAnswerSummary &&
                    !snapshot.lastQuestionResult.personalResult.isCorrect && (
                      <p className="mt-2 text-xs sm:text-sm font-semibold text-navy-700">
                        {snapshot.lastQuestionResult.questionType === 'ORDERING'
                          ? 'Doğru sıralama: '
                          : snapshot.lastQuestionResult.questionType === 'MULTI_SELECT'
                            ? 'Doğru cevaplar: '
                            : 'Doğru seçenek: '}
                        <span className="text-burgundy-700">{correctAnswerSummary}</span>
                      </p>
                    )}

                  {snapshot.lastQuestionResult.explanation && (
                    <p className="mt-2.5 rounded-xl bg-cream-50/80 border border-cream-300 px-3 py-2 text-xs text-navy-700 text-start">
                      <strong className="font-semibold text-navy-900">Açıklama: </strong>
                      {snapshot.lastQuestionResult.explanation}
                    </p>
                  )}

                  <p className="mt-2 font-display font-bold text-lg tabular-nums text-burgundy-600">
                    +
                    <AnimatedScoreCounter
                      from={0}
                      to={snapshot.lastQuestionResult.personalResult.pointsAwarded}
                      duration={0.35}
                      suffix=" puan"
                    />
                  </p>
                  <p className="mt-2 text-xs font-semibold tabular-nums text-navy-700">
                    Toplam:{' '}
                    <AnimatedScoreCounter
                      from={previousScore}
                      to={snapshot.lastQuestionResult.personalResult.totalScore}
                      suffix=" puan"
                    />{' '}
                    · {snapshot.lastQuestionResult.personalResult.rank}. sıra
                  </p>
                </motion.div>
              )}

              <div>
                <h2 className="font-display font-bold text-base text-navy-900 mb-3">
                  İlk 5 Sıralama
                </h2>
                <LeaderboardTable
                  entries={snapshot.lastQuestionResult.leaderboard}
                  highlightParticipantId={snapshot.participantId}
                  previousRanks={previousRanks}
                  limit={5}
                />
              </div>

              <p className="text-center text-xs text-navy-600">
                Öğretmenin sonraki soruya geçmesi bekleniyor...
              </p>
            </motion.section>
          ) : snapshot.phase === 'FINISHED' && snapshot.finalResult ? (
            <motion.div key={phaseKey} {...phaseTransitionProps} className="space-y-5">
              <section className="rounded-2xl bg-cream-50 border border-cream-300 p-5 sm:p-6 shadow-card space-y-5">
                <div className="text-center">
                  <span className="inline-flex items-center rounded-full bg-powder-100 border border-powder-200 px-3 py-1 text-xs font-semibold text-burgundy-600">
                    Yarışma Bitti
                  </span>
                  <h1 className="mt-3 font-display font-extrabold text-2xl text-navy-900">
                    Oyun Sonuçları
                  </h1>
                </div>

                {snapshot.finalResult.personalResult && (
                  <div className="rounded-2xl bg-navy-900 text-cream-50 p-5 text-center space-y-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-powder-200">
                        Senin Sıralaman
                      </p>
                      <p className="mt-1 font-display font-extrabold text-3xl tabular-nums">
                        {snapshot.finalResult.personalResult.rank}. Sıra
                      </p>
                      <p className="mt-1 text-base font-bold tabular-nums text-powder-100">
                        <AnimatedScoreCounter
                          from={previousScore}
                          to={snapshot.finalResult.personalResult.totalScore}
                          suffix=" puan"
                        />
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-2 border-t border-cream-50/15 pt-3 text-xs">
                      <div className="rounded-xl bg-cream-50/10 px-2 py-2">
                        <p className="text-powder-200">Doğru</p>
                        <p className="mt-0.5 font-display font-extrabold text-base tabular-nums">
                          {snapshot.finalResult.personalResult.correctCount}
                        </p>
                      </div>
                      <div className="rounded-xl bg-cream-50/10 px-2 py-2">
                        <p className="text-powder-200">Yanlış</p>
                        <p className="mt-0.5 font-display font-extrabold text-base tabular-nums">
                          {snapshot.finalResult.personalResult.wrongCount ?? 0}
                        </p>
                      </div>
                      <div className="rounded-xl bg-cream-50/10 px-2 py-2">
                        <p className="text-powder-200">Boş</p>
                        <p className="mt-0.5 font-display font-extrabold text-base tabular-nums">
                          {snapshot.finalResult.personalResult.unansweredCount ??
                            Math.max(
                              0,
                              snapshot.finalResult.personalResult.totalQuestions -
                                snapshot.finalResult.personalResult.correctCount -
                                (snapshot.finalResult.personalResult.wrongCount ?? 0),
                            )}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <PodiumView
                  podium={snapshot.finalResult.podium}
                  highlightParticipantId={snapshot.participantId}
                  onWinnerRevealed={handleWinnerRevealed}
                />

                <LeaderboardTable
                  entries={snapshot.finalResult.leaderboard}
                  highlightParticipantId={snapshot.participantId}
                  previousRanks={previousRanks}
                  showWrongCount
                />

                <div className="pt-2 text-center">
                  <Link
                    to="/join"
                    className="inline-flex items-center justify-center rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-5 py-2.5 text-sm font-semibold text-cream-50"
                  >
                    Başka Oyuna Katıl
                  </Link>
                </div>
              </section>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </main>
    </div>
  );
}
