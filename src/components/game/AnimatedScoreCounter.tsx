import { memo, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

interface AnimatedScoreCounterProps {
  from?: number;
  to: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export const AnimatedScoreCounter = memo(function AnimatedScoreCounter({
  from,
  to,
  duration = 0.45,
  prefix = '',
  suffix = '',
  className,
}: AnimatedScoreCounterProps) {
  const reducedMotion = usePrefersReducedMotion();
  const spanRef = useRef<HTMLSpanElement>(null);
  const lastRenderedValueRef = useRef<number>(from ?? to);

  const initialDisplay = `${prefix}${Math.round(from ?? to).toLocaleString('tr-TR')}${suffix}`;

  useEffect(() => {
    const el = spanRef.current;
    if (!el) return;

    const startValue = from ?? lastRenderedValueRef.current;
    const format = (value: number) =>
      `${prefix}${Math.round(value).toLocaleString('tr-TR')}${suffix}`;

    if (reducedMotion || startValue === to || duration <= 0) {
      el.textContent = format(to);
      lastRenderedValueRef.current = to;
      return;
    }

    const state = { value: startValue };
    const tween = gsap.to(state, {
      value: to,
      duration,
      ease: 'power2.out',
      onUpdate: () => {
        if (spanRef.current) {
          spanRef.current.textContent = format(state.value);
        }
      },
      onComplete: () => {
        if (spanRef.current) {
          spanRef.current.textContent = format(to);
        }
        lastRenderedValueRef.current = to;
      },
    });

    return () => {
      tween.kill();
      lastRenderedValueRef.current = to;
    };
  }, [from, to, duration, prefix, suffix, reducedMotion]);

  return (
    <span ref={spanRef} className={className}>
      {initialDisplay}
    </span>
  );
});
