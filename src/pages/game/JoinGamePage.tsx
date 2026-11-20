import { useEffect, useRef, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { ValidatePinResponse } from '@shared/gameTypes';
import { QuizoraLogo } from '@/components/brand/QuizoraLogo';
import { AlertCircleIcon, ChevronLeftIcon } from '@/components/ui/Icons';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { validateGamePin } from '@/services/gameApi';
import { createGameSocket, type GameSocket } from '@/services/gameSocket';
import { ApiError } from '@/services/quizApi';
import { formatPinDisplay, savePlayerToken } from '@/utils/gameStorage';

export function JoinGamePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialPin = (searchParams.get('pin') ?? '').replace(/\D/g, '').slice(0, 6);

  const isOnline = useNetworkStatus();
  const [pin, setPin] = useState(initialPin);
  const [roomInfo, setRoomInfo] = useState<ValidatePinResponse | null>(null);
  const [nickname, setNickname] = useState('');
  const [validating, setValidating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeSocketRef = useRef<GameSocket | null>(null);
  const joinTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (joinTimeoutRef.current !== null) {
        window.clearTimeout(joinTimeoutRef.current);
        joinTimeoutRef.current = null;
      }
      if (activeSocketRef.current) {
        activeSocketRef.current.removeAllListeners();
        activeSocketRef.current.disconnect();
        activeSocketRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (initialPin.length !== 6) return;

    let active = true;
    setValidating(true);
    setError(null);

    validateGamePin(initialPin)
      .then((info) => {
        if (active) setRoomInfo(info);
      })
      .catch((err) => {
        if (active) {
          setRoomInfo(null);
          setError(
            err instanceof ApiError
              ? err.message
              : 'Oyun odası doğrulanırken bir hata oluştu.',
          );
        }
      })
      .finally(() => {
        if (active) setValidating(false);
      });

    return () => {
      active = false;
    };
  }, [initialPin]);

  const handleValidatePin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const clean = pin.replace(/\D/g, '');
    if (clean.length !== 6) {
      setError('Lütfen 6 haneli oyun PIN kodunu eksiksiz girin.');
      return;
    }

    setValidating(true);
    setError(null);
    try {
      const info = await validateGamePin(clean);
      setRoomInfo(info);
    } catch (err) {
      setRoomInfo(null);
      setError(
        err instanceof ApiError
          ? err.message
          : 'Oyun odası doğrulanırken bir hata oluştu.',
      );
    } finally {
      setValidating(false);
    }
  };

  const handleJoinRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!roomInfo) return;

    const cleanName = nickname.trim();
    if (cleanName.length < 2 || cleanName.length > 24) {
      setError('Kullanıcı adı en az 2, en fazla 24 karakter olmalıdır.');
      return;
    }

    if (joinTimeoutRef.current !== null) {
      window.clearTimeout(joinTimeoutRef.current);
      joinTimeoutRef.current = null;
    }
    if (activeSocketRef.current) {
      activeSocketRef.current.removeAllListeners();
      activeSocketRef.current.disconnect();
      activeSocketRef.current = null;
    }

    setJoining(true);
    setError(null);

    const socket = createGameSocket();
    activeSocketRef.current = socket;

    const cleanupSocket = () => {
      if (joinTimeoutRef.current !== null) {
        window.clearTimeout(joinTimeoutRef.current);
        joinTimeoutRef.current = null;
      }
      socket.removeAllListeners();
      socket.disconnect();
      if (activeSocketRef.current === socket) {
        activeSocketRef.current = null;
      }
    };

    const finishWithError = (message: string) => {
      cleanupSocket();
      setJoining(false);
      setError(message);
    };

    joinTimeoutRef.current = window.setTimeout(() => {
      finishWithError('Bağlantı zaman aşımına uğradı. Lütfen tekrar deneyin.');
    }, 8000);

    socket.on('connect_error', () => {
      finishWithError('Gerçek zamanlı sunucuya bağlanılamadı.');
    });

    socket.on('connect', () => {
      socket.emit(
        'player:join',
        { pin: roomInfo.pin, nickname: cleanName },
        (res) => {
          cleanupSocket();

          if (!res.ok) {
            setJoining(false);
            setError(res.message);
            return;
          }

          savePlayerToken(roomInfo.pin, res.reconnectToken);
          navigate(`/play/${roomInfo.pin}`);
        },
      );
    });

    socket.connect();
  };

  return (
    <div className="min-h-dvh flex flex-col bg-powder-300 text-navy-900 overflow-x-clip">
      <header className="px-5 sm:px-8 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <Link to="/" className="rounded-lg">
            <QuizoraLogo size="md" />
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-xl border border-navy-900/20 bg-cream-50/55 hover:bg-cream-50/85 px-3.5 py-2 text-xs sm:text-sm font-semibold text-navy-900"
          >
            <ChevronLeftIcon />
            <span>Ana Sayfa</span>
          </Link>
        </div>
      </header>

      {!isOnline && (
        <div
          role="alert"
          aria-live="assertive"
          className="bg-burgundy-600 text-cream-50 px-4 py-2 text-center text-xs sm:text-sm font-semibold"
        >
          İnternet bağlantınız kesildi. Lütfen bağlantınızı kontrol edin.
        </div>
      )}

      <main className="flex-1 flex items-center justify-center px-3 sm:px-4 py-6 sm:py-8">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-md rounded-3xl bg-cream-50 border border-cream-300 p-6 sm:p-8 shadow-card"
        >
          <div className="text-center">
            <h1
              className="font-display font-extrabold text-navy-900"
              style={{ fontSize: 'var(--text-h1)', lineHeight: 'var(--leading-h1)' }}
            >
              Oyuna Katıl
            </h1>
            <p className="mt-2 text-sm text-navy-600">
              Öğretmeninin paylaştığı 6 haneli PIN kodunu gir ve yarışmaya katıl.
            </p>
          </div>

          {error && (
            <div
              id="join-error-alert"
              role="alert"
              className="mt-5 rounded-xl bg-burgundy-50 border border-burgundy-500 px-4 py-3 flex items-start gap-2.5 text-xs sm:text-sm font-medium text-burgundy-800"
            >
              <AlertCircleIcon className="h-4 w-4 mt-0.5 shrink-0 text-burgundy-600" />
              <span>{error}</span>
            </div>
          )}

          {!roomInfo ? (
            <form
              onSubmit={(event) => void handleValidatePin(event)}
              noValidate
              className="mt-6 space-y-5"
            >
              <div>
                <label
                  htmlFor="game-pin"
                  className="block text-sm font-semibold text-navy-900"
                >
                  6 Haneli Oyun PIN Kodu
                </label>
                <input
                  id="game-pin"
                  name="pin"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'join-error-alert' : undefined}
                  value={pin}
                  onChange={(event) => {
                    setError(null);
                    setPin(event.target.value.replace(/\D/g, '').slice(0, 6));
                  }}
                  placeholder="482915"
                  className="mt-2 w-full min-h-14 rounded-xl border border-cream-300 bg-cream-100 px-3 sm:px-4 py-3 text-center font-display font-extrabold text-2xl sm:text-3xl tracking-[0.2em] sm:tracking-[0.35em] tabular-nums text-navy-900 placeholder:text-navy-500/45 focus:border-burgundy-600"
                />
              </div>

              <button
                type="submit"
                disabled={validating}
                className="w-full min-h-12 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-5 py-3 text-base font-semibold text-cream-50 transition-colors duration-150 cursor-pointer disabled:opacity-60"
              >
                {validating ? 'Oda Kontrol Ediliyor...' : 'Devam Et'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleJoinRoom} noValidate className="mt-6 space-y-5">
              <div className="rounded-xl bg-powder-100 border border-powder-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-burgundy-600">
                  <span>{roomInfo.quizCategory}</span>
                  <span className="tabular-nums">
                    PIN: {formatPinDisplay(roomInfo.pin)}
                  </span>
                </div>
                <p className="mt-1.5 font-display font-bold text-base text-navy-900">
                  {roomInfo.quizTitle}
                </p>
                <p className="mt-1 text-xs tabular-nums text-navy-700">
                  {roomInfo.questionCount} soru · {roomInfo.participantCount} oyuncu
                  bekleme odasında
                </p>
              </div>

              <div>
                <label
                  htmlFor="player-nickname"
                  className="block text-sm font-semibold text-navy-900"
                >
                  Kullanıcı Adın
                </label>
                <input
                  id="player-nickname"
                  name="nickname"
                  type="text"
                  autoComplete="nickname"
                  required
                  minLength={2}
                  maxLength={24}
                  autoFocus
                  aria-invalid={Boolean(error)}
                  aria-describedby={
                    error ? 'join-error-alert nickname-hint' : 'nickname-hint'
                  }
                  value={nickname}
                  onChange={(event) => {
                    setError(null);
                    setNickname(event.target.value);
                  }}
                  placeholder="Örn. Zeynep"
                  className="mt-1.5 w-full min-h-12 rounded-xl border border-cream-300 bg-cream-100 px-4 py-3 text-base text-navy-900 placeholder:text-navy-500 focus:border-burgundy-600"
                />
                <p id="nickname-hint" className="mt-1.5 text-xs text-navy-500">
                  2–24 karakter arası; aynı odada benzersiz olmalıdır.
                </p>
              </div>

              <div className="flex flex-col gap-2.5">
                <button
                  type="submit"
                  disabled={joining}
                  className="w-full min-h-12 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-5 py-3 text-base font-semibold text-cream-50 transition-colors duration-150 cursor-pointer disabled:opacity-60"
                >
                  {joining ? 'Katılıyor...' : 'Katıl'}
                </button>

                <button
                  type="button"
                  disabled={joining}
                  onClick={() => {
                    setRoomInfo(null);
                    setError(null);
                  }}
                  className="w-full min-h-10 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-4 py-2 text-sm font-semibold text-navy-700 cursor-pointer"
                >
                  Farklı PIN Gir
                </button>
              </div>
            </form>
          )}
        </motion.section>
      </main>
    </div>
  );
}
