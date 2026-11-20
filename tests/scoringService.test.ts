import { describe, expect, it } from 'vitest';
import {
  calculateAnswerPoints,
  rankParticipants,
} from '../server/game/scoringService';
import { validateAndEvaluateAnswer } from '../shared/answerEvaluation';
import { shuffleOrderingIds } from '../shared/quizTypes';

describe('scoringService & answerEvaluation', () => {
  it('hızlı doğru cevaplara daha yüksek puan verir', () => {
    const fast = calculateAnswerPoints({
      basePoints: 1000,
      isCorrect: true,
      remainingMs: 18_000,
      totalDurationMs: 20_000,
    });
    const slow = calculateAnswerPoints({
      basePoints: 1000,
      isCorrect: true,
      remainingMs: 2_000,
      totalDurationMs: 20_000,
    });

    expect(fast).toBe(950);
    expect(slow).toBe(550);
    expect(fast).toBeGreaterThan(slow);
  });

  it('yanlış veya süresi dolmuş cevaplara 0 puan verir', () => {
    expect(
      calculateAnswerPoints({
        basePoints: 1000,
        isCorrect: false,
        remainingMs: 15_000,
        totalDurationMs: 20_000,
      }),
    ).toBe(0);

    expect(
      calculateAnswerPoints({
        basePoints: 1000,
        isCorrect: true,
        remainingMs: 0,
        totalDurationMs: 20_000,
      }),
    ).toBe(0);

    expect(
      calculateAnswerPoints({
        basePoints: 1000,
        isCorrect: true,
        remainingMs: -250,
        totalDurationMs: 20_000,
      }),
    ).toBe(0);
  });

  it('kalan süreyi toplam süreyle sınırlar ve kısmi puan oranını uygular', () => {
    expect(
      calculateAnswerPoints({
        basePoints: 1000,
        isCorrect: true,
        remainingMs: 99_000,
        totalDurationMs: 20_000,
      }),
    ).toBe(1000);

    expect(
      calculateAnswerPoints({
        basePoints: 777,
        isCorrect: true,
        remainingMs: 10_000,
        totalDurationMs: 20_000,
      }),
    ).toBe(583);

    expect(
      calculateAnswerPoints({
        basePoints: 1000,
        isCorrect: false,
        scoreRatio: 0.5,
        remainingMs: 20_000,
        totalDurationMs: 20_000,
      }),
    ).toBe(500);
  });

  it('liderlik tablosunu puan, doğru sayısı ve tepki süresine göre tutarlı sıralar', () => {
    const ranked = rankParticipants([
      {
        id: 'p1',
        nickname: 'Ayşe',
        score: 1500,
        correctCount: 2,
        totalResponseMs: 6000,
        joinedAtMs: 100,
        lastDelta: 700,
      },
      {
        id: 'p2',
        nickname: 'Mehmet',
        score: 1500,
        correctCount: 2,
        totalResponseMs: 4200,
        joinedAtMs: 200,
        lastDelta: 800,
      },
      {
        id: 'p3',
        nickname: 'Zeynep',
        score: 1850,
        correctCount: 2,
        totalResponseMs: 2500,
        joinedAtMs: 300,
        lastDelta: 950,
      },
      {
        id: 'p4',
        nickname: 'Ali',
        score: 1500,
        correctCount: 1,
        totalResponseMs: 1500,
        joinedAtMs: 50,
        lastDelta: 0,
      },
    ]);

    expect(ranked.map((r) => [r.rank, r.nickname])).toEqual([
      [1, 'Zeynep'],
      [2, 'Mehmet'],
      [3, 'Ayşe'],
      [4, 'Ali'],
    ]);
    expect(ranked[1]?.avgResponseMs).toBe(2100);
  });

  it('Çoklu Doğru Cevap sorularında tam eşleşmeyi, kısmi puanı ve geçersiz biçimleri değerlendirir', () => {
    const question = {
      type: 'MULTI_SELECT' as const,
      allowPartialCredit: true,
      options: [
        { id: 'o1', order: 1, text: 'A', isCorrect: true },
        { id: 'o2', order: 2, text: 'B', isCorrect: true },
        { id: 'o3', order: 3, text: 'C', isCorrect: false },
        { id: 'o4', order: 4, text: 'D', isCorrect: false },
      ],
    };

    const exact = validateAndEvaluateAnswer(question, { optionIds: ['o2', 'o1'] });
    expect(exact).toMatchObject({ ok: true, isCorrect: true, isPartial: false, scoreRatio: 1 });

    const half = validateAndEvaluateAnswer(question, { optionIds: ['o1'] });
    expect(half).toMatchObject({ ok: true, isCorrect: false, isPartial: true, scoreRatio: 0.5 });

    const cancelledOut = validateAndEvaluateAnswer(question, { optionIds: ['o1', 'o3'] });
    expect(cancelledOut).toMatchObject({ ok: true, isCorrect: false, isPartial: false, scoreRatio: 0 });

    const noPartial = validateAndEvaluateAnswer(
      { ...question, allowPartialCredit: false },
      { optionIds: ['o1'] },
    );
    expect(noPartial).toMatchObject({ ok: true, isCorrect: false, isPartial: false, scoreRatio: 0 });

    expect(validateAndEvaluateAnswer(question, { optionIds: [] }).ok).toBe(false);
    expect(validateAndEvaluateAnswer(question, { optionIds: ['o1', 'o1'] }).ok).toBe(false);
    expect(validateAndEvaluateAnswer(question, { optionIds: ['o999'] }).ok).toBe(false);
  });

  it('Sıralama sorularını doğrular ve başlangıç sırasını gerçekten karıştırır', () => {
    const items = [
      { id: 's1', order: 1, text: 'İlk', isCorrect: true },
      { id: 's2', order: 2, text: 'İkinci', isCorrect: true },
      { id: 's3', order: 3, text: 'Üçüncü', isCorrect: true },
    ];

    for (let i = 0; i < 10; i += 1) {
      const shuffled = shuffleOrderingIds(items);
      expect(shuffled.map((x) => x.id)).not.toEqual(['s1', 's2', 's3']);
      expect(new Set(shuffled.map((x) => x.id))).toEqual(new Set(['s1', 's2', 's3']));
    }

    const question = {
      type: 'ORDERING' as const,
      allowPartialCredit: false,
      options: items,
    };

    expect(
      validateAndEvaluateAnswer(question, { orderedOptionIds: ['s1', 's2', 's3'] }),
    ).toMatchObject({ ok: true, isCorrect: true, scoreRatio: 1 });

    expect(
      validateAndEvaluateAnswer(question, { orderedOptionIds: ['s2', 's1', 's3'] }),
    ).toMatchObject({ ok: true, isCorrect: false, scoreRatio: 0 });

    expect(
      validateAndEvaluateAnswer(question, { orderedOptionIds: ['s1', 's2'] }).ok,
    ).toBe(false);
    expect(
      validateAndEvaluateAnswer(question, { orderedOptionIds: ['s1', 's1', 's3'] }).ok,
    ).toBe(false);
  });
});
