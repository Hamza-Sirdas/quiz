import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import type { LeaderboardEntry } from '@shared/gameTypes';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { cn } from '@/utils/cn';

interface PodiumViewProps {
  podium: LeaderboardEntry[];
  highlightParticipantId?: string;
  onWinnerRevealed?: () => void;
}

export function PodiumView({
  podium,
  highlightParticipantId,
  onWinnerRevealed,
}: PodiumViewProps) {
  const reducedMotion = usePrefersReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const winnerNotifiedRef = useRef(false);
  const onWinnerRevealedRef = useRef(onWinnerRevealed);
  onWinnerRevealedRef.current = onWinnerRevealed;

  const first = podium[0];
  const second = podium[1];
  const third = podium[2];

  const podiumKey = podium.map((p) => `${p.participantId}:${p.score}`).join('|');

  useEffect(() => {
    winnerNotifiedRef.current = false;
    const container = containerRef.current;
    if (!container || podium.length === 0) return;

    const notifyWinner = () => {
      if (!winnerNotifiedRef.current) {
        winnerNotifiedRef.current = true;
        onWinnerRevealedRef.current?.();
      }
    };

    if (reducedMotion) {
      notifyWinner();
      return;
    }

    const ctx = gsap.context(() => {
      const rankOrder = [3, 2, 1];
      const targets = rankOrder
        .map((rank) => container.querySelector<HTMLElement>(`[data-podium-rank="${rank}"]`))
        .filter((el): el is HTMLElement => el !== null);

      if (targets.length === 0) return;

      gsap.set(targets, { opacity: 0, y: 20, scale: 0.94 });

      const tl = gsap.timeline();
      targets.forEach((el, idx) => {
        const isWinner = el.dataset.podiumRank === '1';
        tl.to(
          el,
          {
            opacity: 1,
            y: 0,
            scale: isWinner ? 1.03 : 1,
            duration: isWinner ? 0.42 : 0.34,
            ease: 'power2.out',
            onStart: isWinner ? notifyWinner : undefined,
          },
          idx * 0.28,
        );

        if (isWinner) {
          tl.to(el, {
            scale: 1,
            duration: 0.24,
            ease: 'power2.inOut',
          });
        }
      });
    }, containerRef);

    return () => {
      ctx.revert();
    };
  }, [podiumKey, podium.length, reducedMotion]);

  if (podium.length === 0) return null;

  const slots = [
    second
      ? {
          entry: second,
          rank: 2,
          heightClass: 'min-h-36',
          toneClass: 'bg-cream-200 border-cream-300 text-navy-900',
          badgeClass: 'bg-navy-900 text-cream-50',
          orderClass: 'order-2 sm:order-1',
        }
      : null,
    first
      ? {
          entry: first,
          rank: 1,
          heightClass: 'min-h-44',
          toneClass: 'bg-burgundy-600 border-burgundy-700 text-cream-50',
          badgeClass: 'bg-cream-50 text-burgundy-600',
          orderClass: 'order-1 sm:order-2',
        }
      : null,
    third
      ? {
          entry: third,
          rank: 3,
          heightClass: 'min-h-32',
          toneClass: 'bg-powder-200 border-powder-400 text-navy-900',
          badgeClass: 'bg-burgundy-600 text-cream-50',
          orderClass: 'order-3 sm:order-3',
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <div
      ref={containerRef}
      aria-label="İlk üç podyum sıralaması"
      className="grid grid-cols-1 sm:grid-cols-3 items-end gap-3 sm:gap-4"
    >
      {slots.map(({ entry, rank, heightClass, toneClass, badgeClass, orderClass }) => {
        const isCurrent = entry.participantId === highlightParticipantId;

        return (
          <div
            key={entry.participantId}
            data-podium-rank={rank}
            className={cn(
              'rounded-2xl border p-5 flex flex-col items-center justify-center text-center shadow-card will-change-transform',
              heightClass,
              toneClass,
              isCurrent && 'ring-2 ring-navy-900 ring-offset-2 ring-offset-cream-50',
              orderClass,
            )}
          >
            <span
              className={cn(
                'inline-flex h-9 w-9 items-center justify-center rounded-full font-display font-extrabold text-base tabular-nums',
                badgeClass,
              )}
            >
              {rank}
            </span>

            <p className="mt-3 font-display font-bold text-lg break-words max-w-full">
              {entry.nickname}
            </p>
            <p
              className={cn(
                'mt-1 text-sm font-semibold tabular-nums',
                rank === 1 ? 'text-powder-100' : 'text-navy-700',
              )}
            >
              {entry.score.toLocaleString('tr-TR')} puan
            </p>
            <p
              className={cn(
                'mt-1 text-xs tabular-nums',
                rank === 1 ? 'text-powder-200' : 'text-navy-600',
              )}
            >
              {entry.correctCount} doğru
              {typeof entry.wrongCount === 'number' ? ` · ${entry.wrongCount} yanlış` : ''}
            </p>
          </div>
        );
      })}
    </div>
  );
}
