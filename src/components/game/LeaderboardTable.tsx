import { motion } from 'motion/react';
import type { LeaderboardEntry } from '@shared/gameTypes';
import { ArrowDownIcon, ArrowUpIcon } from '@/components/ui/Icons';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { cn } from '@/utils/cn';

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  highlightParticipantId?: string;
  limit?: number;
  previousRanks?: Record<string, number>;
  showWrongCount?: boolean;
  showResponseTime?: boolean;
}

export function LeaderboardTable({
  entries,
  highlightParticipantId,
  limit,
  previousRanks,
  showWrongCount = false,
  showResponseTime = false,
}: LeaderboardTableProps) {
  const reducedMotion = usePrefersReducedMotion();
  const visible = typeof limit === 'number' ? entries.slice(0, limit) : entries;

  if (visible.length === 0) {
    return (
      <p className="text-sm text-navy-600">Henüz sıralama verisi oluşmadı.</p>
    );
  }

  return (
    <ol className="space-y-2">
      {visible.map((entry, idx) => {
        const isCurrent = entry.participantId === highlightParticipantId;
        const prevRank = previousRanks?.[entry.participantId];
        const rankDelta = typeof prevRank === 'number' ? prevRank - entry.rank : 0;

        const rowClass = cn(
          'rounded-xl border px-4 py-3 flex items-center justify-between gap-3',
          isCurrent
            ? 'bg-powder-100 border-burgundy-600'
            : 'bg-cream-100 border-cream-300',
        );

        const content = (
          <>
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={cn(
                  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold tabular-nums',
                  entry.rank === 1
                    ? 'bg-burgundy-600 text-cream-50'
                    : entry.rank <= 3
                      ? 'bg-navy-900 text-cream-50'
                      : 'bg-cream-200 text-navy-900',
                )}
              >
                {entry.rank}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="truncate font-display font-bold text-sm sm:text-base text-navy-900">
                    {entry.nickname}
                    {isCurrent && (
                      <span className="ms-2 text-xs font-semibold text-burgundy-600">
                        (Sen)
                      </span>
                    )}
                  </p>
                  {rankDelta > 0 && (
                    <span
                      aria-label={`${rankDelta} sıra yükseldi`}
                      className="inline-flex items-center gap-0.5 rounded-md bg-powder-100 border border-powder-400 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-burgundy-700 shrink-0"
                    >
                      <ArrowUpIcon className="h-3 w-3" />
                      <span>+{rankDelta}</span>
                    </span>
                  )}
                  {rankDelta < 0 && (
                    <span
                      aria-label={`${Math.abs(rankDelta)} sıra geriledi`}
                      className="inline-flex items-center gap-0.5 rounded-md bg-cream-200 border border-cream-300 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-navy-600 shrink-0"
                    >
                      <ArrowDownIcon className="h-3 w-3" />
                      <span>-{Math.abs(rankDelta)}</span>
                    </span>
                  )}
                </div>
                <p className="text-xs tabular-nums text-navy-600">
                  {entry.correctCount} doğru
                  {showWrongCount && typeof entry.wrongCount === 'number'
                    ? ` · ${entry.wrongCount} yanlış`
                    : ''}
                  {showWrongCount &&
                  typeof entry.unansweredCount === 'number' &&
                  entry.unansweredCount > 0
                    ? ` · ${entry.unansweredCount} boş`
                    : ''}
                  {showResponseTime && entry.avgResponseMs > 0
                    ? ` · ${(entry.avgResponseMs / 1000).toFixed(2)} sn`
                    : ''}
                </p>
              </div>
            </div>

            <div className="text-end shrink-0">
              <p className="font-display font-bold text-sm sm:text-base tabular-nums text-navy-900">
                {entry.score.toLocaleString('tr-TR')} puan
              </p>
              {entry.lastDelta > 0 && (
                <p className="text-xs font-semibold tabular-nums text-burgundy-600">
                  +{entry.lastDelta.toLocaleString('tr-TR')}
                </p>
              )}
            </div>
          </>
        );

        if (idx >= 10 || reducedMotion) {
          return (
            <li key={entry.participantId} className={rowClass}>
              {content}
            </li>
          );
        }

        return (
          <motion.li
            key={entry.participantId}
            layout="position"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, delay: idx * 0.02, ease: [0.22, 1, 0.36, 1] }}
            className={rowClass}
          >
            {content}
          </motion.li>
        );
      })}
    </ol>
  );
}
