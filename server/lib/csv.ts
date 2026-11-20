import type { GameSessionAnalytics } from '../../shared/analyticsTypes';
import { QUESTION_TYPE_LABELS } from '../../shared/quizTypes';

export interface CsvGameResultRow {
  rank: number;
  nickname: string;
  totalScore: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  totalQuestions: number;
  avgResponseMs: number;
}

const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: string | number): string {
  const raw = String(value);
  const safe = FORMULA_PREFIX_RE.test(raw) ? `'${raw}` : raw;
  const escaped = safe.replace(/"/g, '""');
  return `"${escaped}"`;
}

function encodeRow(cells: ReadonlyArray<string | number>): string {
  return cells.map(escapeCsvCell).join(',');
}

export function buildGameResultsCsv(rows: readonly CsvGameResultRow[]): string {
  const header = encodeRow([
    'Sıra',
    'Oyuncu Adı',
    'Toplam Puan',
    'Doğru Sayısı',
    'Yanlış Sayısı',
    'Boş Sayısı',
    'Toplam Soru',
    'Ortalama Tepki Süresi (sn)',
  ]);

  const dataLines = rows.map((row) =>
    encodeRow([
      row.rank,
      row.nickname,
      row.totalScore,
      row.correctCount,
      row.wrongCount,
      row.unansweredCount,
      row.totalQuestions,
      (row.avgResponseMs / 1000).toFixed(2),
    ]),
  );

  return `\uFEFF${[header, ...dataLines].join('\r\n')}`;
}

const STATUS_TR: Record<GameSessionAnalytics['status'], string> = {
  FINISHED: 'Tamamlandı',
  CANCELLED: 'İptal Edildi',
  INTERRUPTED: 'Kesintiye Uğradı',
};

function formatDurationCsv(durationSec: number | null): string {
  if (durationSec === null || !Number.isFinite(durationSec)) return 'Veri yok';
  const mins = Math.floor(durationSec / 60);
  const secs = durationSec % 60;
  return mins > 0 ? `${mins} dk ${secs} sn` : `${secs} sn`;
}

export function buildGameAnalyticsCsv(analytics: GameSessionAnalytics): string {
  const lines: string[] = [];

  // 1. Yarışma Bilgileri
  lines.push(encodeRow(['BÖLÜM', 'YARIŞMA BİLGİLERİ']));
  lines.push(encodeRow(['Quiz Başlığı', analytics.quizTitle]));
  lines.push(encodeRow(['Kategori', analytics.quizCategory]));
  lines.push(encodeRow(['Oyun PIN Kodu', analytics.pin]));
  lines.push(encodeRow(['Durum', STATUS_TR[analytics.status]]));
  lines.push(
    encodeRow([
      'Başlangıç Zamanı',
      analytics.startedAt ?? 'Veri yok',
    ]),
  );
  lines.push(
    encodeRow([
      'Bitiş Zamanı',
      analytics.endedAt ?? 'Veri yok',
    ]),
  );
  lines.push(encodeRow(['Yarışma Süresi', formatDurationCsv(analytics.durationSec)]));
  lines.push(
    encodeRow(['Toplam Katılımcı', analytics.overview.totalParticipants]),
  );
  lines.push(encodeRow(['Toplam Soru', analytics.totalQuestions]));
  lines.push(
    encodeRow([
      'Ortalama Başarı Oranı (%)',
      analytics.overview.averageSuccessRatePct !== null
        ? `%${analytics.overview.averageSuccessRatePct}`
        : 'Veri yok',
    ]),
  );
  lines.push(
    encodeRow([
      'Ortalama Puan',
      analytics.overview.averageScore !== null
        ? analytics.overview.averageScore
        : 'Veri yok',
    ]),
  );
  lines.push(
    encodeRow([
      'En Yüksek Puan',
      analytics.overview.highestScore !== null
        ? analytics.overview.highestScore
        : 'Veri yok',
    ]),
  );
  lines.push(
    encodeRow([
      'Ortalama Cevaplama Süresi (sn)',
      analytics.overview.averageResponseMs !== null
        ? (analytics.overview.averageResponseMs / 1000).toFixed(2)
        : 'Veri yok',
    ]),
  );

  lines.push('');

  // 2. Katılımcı Sonuçları
  lines.push(encodeRow(['BÖLÜM', 'KATILIMCI SONUÇLARI']));
  lines.push(
    encodeRow([
      'Sıra',
      'Oyuncu Adı',
      'Toplam Puan',
      'Doğru Sayısı',
      'Yanlış Sayısı',
      'Boş Sayısı',
      'Toplam Soru',
      'Başarı Oranı (%)',
      'Ortalama Tepki Süresi (sn)',
    ]),
  );

  for (const p of analytics.participants) {
    lines.push(
      encodeRow([
        p.rank,
        p.nickname,
        p.totalScore,
        p.correctCount,
        p.wrongCount,
        p.unansweredCount,
        p.totalQuestions,
        `%${p.successRatePct}`,
        p.avgResponseMs !== null ? (p.avgResponseMs / 1000).toFixed(2) : 'Veri yok',
      ]),
    );
  }

  lines.push('');

  // 3. Soru Bazlı İstatistikler
  lines.push(encodeRow(['BÖLÜM', 'SORU BAZLI İSTATİSTİKLER']));
  lines.push(
    encodeRow([
      'Soru No',
      'Soru Türü',
      'Soru Metni',
      'Doğru Cevap',
      'Doğru Sayısı',
      'Kısmi Doğru Sayısı',
      'Yanlış Sayısı',
      'Boş Sayısı',
      'Başarı Oranı (%)',
      'Ortalama Süre (sn)',
      'En Çok Seçilen Yanlış Cevap',
    ]),
  );

  for (const q of analytics.questions) {
    lines.push(
      encodeRow([
        q.questionNumber,
        QUESTION_TYPE_LABELS[q.type],
        q.text,
        q.correctAnswerText,
        q.correctCount,
        q.partialCount,
        q.wrongCount,
        q.unansweredCount,
        q.successRatePct !== null ? `%${q.successRatePct}` : 'Veri yok',
        q.averageResponseMs !== null
          ? (q.averageResponseMs / 1000).toFixed(2)
          : 'Veri yok',
        q.mostCommonWrongAnswer ?? 'Yok',
      ]),
    );
  }

  return `\uFEFF${lines.join('\r\n')}`;
}
