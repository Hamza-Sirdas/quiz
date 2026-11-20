import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Link, useParams } from 'react-router-dom';
import type {
  GameSessionAnalytics,
  ParticipantAnalyticsItem,
} from '@shared/analyticsTypes';
import { QUESTION_TYPE_LABELS } from '@shared/quizTypes';
import {
  QuestionOptionDistributionChart,
  SessionChartsSection,
} from '@/components/analytics/SessionChartsSection';
import {
  BarChartIcon,
  CheckIcon,
  ChevronLeftIcon,
  ClockIcon,
  DownloadIcon,
  EditIcon,
  UsersIcon,
} from '@/components/ui/Icons';
import {
  downloadGameResultsCsv,
  downloadGameResultsPdf,
  getGameSessionAnalytics,
} from '@/services/gameApi';
import { ApiError } from '@/services/quizApi';
import { cn } from '@/utils/cn';
import { formatDateTime, formatDurationSec } from '@/utils/formatDate';
import { formatPinDisplay } from '@/utils/gameStorage';

type SortKey =
  | 'rank'
  | 'nickname'
  | 'totalScore'
  | 'correctCount'
  | 'wrongCount'
  | 'unansweredCount'
  | 'successRatePct'
  | 'avgResponseMs';

type SortDirection = 'ascending' | 'descending';

const PAGE_SIZE = 10;

const turkishCollator = new Intl.Collator('tr-TR', {
  numeric: true,
  sensitivity: 'base',
});

const STATUS_LABELS: Record<GameSessionAnalytics['status'], string> = {
  FINISHED: 'Tamamlandı',
  CANCELLED: 'İptal Edildi',
  INTERRUPTED: 'Kesintiye Uğradı',
};

const SORT_COLUMN_NAMES: Record<SortKey, string> = {
  rank: 'Sıralama',
  nickname: 'Kullanıcı Adı',
  totalScore: 'Toplam Puan',
  correctCount: 'Doğru Sayısı',
  wrongCount: 'Yanlış Sayısı',
  unansweredCount: 'Boş Sayısı',
  successRatePct: 'Başarı Oranı',
  avgResponseMs: 'Ortalama Cevaplama Süresi',
};

function formatResponseSec(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) {
    return 'Veri yok';
  }
  return `${(ms / 1000).toFixed(2)} sn`;
}

export function GameSessionAnalyticsPage() {
  const { sessionId } = useParams<{ sessionId: string }>();

  const [analytics, setAnalytics] = useState<GameSessionAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [downloadingCsv, setDownloadingCsv] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>('totalScore');
  const [sortDir, setSortDir] = useState<SortDirection>('descending');
  const [sortAnnouncement, setSortAnnouncement] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(
    null,
  );

  const tableCaptionId = useId();

  const loadAnalytics = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getGameSessionAnalytics(sessionId);
      setAnalytics(data.analytics);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Yarışma analiz verileri yüklenirken bir hata oluştu.',
      );
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const handleSort = (column: SortKey, defaultDir: SortDirection = 'descending') => {
    let nextDir: SortDirection = defaultDir;
    if (sortKey === column) {
      nextDir = sortDir === 'ascending' ? 'descending' : 'ascending';
    }
    setSortKey(column);
    setSortDir(nextDir);
    setCurrentPage(1);
    const dirLabel = nextDir === 'ascending' ? 'artan' : 'azalan';
    setSortAnnouncement(
      `Öğrenci performans tablosu ${SORT_COLUMN_NAMES[column]} sütununa göre ${dirLabel} sırada sıralandı.`,
    );
  };

  const sortedParticipants = useMemo(() => {
    if (!analytics) return [];
    const factor = sortDir === 'ascending' ? 1 : -1;

    return [...analytics.participants].sort((a, b) => {
      switch (sortKey) {
        case 'nickname':
          return factor * turkishCollator.compare(a.nickname, b.nickname);
        case 'rank':
          return factor * (a.rank - b.rank);
        case 'totalScore':
          return (
            factor * (a.totalScore - b.totalScore) ||
            a.rank - b.rank
          );
        case 'correctCount':
          return (
            factor * (a.correctCount - b.correctCount) ||
            a.rank - b.rank
          );
        case 'wrongCount':
          return (
            factor * (a.wrongCount - b.wrongCount) ||
            a.rank - b.rank
          );
        case 'unansweredCount':
          return (
            factor * (a.unansweredCount - b.unansweredCount) ||
            a.rank - b.rank
          );
        case 'successRatePct':
          return (
            factor * (a.successRatePct - b.successRatePct) ||
            a.rank - b.rank
          );
        case 'avgResponseMs': {
          const valA = a.avgResponseMs ?? Number.POSITIVE_INFINITY;
          const valB = b.avgResponseMs ?? Number.POSITIVE_INFINITY;
          if (valA === valB) return a.rank - b.rank;
          return factor * (valA - valB);
        }
        default:
          return a.rank - b.rank;
      }
    });
  }, [analytics, sortKey, sortDir]);

  const totalPages = Math.max(
    1,
    Math.ceil(sortedParticipants.length / PAGE_SIZE),
  );

  const paginatedParticipants = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedParticipants.slice(start, start + PAGE_SIZE);
  }, [sortedParticipants, currentPage]);

  const selectedParticipant: ParticipantAnalyticsItem | null = useMemo(() => {
    if (!analytics || !selectedParticipantId) return null;
    return (
      analytics.participants.find(
        (p) => p.participantId === selectedParticipantId,
      ) ?? null
    );
  }, [analytics, selectedParticipantId]);

  const handleExportCsv = async () => {
    if (!analytics) return;
    setDownloadingCsv(true);
    setExportError(null);
    try {
      await downloadGameResultsCsv(analytics.id, analytics.pin);
    } catch (err) {
      setExportError(
        err instanceof ApiError
          ? err.message
          : 'CSV raporu indirilirken bir hata oluştu.',
      );
    } finally {
      setDownloadingCsv(false);
    }
  };

  const handleExportPdf = async () => {
    if (!analytics) return;
    setDownloadingPdf(true);
    setExportError(null);
    try {
      await downloadGameResultsPdf(analytics.id, analytics.pin);
    } catch (err) {
      setExportError(
        err instanceof ApiError
          ? err.message
          : 'PDF raporu indirilirken bir hata oluştu.',
      );
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="h-8 w-64 rounded-xl bg-cream-200 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2, 3, 4, 5].map((idx) => (
            <div
              key={idx}
              className="h-28 rounded-2xl bg-cream-50 border border-cream-300 p-5 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="space-y-4">
        <Link
          to="/dashboard/history"
          className="inline-flex items-center gap-2 text-sm font-semibold text-burgundy-600 hover:text-burgundy-700"
        >
          <ChevronLeftIcon />
          <span>Yarışma Geçmişine Dön</span>
        </Link>
        <div
          role="alert"
          className="rounded-2xl bg-burgundy-50 border border-burgundy-500 p-6 text-navy-900"
        >
          <h1 className="font-display font-bold text-lg">
            Yarışma Analizi Yüklenemedi
          </h1>
          <p className="mt-1 text-sm text-navy-700">
            {error ?? 'İstenen yarışma oturumu bulunamadı veya erişim yetkiniz yok.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void loadAnalytics()}
              className="rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-4 py-2 text-sm font-semibold text-cream-50 cursor-pointer"
            >
              Tekrar Dene
            </button>
            <Link
              to="/dashboard/history"
              className="rounded-xl border border-cream-300 bg-cream-50 hover:bg-cream-200 px-4 py-2 text-sm font-semibold text-navy-900"
            >
              Geçmiş Yarışmalara Dön
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { overview } = analytics;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      {/* Üst Başlık ve Eylemler */}
      <header className="rounded-2xl bg-cream-50 border border-cream-300 p-6 shadow-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/dashboard/history"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-burgundy-600 hover:text-burgundy-700"
          >
            <ChevronLeftIcon />
            <span>Geçmiş Yarışmalara Dön</span>
          </Link>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-powder-100 border border-powder-200 px-3 py-1 text-xs font-semibold text-burgundy-600">
              {analytics.quizCategory}
            </span>
            <span className="inline-flex items-center rounded-full bg-cream-200 border border-cream-300 px-3 py-1 text-xs font-semibold text-navy-900">
              {STATUS_LABELS[analytics.status]}
            </span>
            <span className="inline-flex items-center rounded-full bg-cream-100 border border-cream-300 px-3 py-1 text-xs font-bold tabular-nums text-navy-700">
              PIN: {formatPinDisplay(analytics.pin)}
            </span>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="space-y-1.5">
            <h1
              className="font-display font-bold tracking-tight text-navy-900"
              style={{ fontSize: 'var(--text-h1)', lineHeight: 'var(--leading-h1)' }}
            >
              {analytics.quizTitle}
            </h1>
            <p className="text-xs sm:text-sm text-navy-600 tabular-nums">
              Tarih: <strong className="text-navy-800">{formatDateTime(analytics.endedAt ?? analytics.createdAt)}</strong>
              {' · '}
              Oturum Süresi: <strong className="text-navy-800">{formatDurationSec(analytics.durationSec)}</strong>
              {' · '}
              Soru Sayısı: <strong className="text-navy-800">{analytics.totalQuestions}</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {analytics.quizId && analytics.quizStillExists && (
              <Link
                to={`/dashboard/quizzes/${analytics.quizId}/edit`}
                className="inline-flex items-center justify-center gap-1.5 min-h-10 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-4 py-2 text-xs sm:text-sm font-semibold text-navy-900"
              >
                <EditIcon />
                <span>Quizi Düzenle</span>
              </Link>
            )}

            <button
              type="button"
              disabled={downloadingCsv}
              onClick={() => void handleExportCsv()}
              className="inline-flex items-center justify-center gap-1.5 min-h-10 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-4 py-2 text-xs sm:text-sm font-semibold text-navy-900 cursor-pointer disabled:opacity-60"
            >
              <DownloadIcon className="h-4 w-4" />
              <span>{downloadingCsv ? 'CSV İndiriliyor...' : 'CSV Olarak İndir'}</span>
            </button>

            <button
              type="button"
              disabled={downloadingPdf}
              onClick={() => void handleExportPdf()}
              className="inline-flex items-center justify-center gap-1.5 min-h-10 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-4 py-2 text-xs sm:text-sm font-semibold text-cream-50 cursor-pointer disabled:opacity-60"
            >
              <DownloadIcon className="h-4 w-4" />
              <span>{downloadingPdf ? 'PDF Hazırlanıyor...' : 'PDF Olarak İndir'}</span>
            </button>
          </div>
        </div>

        {exportError && (
          <div
            role="alert"
            className="rounded-xl bg-burgundy-50 border border-burgundy-500 p-3 text-xs font-semibold text-burgundy-700"
          >
            {exportError}
          </div>
        )}
      </header>

      {/* Eksik veri veya katılımcısız yarışma uyarıları */}
      {analytics.overview.totalParticipants === 0 && (
        <section
          role="status"
          className="rounded-2xl bg-powder-100/70 border border-powder-200 p-5 text-navy-900"
        >
          <h2 className="font-display font-bold text-base text-burgundy-700">
            Bu yarışmaya katılan öğrenci bulunmuyor
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-navy-700">
            Yarışma hiçbir katılımcı katılmadan sonlandırıldığı için ortalama başarı oranı ve cevaplama süresi gibi istatistikler &quot;Veri yok&quot; olarak işaretlenmiştir.
          </p>
        </section>
      )}

      {analytics.overview.totalParticipants > 0 &&
        analytics.overview.totalAnswersSubmitted === 0 && (
          <section
            role="status"
            className="rounded-2xl bg-powder-100/70 border border-powder-200 p-5 text-navy-900"
          >
            <h2 className="font-display font-bold text-base text-burgundy-700">
              Bu yarışmada gönderilmiş soru yanıtı kaydı bulunmuyor
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-navy-700">
              Katılımcılar yarışmaya katılmış ancak herhangi bir soruya yanıt göndermemiş. Soru bazlı dağılımlar mevcut veriler üzerinden sıfır yanıt olarak gösterilmektedir.
            </p>
          </section>
        )}

      {/* 3.A. Genel Özet Kartları (6 KPI Kartı) */}
      <section aria-labelledby="overview-kpis-title" className="space-y-3">
        <h2
          id="overview-kpis-title"
          className="font-display font-bold text-xl text-navy-900"
        >
          Genel Özet İstatistikleri
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <article className="rounded-2xl bg-cream-50 border border-cream-300 p-5 shadow-card">
            <div className="flex items-center justify-between text-xs font-semibold text-navy-600">
              <span>Toplam Katılımcı</span>
              <span className="text-burgundy-600">
                <UsersIcon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 font-display font-bold text-2xl sm:text-3xl tabular-nums text-navy-900">
              {overview.totalParticipants}
            </p>
            <p className="mt-1 text-xs text-navy-500">
              Yarışmaya bağlanan toplam öğrenci
            </p>
          </article>

          <article className="rounded-2xl bg-cream-50 border border-cream-300 p-5 shadow-card">
            <div className="flex items-center justify-between text-xs font-semibold text-navy-600">
              <span>Ortalama Doğru Cevap Oranı</span>
              <span className="text-burgundy-600">
                <BarChartIcon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 font-display font-bold text-2xl sm:text-3xl tabular-nums text-navy-900">
              {overview.averageSuccessRatePct !== null
                ? `%${overview.averageSuccessRatePct}`
                : 'Veri yok'}
            </p>
            <p className="mt-1 text-xs text-navy-500">
              Tüm sorulardaki genel sınıf başarısı
            </p>
          </article>

          <article className="rounded-2xl bg-cream-50 border border-cream-300 p-5 shadow-card">
            <div className="flex items-center justify-between text-xs font-semibold text-navy-600">
              <span>Ortalama Puan</span>
              <span className="text-burgundy-600">
                <CheckIcon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 font-display font-bold text-2xl sm:text-3xl tabular-nums text-navy-900">
              {overview.averageScore !== null
                ? `${overview.averageScore.toLocaleString('tr-TR')} puan`
                : 'Veri yok'}
            </p>
            <p className="mt-1 text-xs text-navy-500">
              Katılımcı başına ortalama toplam puan
            </p>
          </article>

          <article className="rounded-2xl bg-cream-50 border border-cream-300 p-5 shadow-card">
            <div className="flex items-center justify-between text-xs font-semibold text-navy-600">
              <span>En Yüksek Puan</span>
              <span className="text-burgundy-600">
                <CheckIcon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 font-display font-bold text-2xl sm:text-3xl tabular-nums text-navy-900">
              {overview.highestScore !== null
                ? `${overview.highestScore.toLocaleString('tr-TR')} puan`
                : 'Veri yok'}
            </p>
            <p className="mt-1 text-xs text-navy-500 truncate">
              {overview.highestScorerNickname
                ? `Birinci: ${overview.highestScorerNickname}`
                : 'Katılımcı kaydı yok'}
            </p>
          </article>

          <article className="rounded-2xl bg-cream-50 border border-cream-300 p-5 shadow-card">
            <div className="flex items-center justify-between text-xs font-semibold text-navy-600">
              <span>En Zor Soru</span>
              <span className="text-burgundy-600">
                <BarChartIcon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 font-display font-bold text-lg sm:text-xl text-navy-900 line-clamp-1">
              {overview.hardestQuestion
                ? `Soru ${overview.hardestQuestion.questionNumber} (%${overview.hardestQuestion.successRatePct})`
                : 'Veri yok'}
            </p>
            <p className="mt-1 text-xs text-navy-500 line-clamp-1">
              {overview.hardestQuestion
                ? overview.hardestQuestion.text
                : 'Henüz değerlendirilen soru yok'}
            </p>
          </article>

          <article className="rounded-2xl bg-cream-50 border border-cream-300 p-5 shadow-card">
            <div className="flex items-center justify-between text-xs font-semibold text-navy-600">
              <span>Ortalama Cevaplama Süresi</span>
              <span className="text-burgundy-600">
                <ClockIcon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-2 font-display font-bold text-2xl sm:text-3xl tabular-nums text-navy-900">
              {formatResponseSec(overview.averageResponseMs)}
            </p>
            <p className="mt-1 text-xs text-navy-500">
              Gönderilen yanıtların ortalama süresi
            </p>
          </article>
        </div>
      </section>

      {/* 3.D. Görsel Grafikler */}
      <SessionChartsSection
        questionChartData={analytics.charts.questionSuccessAndTime}
        scoreDistribution={analytics.charts.scoreDistribution}
        participantCount={overview.totalParticipants}
      />

      {/* 4. Zor Sorular Analizi */}
      <section aria-labelledby="hardest-questions-title" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h2
              id="hardest-questions-title"
              className="font-display font-bold text-xl text-navy-900"
            >
              Zor Sorular Analizi
            </h2>
            <p className="mt-1 text-sm text-navy-600">
              En düşük başarı oranına sahip sorular, en sık yapılan hatalar ve iyileştirme önerileri.
            </p>
          </div>

          {analytics.quizId && analytics.quizStillExists && (
            <Link
              to={`/dashboard/quizzes/${analytics.quizId}/edit`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-4 py-2 text-xs sm:text-sm font-semibold text-cream-50 shrink-0"
            >
              <EditIcon />
              <span>Quizi Düzenle</span>
            </Link>
          )}
        </div>

        {analytics.hardestQuestions.length === 0 ? (
          <div className="rounded-2xl bg-cream-50 border border-cream-300 p-6 text-sm text-navy-600">
            Zor soru analizi oluşturmak için tamamlanmış soru verisi bulunmuyor.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {analytics.hardestQuestions.slice(0, 4).map((hq, idx) => (
              <article
                key={hq.questionIndex}
                className="rounded-2xl bg-cream-50 border border-cream-300 p-5 shadow-card flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center rounded-full bg-burgundy-50 border border-burgundy-500/40 px-2.5 py-0.5 text-xs font-bold text-burgundy-700">
                      #{idx + 1} En Zor · Soru {hq.questionNumber}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-cream-200 border border-cream-300 px-2.5 py-0.5 text-xs font-semibold text-navy-800">
                      {QUESTION_TYPE_LABELS[hq.type]}
                    </span>
                  </div>

                  <h3 className="font-display font-bold text-base text-navy-900">
                    {hq.text}
                  </h3>
                </div>

                <div className="rounded-xl bg-cream-100 border border-cream-300 p-3.5 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-navy-600">Başarı Oranı:</span>
                    <strong className="font-bold text-burgundy-700 tabular-nums">
                      {hq.successRatePct !== null ? `%${hq.successRatePct}` : 'Veri yok'}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-navy-600">Cevap Veren Oyuncu Sayısı:</span>
                    <strong className="font-semibold text-navy-900 tabular-nums">
                      {hq.answeredCount} / {hq.totalParticipants} öğrenci
                    </strong>
                  </div>
                  <div className="flex items-start justify-between gap-3 pt-1 border-t border-cream-200">
                    <span className="text-navy-600 shrink-0">En Sık Seçilen Yanlış Cevap:</span>
                    <strong className="font-semibold text-navy-900 text-right break-words">
                      {hq.mostCommonWrongAnswer ?? 'Yanlış yanıt kaydı yok'}
                    </strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        <p className="text-xs text-navy-500">
          Not: &quot;Quizi Düzenle&quot; bağlantısıyla quiz sorularını gelecekteki yarışmalar için güncelleyebilirsiniz; bu geçmiş yarışma oturumunun dondurulmuş analiz verileri değiştirilmez.
        </p>
      </section>

      {/* 3.B. Soru Bazlı Analiz */}
      <section aria-labelledby="question-analysis-title" className="space-y-4">
        <div>
          <h2
            id="question-analysis-title"
            className="font-display font-bold text-xl text-navy-900"
          >
            Soru Bazlı Ayrıntılı Analiz
          </h2>
          <p className="mt-1 text-sm text-navy-600">
            Her soru için doğru cevap, doğru/kısmi/yanlış/boş sayıları, başarı yüzdesi, cevaplama süresi ve soru türüne uygun seçenek dağılımı.
          </p>
        </div>

        {!analytics.hasSnapshotQuestions ? (
          <div className="rounded-2xl bg-cream-50 border border-cream-300 p-6 text-sm text-navy-600">
            Bu yarışma oturumuna ait soru anlık görüntüsü (snapshot) kaydı bulunamadı.
          </div>
        ) : (
          <div className="space-y-4">
            {analytics.questions.map((q) => (
              <article
                key={q.questionIndex}
                className="rounded-2xl bg-cream-50 border border-cream-300 p-5 sm:p-6 shadow-card space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-lg bg-navy-900 px-2.5 py-1 text-xs font-bold text-cream-50">
                        Soru {q.questionNumber}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-powder-100 border border-powder-200 px-2.5 py-0.5 text-xs font-semibold text-burgundy-600">
                        {QUESTION_TYPE_LABELS[q.type]}
                      </span>
                      <span className="text-xs font-medium text-navy-500 tabular-nums">
                        Süre Limiti: {q.timeLimitSec} sn · Puan Ağırlığı: {q.points}
                      </span>
                    </div>

                    <h3 className="font-display font-bold text-lg text-navy-900">
                      {q.text}
                    </h3>

                    <p className="text-xs sm:text-sm text-navy-700">
                      Doğru Cevap:{' '}
                      <strong className="font-semibold text-burgundy-700">
                        {q.correctAnswerText}
                      </strong>
                    </p>
                  </div>

                  <div className="flex flex-wrap sm:flex-col items-start sm:items-end gap-1.5 shrink-0">
                    <span className="inline-flex items-center rounded-xl bg-powder-100 border border-powder-200 px-3 py-1 text-xs sm:text-sm font-bold text-burgundy-700 tabular-nums">
                      Başarı: {q.successRatePct !== null ? `%${q.successRatePct}` : 'Veri yok'}
                    </span>
                    <span className="text-xs font-semibold text-navy-600 tabular-nums">
                      Ort. Süre: {formatResponseSec(q.averageResponseMs)}
                    </span>
                  </div>
                </div>

                {/* Doğru / Kısmi / Yanlış / Boş metrik rozetleri */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="rounded-xl bg-cream-100 border border-cream-300 px-3.5 py-2.5">
                    <span className="text-navy-600">Tam Doğru</span>
                    <p className="mt-0.5 font-display font-bold text-base text-burgundy-700 tabular-nums">
                      {q.correctCount} öğrenci
                    </p>
                  </div>

                  <div className="rounded-xl bg-cream-100 border border-cream-300 px-3.5 py-2.5">
                    <span className="text-navy-600">Kısmi Doğru</span>
                    <p className="mt-0.5 font-display font-bold text-base text-navy-900 tabular-nums">
                      {q.partialCount} öğrenci
                    </p>
                  </div>

                  <div className="rounded-xl bg-cream-100 border border-cream-300 px-3.5 py-2.5">
                    <span className="text-navy-600">Yanlış</span>
                    <p className="mt-0.5 font-display font-bold text-base text-navy-900 tabular-nums">
                      {q.wrongCount} öğrenci
                    </p>
                  </div>

                  <div className="rounded-xl bg-cream-100 border border-cream-300 px-3.5 py-2.5">
                    <span className="text-navy-600">Boş Bırakan</span>
                    <p className="mt-0.5 font-display font-bold text-base text-navy-700 tabular-nums">
                      {q.unansweredCount} öğrenci
                    </p>
                  </div>
                </div>

                {/* Soru türüne uygun cevap seçenekleri dağılım grafiği */}
                <QuestionOptionDistributionChart question={q} />
              </article>
            ))}
          </div>
        )}
      </section>

      {/* 3.C. Öğrenci Performansı Tablosu (Erişilebilir Sıralanabilir Tablo) */}
      <section aria-labelledby="student-performance-title" className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h2
              id="student-performance-title"
              className="font-display font-bold text-xl text-navy-900"
            >
              Öğrenci Performansı
            </h2>
            <p className="mt-1 text-sm text-navy-600">
              Katılımcıların puan, doğru, yanlış, boş, başarı oranı ve ortalama cevaplama süresi sıralaması.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-navy-600">Hızlı Sırala:</span>
            <button
              type="button"
              onClick={() => handleSort('totalScore', 'descending')}
              className={cn(
                'min-h-9 rounded-lg border px-3 py-1.5 font-semibold cursor-pointer',
                sortKey === 'totalScore'
                  ? 'bg-burgundy-600 border-burgundy-600 text-cream-50'
                  : 'bg-cream-50 border-cream-300 text-navy-800 hover:bg-cream-200',
              )}
            >
              Puana Göre
            </button>
            <button
              type="button"
              onClick={() => handleSort('successRatePct', 'descending')}
              className={cn(
                'min-h-9 rounded-lg border px-3 py-1.5 font-semibold cursor-pointer',
                sortKey === 'successRatePct'
                  ? 'bg-burgundy-600 border-burgundy-600 text-cream-50'
                  : 'bg-cream-50 border-cream-300 text-navy-800 hover:bg-cream-200',
              )}
            >
              Başarı Oranına Göre
            </button>
          </div>
        </div>

        {/* Kalıcı hesap olmadığına dair bilgilendirme */}
        <div className="rounded-xl bg-cream-100 border border-cream-300 px-4 py-2.5 text-xs text-navy-700">
          Bilgi: Öğrenciler yarışmaya kalıcı kullanıcı hesabı olmadan, yalnızca bu oturum için belirledikleri takma adlarla katılmıştır. Bir öğrencinin soru bazlı yanıtlarını görmek için satırdaki <strong>&quot;Soru Detayı&quot;</strong> butonuna tıklayın.
        </div>

        {/* Ekran okuyucu sıralama bildirim alanı (tek role="status") */}
        <div role="status" aria-live="polite" className="sr-only">
          {sortAnnouncement}
        </div>

        {sortedParticipants.length === 0 ? (
          <div className="rounded-2xl bg-cream-50 border border-cream-300 p-8 text-center text-sm text-navy-600">
            Bu yarışma oturumunda kayıtlı öğrenci performansı bulunmuyor.
          </div>
        ) : (
          <div className="rounded-2xl bg-cream-50 border border-cream-300 shadow-card overflow-hidden">
            <div
              tabIndex={0}
              role="region"
              aria-labelledby={tableCaptionId}
              className="overflow-x-auto focus:outline-2 focus:outline-burgundy-600"
            >
              <table className="w-full min-w-[46rem] border-collapse text-left text-xs sm:text-sm">
                <caption id={tableCaptionId} className="sr-only">
                  Öğrenci performansı ve yarışma sıralama tablosu
                </caption>
                <thead className="bg-cream-100 border-b border-cream-300 text-navy-700">
                  <tr>
                    <th
                      scope="col"
                      aria-sort={sortKey === 'rank' ? sortDir : undefined}
                      className="px-3.5 py-3 font-semibold"
                    >
                      <button
                        type="button"
                        onClick={() => handleSort('rank', 'ascending')}
                        className="inline-flex items-center gap-1 font-bold text-navy-900 hover:text-burgundy-700 cursor-pointer"
                      >
                        <span>Sıralama</span>
                        <span aria-hidden="true" className="text-[11px]">
                          {sortKey === 'rank'
                            ? sortDir === 'ascending'
                              ? '▲'
                              : '▼'
                            : '↕'}
                        </span>
                      </button>
                    </th>

                    <th
                      scope="col"
                      aria-sort={sortKey === 'nickname' ? sortDir : undefined}
                      className="px-3.5 py-3 font-semibold"
                    >
                      <button
                        type="button"
                        onClick={() => handleSort('nickname', 'ascending')}
                        className="inline-flex items-center gap-1 font-bold text-navy-900 hover:text-burgundy-700 cursor-pointer"
                      >
                        <span>Kullanıcı Adı</span>
                        <span aria-hidden="true" className="text-[11px]">
                          {sortKey === 'nickname'
                            ? sortDir === 'ascending'
                              ? '▲'
                              : '▼'
                            : '↕'}
                        </span>
                      </button>
                    </th>

                    <th
                      scope="col"
                      aria-sort={sortKey === 'totalScore' ? sortDir : undefined}
                      className="px-3.5 py-3 font-semibold text-right"
                    >
                      <button
                        type="button"
                        onClick={() => handleSort('totalScore', 'descending')}
                        className="inline-flex items-center justify-end gap-1 font-bold text-navy-900 hover:text-burgundy-700 cursor-pointer"
                      >
                        <span>Toplam Puan</span>
                        <span aria-hidden="true" className="text-[11px]">
                          {sortKey === 'totalScore'
                            ? sortDir === 'ascending'
                              ? '▲'
                              : '▼'
                            : '↕'}
                        </span>
                      </button>
                    </th>

                    <th
                      scope="col"
                      aria-sort={sortKey === 'correctCount' ? sortDir : undefined}
                      className="px-3.5 py-3 font-semibold text-right"
                    >
                      <button
                        type="button"
                        onClick={() => handleSort('correctCount', 'descending')}
                        className="inline-flex items-center justify-end gap-1 font-bold text-navy-900 hover:text-burgundy-700 cursor-pointer"
                      >
                        <span>Doğru</span>
                        <span aria-hidden="true" className="text-[11px]">
                          {sortKey === 'correctCount'
                            ? sortDir === 'ascending'
                              ? '▲'
                              : '▼'
                            : '↕'}
                        </span>
                      </button>
                    </th>

                    <th
                      scope="col"
                      aria-sort={sortKey === 'wrongCount' ? sortDir : undefined}
                      className="px-3.5 py-3 font-semibold text-right"
                    >
                      <button
                        type="button"
                        onClick={() => handleSort('wrongCount', 'descending')}
                        className="inline-flex items-center justify-end gap-1 font-bold text-navy-900 hover:text-burgundy-700 cursor-pointer"
                      >
                        <span>Yanlış</span>
                        <span aria-hidden="true" className="text-[11px]">
                          {sortKey === 'wrongCount'
                            ? sortDir === 'ascending'
                              ? '▲'
                              : '▼'
                            : '↕'}
                        </span>
                      </button>
                    </th>

                    <th
                      scope="col"
                      aria-sort={sortKey === 'unansweredCount' ? sortDir : undefined}
                      className="px-3.5 py-3 font-semibold text-right"
                    >
                      <button
                        type="button"
                        onClick={() => handleSort('unansweredCount', 'descending')}
                        className="inline-flex items-center justify-end gap-1 font-bold text-navy-900 hover:text-burgundy-700 cursor-pointer"
                      >
                        <span>Boş</span>
                        <span aria-hidden="true" className="text-[11px]">
                          {sortKey === 'unansweredCount'
                            ? sortDir === 'ascending'
                              ? '▲'
                              : '▼'
                            : '↕'}
                        </span>
                      </button>
                    </th>

                    <th
                      scope="col"
                      aria-sort={sortKey === 'successRatePct' ? sortDir : undefined}
                      className="px-3.5 py-3 font-semibold text-right"
                    >
                      <button
                        type="button"
                        onClick={() => handleSort('successRatePct', 'descending')}
                        className="inline-flex items-center justify-end gap-1 font-bold text-navy-900 hover:text-burgundy-700 cursor-pointer"
                      >
                        <span>Başarı Oranı</span>
                        <span aria-hidden="true" className="text-[11px]">
                          {sortKey === 'successRatePct'
                            ? sortDir === 'ascending'
                              ? '▲'
                              : '▼'
                            : '↕'}
                        </span>
                      </button>
                    </th>

                    <th
                      scope="col"
                      aria-sort={sortKey === 'avgResponseMs' ? sortDir : undefined}
                      className="px-3.5 py-3 font-semibold text-right"
                    >
                      <button
                        type="button"
                        onClick={() => handleSort('avgResponseMs', 'ascending')}
                        className="inline-flex items-center justify-end gap-1 font-bold text-navy-900 hover:text-burgundy-700 cursor-pointer"
                      >
                        <span>Ort. Süre</span>
                        <span aria-hidden="true" className="text-[11px]">
                          {sortKey === 'avgResponseMs'
                            ? sortDir === 'ascending'
                              ? '▲'
                              : '▼'
                            : '↕'}
                        </span>
                      </button>
                    </th>

                    <th scope="col" className="px-3.5 py-3 font-bold text-right text-navy-900">
                      İncele
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-cream-200">
                  {paginatedParticipants.map((p) => {
                    const isSelected = selectedParticipantId === p.participantId;
                    return (
                      <tr
                        key={p.participantId}
                        className={cn(
                          'transition-colors',
                          isSelected ? 'bg-powder-100/70' : 'hover:bg-cream-100/70',
                        )}
                      >
                        <td className="px-3.5 py-3 font-bold tabular-nums text-navy-900">
                          #{p.rank}
                        </td>
                        <th
                          scope="row"
                          className="px-3.5 py-3 font-semibold text-navy-900"
                        >
                          {p.nickname}
                        </th>
                        <td className="px-3.5 py-3 text-right font-bold tabular-nums text-burgundy-700">
                          {p.totalScore.toLocaleString('tr-TR')}
                        </td>
                        <td className="px-3.5 py-3 text-right tabular-nums text-navy-900">
                          {p.correctCount}
                          {p.partialCount > 0 ? ` (+${p.partialCount} kısmi)` : ''}
                        </td>
                        <td className="px-3.5 py-3 text-right tabular-nums text-navy-900">
                          {p.wrongCount}
                        </td>
                        <td className="px-3.5 py-3 text-right tabular-nums text-navy-700">
                          {p.unansweredCount}
                        </td>
                        <td className="px-3.5 py-3 text-right font-semibold tabular-nums text-navy-900">
                          %{p.successRatePct}
                        </td>
                        <td className="px-3.5 py-3 text-right tabular-nums text-navy-700">
                          {formatResponseSec(p.avgResponseMs)}
                        </td>
                        <td className="px-3.5 py-3 text-right">
                          <button
                            type="button"
                            aria-expanded={isSelected}
                            onClick={() =>
                              setSelectedParticipantId(
                                isSelected ? null : p.participantId,
                              )
                            }
                            className={cn(
                              'min-h-9 rounded-lg border px-2.5 py-1.5 text-xs font-semibold cursor-pointer',
                              isSelected
                                ? 'bg-navy-900 border-navy-900 text-cream-50'
                                : 'bg-cream-100 border-cream-300 text-navy-900 hover:bg-cream-200',
                            )}
                          >
                            {isSelected ? 'Detayı Kapat' : 'Soru Detayı'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Sayfalama (30+ katılımcı için) */}
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-cream-300 bg-cream-100 px-4 py-3 text-xs">
                <span className="text-navy-600 tabular-nums">
                  Toplam {sortedParticipants.length} katılımcı · Sayfa {currentPage} / {totalPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="min-h-9 rounded-lg border border-cream-300 bg-cream-50 hover:bg-cream-200 px-3 py-1.5 font-semibold text-navy-900 cursor-pointer disabled:opacity-50"
                  >
                    Önceki Sayfa
                  </button>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="min-h-9 rounded-lg border border-cream-300 bg-cream-50 hover:bg-cream-200 px-3 py-1.5 font-semibold text-navy-900 cursor-pointer disabled:opacity-50"
                  >
                    Sonraki Sayfa
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Seçilen Öğrencinin Soru Bazlı Performans Detayı */}
        {selectedParticipant && (
          <article
            aria-label={`${selectedParticipant.nickname} soru bazlı performans detayı`}
            className="rounded-2xl bg-cream-50 border-2 border-burgundy-600 p-5 shadow-card space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cream-300 pb-3">
              <div>
                <span className="text-xs font-bold text-burgundy-600">
                  Öğrenci Soru Bazlı Yanıt Dökümü
                </span>
                <h3 className="font-display font-bold text-lg text-navy-900">
                  {selectedParticipant.nickname} (Sıra #{selectedParticipant.rank} ·{' '}
                  {selectedParticipant.totalScore.toLocaleString('tr-TR')} puan)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedParticipantId(null)}
                className="rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-3 py-1.5 text-xs font-semibold text-navy-900 cursor-pointer"
              >
                Kapat
              </button>
            </div>

            {selectedParticipant.questionBreakdown.length === 0 ? (
              <p className="text-xs text-navy-600">
                Bu öğrenci için soru bazlı yanıt dökümü bulunamadı.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {selectedParticipant.questionBreakdown.map((item) => {
                  const statusLabel =
                    item.status === 'CORRECT'
                      ? 'Tam Doğru'
                      : item.status === 'PARTIAL'
                        ? 'Kısmi Doğru'
                        : item.status === 'WRONG'
                          ? 'Yanlış'
                          : 'Boş';

                  const badgeStyle =
                    item.status === 'CORRECT'
                      ? 'bg-burgundy-600 text-cream-50'
                      : item.status === 'PARTIAL'
                        ? 'bg-powder-200 text-burgundy-800'
                        : item.status === 'WRONG'
                          ? 'bg-navy-900 text-cream-50'
                          : 'bg-cream-200 text-navy-700';

                  return (
                    <div
                      key={item.questionIndex}
                      className="rounded-xl bg-cream-100 border border-cream-300 p-3.5 space-y-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-navy-900">
                          Soru {item.questionNumber}
                        </span>
                        <span
                          className={cn(
                            'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold',
                            badgeStyle,
                          )}
                        >
                          {statusLabel} (+{item.pointsAwarded} puan)
                        </span>
                      </div>
                      <p className="font-semibold text-navy-800 line-clamp-1">
                        {item.questionText}
                      </p>
                      <p className="text-navy-700">
                        Öğrenci Yanıtı:{' '}
                        <strong className="text-navy-900">
                          {item.submittedAnswerText ?? 'Boş bırakıldı'}
                        </strong>
                      </p>
                      <p className="text-navy-500 tabular-nums">
                        Yanıt Süresi: {formatResponseSec(item.responseTimeMs)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </article>
        )}
      </section>
    </motion.div>
  );
}
