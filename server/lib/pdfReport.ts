import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import type { GameSessionAnalytics } from '../../shared/analyticsTypes';
import { QUESTION_TYPE_LABELS } from '../../shared/quizTypes';

const require = createRequire(import.meta.url);

const COLORS = {
  burgundy: '#6B1D2F',
  burgundyLight: '#F8EEF0',
  powder: '#F2E4E5',
  powderBorder: '#DEC4C5',
  cream: '#FAF7F4',
  creamBorder: '#E4DBD4',
  navy: '#232B3A',
  navyMuted: '#4A5263',
  white: '#FFFDFB',
} as const;

const STATUS_TR: Record<GameSessionAnalytics['status'], string> = {
  FINISHED: 'Tamamlandı',
  CANCELLED: 'İptal Edildi',
  INTERRUPTED: 'Kesintiye Uğradı',
};

function resolveFontPaths(): { regular: string; bold: string } | null {
  const candidates: Array<{ regular: string; bold: string }> = [];

  try {
    const pkgPath = require.resolve('dejavu-fonts-ttf/package.json');
    const pkgDir = path.dirname(pkgPath);
    candidates.push({
      regular: path.join(pkgDir, 'ttf', 'DejaVuSans.ttf'),
      bold: path.join(pkgDir, 'ttf', 'DejaVuSans-Bold.ttf'),
    });
  } catch {
    // ignore
  }

  candidates.push({
    regular: path.resolve(
      process.cwd(),
      'node_modules',
      'dejavu-fonts-ttf',
      'ttf',
      'DejaVuSans.ttf',
    ),
    bold: path.resolve(
      process.cwd(),
      'node_modules',
      'dejavu-fonts-ttf',
      'ttf',
      'DejaVuSans-Bold.ttf',
    ),
  });

  for (const c of candidates) {
    if (fs.existsSync(c.regular) && fs.existsSync(c.bold)) {
      return c;
    }
  }

  return null;
}

function formatDateTr(iso: string | null): string {
  if (!iso) return 'Veri yok';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Veri yok';
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function formatDurationTr(durationSec: number | null): string {
  if (durationSec === null || !Number.isFinite(durationSec)) return 'Veri yok';
  const mins = Math.floor(durationSec / 60);
  const secs = durationSec % 60;
  return mins > 0 ? `${mins} dk ${secs} sn` : `${secs} sn`;
}

export async function generateGameAnalyticsPdfBuffer(
  analytics: GameSessionAnalytics,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      info: {
        Title: `QUIZORA Analiz Raporu - ${analytics.quizTitle}`,
        Author: 'QUIZORA',
        Subject: 'Canlı Bilgi Yarışması Sonuç ve İstatistik Raporu',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', (err) => reject(err));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    const fonts = resolveFontPaths();
    const FONT_REGULAR = fonts ? 'QuizoraRegular' : 'Helvetica';
    const FONT_BOLD = fonts ? 'QuizoraBold' : 'Helvetica-Bold';

    if (fonts) {
      doc.registerFont(FONT_REGULAR, fonts.regular);
      doc.registerFont(FONT_BOLD, fonts.bold);
    }

    const pageWidth = doc.page.width - 80;
    const leftX = 40;
    const pageBottom = doc.page.height - 50;

    const ensureSpace = (neededHeight: number) => {
      if (doc.y + neededHeight > pageBottom) {
        doc.addPage();
      }
    };

    // 1. Üst Başlık Bandı
    doc
      .roundedRect(leftX, 36, pageWidth, 74, 10)
      .fillAndStroke(COLORS.burgundy, COLORS.burgundy);

    doc
      .fillColor(COLORS.white)
      .font(FONT_BOLD)
      .fontSize(16)
      .text('QUIZORA — YARIŞMA ANALİZ RAPORU', leftX + 18, 49, {
        width: pageWidth - 36,
      });

    doc
      .fillColor(COLORS.powder)
      .font(FONT_BOLD)
      .fontSize(12)
      .text(analytics.quizTitle, leftX + 18, 71, {
        width: pageWidth - 36,
      });

    doc
      .fillColor(COLORS.white)
      .font(FONT_REGULAR)
      .fontSize(8.5)
      .text(
        `Kategori: ${analytics.quizCategory}   |   PIN: ${analytics.pin}   |   Durum: ${STATUS_TR[analytics.status]}   |   Tarih: ${formatDateTr(analytics.endedAt ?? analytics.createdAt)}   |   Süre: ${formatDurationTr(analytics.durationSec)}`,
        leftX + 18,
        90,
        { width: pageWidth - 36 },
      );

    doc.y = 124;

    // 2. Genel İstatistikler (6 KPI Kutusu - 3x2 Izgara)
    doc
      .fillColor(COLORS.navy)
      .font(FONT_BOLD)
      .fontSize(12)
      .text('1. Genel İstatistikler', leftX, doc.y);

    doc.moveDown(0.4);

    const kpis = [
      {
        label: 'Toplam Katılımcı',
        value: `${analytics.overview.totalParticipants} oyuncu`,
      },
      {
        label: 'Ortalama Doğru Oranı',
        value:
          analytics.overview.averageSuccessRatePct !== null
            ? `%${analytics.overview.averageSuccessRatePct}`
            : 'Veri yok',
      },
      {
        label: 'Ortalama Puan',
        value:
          analytics.overview.averageScore !== null
            ? `${analytics.overview.averageScore.toLocaleString('tr-TR')} p`
            : 'Veri yok',
      },
      {
        label: 'En Yüksek Puan',
        value:
          analytics.overview.highestScore !== null
            ? `${analytics.overview.highestScore.toLocaleString('tr-TR')} p (${analytics.overview.highestScorerNickname ?? '—'})`
            : 'Veri yok',
      },
      {
        label: 'En Zor Soru',
        value: analytics.overview.hardestQuestion
          ? `Soru ${analytics.overview.hardestQuestion.questionNumber} (%${analytics.overview.hardestQuestion.successRatePct})`
          : 'Veri yok',
      },
      {
        label: 'Ort. Cevaplama Süresi',
        value:
          analytics.overview.averageResponseMs !== null
            ? `${(analytics.overview.averageResponseMs / 1000).toFixed(2)} sn`
            : 'Veri yok',
      },
    ];

    const colGap = 10;
    const boxWidth = (pageWidth - colGap * 2) / 3;
    const boxHeight = 44;
    const gridStartY = doc.y;

    kpis.forEach((item, idx) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      const bx = leftX + col * (boxWidth + colGap);
      const by = gridStartY + row * (boxHeight + 8);

      doc
        .roundedRect(bx, by, boxWidth, boxHeight, 6)
        .fillAndStroke(COLORS.cream, COLORS.creamBorder);

      doc
        .fillColor(COLORS.navyMuted)
        .font(FONT_REGULAR)
        .fontSize(8)
        .text(item.label, bx + 10, by + 8, { width: boxWidth - 20 });

      doc
        .fillColor(COLORS.navy)
        .font(FONT_BOLD)
        .fontSize(10.5)
        .text(item.value, bx + 10, by + 22, {
          width: boxWidth - 20,
          ellipsis: true,
        });
    });

    doc.y = gridStartY + boxHeight * 2 + 24;

    // 3. Grafikler (Vektörel Çubuk Grafikler: Sorulara Göre Başarı & Süre + Puan Dağılımı)
    ensureSpace(140);
    doc
      .fillColor(COLORS.navy)
      .font(FONT_BOLD)
      .fontSize(12)
      .text('2. Grafik Özeti (Soru Başarı Oranı ve Cevaplama Süresi)', leftX, doc.y);
    doc.moveDown(0.35);

    if (analytics.charts.questionSuccessAndTime.length === 0) {
      doc
        .fillColor(COLORS.navyMuted)
        .font(FONT_REGULAR)
        .fontSize(9)
        .text('Grafik oluşturmak için kayıtlı soru verisi bulunmuyor.', leftX, doc.y);
      doc.moveDown(0.8);
    } else {
      for (const point of analytics.charts.questionSuccessAndTime) {
        ensureSpace(24);
        const rowY = doc.y;
        const barAreaX = leftX + 75;
        const barMaxW = pageWidth - 185;
        const barW = Math.max(
          2,
          Math.min(barMaxW, (point.successRatePct / 100) * barMaxW),
        );

        doc
          .fillColor(COLORS.navy)
          .font(FONT_BOLD)
          .fontSize(8.5)
          .text(`${point.label} (${QUESTION_TYPE_LABELS[point.type].slice(0, 8)})`, leftX, rowY + 2, {
            width: 72,
          });

        doc
          .roundedRect(barAreaX, rowY + 2, barMaxW, 11, 3)
          .fill(COLORS.powder);

        if (point.successRatePct > 0) {
          doc
            .roundedRect(barAreaX, rowY + 2, barW, 11, 3)
            .fill(COLORS.burgundy);
        }

        doc
          .fillColor(COLORS.navy)
          .font(FONT_REGULAR)
          .fontSize(8)
          .text(
            `%${point.successRatePct} başarı  |  ${point.avgResponseSec.toFixed(2)} sn`,
            barAreaX + barMaxW + 8,
            rowY + 2,
            { width: 102 },
          );

        doc.y = rowY + 18;
      }
      doc.moveDown(0.5);
    }

    // Puan Dağılımı Özeti
    if (analytics.charts.scoreDistribution.length > 0) {
      ensureSpace(95);
      doc
        .fillColor(COLORS.navy)
        .font(FONT_BOLD)
        .fontSize(10.5)
        .text('Oyuncuların Puan Dağılımı', leftX, doc.y);
      doc.moveDown(0.3);

      for (const bucket of analytics.charts.scoreDistribution) {
        ensureSpace(18);
        const rowY = doc.y;
        const barAreaX = leftX + 125;
        const barMaxW = pageWidth - 215;
        const barW = Math.max(
          2,
          Math.min(barMaxW, (bucket.percentage / 100) * barMaxW),
        );

        doc
          .fillColor(COLORS.navyMuted)
          .font(FONT_REGULAR)
          .fontSize(8)
          .text(`${bucket.bucketLabel} (${bucket.rangeLabel})`, leftX, rowY + 1, {
            width: 120,
          });

        doc.roundedRect(barAreaX, rowY + 2, barMaxW, 9, 2).fill(COLORS.cream);
        if (bucket.count > 0) {
          doc.roundedRect(barAreaX, rowY + 2, barW, 9, 2).fill(COLORS.navy);
        }

        doc
          .fillColor(COLORS.navy)
          .font(FONT_BOLD)
          .fontSize(8)
          .text(
            `${bucket.count} oyuncu (%${bucket.percentage})`,
            barAreaX + barMaxW + 8,
            rowY + 1,
            { width: 82 },
          );

        doc.y = rowY + 15;
      }
      doc.moveDown(0.6);
    }

    // 4. Soru Bazlı Analizler
    ensureSpace(80);
    doc
      .fillColor(COLORS.navy)
      .font(FONT_BOLD)
      .fontSize(12)
      .text('3. Soru Bazlı Ayrıntılı Analizler', leftX, doc.y);
    doc.moveDown(0.4);

    for (const q of analytics.questions) {
      ensureSpace(74);
      const cardY = doc.y;
      doc
        .roundedRect(leftX, cardY, pageWidth, 64, 6)
        .fillAndStroke(COLORS.cream, COLORS.creamBorder);

      doc
        .fillColor(COLORS.burgundy)
        .font(FONT_BOLD)
        .fontSize(8.5)
        .text(
          `Soru ${q.questionNumber} · ${QUESTION_TYPE_LABELS[q.type]} · Başarı: ${q.successRatePct !== null ? `%${q.successRatePct}` : 'Veri yok'} · Ort. Süre: ${q.averageResponseMs !== null ? `${(q.averageResponseMs / 1000).toFixed(2)} sn` : 'Veri yok'}`,
          leftX + 10,
          cardY + 7,
          { width: pageWidth - 20 },
        );

      doc
        .fillColor(COLORS.navy)
        .font(FONT_BOLD)
        .fontSize(9.5)
        .text(q.text, leftX + 10, cardY + 21, {
          width: pageWidth - 20,
          ellipsis: true,
        });

      doc
        .fillColor(COLORS.navyMuted)
        .font(FONT_REGULAR)
        .fontSize(8)
        .text(
          `Doğru Cevap: ${q.correctAnswerText}   |   En Sık Yanlış: ${q.mostCommonWrongAnswer ?? 'Yok'}`,
          leftX + 10,
          cardY + 36,
          { width: pageWidth - 20, ellipsis: true },
        );

      doc
        .fillColor(COLORS.navy)
        .font(FONT_REGULAR)
        .fontSize(8)
        .text(
          `Doğru: ${q.correctCount}   |   Kısmi Doğru: ${q.partialCount}   |   Yanlış: ${q.wrongCount}   |   Boş: ${q.unansweredCount}`,
          leftX + 10,
          cardY + 49,
          { width: pageWidth - 20 },
        );

      doc.y = cardY + 71;
    }

    doc.moveDown(0.5);

    // 5. Katılımcı Sonuçları Tablosu
    ensureSpace(80);
    doc
      .fillColor(COLORS.navy)
      .font(FONT_BOLD)
      .fontSize(12)
      .text('4. Katılımcı Performans Sonuçları', leftX, doc.y);
    doc.moveDown(0.35);

    if (analytics.participants.length === 0) {
      doc
        .fillColor(COLORS.navyMuted)
        .font(FONT_REGULAR)
        .fontSize(9)
        .text('Bu yarışmaya katılan oyuncu kaydı bulunmuyor.', leftX, doc.y);
    } else {
      const cols = [
        { header: 'Sıra', width: 34 },
        { header: 'Kullanıcı Adı', width: 150 },
        { header: 'Puan', width: 62 },
        { header: 'Doğru', width: 46 },
        { header: 'Yanlış', width: 46 },
        { header: 'Boş', width: 42 },
        { header: 'Başarı %', width: 65 },
        { header: 'Ort. Süre', width: 70 },
      ];

      const drawTableHeader = () => {
        const hy = doc.y;
        doc
          .roundedRect(leftX, hy, pageWidth, 20, 4)
          .fill(COLORS.navy);
        let cx = leftX + 6;
        for (const col of cols) {
          doc
            .fillColor(COLORS.white)
            .font(FONT_BOLD)
            .fontSize(8)
            .text(col.header, cx, hy + 5, { width: col.width - 6 });
          cx += col.width;
        }
        doc.y = hy + 23;
      };

      drawTableHeader();

      analytics.participants.forEach((p, idx) => {
        if (doc.y + 20 > pageBottom) {
          doc.addPage();
          drawTableHeader();
        }

        const ry = doc.y;
        if (idx % 2 === 0) {
          doc.rect(leftX, ry, pageWidth, 18).fill(COLORS.cream);
        }

        const values = [
          `#${p.rank}`,
          p.nickname,
          `${p.totalScore.toLocaleString('tr-TR')}`,
          String(p.correctCount),
          String(p.wrongCount),
          String(p.unansweredCount),
          `%${p.successRatePct}`,
          p.avgResponseMs !== null
            ? `${(p.avgResponseMs / 1000).toFixed(2)} sn`
            : '—',
        ];

        let cx = leftX + 6;
        cols.forEach((col, cIdx) => {
          doc
            .fillColor(COLORS.navy)
            .font(cIdx === 1 ? FONT_BOLD : FONT_REGULAR)
            .fontSize(8)
            .text(values[cIdx] ?? '', cx, ry + 4, {
              width: col.width - 6,
              ellipsis: true,
            });
          cx += col.width;
        });

        doc.y = ry + 19;
      });
    }

    doc.end();
  });
}
