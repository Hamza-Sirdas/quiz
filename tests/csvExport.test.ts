import { describe, expect, it } from 'vitest';
import type { GameSessionAnalytics } from '../shared/analyticsTypes';
import {
  buildGameAnalyticsCsv,
  buildGameResultsCsv,
  escapeCsvCell,
} from '../server/lib/csv';

describe('csv export helper', () => {
  it('hücre içi tırnak, virgül ve formül enjeksiyonunu güvenle kaçırır', () => {
    expect(escapeCsvCell('Ahmet Yılmaz')).toBe('"Ahmet Yılmaz"');
    expect(escapeCsvCell('Ali, "Can"')).toBe('"Ali, ""Can"""');
    expect(escapeCsvCell('=SUM(A1:A2)')).toBe('"\'=SUM(A1:A2)"');
    expect(escapeCsvCell('+cmd|calc')).toBe('"\'+cmd|calc"');
    expect(escapeCsvCell('-2+3')).toBe('"\'-2+3"');
    expect(escapeCsvCell('@evil')).toBe('"\'@evil"');
    expect(escapeCsvCell('\tcell')).toBe('"\'\tcell"');
  });

  it('UTF-8 BOM ve Türkçe başlıklarla geçerli CSV çıktısı üretir', () => {
    const csv = buildGameResultsCsv([
      {
        rank: 1,
        nickname: 'Zeynep Şahin',
        totalScore: 1920,
        correctCount: 2,
        wrongCount: 0,
        unansweredCount: 0,
        totalQuestions: 2,
        avgResponseMs: 1450,
      },
      {
        rank: 2,
        nickname: '=CMD()',
        totalScore: 850,
        correctCount: 1,
        wrongCount: 1,
        unansweredCount: 0,
        totalQuestions: 2,
        avgResponseMs: 4120,
      },
    ]);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(
      '"Sıra","Oyuncu Adı","Toplam Puan","Doğru Sayısı","Yanlış Sayısı","Boş Sayısı","Toplam Soru","Ortalama Tepki Süresi (sn)"',
    );
    expect(lines[1]).toBe('"1","Zeynep Şahin","1920","2","0","0","2","1.45"');
    expect(lines[2]).toBe('"2","\'=CMD()","850","1","1","0","2","4.12"');
  });

  it('yarışma bilgileri, katılımcı sonuçları ve soru bazlı istatistikleri içeren 3 bölümlü CSV üretir', () => {
    const sampleAnalytics: GameSessionAnalytics = {
      id: 'sess-1',
      pin: '482915',
      quizId: 'quiz-1',
      quizStillExists: true,
      quizTitle: 'Türkiye Coğrafyası',
      quizCategory: 'Coğrafya',
      status: 'FINISHED',
      startedAt: '2026-11-19T19:00:00.000Z',
      endedAt: '2026-11-19T19:05:30.000Z',
      createdAt: '2026-11-19T18:59:00.000Z',
      durationSec: 330,
      totalQuestions: 1,
      hasSnapshotQuestions: true,
      overview: {
        totalParticipants: 2,
        totalAnswersSubmitted: 2,
        averageSuccessRatePct: 50,
        averageScore: 710,
        highestScore: 1420,
        highestScorerNickname: 'Ahmet Yılmaz',
        averageResponseMs: 1950,
        hardestQuestion: {
          questionIndex: 0,
          questionNumber: 1,
          text: "Türkiye'nin başkenti neresidir?",
          successRatePct: 50,
        },
      },
      questions: [
        {
          questionIndex: 0,
          questionNumber: 1,
          type: 'MULTIPLE_CHOICE',
          text: "Türkiye'nin başkenti neresidir?",
          explanation: 'Ankara 1923 yılında başkent ilan edilmiştir.',
          allowPartialCredit: false,
          timeLimitSec: 20,
          points: 1000,
          correctAnswerText: 'Ankara',
          answeredCount: 2,
          correctCount: 1,
          partialCount: 0,
          wrongCount: 1,
          unansweredCount: 0,
          successRatePct: 50,
          averageResponseMs: 1950,
          mostCommonWrongAnswer: 'İstanbul (1 oyuncu)',
          optionDistribution: [],
        },
      ],
      hardestQuestions: [],
      participants: [
        {
          participantId: 'p1',
          nickname: 'Ahmet Yılmaz',
          rank: 1,
          totalScore: 1420,
          correctCount: 1,
          partialCount: 0,
          wrongCount: 0,
          unansweredCount: 0,
          totalQuestions: 1,
          successRatePct: 100,
          avgResponseMs: 1400,
          questionBreakdown: [],
        },
        {
          participantId: 'p2',
          nickname: '=Zeynep',
          rank: 2,
          totalScore: 0,
          correctCount: 0,
          partialCount: 0,
          wrongCount: 1,
          unansweredCount: 0,
          totalQuestions: 1,
          successRatePct: 0,
          avgResponseMs: 2500,
          questionBreakdown: [],
        },
      ],
      charts: {
        questionSuccessAndTime: [],
        scoreDistribution: [],
      },
    };

    const csv = buildGameAnalyticsCsv(sampleAnalytics);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"BÖLÜM","YARIŞMA BİLGİLERİ"');
    expect(csv).toContain('"Quiz Başlığı","Türkiye Coğrafyası"');
    expect(csv).toContain('"Yarışma Süresi","5 dk 30 sn"');
    expect(csv).toContain('"BÖLÜM","KATILIMCI SONUÇLARI"');
    expect(csv).toContain('"Oyuncu Adı"');
    expect(csv).toContain('"Ahmet Yılmaz"');
    expect(csv).toContain('"\'=Zeynep"');
    expect(csv).toContain('"BÖLÜM","SORU BAZLI İSTATİSTİKLER"');
    expect(csv).toContain('"Türkiye\'nin başkenti neresidir?"');
    expect(csv).toContain('"İstanbul (1 oyuncu)"');
  });
});
