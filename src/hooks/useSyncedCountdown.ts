import { useEffect, useState } from 'react';

interface CountdownSnapshot {
  remainingMs: number;
  remainingSeconds: number;
  progressPercent: number;
}

export type SyncedCountdownMode = 'progress' | 'seconds';

export function useSyncedCountdown(
  endsAtMs: number | null,
  totalDurationMs: number | null,
  clockOffsetMs: number,
  isPaused = false,
  pausedRemainingMs: number | null = null,
  mode: SyncedCountdownMode = 'progress',
): CountdownSnapshot {
  const compute = (): CountdownSnapshot => {
    if (isPaused) {
      const remMs = Math.max(0, pausedRemainingMs ?? 0);
      const remSec = Math.ceil(remMs / 1000);
      const pct =
        totalDurationMs && totalDurationMs > 0
          ? Math.max(0, Math.min(100, (remMs / totalDurationMs) * 100))
          : 0;
      return {
        remainingMs: remMs,
        remainingSeconds: remSec,
        progressPercent: pct,
      };
    }

    if (!endsAtMs) {
      return { remainingMs: 0, remainingSeconds: 0, progressPercent: 0 };
    }

    const estimatedServerNow = Date.now() + clockOffsetMs;
    const remainingMs = Math.max(0, endsAtMs - estimatedServerNow);
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    const progressPercent =
      totalDurationMs && totalDurationMs > 0
        ? Math.max(0, Math.min(100, (remainingMs / totalDurationMs) * 100))
        : 0;

    return { remainingMs, remainingSeconds, progressPercent };
  };

  const [state, setState] = useState<CountdownSnapshot>(compute);

  useEffect(() => {
    const initial = compute();
    setState(initial);
    if (isPaused || !endsAtMs) return;

    if (mode === 'seconds') {
      let timeoutId: number | null = null;
      let cancelled = false;

      const scheduleNext = (snapshot: CountdownSnapshot) => {
        if (cancelled || snapshot.remainingMs <= 0) return;
        // Tam saniye değişim anına hizalanarak gereksiz ara render'ları (20Hz -> 1Hz) önler
        const msUntilNextSecond = snapshot.remainingMs % 1000 || 1000;
        const delayMs = Math.max(50, Math.min(1000, msUntilNextSecond + 15));
        timeoutId = window.setTimeout(() => {
          if (cancelled) return;
          const next = compute();
          setState((prev) =>
            prev.remainingSeconds === next.remainingSeconds ? prev : next,
          );
          scheduleNext(next);
        }, delayMs);
      };

      scheduleNext(initial);
      return () => {
        cancelled = true;
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
      };
    }

    const timer = window.setInterval(() => {
      const next = compute();
      setState(next);
      if (next.remainingMs <= 0) {
        window.clearInterval(timer);
      }
    }, 100);

    return () => window.clearInterval(timer);
  }, [endsAtMs, totalDurationMs, clockOffsetMs, isPaused, pausedRemainingMs, mode]);

  return state;
}
