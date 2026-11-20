import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from 'motion/react';
import { EASE_OUT_EXPO } from '@/components/home/motion/tokens';
import { CheckIcon, ClockIcon, MonitorIcon } from '@/components/ui/Icons';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { cn } from '@/utils/cn';

interface PreviewOption {
  id: string;
  label: string;
  isCorrect: boolean;
}

const PREVIEW_OPTIONS: readonly PreviewOption[] = [
  { id: 'A', label: 'İstanbul', isCorrect: false },
  { id: 'B', label: 'Ankara', isCorrect: true },
  { id: 'C', label: 'İzmir', isCorrect: false },
  { id: 'D', label: 'Bursa', isCorrect: false },
];

const DEMO_LEADERBOARD_PREVIEW = [
  { rank: 1, name: 'Örnek Oyuncu A', baseScore: 1920, bonus: 920 },
  { rank: 2, name: 'Örnek Oyuncu B', baseScore: 1760, bonus: 850 },
  { rank: 3, name: 'Örnek Oyuncu C', baseScore: 1690, bonus: 800 },
] as const;

/** Parallax yalnızca ince işaretçi + geniş ekran + hareket tercihi açıkken. */
const PARALLAX_QUERY =
  '(pointer: fine) and (hover: hover) and (min-width: 1024px) and (prefers-reduced-motion: no-preference)';

function useParallaxEnabled() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(PARALLAX_QUERY);
    setEnabled(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setEnabled(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return enabled;
}

/** Katman derinlik çarpanına göre en fazla ±6px kayma. */
function useLayerOffset(source: MotionValue<number>, depth: number) {
  return useTransform(source, (v) => v * 6 * depth);
}

const layerEnter = (delay: number, reduced: boolean) =>
  reduced
    ? { initial: false as const }
    : {
        initial: { opacity: 0, y: 22, scale: 0.98 },
        animate: { opacity: 1, y: 0, scale: 1 },
        transition: { duration: 0.55, delay, ease: EASE_OUT_EXPO },
      };

export function QuizPreviewCard() {
  const reducedMotion = usePrefersReducedMotion();
  const parallaxEnabled = useParallaxEnabled();
  const [selectedId, setSelectedId] = useState<string>('B');
  const selectedOption =
    PREVIEW_OPTIONS.find((option) => option.id === selectedId) ?? PREVIEW_OPTIONS[1];

  const rootRef = useRef<HTMLDivElement>(null);
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const springX = useSpring(pointerX, { stiffness: 120, damping: 20, mass: 0.6 });
  const springY = useSpring(pointerY, { stiffness: 120, damping: 20, mass: 0.6 });

  const backX = useLayerOffset(springX, -0.5);
  const backY = useLayerOffset(springY, -0.5);
  const stripX = useLayerOffset(springX, 1);
  const stripY = useLayerOffset(springY, 1);
  const cardX = useLayerOffset(springX, 0.55);
  const cardY = useLayerOffset(springY, 0.55);
  const boardX = useLayerOffset(springX, 0.85);
  const boardY = useLayerOffset(springY, 0.85);

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!parallaxEnabled || event.pointerType !== 'mouse') return;
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    // -1 .. 1 aralığına normalize
    pointerX.set(((event.clientX - rect.left) / rect.width) * 2 - 1);
    pointerY.set(((event.clientY - rect.top) / rect.height) * 2 - 1);
  };

  const resetPointer = () => {
    pointerX.set(0);
    pointerY.set(0);
  };

  const parallaxStyle = (x: MotionValue<number>, y: MotionValue<number>) =>
    parallaxEnabled ? { x, y } : undefined;

  /**
   * Parallax dış sarmalayıcıda, giriş animasyonu iç katmanda: y çakışmaz.
   * Bileşen değil, düz render yardımcısı: her render'da yeniden mount olmaz.
   */
  const renderLayer = (
    x: MotionValue<number>,
    y: MotionValue<number>,
    delay: number,
    className: string,
    children: ReactNode,
  ) => (
    <motion.div style={parallaxStyle(x, y)}>
      <motion.div {...layerEnter(delay, reducedMotion)} className={className}>
        {children}
      </motion.div>
    </motion.div>
  );

  return (
    <div
      ref={rootRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
      data-testid="hero-preview"
      className="relative"
    >
      {/* Arka mimari derinlik çerçevesi (yalnız sm ve üzeri ekranlarda görünür) */}
      <motion.div
        aria-hidden="true"
        {...(reducedMotion
          ? { initial: false as const }
          : {
              initial: { opacity: 0, scale: 0.96 },
              animate: { opacity: 1, scale: 1 },
              transition: { duration: 0.7, delay: 0.05, ease: EASE_OUT_EXPO },
            })}
        style={parallaxStyle(backX, backY)}
        className="hidden sm:block absolute inset-x-4 -top-3 bottom-4 rounded-3xl bg-cream-50/45 border border-navy-900/10"
      />

      <div className="relative space-y-3 sm:space-y-4">
        {/* Katman 1: Üst Oda PIN ve Senkron Geri Sayım Şeridi */}
        {renderLayer(
          stripX,
          stripY,
          0.14,
          'rounded-2xl bg-navy-900 text-cream-50 px-4 py-3 sm:px-5 sm:py-3.5 shadow-card border border-navy-950/60 flex flex-wrap items-center justify-between gap-2.5',
          <>
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-burgundy-600 px-2.5 py-1 text-[11px] font-bold tracking-wider text-cream-50 tabular-nums">
              PIN: 482 910
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-powder-200 truncate">
              <MonitorIcon className="h-3.5 w-3.5 shrink-0" />
              <span>Örnek Sınıf Oturumu</span>
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="inline-flex items-center gap-1 rounded-lg bg-navy-950/70 border border-cream-50/15 px-2.5 py-1 text-xs font-bold tabular-nums text-cream-50">
              <ClockIcon className="h-3.5 w-3.5 text-powder-300" />
              14 sn
            </span>
          </div>
          </>,
        )}

        {/* Katman 2: Ana Etkileşimli Soru Kartı */}
        {renderLayer(
          cardX,
          cardY,
          0.26,
          'bg-cream-50 border border-cream-300 rounded-2xl p-5 sm:p-7 shadow-card',
          <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-lg bg-powder-100 border border-powder-200 px-2.5 py-1 text-xs font-semibold text-burgundy-700">
                Coğrafya
              </span>
              <span className="inline-flex items-center rounded-lg bg-cream-200 border border-cream-300 px-2.5 py-1 text-xs font-semibold tabular-nums text-navy-900">
                Soru 1 / 10
              </span>
            </div>
            <span className="text-xs font-semibold tabular-nums text-navy-600">
              1000 Puan · Demo
            </span>
          </div>

          <div
            aria-hidden="true"
            className="mt-4 h-1.5 w-full rounded-full bg-cream-200 overflow-hidden"
          >
            <motion.div
              initial={reducedMotion ? false : { scaleX: 0 }}
              animate={{ scaleX: 0.6 }}
              transition={{ duration: 0.9, delay: 0.5, ease: EASE_OUT_EXPO }}
              style={{ originX: 0 }}
              className="h-full w-full rounded-full bg-burgundy-600"
            />
          </div>

          <h2
            id="preview-question"
            className="mt-5 font-display font-bold text-lg sm:text-2xl leading-snug text-navy-900"
          >
            Türkiye&apos;nin başkenti hangisidir?
          </h2>

          <div
            role="group"
            aria-labelledby="preview-question"
            className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3"
          >
            {PREVIEW_OPTIONS.map((option) => {
              const isSelected = option.id === selectedId;

              return (
                <motion.button
                  key={option.id}
                  type="button"
                  aria-pressed={isSelected}
                  whileTap={reducedMotion ? undefined : { scale: 0.98 }}
                  transition={{ duration: 0.14 }}
                  onClick={() => setSelectedId(option.id)}
                  className={cn(
                    'q-focus min-h-12 w-full rounded-xl border px-3.5 py-3 text-start font-display font-semibold text-sm sm:text-base flex items-center justify-between gap-2.5 transition-colors duration-200 cursor-pointer',
                    isSelected
                      ? 'bg-burgundy-600 border-burgundy-700 text-cream-50'
                      : 'bg-cream-200 border-cream-300 text-navy-900 hover:bg-powder-100 hover:border-powder-500',
                  )}
                >
                  <span className="inline-flex items-center gap-2.5 min-w-0">
                    <span
                      className={cn(
                        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors duration-200',
                        isSelected
                          ? 'bg-burgundy-800 text-powder-100'
                          : 'bg-cream-50 border border-cream-300 text-navy-700',
                      )}
                    >
                      {option.id}
                    </span>
                    <span className="truncate">{option.label}</span>
                  </span>
                  <AnimatePresence initial={false}>
                    {isSelected && (
                      <motion.span
                        key="check"
                        initial={reducedMotion ? false : { scale: 0.4, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={reducedMotion ? undefined : { scale: 0.4, opacity: 0 }}
                        transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
                        className="inline-flex shrink-0"
                      >
                        <CheckIcon className="h-4 w-4" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </div>

          <div
            aria-live="polite"
            className="mt-4 pt-3.5 border-t border-cream-300 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm"
          >
            <p className="text-navy-600">
              Seçili cevap:{' '}
              <span className="font-semibold text-navy-900">{selectedOption.label}</span>
            </p>
            <motion.span
              key={selectedOption.isCorrect ? 'correct' : 'neutral'}
              initial={reducedMotion ? false : { scale: 0.9, opacity: 0.4 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
              className={cn(
                'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors duration-200',
                selectedOption.isCorrect
                  ? 'bg-powder-100 border-powder-200 text-burgundy-700'
                  : 'bg-cream-200 border-cream-300 text-navy-700',
              )}
            >
              {selectedOption.isCorrect ? 'Doğru cevap (+920 demo puan)' : 'Önizleme seçimi'}
            </motion.span>
          </div>
          </>,
        )}

        {/* Katman 3: Alt Küçük Sıralama Önizlemesi (Demo) */}
        {renderLayer(
          boardX,
          boardY,
          0.4,
          'sm:ml-6 rounded-2xl bg-cream-50/95 border border-cream-300 px-4 py-3.5 shadow-card',
          <>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-navy-700">
              Anlık Sıralama Önizlemesi
            </span>
            <span className="rounded-full bg-cream-200 border border-cream-300 px-2 py-0.5 text-[11px] font-medium text-navy-600">
              Örnek Demo
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {DEMO_LEADERBOARD_PREVIEW.map((entry) => {
              const displayScore =
                entry.rank === 1 && selectedOption.isCorrect
                  ? entry.baseScore + entry.bonus
                  : entry.baseScore;
              return (
                <div
                  key={entry.name}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 flex flex-col gap-1.5 transition-colors duration-300',
                    entry.rank === 1
                      ? 'bg-powder-100/80 border-burgundy-600/35'
                      : 'bg-cream-100 border-cream-300',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold tabular-nums',
                        entry.rank === 1
                          ? 'bg-burgundy-600 text-cream-50'
                          : 'bg-cream-200 text-navy-800',
                      )}
                    >
                      {entry.rank}
                    </span>
                    <span className="text-xs font-bold tabular-nums text-navy-800 whitespace-nowrap">
                      <PreviewScore value={displayScore} reduced={reducedMotion} /> p
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-navy-900 leading-tight">
                    {entry.name}
                  </span>
                </div>
              );
            })}
          </div>
          </>,
        )}
      </div>
    </div>
  );
}

/** Önizleme puanı: değiştiğinde kısa bir yukarı kayma ile güncellenir. */
function PreviewScore({ value, reduced }: { value: number; reduced: boolean }) {
  return (
    <span className="inline-flex overflow-hidden align-bottom">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={reduced ? false : { y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={reduced ? undefined : { y: '-100%', opacity: 0 }}
          transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
          className="inline-block"
        >
          {value.toLocaleString('tr-TR')}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
