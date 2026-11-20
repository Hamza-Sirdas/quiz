export interface ScoreCalculationInput {
  basePoints: number;
  isCorrect: boolean;
  scoreRatio?: number;
  remainingMs: number;
  totalDurationMs: number;
}

export function calculateAnswerPoints({
  basePoints,
  isCorrect,
  scoreRatio,
  remainingMs,
  totalDurationMs,
}: ScoreCalculationInput): number {
  const effectiveRatio =
    typeof scoreRatio === 'number'
      ? Math.max(0, Math.min(1, scoreRatio))
      : isCorrect
        ? 1
        : 0;

  if (
    effectiveRatio <= 0 ||
    basePoints <= 0 ||
    totalDurationMs <= 0 ||
    remainingMs <= 0
  ) {
    return 0;
  }

  const clampedRemaining = Math.min(remainingMs, totalDurationMs);
  const ratio = clampedRemaining / totalDurationMs;
  const multiplier = 0.5 + 0.5 * ratio;

  return Math.round(basePoints * multiplier * effectiveRatio);
}

export interface RankableParticipant {
  id: string;
  nickname: string;
  score: number;
  correctCount: number;
  wrongCount?: number;
  totalResponseMs: number;
  joinedAtMs: number;
  lastDelta: number;
}

export interface RankedParticipant {
  participantId: string;
  nickname: string;
  score: number;
  rank: number;
  correctCount: number;
  wrongCount: number;
  totalResponseMs: number;
  avgResponseMs: number;
  lastDelta: number;
}

export function rankParticipants(
  participants: readonly RankableParticipant[],
): RankedParticipant[] {
  const sorted = [...participants].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
    if (a.totalResponseMs !== b.totalResponseMs) {
      return a.totalResponseMs - b.totalResponseMs;
    }
    if (a.joinedAtMs !== b.joinedAtMs) return a.joinedAtMs - b.joinedAtMs;
    return a.id.localeCompare(b.id);
  });

  return sorted.map((participant, index) => ({
    participantId: participant.id,
    nickname: participant.nickname,
    score: participant.score,
    rank: index + 1,
    correctCount: participant.correctCount,
    wrongCount: participant.wrongCount ?? 0,
    totalResponseMs: participant.totalResponseMs,
    avgResponseMs:
      participant.correctCount > 0
        ? Math.round(participant.totalResponseMs / participant.correctCount)
        : 0,
    lastDelta: participant.lastDelta,
  }));
}
