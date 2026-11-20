import { memo, useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

interface CelebrationConfettiProps {
  active: boolean;
}

interface ConfettiPiece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rotation: number;
  rotationSpeed: number;
  color: string;
}

const QUIZORA_CONFETTI_COLORS = [
  '#6B1D2F',
  '#DEC4C5',
  '#232B3A',
  '#8A3346',
  '#C9A7AA',
] as const;

export const CelebrationConfetti = memo(function CelebrationConfetti({
  active,
}: CelebrationConfettiProps) {
  const reducedMotion = usePrefersReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active || reducedMotion) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const count = width < 640 ? 22 : 36;
    const pieces: ConfettiPiece[] = Array.from({ length: count }, (_, idx) => {
      const originX = width * (0.25 + (idx / Math.max(count - 1, 1)) * 0.5);
      return {
        x: originX + (Math.random() - 0.5) * 40,
        y: height * 0.24 + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 6.5,
        vy: -5.5 - Math.random() * 4.5,
        w: 6 + Math.random() * 5,
        h: 4 + Math.random() * 4,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.16,
        color:
          QUIZORA_CONFETTI_COLORS[idx % QUIZORA_CONFETTI_COLORS.length] ??
          '#6B1D2F',
      };
    });

    let rafId = 0;
    const startTime = performance.now();
    const durationMs = 1850;
    let lastTime = startTime;

    const renderFrame = (now: number) => {
      const elapsed = now - startTime;
      const dt = Math.min((now - lastTime) / 16.67, 2.5);
      lastTime = now;

      ctx.clearRect(0, 0, width, height);

      if (elapsed >= durationMs) {
        return;
      }

      const fade =
        elapsed > durationMs * 0.65
          ? Math.max(0, 1 - (elapsed - durationMs * 0.65) / (durationMs * 0.35))
          : 1;

      ctx.globalAlpha = fade;

      for (const piece of pieces) {
        piece.x += piece.vx * dt;
        piece.y += piece.vy * dt;
        piece.vy += 0.22 * dt;
        piece.vx *= 0.992;
        piece.rotation += piece.rotationSpeed * dt;

        ctx.save();
        ctx.translate(piece.x, piece.y);
        ctx.rotate(piece.rotation);
        ctx.fillStyle = piece.color;
        ctx.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
        ctx.restore();
      }

      rafId = window.requestAnimationFrame(renderFrame);
    };

    rafId = window.requestAnimationFrame(renderFrame);

    return () => {
      window.cancelAnimationFrame(rafId);
      ctx.clearRect(0, 0, width, height);
    };
  }, [active, reducedMotion]);

  if (!active || reducedMotion) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 h-full w-full"
    />
  );
});
