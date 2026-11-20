import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import QRCode from 'qrcode';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { QUESTION_TYPE_LABELS } from '@shared/quizTypes';
import type {
  HostSessionSnapshot,
  ParticipantPublic,
  PresenterResultFocus,
} from '@shared/gameTypes';
import { QuizoraLogo } from '@/components/brand/QuizoraLogo';
import { ConfirmDialog } from '@/components/dashboard/ConfirmDialog';
import { CelebrationConfetti } from '@/components/game/CelebrationConfetti';
import { LeaderboardTable } from '@/components/game/LeaderboardTable';
import { PodiumView } from '@/components/game/PodiumView';
import { SoundToggleButton } from '@/components/game/SoundToggleButton';
import {
  SyncedBigCountdown,
  SyncedCountdownBadge,
  SyncedProgressBar,
} from '@/components/game/SyncedTimerDisplay';
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronLeftIcon,
  DownloadIcon,
  MaximizeIcon,
  MinimizeIcon,
  MonitorIcon,
  PauseIcon,
  PlayIcon,
  StopCircleIcon,
  TrashIcon,
  UsersIcon,
} from '@/components/ui/Icons';
import { SafeImage } from '@/components/ui/SafeImage';
import { resolveMediaUrl } from '@/config/runtime';
import { useGameSound } from '@/hooks/useGameSound';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { downloadGameResultsCsv } from '@/services/gameApi';
import {
  createGameSocket,
  measureClockOffset,
  type GameSocket,
} from '@/services/gameSocket';
import { ApiError } from '@/services/quizApi';
import { cn } from '@/utils/cn';
import {
  clearHostToken,
  clearPresenterToken,
  formatPinDisplay,
  readHostToken,
  savePresenterToken,
} from '@/utils/gameStorage';

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
const HOST_ACTION_TIMEOUT_MS = 6000;

const PHASE_LABELS: Record<HostSessionSnapshot['phase'], string> = {
  LOBBY: 'Bekleme Odası',
  COUNTDOWN: 'Başlangıç Geri Sayımı',
  QUESTION: 'Soru Devam Ediyor',
  QUESTION_RESULT: 'Soru Sonucu',
  FINISHED: 'Tamamlandı',
  CANCELLED: 'İptal Edildi',
};

export function HostGamePage() {
  const { pin = '' } = useParams<{ pin: string }>();
  const [searchParams] = useSearchParams();
  const isClassroomParam = searchParams.get('classroom') === '1';
  const navigate = useNavigate();
  const reducedMotion = usePrefersReducedMotion();
  const { playSound } = useGameSound();
  const playSoundRef = useRef(playSound);
  playSoundRef.current = playSound;

  const [snapshot, setSnapshot] = useState<HostSessionSnapshot | null>(null);
  const [previousRanks, setPreviousRanks] = useState<Record<string, number>>({});
  const [confettiActive, setConfettiActive] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [connectionLost, setConnectionLost] = useState(false);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [socketRef, setSocketRef] = useState<GameSocket | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPresenterLink, setCopiedPresenterLink] = useState(false);
  const isOnline = useNetworkStatus();
  const [busyAction, setBusyAction] = useState(false);
  const busySeqRef = useRef(0);
  const busyTimeoutRef = useRef<number | null>(null);
  const lastVisibilitySyncRef = useRef(0);
  const [downloadingCsv, setDownloadingCsv] = useState(false);

  const clearPendingHostAction = useCallback((invalidateSeq = false) => {
    if (invalidateSeq) {
      busySeqRef.current += 1;
    }
    if (busyTimeoutRef.current !== null) {
      window.clearTimeout(busyTimeoutRef.current);
      busyTimeoutRef.current = null;
    }
    setBusyAction(false);
  }, []);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [endGameDialogOpen, setEndGameDialogOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [singleScreenPresentMode, setSingleScreenPresentMode] = useState(false);
  const rootContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const handleToggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } else {
        const target = rootContainerRef.current ?? document.documentElement;
        if (typeof target.requestFullscreen === 'function') {
          await target.requestFullscreen();
          setIsFullscreen(true);
        } else {
          setIsFullscreen((prev) => !prev);
        }
      }
    } catch {
      setIsFullscreen((prev) => !prev);
    }
  };

  const hostToken = readHostToken(pin);
  const joinUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/join?pin=${pin}`
      : `/join?pin=${pin}`;

  useEffect(() => {
    if (!pin || !/^\d{6}$/.test(pin)) return;

    let active = true;
    QRCode.toDataURL(joinUrl, {
      width: 220,
      margin: 1,
      color: {
        dark: '#232B3A',
        light: '#FFFDFB',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl(null);
      });

    return () => {
      active = false;
    };
  }, [pin, joinUrl]);

  useEffect(() => {
    setPreviousRanks({});
    setConfettiActive(false);

    if (!/^\d{6}$/.test(pin)) {
      setAuthError('Geçersiz oyun PIN kodu.');
      return;
    }

    if (!hostToken) {
      setAuthError(
        'Bu yarışmayı yönetmek için öğretmen oturum belirteci bulunamadı. Yetkisiz erişim engellendi.',
      );
      return;
    }

    const socket = createGameSocket();
    setSocketRef(socket);

    const attachAsHost = () => {
      void measureClockOffset(socket).then((offset) => {
        setClockOffsetMs(offset);
      });

      socket.emit('host:attach', { pin, hostToken }, (res) => {
        clearPendingHostAction(true);
        if (!res.ok) {
          setAuthError(res.message);
          return;
        }
        setAuthError(null);
        setConnectionLost(false);
        if (res.snapshot.presenterToken) {
          savePresenterToken(pin, res.snapshot.presenterToken);
        }
        setSnapshot(res.snapshot);
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || !socket.connected) return;
      const now = Date.now();
      if (now - lastVisibilitySyncRef.current < 800) return;
      lastVisibilitySyncRef.current = now;
      attachAsHost();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    socket.on('connect', attachAsHost);

    socket.on('disconnect', () => {
      clearPendingHostAction(true);
      setConnectionLost(true);
    });

    socket.on('lobby:updated', ({ participants, connectedCount }) => {
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              participants,
              connectedCount,
            }
          : prev,
      );
    });

    socket.on('game:countdown', ({ countdownEndsAtMs, totalQuestions }) => {
      playSoundRef.current('gameStart');
      setConfettiActive(false);
      setPreviousRanks({});
      setLiveAnnouncement('Yarışma başlangıç geri sayımı başladı.');
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

    socket.on(
      'game:question_started',
      ({ question, questionEndsAtMs, connectedCount }) => {
        setLiveAnnouncement(
          `Soru ${question.index + 1} / ${question.totalQuestions}: ${question.text}`,
        );
        setSnapshot((prev) => {
          if (!prev) return prev;
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
            presenterResultFocus: 'DISTRIBUTION',
            countdownEndsAtMs: null,
            answeredCount: 0,
            connectedCount,
            lastQuestionResult: null,
          };
        });
      },
    );

    socket.on('game:question_paused', ({ questionIndex, pausedRemainingMs }) => {
      setLiveAnnouncement('Soru duraklatıldı.');
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
      setLiveAnnouncement('Soru devam ettirildi.');
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

    socket.on('game:presenter_focus', ({ focus }) => {
      setSnapshot((prev) =>
        prev ? { ...prev, presenterResultFocus: focus } : prev,
      );
    });

    socket.on(
      'game:answer_progress',
      ({ questionIndex, answeredCount, connectedCount }) => {
        setSnapshot((prev) =>
          prev && prev.questionIndex === questionIndex
            ? { ...prev, answeredCount, connectedCount }
            : prev,
        );
      },
    );

    socket.on('game:question_result', (result) => {
      playSoundRef.current('questionEnd');
      setLiveAnnouncement(
        `Soru ${result.questionIndex + 1} sona erdi. Sonuçlar ve güncel liderlik tablosu gösteriliyor.`,
      );
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              phase: 'QUESTION_RESULT',
              questionEndsAtMs: null,
              lastQuestionResult: result,
            }
          : prev,
      );
    });

    socket.on('game:finished', (finalResult) => {
      setLiveAnnouncement(
        'Yarışma tamamlandı. Final podyumu ve tüm oyuncu sonuçları hazır.',
      );
      setSnapshot((prev) => {
        if (!prev) return prev;
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
          finalResult,
        };
      });
    });

    socket.on('game:cancelled', ({ message }) => {
      clearHostToken(pin);
      setAuthError(message);
    });

    socket.connect();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearPendingHostAction(true);
      socket.removeAllListeners();
      socket.disconnect();
      setSocketRef(null);
    };
  }, [pin, hostToken, clearPendingHostAction]);

  const handleCountdownTick = useCallback(() => {
    playSoundRef.current('countdownTick');
  }, []);

  const handleWinnerRevealed = useCallback(() => {
    setConfettiActive(true);
    playSoundRef.current('podiumCelebration');
  }, []);

  const handleCopyJoinLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setActionError('Bağlantı panoya kopyalanamadı.');
    }
  }, [joinUrl]);

  const runHostAction = <T extends object = object>(
    emitCall: (
      socket: GameSocket,
      token: string,
      onAck: (res: { ok: true } & T | { ok: false; code: string; message: string }) => void,
    ) => void,
    onSuccess?: (res: { ok: true } & T) => void,
    onFinally?: () => void,
  ) => {
    if (!socketRef || !hostToken) return;
    if (!navigator.onLine || !socketRef.connected) {
      onFinally?.();
      setActionError(
        'Sunucu bağlantısı kesildi veya çevrimdışısınız. Bağlantı sağlandığında komutu tekrar deneyin.',
      );
      return;
    }

    setActionError(null);
    setBusyAction(true);
    const seq = ++busySeqRef.current;
    if (busyTimeoutRef.current !== null) {
      window.clearTimeout(busyTimeoutRef.current);
    }
    busyTimeoutRef.current = window.setTimeout(() => {
      if (busySeqRef.current !== seq) return;
      clearPendingHostAction(true);
      onFinally?.();
      setActionError(
        'Komut sunucuya ulaşmadı (bağlantı zaman aşımı). Bağlantınızı kontrol edip tekrar deneyin.',
      );
    }, HOST_ACTION_TIMEOUT_MS);

    emitCall(socketRef, hostToken, (res) => {
      if (busySeqRef.current !== seq) return;
      clearPendingHostAction(false);
      onFinally?.();
      if (!res.ok) {
        setActionError(res.message);
        return;
      }
      onSuccess?.(res);
    });
  };

  const handleStartGame = () => {
    runHostAction((sock, token, onAck) => {
      sock.emit('host:start_game', { pin, hostToken: token }, onAck);
    });
  };

  const handlePauseQuestion = () => {
    runHostAction((sock, token, onAck) => {
      sock.emit('host:pause_question', { pin, hostToken: token }, onAck);
    });
  };

  const handleResumeQuestion = () => {
    runHostAction((sock, token, onAck) => {
      sock.emit('host:resume_question', { pin, hostToken: token }, onAck);
    });
  };

  const handleSetPresenterFocus = (focus: PresenterResultFocus) => {
    if (!socketRef || !hostToken) return;
    setActionError(null);
    socketRef.emit(
      'host:set_presenter_focus',
      { pin, hostToken, focus },
      (res) => {
        if (!res.ok) setActionError(res.message);
      },
    );
  };

  const handleRotatePresenterToken = () => {
    runHostAction<{ presenterToken: string }>(
      (sock, token, onAck) => {
        sock.emit('host:rotate_presenter_token', { pin, hostToken: token }, onAck);
      },
      (res) => {
        savePresenterToken(pin, res.presenterToken);
        setSnapshot((prev) =>
          prev ? { ...prev, presenterToken: res.presenterToken } : prev,
        );
      },
    );
  };

  const presenterUrl =
    snapshot && typeof window !== 'undefined'
      ? `${window.location.origin}/present/${snapshot.pin}?token=${encodeURIComponent(snapshot.presenterToken)}`
      : snapshot
        ? `/present/${snapshot.pin}?token=${encodeURIComponent(snapshot.presenterToken)}`
        : '';

  const handleOpenPresenterWindow = () => {
    if (!presenterUrl || !snapshot) return;
    savePresenterToken(snapshot.pin, snapshot.presenterToken);
    window.open(presenterUrl, '_blank', 'noopener');
  };

  const handleCopyPresenterLink = async () => {
    if (!presenterUrl) return;
    try {
      await navigator.clipboard.writeText(presenterUrl);
      setCopiedPresenterLink(true);
      window.setTimeout(() => setCopiedPresenterLink(false), 2000);
    } catch {
      setActionError('Projeksiyon bağlantısı kopyalanamadı.');
    }
  };

  const handleEndQuestion = () => {
    runHostAction((sock, token, onAck) => {
      sock.emit('host:end_question', { pin, hostToken: token }, onAck);
    });
  };

  const handleNextQuestion = () => {
    runHostAction((sock, token, onAck) => {
      sock.emit('host:next_question', { pin, hostToken: token }, onAck);
    });
  };

  const handleKickPlayer = (participant: ParticipantPublic) => {
    if (!socketRef || !hostToken) return;
    setActionError(null);
    socketRef.emit(
      'host:kick_player',
      { pin, hostToken, participantId: participant.id },
      (res) => {
        if (!res.ok) setActionError(res.message);
      },
    );
  };

  const handleCancelGame = () => {
    runHostAction(
      (sock, token, onAck) => {
        sock.emit('host:cancel_game', { pin, hostToken: token }, onAck);
      },
      () => {
        clearHostToken(pin);
        clearPresenterToken(pin);
        navigate('/dashboard/quizzes');
      },
      () => setCancelDialogOpen(false),
    );
  };

  const handleEndGame = () => {
    runHostAction(
      (sock, token, onAck) => {
        sock.emit('host:end_game', { pin, hostToken: token }, onAck);
      },
      undefined,
      () => setEndGameDialogOpen(false),
    );
  };

  const handleDownloadCsv = async () => {
    if (!snapshot?.finalResult) return;
    setActionError(null);
    setDownloadingCsv(true);
    try {
      await downloadGameResultsCsv(
        snapshot.finalResult.sessionId,
        snapshot.finalResult.pin,
      );
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : 'Sonuçlar CSV olarak indirilemedi.',
      );
    } finally {
      setDownloadingCsv(false);
    }
  };

  if (authError) {
    return (
      <div className="min-h-dvh bg-cream-100 text-navy-900 flex flex-col">
        <header className="bg-cream-50 border-b border-cream-300 px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
            <Link to="/dashboard">
              <QuizoraLogo size="md" />
            </Link>
            <SoundToggleButton />
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div
            role="alert"
            className="max-w-md w-full rounded-2xl bg-cream-50 border border-burgundy-500 p-7 text-center shadow-card"
          >
            <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-burgundy-50 border border-burgundy-500/40 text-burgundy-600">
              <AlertCircleIcon />
            </div>
            <h1 className="mt-4 font-display font-bold text-xl text-navy-900">
              Oturum Yönetilemiyor
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-navy-600">{authError}</p>
            <Link
              to="/dashboard/quizzes"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-navy-900 hover:bg-navy-950 px-5 py-2.5 text-sm font-semibold text-cream-50"
            >
              <ChevronLeftIcon />
              <span>Quizlerime Dön</span>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const isInActiveGame =
    snapshot?.phase === 'COUNTDOWN' ||
    snapshot?.phase === 'QUESTION' ||
    snapshot?.phase === 'QUESTION_RESULT';

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

  const isClassroomMode = Boolean(snapshot?.classroomMode || isClassroomParam);
  const answeredCount = snapshot?.answeredCount ?? 0;
  const connectedCount = snapshot?.connectedCount ?? 0;
  const unansweredLiveCount = Math.max(0, connectedCount - answeredCount);
  const participationPct =
    connectedCount > 0 ? Math.round((answeredCount / connectedCount) * 100) : 0;

  return (
    <div
      ref={rootContainerRef}
      className="min-h-dvh flex flex-col bg-cream-100 text-navy-900 overflow-x-clip"
    >
      <CelebrationConfetti active={confettiActive} />

      <div role="status" aria-live="polite" className="sr-only">
        {liveAnnouncement}
      </div>

      <header className="bg-cream-50 border-b border-cream-300">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 min-h-16 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <QuizoraLogo size="md" />
            {snapshot && (
              <>
                <span className="hidden md:inline-flex items-center rounded-full bg-powder-100 border border-powder-200 px-3 py-0.5 text-xs font-semibold text-burgundy-600 truncate max-w-xs">
                  {snapshot.quizTitle}
                </span>
                <span className="inline-flex items-center rounded-full bg-cream-200 border border-cream-300 px-2.5 py-0.5 text-xs font-semibold text-navy-800">
                  {snapshot.isPaused
                    ? 'Duraklatıldı'
                    : PHASE_LABELS[snapshot.phase]}
                </span>
                {isClassroomMode && (
                  <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-burgundy-600 px-2.5 py-0.5 text-xs font-bold text-cream-50">
                    <MonitorIcon className="h-3.5 w-3.5" />
                    <span>Sınıf Modu</span>
                  </span>
                )}
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {snapshot && (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-cream-100 border border-cream-300 px-2.5 py-1 text-xs font-semibold tabular-nums text-navy-700">
                  <UsersIcon className="h-3.5 w-3.5 text-burgundy-600" />
                  <span>{snapshot.connectedCount} Bağlı / {snapshot.participants.length} Oyuncu</span>
                </span>
                {(snapshot.phase === 'QUESTION' ||
                  snapshot.phase === 'QUESTION_RESULT') && (
                  <span className="inline-flex items-center rounded-lg bg-powder-100 border border-powder-200 px-2.5 py-1 text-xs font-semibold tabular-nums text-burgundy-700">
                    Soru {snapshot.questionIndex + 1} / {snapshot.totalQuestions}
                  </span>
                )}
                <span className="inline-flex items-center rounded-lg bg-cream-200 border border-cream-300 px-3 py-1 text-xs font-bold tabular-nums text-navy-900">
                  PIN: {formatPinDisplay(snapshot.pin)}
                </span>

                <button
                  type="button"
                  onClick={handleOpenPresenterWindow}
                  className="inline-flex items-center gap-1.5 min-h-10 rounded-xl border border-burgundy-600 bg-powder-100 hover:bg-powder-200 px-3 py-1.5 text-xs font-semibold text-burgundy-700 cursor-pointer"
                >
                  <MonitorIcon className="h-4 w-4" />
                  <span>Projeksiyon Görünümü</span>
                </button>

                <button
                  type="button"
                  aria-pressed={singleScreenPresentMode}
                  onClick={() => setSingleScreenPresentMode((prev) => !prev)}
                  className={cn(
                    'inline-flex items-center gap-1.5 min-h-10 rounded-xl border px-3 py-1.5 text-xs font-semibold cursor-pointer',
                    singleScreenPresentMode
                      ? 'bg-navy-900 border-navy-900 text-cream-50'
                      : 'bg-cream-100 border-cream-300 text-navy-900 hover:bg-cream-200',
                  )}
                >
                  <span>
                    {singleScreenPresentMode ? 'Kontrol Görünümü' : 'Sunum Görünümü'}
                  </span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => void handleToggleFullscreen()}
              className="inline-flex items-center gap-1.5 min-h-10 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-3 py-1.5 text-xs font-semibold text-navy-900 cursor-pointer"
            >
              {isFullscreen ? (
                <MinimizeIcon className="h-4 w-4" />
              ) : (
                <MaximizeIcon className="h-4 w-4" />
              )}
              <span>{isFullscreen ? 'Tam Ekrandan Çık' : 'Tam Ekran'}</span>
            </button>

            <SoundToggleButton />

            {snapshot?.phase === 'LOBBY' && (
              <button
                type="button"
                onClick={() => setCancelDialogOpen(true)}
                className="inline-flex items-center gap-1.5 min-h-10 rounded-xl border border-burgundy-500/40 bg-burgundy-50 hover:bg-burgundy-100 px-3.5 py-2 text-xs font-semibold text-burgundy-700 cursor-pointer"
              >
                <TrashIcon />
                <span>Oturumu İptal Et</span>
              </button>
            )}

            {isInActiveGame && (
              <button
                type="button"
                disabled={busyAction}
                onClick={() => setEndGameDialogOpen(true)}
                className="inline-flex items-center gap-1.5 min-h-10 rounded-xl border border-burgundy-500/40 bg-burgundy-50 hover:bg-burgundy-100 px-3.5 py-2 text-xs font-semibold text-burgundy-700 cursor-pointer disabled:opacity-60"
              >
                <StopCircleIcon className="h-4 w-4" />
                <span>Yarışmayı Sonlandır</span>
              </button>
            )}
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
            : 'Sunucu bağlantısı koptu. Öğretmen oturumuna yeniden bağlanılıyor...'}
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4"
        >
          <div className="rounded-xl bg-burgundy-50 border border-burgundy-500 px-4 py-3 text-sm font-medium text-burgundy-800 flex items-center justify-between gap-3">
            <span>{actionError}</span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="text-xs font-bold underline cursor-pointer"
            >
              Kapat
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <AnimatePresence mode="wait">
          {!snapshot ? (
            <motion.div
              key="loading"
              {...phaseTransitionProps}
              className="rounded-2xl bg-cream-50 border border-cream-300 p-8 text-center shadow-card"
            >
              <p className="font-display font-bold text-lg text-navy-900">
                Oyun odasına bağlanılıyor...
              </p>
            </motion.div>
          ) : snapshot.phase === 'LOBBY' ? (
            <motion.div key={phaseKey} {...phaseTransitionProps} className="space-y-6">
              <div className="rounded-2xl bg-powder-300 border border-powder-400/70 p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div>
                  <span className="inline-flex items-center rounded-full bg-cream-50/70 border border-navy-900/15 px-3 py-1 text-xs font-semibold text-navy-900">
                    Oyun Lobisi · {snapshot.quizCategory}
                  </span>
                  <h1
                    className="mt-3 font-display font-extrabold text-navy-900"
                    style={{
                      fontSize: 'var(--text-h1)',
                      lineHeight: 'var(--leading-h1)',
                    }}
                  >
                    {snapshot.quizTitle}
                  </h1>
                  <p className="mt-1.5 text-sm text-navy-700">
                    Öğrenciler <strong className="font-semibold">/join</strong> adresinden PIN
                    girerek veya QR kodu okutarak katılabilir.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={busyAction || snapshot.participants.length === 0}
                  onClick={handleStartGame}
                  className="inline-flex items-center justify-center gap-2.5 min-h-12 rounded-xl bg-navy-900 hover:bg-navy-950 px-6 py-3.5 text-base font-semibold text-cream-50 transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  <PlayIcon />
                  <span>Yarışmayı Başlat</span>
                </button>
              </div>

              <div className="grid gap-6 lg:grid-cols-12 items-start">
                <section
                  aria-label="Oyun katılım bilgileri"
                  className="lg:col-span-5 rounded-2xl bg-cream-50 border border-cream-300 p-6 shadow-card text-center space-y-5"
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-navy-600">
                      Oyun Kodu (PIN)
                    </p>
                    <p className="mt-2 font-display font-extrabold text-4xl sm:text-5xl tracking-[0.08em] tabular-nums text-navy-900">
                      {formatPinDisplay(snapshot.pin)}
                    </p>
                  </div>

                  {qrDataUrl && (
                    <div className="mx-auto inline-block rounded-2xl bg-cream-50 border border-cream-300 p-3">
                      <img
                        src={qrDataUrl}
                        alt={`${snapshot.pin} kodlu oyuna katılım QR kodu`}
                        className="w-48 h-48 mx-auto"
                      />
                    </div>
                  )}

                  <div className="rounded-xl bg-cream-100 border border-cream-300 p-3 text-xs text-navy-700 break-all">
                    {joinUrl}
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleCopyJoinLink()}
                    className="inline-flex w-full items-center justify-center gap-2 min-h-11 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-4 py-2 text-sm font-semibold text-navy-900 cursor-pointer"
                  >
                    {copiedLink ? <CheckIcon /> : null}
                    <span>
                      {copiedLink ? 'Katılım Bağlantısı Kopyalandı' : 'Katılım Bağlantısını Kopyala'}
                    </span>
                  </button>

                  {!singleScreenPresentMode && (
                    <div className="pt-4 border-t border-cream-300 space-y-2.5 text-start">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold uppercase tracking-wide text-navy-700">
                          Sınıf Projeksiyon Ekranı
                        </span>
                        <button
                          type="button"
                          disabled={busyAction}
                          onClick={handleRotatePresenterToken}
                          className="text-xs font-semibold text-burgundy-600 hover:text-burgundy-700 underline cursor-pointer"
                        >
                          Bağlantıyı Yenile / İptal Et
                        </button>
                      </div>
                      <p className="text-xs text-navy-600">
                        Akıllı tahta veya ikinci ekranda yönetim kontrolleri olmadan yalnızca soruları ve sonuçları gösterir.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleOpenPresenterWindow}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-10 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-3 py-2 text-xs font-semibold text-cream-50 cursor-pointer"
                        >
                          <MonitorIcon className="h-4 w-4" />
                          <span>Projeksiyon Ekranını Aç</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleCopyPresenterLink()}
                          className="inline-flex items-center justify-center min-h-10 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-3 py-2 text-xs font-semibold text-navy-900 cursor-pointer"
                        >
                          {copiedPresenterLink
                            ? 'Projeksiyon Linki Kopyalandı'
                            : 'Projeksiyon Linkini Kopyala'}
                        </button>
                      </div>
                    </div>
                  )}
                </section>

                <section
                  aria-labelledby="katilimcilar-baslik"
                  className="lg:col-span-7 rounded-2xl bg-cream-50 border border-cream-300 p-6 shadow-card"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cream-300 pb-4">
                    <div className="flex items-center gap-2.5">
                      <UsersIcon className="text-burgundy-600" />
                      <h2
                        id="katilimcilar-baslik"
                        className="font-display font-bold text-lg text-navy-900"
                      >
                        Katılımcılar ({snapshot.participants.length} / {snapshot.maxPlayers})
                      </h2>
                    </div>

                    <span className="text-xs font-semibold tabular-nums text-navy-600">
                      {snapshot.connectedCount} çevrimiçi
                    </span>
                  </div>

                  {snapshot.participants.length === 0 ? (
                    <div className="py-12 text-center">
                      <p className="font-display font-bold text-base text-navy-900">
                        Henüz katılan oyuncu yok
                      </p>
                      <p className="mt-1.5 text-sm text-navy-600">
                        Öğrenciler PIN veya QR kod ile katıldığında isimleri burada anlık
                        olarak görünecektir.
                      </p>
                    </div>
                  ) : (
                    <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
                      {snapshot.participants.map((player) => (
                        <li
                          key={player.id}
                          className="rounded-xl bg-cream-100 border border-cream-300 px-3.5 py-2.5 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              aria-hidden="true"
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-powder-200 font-display font-bold text-xs text-burgundy-700 uppercase"
                            >
                              {player.nickname.slice(0, 1)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-display font-bold text-sm text-navy-900">
                                {player.nickname}
                              </p>
                              <p className="text-xs text-navy-600">
                                {player.connected ? 'Bağlı' : 'Bağlantı koptu'}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleKickPlayer(player)}
                            aria-label={`${player.nickname} adlı oyuncuyu çıkar`}
                            className="rounded-lg border border-cream-300 bg-cream-50 hover:bg-burgundy-50 hover:border-burgundy-500/40 px-2.5 py-1 text-xs font-semibold text-navy-700 hover:text-burgundy-700 cursor-pointer shrink-0"
                          >
                            Çıkar
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </motion.div>
          ) : snapshot.phase === 'COUNTDOWN' ? (
            <motion.div
              key={phaseKey}
              {...phaseTransitionProps}
              className="rounded-3xl bg-powder-300 border border-powder-400/70 p-10 sm:p-12 text-center shadow-card"
            >
              <p className="text-sm font-semibold uppercase tracking-wide text-navy-700">
                {snapshot.quizTitle}
              </p>
              <h1 className="mt-3 font-display font-extrabold text-2xl sm:text-3xl text-navy-900">
                Yarışma Başlıyor
              </h1>
              <SyncedBigCountdown
                endsAtMs={snapshot.countdownEndsAtMs}
                totalDurationMs={3000}
                clockOffsetMs={clockOffsetMs}
                onTick={handleCountdownTick}
              />
              <p className="mt-4 text-sm text-navy-700">
                Toplam {snapshot.totalQuestions} soru · {snapshot.connectedCount} oyuncu hazır
              </p>
            </motion.div>
          ) : snapshot.phase === 'QUESTION' && snapshot.currentQuestion ? (
            <motion.div key={phaseKey} {...phaseTransitionProps} className="space-y-6">
              <div className="rounded-2xl bg-cream-50 border border-cream-300 p-6 sm:p-8 shadow-card">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-lg bg-cream-200 border border-cream-300 px-3 py-1 text-xs font-semibold tabular-nums text-navy-900">
                      Soru {snapshot.currentQuestion.index + 1} /{' '}
                      {snapshot.currentQuestion.totalQuestions}
                    </span>
                    <span className="inline-flex items-center rounded-lg bg-powder-100 border border-powder-200 px-2.5 py-1 text-xs font-semibold text-burgundy-700">
                      {QUESTION_TYPE_LABELS[snapshot.currentQuestion.type]}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center rounded-lg bg-powder-100 border border-powder-200 px-3 py-1 text-xs font-semibold tabular-nums text-burgundy-600">
                      Cevaplayanlar: {snapshot.answeredCount} / {snapshot.connectedCount}
                    </span>
                    <span className="inline-flex items-center rounded-lg bg-cream-200 border border-cream-300 px-3 py-1 text-xs font-semibold tabular-nums text-navy-800">
                      Bekleyen: {unansweredLiveCount} · Katılım: %{participationPct}
                    </span>
                    <SyncedCountdownBadge
                      endsAtMs={snapshot.questionEndsAtMs}
                      totalDurationMs={snapshot.currentQuestion.timeLimitSec * 1000}
                      clockOffsetMs={clockOffsetMs}
                      isPaused={snapshot.isPaused}
                      pausedRemainingMs={snapshot.pausedRemainingMs}
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <SyncedProgressBar
                    endsAtMs={snapshot.questionEndsAtMs}
                    totalDurationMs={snapshot.currentQuestion.timeLimitSec * 1000}
                    clockOffsetMs={clockOffsetMs}
                    isPaused={snapshot.isPaused}
                    pausedRemainingMs={snapshot.pausedRemainingMs}
                  />
                </div>

                {snapshot.isPaused && (
                  <div
                    role="status"
                    className="mt-4 rounded-xl bg-powder-100 border border-burgundy-600 px-4 py-3 text-xs sm:text-sm font-semibold text-burgundy-800 flex flex-wrap items-center justify-between gap-2"
                  >
                    <span>
                      Soru duraklatıldı. Duraklatma süresince öğrenci cevap gönderimi kilitlidir.
                    </span>
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={handleResumeQuestion}
                      className="rounded-lg bg-burgundy-600 hover:bg-burgundy-700 px-3 py-1.5 text-xs font-bold text-cream-50 cursor-pointer"
                    >
                      Soruyu Devam Ettir
                    </button>
                  </div>
                )}

                {snapshot.currentQuestion.imageUrl && (
                  <div className="mt-5 overflow-hidden rounded-xl border border-cream-300 bg-cream-100">
                    <SafeImage
                      src={resolveMediaUrl(snapshot.currentQuestion.imageUrl)}
                      alt={`Soru ${snapshot.currentQuestion.index + 1} görseli`}
                      fetchPriority="high"
                      className="w-full max-h-64 object-contain"
                      fallbackClassName="rounded-none"
                    />
                  </div>
                )}

                <h1 className="mt-6 font-display font-bold text-2xl sm:text-3xl leading-snug text-navy-900 break-words">
                  {snapshot.currentQuestion.text}
                </h1>

                {snapshot.currentQuestion.type === 'MULTI_SELECT' && (
                  <p className="mt-2 text-xs font-medium text-navy-600">
                    Birden fazla doğru cevap seçilebilir ·{' '}
                    {snapshot.currentQuestion.allowPartialCredit
                      ? 'Kısmi puanlama açık'
                      : 'Tam eşleşme gerekir'}
                  </p>
                )}

                {snapshot.currentQuestion.type === 'ORDERING' ? (
                  <div className="mt-5 space-y-2.5">
                    <p className="text-xs font-medium text-navy-600">
                      Öğrenciler aşağıdaki öğeleri doğru sıraya diziyor:
                    </p>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {snapshot.currentQuestion.options.map((opt, idx) => (
                        <motion.div
                          key={opt.id}
                          initial={reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            duration: reducedMotion ? 0 : 0.22,
                            delay: reducedMotion ? 0 : idx * 0.04,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          className="rounded-xl border border-cream-300 bg-cream-200 px-4 py-3.5 font-display font-semibold text-base text-navy-900 flex items-center gap-3"
                        >
                          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cream-50 border border-cream-300 text-xs font-bold tabular-nums text-navy-700">
                            {idx + 1}
                          </span>
                          <span className="break-words">{opt.text}</span>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    {snapshot.currentQuestion.options.map((opt, idx) => (
                      <motion.div
                        key={opt.id}
                        initial={reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: reducedMotion ? 0 : 0.22,
                          delay: reducedMotion ? 0 : idx * 0.04,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        className={cn(
                          'rounded-xl border border-cream-300 bg-cream-200 px-5 font-display font-semibold text-navy-900 flex items-center gap-3',
                          snapshot.currentQuestion?.type === 'TRUE_FALSE'
                            ? 'py-6 text-lg sm:text-xl justify-center'
                            : 'py-4 text-base sm:text-lg',
                        )}
                      >
                        {snapshot.currentQuestion?.type !== 'TRUE_FALSE' && (
                          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cream-50 border border-cream-300 text-xs font-bold text-navy-700">
                            {OPTION_LETTERS[idx] ?? idx + 1}
                          </span>
                        )}
                        <span className="break-words">{opt.text}</span>
                      </motion.div>
                    ))}
                  </div>
                )}

                <div className="mt-6 pt-4 border-t border-cream-300 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs font-medium text-navy-600 tabular-nums">
                    Bu soru değeri: {snapshot.currentQuestion.points.toLocaleString('tr-TR')} puan ·{' '}
                    {snapshot.currentQuestion.timeLimitSec} sn
                  </p>
                  <div className="flex flex-wrap items-center gap-2.5">
                    {snapshot.isPaused ? (
                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={handleResumeQuestion}
                        className="inline-flex items-center gap-2 min-h-11 rounded-xl bg-navy-900 hover:bg-navy-950 px-5 py-2.5 text-sm font-semibold text-cream-50 cursor-pointer disabled:opacity-60"
                      >
                        <PlayIcon className="h-4 w-4" />
                        <span>Soruyu Devam Ettir</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={handlePauseQuestion}
                        className="inline-flex items-center gap-2 min-h-11 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-5 py-2.5 text-sm font-semibold text-navy-900 cursor-pointer disabled:opacity-60"
                      >
                        <PauseIcon className="h-4 w-4" />
                        <span>Soruyu Duraklat</span>
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={handleEndQuestion}
                      className="min-h-11 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-5 py-2.5 text-sm font-semibold text-cream-50 cursor-pointer disabled:opacity-60"
                    >
                      Soruyu Bitir
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : snapshot.phase === 'QUESTION_RESULT' && snapshot.lastQuestionResult ? (
            <motion.div
              key={phaseKey}
              {...phaseTransitionProps}
              className="grid gap-6 lg:grid-cols-12 items-start"
            >
              <section className="lg:col-span-6 rounded-2xl bg-cream-50 border border-cream-300 p-6 shadow-card space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center rounded-lg bg-cream-200 border border-cream-300 px-3 py-1 text-xs font-semibold tabular-nums text-navy-900">
                    Soru {snapshot.lastQuestionResult.questionIndex + 1} /{' '}
                    {snapshot.lastQuestionResult.totalQuestions} Sonucu
                  </span>
                  <span className="inline-flex items-center rounded-lg bg-powder-100 border border-powder-200 px-2.5 py-1 text-xs font-semibold text-burgundy-700">
                    {QUESTION_TYPE_LABELS[snapshot.lastQuestionResult.questionType]}
                  </span>
                </div>

                {snapshot.currentQuestion && (
                  <h1 className="font-display font-bold text-xl text-navy-900">
                    {snapshot.currentQuestion.text}
                  </h1>
                )}

                {(snapshot.lastQuestionResult.questionType === 'MULTI_SELECT' ||
                  snapshot.lastQuestionResult.questionType === 'ORDERING') && (
                  <p className="text-xs font-semibold tabular-nums text-navy-600">
                    {snapshot.lastQuestionResult.exactCorrectCount} /{' '}
                    {snapshot.lastQuestionResult.totalResponders} öğrenci tam doğru
                    {snapshot.lastQuestionResult.partialCorrectCount > 0
                      ? ` · ${snapshot.lastQuestionResult.partialCorrectCount} kısmi doğru`
                      : ''}
                  </p>
                )}

                {snapshot.lastQuestionResult.questionType === 'ORDERING' ? (
                  <div className="space-y-2.5">
                    <p className="text-xs font-bold uppercase tracking-wide text-burgundy-700">
                      Doğru Sıralama
                    </p>
                    <ol className="space-y-2.5">
                      {snapshot.lastQuestionResult.optionStats.map((stat, idx) => (
                        <li
                          key={stat.optionId}
                          className="rounded-xl border border-burgundy-700 bg-burgundy-600 p-3.5 text-cream-50 flex items-center justify-between gap-2 text-sm font-semibold"
                        >
                          <span className="inline-flex items-center gap-2.5 min-w-0">
                            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-burgundy-800 text-xs font-bold tabular-nums">
                              {idx + 1}
                            </span>
                            <span className="truncate">{stat.text}</span>
                          </span>
                          <span className="text-xs tabular-nums text-powder-100 shrink-0">
                            {stat.count} doğru konum
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {snapshot.lastQuestionResult.optionStats.map((stat, idx) => {
                      const totalVotes = snapshot.lastQuestionResult!.optionStats.reduce(
                        (sum, item) => sum + item.count,
                        0,
                      );
                      const denominator =
                        snapshot.lastQuestionResult!.questionType === 'MULTI_SELECT'
                          ? Math.max(0, snapshot.lastQuestionResult!.totalResponders)
                          : totalVotes;
                      const pct =
                        denominator > 0 ? Math.round((stat.count / denominator) * 100) : 0;
                      const scaleRatio = Math.max(0, Math.min(1, pct / 100));

                      return (
                        <li
                          key={stat.optionId}
                          className={cn(
                            'relative overflow-hidden rounded-xl border p-3.5',
                            stat.isCorrect
                              ? 'bg-burgundy-600 border-burgundy-700 text-cream-50'
                              : 'bg-cream-100 border-cream-300 text-navy-900',
                          )}
                        >
                          <div className="flex items-center justify-between gap-2 text-sm font-semibold">
                            <span className="inline-flex items-center gap-2 min-w-0">
                              {snapshot.lastQuestionResult!.questionType !== 'TRUE_FALSE' && (
                                <span className="text-xs font-bold">
                                  {OPTION_LETTERS[idx] ?? idx + 1}
                                </span>
                              )}
                              <span className="break-words">{stat.text}</span>
                              {stat.isCorrect && (
                                <span className="inline-flex items-center gap-1 rounded-md bg-cream-50/15 px-1.5 py-0.5 text-[11px] font-bold shrink-0">
                                  <CheckIcon className="h-3.5 w-3.5" />
                                  <span>Doğru</span>
                                </span>
                              )}
                            </span>
                            <span className="tabular-nums shrink-0">
                              {stat.count} oy ({pct}%)
                            </span>
                          </div>
                          <div
                            aria-hidden="true"
                            className={cn(
                              'mt-2 h-1.5 w-full rounded-full overflow-hidden',
                              stat.isCorrect ? 'bg-burgundy-800' : 'bg-cream-200',
                            )}
                          >
                            <div
                              className={cn(
                                'h-full w-full rounded-full origin-left will-change-transform transition-transform duration-300',
                                stat.isCorrect ? 'bg-cream-50' : 'bg-navy-900/45',
                              )}
                              style={{ transform: `scaleX(${scaleRatio})` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {snapshot.lastQuestionResult.explanation && (
                  <div className="rounded-xl bg-powder-100 border border-powder-200 p-3.5 text-xs sm:text-sm text-navy-800">
                    <span className="font-display font-bold text-burgundy-700 block">
                      Açıklama
                    </span>
                    <p className="mt-1">{snapshot.lastQuestionResult.explanation}</p>
                  </div>
                )}

                <div className="pt-2 flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleSetPresenterFocus(
                          snapshot.presenterResultFocus === 'LEADERBOARD'
                            ? 'DISTRIBUTION'
                            : 'LEADERBOARD',
                        )
                      }
                      className={cn(
                        'min-h-10 rounded-xl border px-3.5 py-2 text-xs font-semibold cursor-pointer',
                        snapshot.presenterResultFocus === 'LEADERBOARD'
                          ? 'bg-powder-100 border-burgundy-600 text-burgundy-700'
                          : 'bg-cream-100 border-cream-300 text-navy-900 hover:bg-cream-200',
                      )}
                    >
                      {snapshot.presenterResultFocus === 'LEADERBOARD'
                        ? 'Projeksiyonda Cevap Dağılımını Göster'
                        : 'Projeksiyonda Liderlik Tablosunu Göster'}
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={handleNextQuestion}
                    className="min-h-11 rounded-xl bg-navy-900 hover:bg-navy-950 px-6 py-2.5 text-sm font-semibold text-cream-50 cursor-pointer disabled:opacity-60"
                  >
                    {snapshot.lastQuestionResult.isLastQuestion
                      ? 'Final Sonuçlarını Göster'
                      : 'Sonraki Soru'}
                  </button>
                </div>
              </section>

              <section className="lg:col-span-6 rounded-2xl bg-cream-50 border border-cream-300 p-6 shadow-card space-y-4">
                <h2 className="font-display font-bold text-lg text-navy-900">
                  Güncel Liderlik Tablosu
                </h2>
                <LeaderboardTable
                  entries={snapshot.lastQuestionResult.leaderboard}
                  previousRanks={previousRanks}
                  showWrongCount
                />
              </section>
            </motion.div>
          ) : snapshot.phase === 'FINISHED' && snapshot.finalResult ? (
            <motion.div key={phaseKey} {...phaseTransitionProps} className="space-y-6">
              <section className="rounded-2xl bg-cream-50 border border-cream-300 p-6 sm:p-8 shadow-card space-y-6">
                <div className="text-center">
                  <span className="inline-flex items-center rounded-full bg-powder-100 border border-powder-200 px-3 py-1 text-xs font-semibold text-burgundy-600">
                    Yarışma Tamamlandı
                  </span>
                  <h1
                    className="mt-3 font-display font-extrabold text-navy-900"
                    style={{
                      fontSize: 'var(--text-h1)',
                      lineHeight: 'var(--leading-h1)',
                    }}
                  >
                    Oyun Sonuçları
                  </h1>
                  <p className="mt-1 text-sm text-navy-600">
                    {snapshot.finalResult.quizTitle} · Sonuçlar veritabanına kaydedildi.
                  </p>
                </div>

                <PodiumView
                  podium={snapshot.finalResult.podium}
                  onWinnerRevealed={handleWinnerRevealed}
                />
              </section>

              <section className="rounded-2xl bg-cream-50 border border-cream-300 p-6 shadow-card space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display font-bold text-lg text-navy-900">
                    Tüm Oyuncu Sonuçları ({snapshot.finalResult.leaderboard.length})
                  </h2>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      disabled={downloadingCsv}
                      onClick={() => void handleDownloadCsv()}
                      className="inline-flex items-center gap-1.5 min-h-10 rounded-xl border border-navy-900 bg-navy-900 hover:bg-navy-950 px-4 py-2 text-xs sm:text-sm font-semibold text-cream-50 cursor-pointer disabled:opacity-60"
                    >
                      <DownloadIcon className="h-4 w-4" />
                      <span>{downloadingCsv ? 'Hazırlanıyor...' : 'CSV Olarak İndir'}</span>
                    </button>
                    <Link
                      to="/dashboard/history"
                      className="rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-4 py-2 text-xs sm:text-sm font-semibold text-navy-900"
                    >
                      Geçmiş Yarışmalar
                    </Link>
                    <Link
                      to="/dashboard/quizzes"
                      className="rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-4 py-2 text-xs sm:text-sm font-semibold text-cream-50"
                    >
                      Quizlerime Dön
                    </Link>
                  </div>
                </div>

                <LeaderboardTable
                  entries={snapshot.finalResult.leaderboard}
                  previousRanks={previousRanks}
                  showWrongCount
                  showResponseTime
                />
              </section>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </main>

      <ConfirmDialog
        open={cancelDialogOpen}
        title="Oyun oturumunu iptal etmek istediğinize emin misiniz?"
        description="Bekleme odasındaki tüm katılımcıların bağlantısı kesilecek ve bu PIN kodu kapatılacaktır."
        confirmLabel="Evet, Oturumu İptal Et"
        cancelLabel="Vazgeç"
        variant="danger"
        busy={busyAction}
        onConfirm={handleCancelGame}
        onCancel={() => setCancelDialogOpen(false)}
      />

      <ConfirmDialog
        open={endGameDialogOpen}
        title="Yarışmayı şimdi sonlandırmak istediğinize emin misiniz?"
        description="O ana kadar toplanan puanlar ve cevaplar kesinleştirilerek veritabanına kaydedilecek ve tüm oyunculara final sonuçları gösterilecektir."
        confirmLabel="Evet, Yarışmayı Sonlandır"
        cancelLabel="Devam Et"
        variant="danger"
        busy={busyAction}
        onConfirm={handleEndGame}
        onCancel={() => setEndGameDialogOpen(false)}
      />
    </div>
  );
}
