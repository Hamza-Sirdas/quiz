import { memo, useEffect, useRef } from 'react';
import { animate } from 'motion/react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

interface AnimatedNumberProps {
  value: number;
  suffix?: string;
  duration?: number;
  className?: string;
  'data-testid'?: string;
}

const format = (n: number, suffix: string) =>
  `${Math.round(n).toLocaleString('tr-TR')}${suffix}`;

/**
 * Aşama 15B: React yeniden render üretmeden sayıyı yumuşakça günceller.
 * Bitiş değeri her zaman kesin biçimde yazılır; azaltılmış harekette anında.
 */
export const AnimatedNumber = memo(function AnimatedNumber({
  value,
  suffix = '',
  duration = 0.6,
  className,
  'data-testid': testId,
}: AnimatedNumberProps) {
  const reducedMotion = usePrefersReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const lastValue = useRef(value);
  // Sabit ilk metin: React metin düğümünü sonradan güncellemez, değeri efekt yazar.
  const initialText = useRef(format(value, suffix));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = lastValue.current;
    lastValue.current = value;

    if (reducedMotion || from === value) {
      el.textContent = format(value, suffix);
      return;
    }

    const controls = animate(from, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => {
        el.textContent = format(latest, suffix);
      },
      onComplete: () => {
        el.textContent = format(value, suffix);
      },
    });

    return () => {
      controls.stop();
      el.textContent = format(value, suffix);
    };
  }, [value, suffix, duration, reducedMotion]);

  return (
    <span ref={ref} className={className} data-testid={testId}>
      {initialText.current}
    </span>
  );
});
