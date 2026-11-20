import { memo, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ClockIcon } from '@/components/ui/Icons';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useSyncedCountdown } from '@/hooks/useSyncedCountdown';

interface TimerProps {
  endsAtMs: number | null;
  totalDurationMs: number | null;
  clockOffsetMs: number;
  isPaused?: boolean;
  pausedRemainingMs?: number | null;
}

export const SyncedCountdownBadge = memo(function SyncedCountdownBadge({
  endsAtMs,
  totalDurationMs,
  clockOffsetMs,
  isPaused = false,
  pausedRemainingMs = null,
}: TimerProps) {
  const { remainingSeconds } = useSyncedCountdown(
    endsAtMs,
    totalDurationMs,
    clockOffsetMs,
    isPaused,
    pausedRemainingMs,
    'seconds',
  );
  const isUrgent = !isPaused && remainingSeconds > 0 && remainingSeconds <= 5;

  return (
    <span
      className={
        isPaused
          ? 'inline-flex items-center gap-1.5 rounded-lg bg-powder-200 border border-burgundy-600 px-3 py-1 text-xs sm:text-sm font-bold tabular-nums text-burgundy-800 transition-colors duration-200'
          : isUrgent
            ? 'inline-flex items-center gap-1.5 rounded-lg bg-burgundy-600 px-3 py-1 text-xs sm:text-sm font-bold tabular-nums text-cream-50 transition-colors duration-200'
            : 'inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-3 py-1 text-xs sm:text-sm font-bold tabular-nums text-cream-50 transition-colors duration-200'
      }
    >
      <ClockIcon className="h-4 w-4" />
      <span>
        {remainingSeconds} sn{isPaused ? ' (Duraklatıldı)' : ''}
      </span>
    </span>
  );
});

export const SyncedProgressBar = memo(function SyncedProgressBar({
  endsAtMs,
  totalDurationMs,
  clockOffsetMs,
  isPaused = false,
  pausedRemainingMs = null,
}: TimerProps) {
  const { progressPercent } = useSyncedCountdown(
    endsAtMs,
    totalDurationMs,
    clockOffsetMs,
    isPaused,
    pausedRemainingMs,
  );
  const scaleX = Math.max(0, Math.min(1, progressPercent / 100));

  return (
    <div
      aria-hidden="true"
      className="h-2 w-full rounded-full bg-cream-200 overflow-hidden"
    >
      <div
        className={
          isPaused
            ? 'h-full w-full rounded-full bg-burgundy-600 origin-left transition-transform duration-100 ease-linear'
            : 'h-full w-full rounded-full bg-burgundy-600 origin-left transition-transform duration-100 ease-linear will-change-transform'
        }
        style={{ transform: `scaleX(${scaleX})` }}
      />
    </div>
  );
});

interface BigCountdownProps extends TimerProps {
  onTick?: (seconds: number) => void;
}

export const SyncedBigCountdown = memo(function SyncedBigCountdown({
  endsAtMs,
  totalDurationMs,
  clockOffsetMs,
  onTick,
}: BigCountdownProps) {
  const reducedMotion = usePrefersReducedMotion();
  const { remainingSeconds } = useSyncedCountdown(
    endsAtMs,
    totalDurationMs,
    clockOffsetMs,
    false,
    null,
    'seconds',
  );
  const displayValue = Math.max(1, remainingSeconds);

  useEffect(() => {
    if (remainingSeconds >= 1) {
      onTick?.(displayValue);
    }
  }, [displayValue, remainingSeconds, onTick]);

  return (
    <div className="mt-4 relative flex items-center justify-center min-h-[4.5rem] sm:min-h-[5.5rem]">
      {reducedMotion ? (
        <span className="font-display font-extrabold text-6xl sm:text-7xl tabular-nums text-burgundy-600">
          {displayValue}
        </span>
      ) : (
        <AnimatePresence mode="popLayout" initial={true}>
          <motion.span
            key={displayValue}
            initial={{ opacity: 0, scale: 0.72 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.24 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="inline-block will-change-transform font-display font-extrabold text-6xl sm:text-7xl tabular-nums text-burgundy-600"
          >
            {displayValue}
          </motion.span>
        </AnimatePresence>
      )}
    </div>
  );
});
