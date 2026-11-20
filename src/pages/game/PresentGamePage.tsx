import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import QRCode from 'qrcode';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { QUESTION_TYPE_LABELS } from '@shared/quizTypes';
import type { PresenterSessionSnapshot } from '@shared/gameTypes';
import { QuizoraLogo } from '@/components/brand/QuizoraLogo';
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
  MaximizeIcon,
  MinimizeIcon,
  MonitorIcon,
  UsersIcon,
} from '@/components/ui/Icons';
import { SafeImage } from '@/components/ui/SafeImage';
import { buildGameJoinUrl, resolveMediaUrl } from '@/config/runtime';
import { useGameSound } from '@/hooks/useGameSound';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import {
  createGameSocket,
  measureClockOffset,
} from '@/services/gameSocket';
import { soundManager } from '@/services/soundManager';
import { cn } from '@/utils/cn';
import {
  clearPresenterToken,
  formatPinDisplay,
  readPresenterToken,
  savePresenterToken,
} from '@/utils/gameStorage';

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

export function PresentGamePage() {
  const { pin = '' } = useParams<{ pin: string }>();
  const [searchParams] = useSearchParams();
  const tokenFromQuery = searchParams.get('token');

  const reducedMotion = usePrefersReducedMotion();
  const { playSound } = useGameSound();
  const playSoundRef = useRef(playSound);
  playSoundRef.current = playSound;

  const [snapshot, setSnapshot] = useState<PresenterSessionSnapshot | null>(null);
  const [previousRanks, setPreviousRanks] = useState<Record<string, number>>({});
  const [confettiActive, setConfettiActive] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [connectionLost, setConnectionLost] = useState(false);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isOnline = useNetworkStatus();
  const rootRef = useRef<HTMLDivElement>(null);
  const lastVisibilitySyncRef = useRef(0);

  // Pencere bazlı ses kapsamı: aynı bilgisayarda açık öğretmen ve projeksiyon pencerelerinin aynı anda ses çalmasını önlemek için projeksiyon penceresi bağımsız (varsayılan kapalı) ses kapsamı kullanır
  useEffect(() => {
    soundManager.setWindowScope(`presenter:${pin}`, false);
    return () => {
      soundManager.setWindowScope(null, true);
    };
  }, [pin]);

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
        const target = rootRef.current ?? document.documentElement;
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

  const presenterToken = tokenFromQuery || readPresenterToken(pin);
  const joinUrl = buildGameJoinUrl(pin);

  useEffect(() => {
    if (tokenFromQuery && /^\d{6}$/.test(pin)) {
      savePresenterToken(pin, tokenFromQuery);
    }
  }, [pin, tokenFromQuery]);

  useEffect(() => {
    if (!pin || !/^\d{6}$/.test(pin)) return;

    let active = true;
    QRCode.toDataURL(joinUrl, {
      width: 260,
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

    if (!presenterToken) {
      setAuthError(
        'Projeksiyon görünümü için geçerli bir sunum belirteci bulunamadı. Lütfen öğretmen kontrol ekranından projeksiyon görünümünü açın.',
      );
      return;
    }

    const socket = createGameSocket();

    const attachAsPresenter = () => {
      void measureClockOffset(socket).then((offset) => {
        setClockOffsetMs(offset);
      });

      socket.emit('presenter:attach', { pin, presenterToken }, (res) => {
        if (!res.ok) {
          setAuthError(res.message);
          return;
        }
        setAuthError(null);
        setConnectionLost(false);
        setSnapshot(res.snapshot);
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || !socket.connected) return;
      const now = Date.now();
      if (now - lastVisibilitySyncRef.current < 800) return;
      lastVisibilitySyncRef.current = now;
      attachAsPresenter();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    socket.on('connect', attachAsPresenter);

    socket.on('disconnect', () => {
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
        `Soru ${result.questionIndex + 1} tamamlandı. Cevap dağılımı ve sınıf sıralaması gösteriliyor.`,
      );
      setSnapshot((prev) =>
        prev
          ? {
              ...prev,
              phase: 'QUESTION_RESULT',
              isPaused: false,
              pausedRemainingMs: null,
              questionEndsAtMs: null,
              lastQuestionResult: {
                ...result,
                leaderboard: result.leaderboard.slice(0, 10),
              },
            }
          : prev,
      );
    });

    socket.on('game:presenter_focus', ({ focus }) => {
      setSnapshot((prev) =>
        prev ? { ...prev, presenterResultFocus: focus } : prev,
      );
    });

    socket.on('presenter:revoked', ({ message }) => {
      clearPresenterToken(pin);
      setAuthError(message);
    });

    socket.on('game:finished', (finalResult) => {
      setLiveAnnouncement('Yarışma tamamlandı. Final podyumu gösteriliyor.');
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
          isPaused: false,
          pausedRemainingMs: null,
          questionEndsAtMs: null,
          finalResult: {
            ...finalResult,
            leaderboard: finalResult.leaderboard.slice(0, 10),
          },
        };
      });
    });

    socket.on('game:cancelled', ({ message }) => {
      clearPresenterToken(pin);
      setAuthError(message);
    });

    socket.connect();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [pin, presenterToken]);

  const handleCountdownTick = useCallback(() => {
    playSoundRef.current('countdownTick');
  }, []);

  const handleWinnerRevealed = useCallback(() => {
    setConfettiActive(true);
    playSoundRef.current('podiumCelebration');
  }, []);

  if (authError) {
    return (
      <div className="min-h-dvh bg-cream-100 text-navy-900 flex flex-col">
        <header className="bg-cream-50 border-b border-cream-300 px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
            <Link to="/">
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
              Projeksiyon Bağlantısı Kurulamadı
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-navy-600">
              {authError}
            </p>
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
        ? `result-${snapshot.lastQuestionResult?.questionIndex ?? snapshot.questionIndex}-${snapshot.presenterResultFocus}`
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

  const progressRatio =
    snapshot && snapshot.totalQuestions > 0 && snapshot.questionIndex >= 0
      ? Math.min(1, (snapshot.questionIndex + 1) / snapshot.totalQuestions)
      : 0;

  return (
    <div
      ref={rootRef}
      className="min-h-dvh flex flex-col bg-cream-100 text-navy-900 overflow-x-clip"
    >
      <CelebrationConfetti active={confettiActive} />

      <div role="status" aria-live="polite" className="sr-only">
        {liveAnnouncement}
      </div>

      {/* Projeksiyon Üst Bilgi Çubuğu (Yönetim kontrolü içermez) */}
      <header className="bg-cream-50 border-b border-cream-300">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 min-h-18 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <QuizoraLogo size="md" />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-powder-100 border border-powder-200 px-3 py-1 text-xs sm:text-sm font-bold text-burgundy-700">
              <MonitorIcon className="h-4 w-4" />
              <span>Sınıf Projeksiyon Görünümü</span>
            </span>
            {snapshot && (
              <span className="hidden lg:inline-flex items-center font-display font-bold text-base text-navy-900 truncate max-w-md">
                {snapshot.quizTitle}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {snapshot && (
              <>
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-cream-100 border border-cream-300 px-3.5 py-1.5 text-xs sm:text-sm font-bold tabular-nums text-navy-800">
                  <UsersIcon className="h-4 w-4 text-burgundy-600" />
                  <span>{snapshot.connectedCount} Oyuncu</span>
                </span>
                {(snapshot.phase === 'QUESTION' ||
                  snapshot.phase === 'QUESTION_RESULT') && (
                  <span className="inline-flex items-center rounded-xl bg-powder-100 border border-powder-200 px-3.5 py-1.5 text-xs sm:text-sm font-bold tabular-nums text-burgundy-700">
                    Soru {snapshot.questionIndex + 1} / {snapshot.totalQuestions}
                  </span>
                )}
                <span className="inline-flex items-center rounded-xl bg-navy-900 px-3.5 py-1.5 text-xs sm:text-sm font-extrabold tabular-nums text-cream-50">
                  PIN: {formatPinDisplay(snapshot.pin)}
                </span>
              </>
            )}

            <button
              type="button"
              onClick={() => void handleToggleFullscreen()}
              className="inline-flex items-center gap-1.5 min-h-10 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-3.5 py-2 text-xs sm:text-sm font-semibold text-navy-900 cursor-pointer"
            >
              {isFullscreen ? (
                <MinimizeIcon className="h-4 w-4" />
              ) : (
                <MaximizeIcon className="h-4 w-4" />
              )}
              <span>{isFullscreen ? 'Tam Ekrandan Çık' : 'Tam Ekran'}</span>
            </button>

            <SoundToggleButton />
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
            ? 'İnternet bağlantısı kesildi. Bağlantı sağlandığında projeksiyon otomatik güncellenecektir.'
            : 'Sunucu bağlantısı koptu. Projeksiyon görünümü yeniden bağlanıyor...'}
        </div>
      )}

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-10 flex flex-col justify-center">
        <AnimatePresence mode="wait">
          {!snapshot ? (
            <motion.div
              key="loading"
              {...phaseTransitionProps}
              className="rounded-3xl bg-cream-50 border border-cream-300 p-12 text-center shadow-card"
            >
              <p className="font-display font-bold text-xl text-navy-900">
                Projeksiyon görünümü senkronize ediliyor...
              </p>
            </motion.div>
          ) : snapshot.phase === 'LOBBY' ? (
            <motion.div
              key={phaseKey}
              {...phaseTransitionProps}
              className="grid gap-8 lg:grid-cols-12 items-center"
            >
              <section className="lg:col-span-5 rounded-3xl bg-cream-50 border-2 border-cream-300 p-8 shadow-card text-center space-y-6">
                <span className="inline-flex items-center rounded-full bg-powder-100 border border-powder-200 px-4 py-1 text-sm font-bold text-burgundy-600">
                  {snapshot.quizCategory}
                </span>
                <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-navy-900">
                  {snapshot.quizTitle}
                </h1>

                <div className="rounded-2xl bg-powder-100/80 border border-powder-200 p-5">
                  <p className="text-xs sm:text-sm font-bold uppercase tracking-wider text-navy-600">
                    Oyuna Katılım Kodu (PIN)
                  </p>
                  <p className="mt-2 font-display font-extrabold text-5xl sm:text-6xl tracking-[0.08em] tabular-nums text-burgundy-700">
                    {formatPinDisplay(snapshot.pin)}
                  </p>
                </div>

                {qrDataUrl && (
                  <div className="mx-auto inline-block rounded-2xl bg-cream-50 border border-cream-300 p-4 shadow-sm">
                    <img
                      src={qrDataUrl}
                      alt={`${snapshot.pin} kodlu oyuna katılım QR kodu`}
                      className="w-56 h-56 mx-auto"
                    />
                  </div>
                )}

                <p className="text-sm font-semibold text-navy-700">
                  Telefonunuzdan <strong>/join</strong> adresine girin veya QR kodu okutun
                </p>
              </section>

              <section className="lg:col-span-7 rounded-3xl bg-cream-50 border-2 border-cream-300 p-8 shadow-card space-y-6">
                <div className="flex items-center justify-between gap-4 border-b border-cream-300 pb-4">
                  <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-navy-900">
                    Sınıftaki Katılımcılar ({snapshot.participants.length})
                  </h2>
                  <span className="inline-flex items-center rounded-xl bg-powder-100 border border-powder-200 px-3.5 py-1.5 text-sm font-bold text-burgundy-700 tabular-nums">
                    {snapshot.connectedCount} Çevrimiçi
                  </span>
                </div>

                {snapshot.participants.length === 0 ? (
                  <div className="py-16 text-center space-y-2">
                    <p className="font-display font-bold text-xl text-navy-900">
                      Öğrencilerin katılması bekleniyor...
                    </p>
                    <p className="text-base text-navy-600">
                      PIN kodunu giren öğrencilerin isimleri ekranda anlık olarak belirecektir.
                    </p>
                  </div>
                ) : (
                  <ul className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                    {snapshot.participants.map((player) => (
                      <li
                        key={player.id}
                        className="rounded-2xl bg-cream-100 border border-cream-300 px-4 py-3.5 flex items-center gap-3"
                      >
                        <span
                          aria-hidden="true"
                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-burgundy-600 font-display font-bold text-base text-cream-50 uppercase"
                        >
                          {player.nickname.slice(0, 1)}
                        </span>
                        <span className="truncate font-display font-bold text-base sm:text-lg text-navy-900">
                          {player.nickname}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </motion.div>
          ) : snapshot.phase === 'COUNTDOWN' ? (
            <motion.div
              key={phaseKey}
              {...phaseTransitionProps}
              className="rounded-3xl bg-powder-300 border-2 border-powder-400 p-12 sm:p-16 text-center shadow-card"
            >
              <p className="text-base sm:text-lg font-bold uppercase tracking-wide text-navy-700">
                {snapshot.quizTitle}
              </p>
              <h1 className="mt-4 font-display font-extrabold text-3xl sm:text-5xl text-navy-900">
                Yarışma Başlıyor!
              </h1>
              <div className="my-6">
                <SyncedBigCountdown
                  endsAtMs={snapshot.countdownEndsAtMs}
                  totalDurationMs={3000}
                  clockOffsetMs={clockOffsetMs}
                  onTick={handleCountdownTick}
                />
              </div>
              <p className="text-base sm:text-lg font-semibold text-navy-800">
                Toplam {snapshot.totalQuestions} Soru · {snapshot.connectedCount} Oyuncu Hazır
              </p>
            </motion.div>
          ) : snapshot.phase === 'QUESTION' && snapshot.currentQuestion ? (
            <motion.div
              key={phaseKey}
              {...phaseTransitionProps}
              className="rounded-3xl bg-cream-50 border-2 border-cream-300 p-6 sm:p-10 shadow-card space-y-6"
            >
              {/* Soru İlerleme Göstergesi ve Sayaç */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="inline-flex items-center rounded-xl bg-navy-900 px-4 py-1.5 text-sm sm:text-base font-extrabold tabular-nums text-cream-50">
                      Soru {snapshot.currentQuestion.index + 1} /{' '}
                      {snapshot.currentQuestion.totalQuestions}
                    </span>
                    <span className="inline-flex items-center rounded-xl bg-powder-100 border border-powder-200 px-3.5 py-1.5 text-xs sm:text-sm font-bold text-burgundy-700">
                      {QUESTION_TYPE_LABELS[snapshot.currentQuestion.type]}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center rounded-xl bg-powder-100 border border-powder-200 px-4 py-1.5 text-sm sm:text-base font-extrabold tabular-nums text-burgundy-700">
                      Cevaplayan: {snapshot.answeredCount} / {snapshot.connectedCount}
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

                {/* Soru İlerleme Çubuğu + Süre Çubuğu */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                  <div className="sm:col-span-3">
                    <div
                      aria-label={`Soru ilerlemesi ${snapshot.currentQuestion.index + 1} / ${snapshot.currentQuestion.totalQuestions}`}
                      className="h-2 w-full rounded-full bg-cream-200 overflow-hidden"
                    >
                      <div
                        className="h-full bg-navy-900 rounded-full transition-all duration-300"
                        style={{ width: `${Math.round(progressRatio * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-9">
                    <SyncedProgressBar
                      endsAtMs={snapshot.questionEndsAtMs}
                      totalDurationMs={snapshot.currentQuestion.timeLimitSec * 1000}
                      clockOffsetMs={clockOffsetMs}
                      isPaused={snapshot.isPaused}
                      pausedRemainingMs={snapshot.pausedRemainingMs}
                    />
                  </div>
                </div>
              </div>

              {snapshot.isPaused && (
                <div
                  role="status"
                  className="rounded-2xl bg-powder-100 border-2 border-burgundy-600 p-4 text-center font-display font-bold text-lg text-burgundy-800"
                >
                  Soru Öğretmen Tarafından Duraklatıldı
                </div>
              )}

              {snapshot.currentQuestion.imageUrl && (
                <div className="overflow-hidden rounded-2xl border border-cream-300 bg-cream-100 max-h-80">
                  <SafeImage
                    src={resolveMediaUrl(snapshot.currentQuestion.imageUrl)}
                    alt={`Soru ${snapshot.currentQuestion.index + 1} görseli`}
                    fetchPriority="high"
                    className="w-full max-h-80 object-contain"
                    fallbackClassName="rounded-none"
                  />
                </div>
              )}

              {/* Büyük Projeksiyon Soru Metni */}
              <h1 className="font-display font-extrabold text-2xl sm:text-4xl lg:text-5xl leading-tight text-navy-900 py-2 break-words">
                {snapshot.currentQuestion.text}
              </h1>

              {/* Büyük Projeksiyon Cevap Seçenekleri (Doğru cevap soru bitmeden açıklanmaz) */}
              <div className="grid gap-4 sm:grid-cols-2">
                {snapshot.currentQuestion.options.map((opt, idx) => (
                  <div
                    key={opt.id}
                    className="rounded-2xl border-2 border-cream-300 bg-cream-100 px-6 py-5 sm:py-6 font-display font-bold text-xl sm:text-2xl lg:text-3xl text-navy-900 flex items-center gap-4"
                  >
                    {snapshot.currentQuestion?.type !== 'TRUE_FALSE' && (
                      <span className="inline-flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-burgundy-600 text-base sm:text-lg font-extrabold text-cream-50">
                        {snapshot.currentQuestion?.type === 'ORDERING'
                          ? idx + 1
                          : OPTION_LETTERS[idx] ?? idx + 1}
                      </span>
                    )}
                    <span className="break-words">{opt.text}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : snapshot.phase === 'QUESTION_RESULT' && snapshot.lastQuestionResult ? (
            <motion.div
              key={phaseKey}
              {...phaseTransitionProps}
              className="space-y-6"
            >
              {snapshot.presenterResultFocus === 'LEADERBOARD' ? (
                <section className="rounded-3xl bg-cream-50 border-2 border-cream-300 p-6 sm:p-10 shadow-card space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-cream-300 pb-4">
                    <div>
                      <span className="inline-flex items-center rounded-full bg-powder-100 border border-powder-200 px-3.5 py-1 text-xs sm:text-sm font-bold text-burgundy-700">
                        Soru {snapshot.lastQuestionResult.questionIndex + 1} Sonrası Sıralama
                      </span>
                      <h1 className="mt-2 font-display font-extrabold text-2xl sm:text-4xl text-navy-900">
                        Sınıf Liderlik Tablosu (İlk 10)
                      </h1>
                    </div>
                  </div>

                  <LeaderboardTable
                    entries={snapshot.lastQuestionResult.leaderboard.slice(0, 10)}
                    previousRanks={previousRanks}
                    limit={10}
                    showWrongCount
                  />
                </section>
              ) : (
                <div className="grid gap-6 lg:grid-cols-12 items-start">
                  <section className="lg:col-span-7 rounded-3xl bg-cream-50 border-2 border-cream-300 p-6 sm:p-8 shadow-card space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center rounded-xl bg-navy-900 px-3.5 py-1 text-xs sm:text-sm font-bold text-cream-50">
                        Soru {snapshot.lastQuestionResult.questionIndex + 1} /{' '}
                        {snapshot.lastQuestionResult.totalQuestions} Sonucu
                      </span>
                      <span className="inline-flex items-center rounded-xl bg-powder-100 border border-powder-200 px-3 py-1 text-xs sm:text-sm font-bold text-burgundy-700">
                        {QUESTION_TYPE_LABELS[snapshot.lastQuestionResult.questionType]}
                      </span>
                    </div>

                    {snapshot.currentQuestion && (
                      <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-navy-900">
                        {snapshot.currentQuestion.text}
                      </h1>
                    )}

                    <ul className="space-y-3.5">
                      {snapshot.lastQuestionResult.optionStats.map((stat, idx) => {
                        const totalVotes =
                          snapshot.lastQuestionResult!.optionStats.reduce(
                            (sum, item) => sum + item.count,
                            0,
                          );
                        const denominator =
                          snapshot.lastQuestionResult!.questionType === 'MULTI_SELECT' ||
                          snapshot.lastQuestionResult!.questionType === 'ORDERING'
                            ? Math.max(0, snapshot.lastQuestionResult!.totalResponders)
                            : totalVotes;
                        const pct =
                          denominator > 0
                            ? Math.round((stat.count / denominator) * 100)
                            : 0;

                        return (
                          <li
                            key={stat.optionId}
                            className={cn(
                              'rounded-2xl border-2 p-4 sm:p-5',
                              stat.isCorrect
                                ? 'bg-burgundy-600 border-burgundy-700 text-cream-50'
                                : 'bg-cream-100 border-cream-300 text-navy-900',
                            )}
                          >
                            <div className="flex items-center justify-between gap-3 text-base sm:text-xl font-bold">
                              <span className="inline-flex items-center gap-3 min-w-0">
                                {snapshot.lastQuestionResult!.questionType !==
                                  'TRUE_FALSE' && (
                                  <span className="text-sm sm:text-base font-extrabold">
                                    {snapshot.lastQuestionResult!.questionType ===
                                    'ORDERING'
                                      ? `${idx + 1}.`
                                      : OPTION_LETTERS[idx] ?? idx + 1}
                                  </span>
                                )}
                                <span className="break-words">{stat.text}</span>
                                {stat.isCorrect && (
                                  <span className="inline-flex items-center gap-1 rounded-lg bg-cream-50/20 px-2.5 py-0.5 text-xs font-extrabold shrink-0">
                                    <CheckIcon className="h-4 w-4" />
                                    <span>Doğru Cevap</span>
                                  </span>
                                )}
                              </span>
                              <span className="tabular-nums shrink-0">
                                {stat.count} öğrenci ({pct}%)
                              </span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>

                    {snapshot.lastQuestionResult.explanation && (
                      <div className="rounded-2xl bg-powder-100 border border-powder-200 p-4 text-sm sm:text-base text-navy-900">
                        <strong className="font-display font-bold text-burgundy-700">
                          Açıklama:{' '}
                        </strong>
                        {snapshot.lastQuestionResult.explanation}
                      </div>
                    )}
                  </section>

                  <section className="lg:col-span-5 rounded-3xl bg-cream-50 border-2 border-cream-300 p-6 sm:p-8 shadow-card space-y-4">
                    <h2 className="font-display font-extrabold text-xl sm:text-2xl text-navy-900">
                      İlk 10 Liderlik Tablosu
                    </h2>
                    <LeaderboardTable
                      entries={snapshot.lastQuestionResult.leaderboard.slice(0, 10)}
                      previousRanks={previousRanks}
                      limit={10}
                    />
                  </section>
                </div>
              )}
            </motion.div>
          ) : snapshot.phase === 'FINISHED' && snapshot.finalResult ? (
            <motion.div
              key={phaseKey}
              {...phaseTransitionProps}
              className="space-y-8"
            >
              <section className="rounded-3xl bg-cream-50 border-2 border-cream-300 p-8 sm:p-10 shadow-card space-y-6">
                <div className="text-center">
                  <span className="inline-flex items-center rounded-full bg-powder-100 border border-powder-200 px-4 py-1 text-sm font-bold text-burgundy-600">
                    Yarışma Tamamlandı
                  </span>
                  <h1 className="mt-3 font-display font-extrabold text-3xl sm:text-5xl text-navy-900">
                    Oyun Sonuçları ve Final Podyumu
                  </h1>
                  <p className="mt-1.5 text-base text-navy-600">
                    {snapshot.finalResult.quizTitle}
                  </p>
                </div>

                <PodiumView
                  podium={snapshot.finalResult.podium}
                  onWinnerRevealed={handleWinnerRevealed}
                />
              </section>

              <section className="rounded-3xl bg-cream-50 border-2 border-cream-300 p-6 sm:p-8 shadow-card space-y-4">
                <h2 className="font-display font-extrabold text-2xl text-navy-900">
                  Sınıf Sıralaması (İlk 10)
                </h2>
                <LeaderboardTable
                  entries={snapshot.finalResult.leaderboard.slice(0, 10)}
                  previousRanks={previousRanks}
                  limit={10}
                  showWrongCount
                />
              </section>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </main>
    </div>
  );
}
