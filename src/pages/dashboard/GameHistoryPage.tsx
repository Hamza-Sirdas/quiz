import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import type { GameHistoryDetail, GameHistorySummary } from '@shared/gameTypes';
import { LeaderboardTable } from '@/components/game/LeaderboardTable';
import {
  BarChartIcon,
  CloseIcon,
  DownloadIcon,
  EyeIcon,
  HistoryIcon,
  SearchIcon,
} from '@/components/ui/Icons';
import {
  downloadGameResultsCsv,
  downloadGameResultsPdf,
  getGameHistory,
  getGameHistoryDetail,
} from '@/services/gameApi';
import { ApiError } from '@/services/quizApi';
import { cn } from '@/utils/cn';
import { handleLightDismissBackdropClick } from '@/utils/dialogLightDismiss';
import { formatDateTime, formatDurationSec } from '@/utils/formatDate';
import { formatPinDisplay } from '@/utils/gameStorage';

const STATUS_LABELS: Record<GameHistorySummary['status'], string> = {
  FINISHED: 'Tamamlandı',
  CANCELLED: 'İptal Edildi',
  INTERRUPTED: 'Kesintiye Uğradı',
};

export function GameHistoryPage() {
  const [history, setHistory] = useState<GameHistorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [detail, setDetail] = useState<GameHistoryDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [downloadingCsvId, setDownloadingCsvId] = useState<string | null>(null);
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const dialogTitleId = useId();

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getGameHistory();
      setHistory(data.history);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Yarışma geçmişi yüklenirken bir hata oluştu.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (detailOpen && detail && !dialog.open) {
      dialog.showModal();
    } else if (!detailOpen && dialog.open) {
      dialog.close();
    }
  }, [detailOpen, detail]);

  const filteredHistory = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLocaleLowerCase('tr-TR');

    const matches = history.filter((item) => {
      if (statusFilter !== 'ALL' && item.status !== statusFilter) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      const titleMatch = item.quizTitle
        .toLocaleLowerCase('tr-TR')
        .includes(normalizedSearch);
      const categoryMatch = item.quizCategory
        .toLocaleLowerCase('tr-TR')
        .includes(normalizedSearch);
      const pinMatch = item.pin.includes(normalizedSearch);
      return titleMatch || categoryMatch || pinMatch;
    });

    return [...matches].sort((a, b) => {
      const timeA = new Date(a.endedAt ?? a.createdAt).getTime();
      const timeB = new Date(b.endedAt ?? b.createdAt).getTime();
      return sortOrder === 'oldest' ? timeA - timeB : timeB - timeA;
    });
  }, [history, searchQuery, sortOrder, statusFilter]);

  const handleOpenDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const data = await getGameHistoryDetail(id);
      setDetail(data.session);
      setDetailOpen(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Yarışma sonuç detayları yüklenemedi.',
      );
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleDownloadCsv = async (id: string, pin: string) => {
    setDownloadingCsvId(id);
    try {
      await downloadGameResultsCsv(id, pin);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Sonuç CSV dosyası indirilemedi.',
      );
    } finally {
      setDownloadingCsvId(null);
    }
  };

  const handleDownloadPdf = async (id: string, pin: string) => {
    setDownloadingPdfId(id);
    try {
      await downloadGameResultsPdf(id, pin);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Sonuç PDF raporu indirilemedi.',
      );
    } finally {
      setDownloadingPdfId(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1
            className="font-display font-bold tracking-tight text-navy-900"
            style={{ fontSize: 'var(--text-h1)', lineHeight: 'var(--leading-h1)' }}
          >
            Geçmiş Yarışmalar ve Analizler
          </h1>
          <p className="mt-1.5 text-sm sm:text-base text-navy-600">
            Tamamlanan canlı bilgi yarışmalarının sonuçları, başarı oranları ve ayrıntılı soru analizleri.
          </p>
        </div>

        <Link
          to="/dashboard/quizzes"
          className="inline-flex items-center justify-center rounded-xl border border-cream-300 bg-cream-50 hover:bg-cream-200 px-4 py-2 text-sm font-semibold text-navy-900"
        >
          Quizlerime Dön
        </Link>
      </div>

      {/* Arama ve Sıralama Filtreleri */}
      {!loading && !error && history.length > 0 && (
        <section
          aria-label="Yarışma geçmişi filtreleri"
          className="rounded-2xl bg-cream-50 border border-cream-300 p-4 sm:p-5 shadow-card grid grid-cols-1 md:grid-cols-12 gap-3.5 items-end"
        >
          <div className="md:col-span-6">
            <label
              htmlFor="history-search"
              className="block text-xs font-semibold text-navy-700 mb-1.5"
            >
              Quiz Adına veya PIN Koduna Göre Ara
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-navy-500">
                <SearchIcon className="h-4 w-4" />
              </span>
              <input
                id="history-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Örn. Türkiye Coğrafyası, Bilgisayar veya PIN..."
                className="w-full min-h-11 rounded-xl border border-cream-300 bg-cream-100 pl-10 pr-3.5 py-2 text-base sm:text-sm text-navy-900 placeholder:text-navy-500 focus:border-burgundy-600 focus:bg-cream-50"
              />
            </div>
          </div>

          <div className="md:col-span-3">
            <label
              htmlFor="history-sort"
              className="block text-xs font-semibold text-navy-700 mb-1.5"
            >
              Tarihe Göre Sırala
            </label>
            <select
              id="history-sort"
              value={sortOrder}
              onChange={(e) =>
                setSortOrder(e.target.value === 'oldest' ? 'oldest' : 'newest')
              }
              className="w-full min-h-11 rounded-xl border border-cream-300 bg-cream-100 px-3 py-2 text-base sm:text-sm font-medium text-navy-900 focus:border-burgundy-600 focus:bg-cream-50"
            >
              <option value="newest">En Yeni Yarışmalar</option>
              <option value="oldest">En Eski Yarışmalar</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label
              htmlFor="history-status"
              className="block text-xs font-semibold text-navy-700 mb-1.5"
            >
              Oturum Durumu
            </label>
            <select
              id="history-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full min-h-11 rounded-xl border border-cream-300 bg-cream-100 px-3 py-2 text-base sm:text-sm font-medium text-navy-900 focus:border-burgundy-600 focus:bg-cream-50"
            >
              <option value="ALL">Tüm Oturumlar ({history.length})</option>
              <option value="FINISHED">Tamamlananlar</option>
              <option value="CANCELLED">İptal Edilenler</option>
              <option value="INTERRUPTED">Kesintiye Uğrayanlar</option>
            </select>
          </div>
        </section>
      )}

      {loading && (
        <div className="space-y-3" aria-busy="true">
          {[0, 1].map((item) => (
            <div
              key={item}
              className="rounded-2xl bg-cream-50 border border-cream-300 p-6 animate-pulse"
            >
              <div className="h-5 w-48 rounded bg-cream-200" />
              <div className="mt-3 h-4 w-72 rounded bg-cream-200" />
            </div>
          ))}
        </div>
      )}

      {error && !loading && (
        <div
          role="alert"
          className="rounded-2xl bg-burgundy-50 border border-burgundy-500 p-6 text-navy-900"
        >
          <p className="font-display font-bold text-base">Kayıtlar alınamadı</p>
          <p className="mt-1 text-sm text-navy-700">{error}</p>
          <button
            type="button"
            onClick={() => void loadHistory()}
            className="mt-4 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-4 py-2 text-sm font-semibold text-cream-50 cursor-pointer"
          >
            Tekrar Dene
          </button>
        </div>
      )}

      {!loading && !error && history.length === 0 && (
        <section className="rounded-2xl bg-cream-50 border border-cream-300 p-8 sm:p-10 text-center shadow-card">
          <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-powder-100 border border-powder-200 text-burgundy-600">
            <HistoryIcon />
          </div>
          <h2 className="mt-4 font-display font-bold text-xl text-navy-900">
            Henüz tamamlanmış canlı yarışma yok
          </h2>
          <p className="mx-auto mt-2 max-w-[50ch] text-sm leading-relaxed text-navy-600">
            Kayıtlı bir quizden &quot;Yarışma Başlat&quot; diyerek canlı oturum açıp
            tamamladığınızda sonuçlar ve soru analizleri burada listelenir.
          </p>
          <Link
            to="/dashboard/quizzes"
            className="mt-6 inline-flex items-center rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-5 py-2.5 text-sm font-semibold text-cream-50"
          >
            Quizlerimden Yarışma Başlat
          </Link>
        </section>
      )}

      {!loading && !error && history.length > 0 && filteredHistory.length === 0 && (
        <section className="rounded-2xl bg-cream-50 border border-cream-300 p-8 text-center shadow-card">
          <h2 className="font-display font-bold text-lg text-navy-900">
            Aramanızla eşleşen yarışma bulunamadı
          </h2>
          <p className="mt-1.5 text-sm text-navy-600">
            Arama terimini veya durum filtresini temizleyerek tüm yarışmaları görüntüleyebilirsiniz.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setStatusFilter('ALL');
              setSortOrder('newest');
            }}
            className="mt-4 inline-flex items-center rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-4 py-2 text-xs font-semibold text-navy-900 cursor-pointer"
          >
            Filtreleri Temizle
          </button>
        </section>
      )}

      {!loading && !error && filteredHistory.length > 0 && (
        <div className="space-y-4">
          {filteredHistory.map((session) => (
            <article
              key={session.id}
              className="rounded-2xl bg-cream-50 border border-cream-300 p-5 sm:p-6 shadow-card flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-powder-100 border border-powder-200 px-2.5 py-0.5 text-xs font-semibold text-burgundy-600">
                    {session.quizCategory}
                  </span>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                      session.status === 'FINISHED'
                        ? 'bg-cream-200 border-cream-300 text-navy-900'
                        : 'bg-burgundy-50 border-burgundy-500/40 text-burgundy-700',
                    )}
                  >
                    {STATUS_LABELS[session.status]}
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-navy-500">
                    PIN: {formatPinDisplay(session.pin)}
                  </span>
                </div>

                <h2 className="font-display font-bold text-lg text-navy-900">
                  {session.quizTitle}
                </h2>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm tabular-nums text-navy-600">
                  <span>
                    Tarih: <strong className="text-navy-800">{formatDateTime(session.endedAt ?? session.createdAt)}</strong>
                  </span>
                  <span>
                    Katılımcı: <strong className="text-navy-800">{session.participantCount}</strong>
                  </span>
                  <span>
                    Soru: <strong className="text-navy-800">{session.questionCount}</strong>
                  </span>
                  <span>
                    Ort. Başarı:{' '}
                    <strong className="text-navy-800">
                      {session.averageSuccessRatePct !== null
                        ? `%${session.averageSuccessRatePct}`
                        : 'Veri yok'}
                    </strong>
                  </span>
                  <span>
                    Süre:{' '}
                    <strong className="text-navy-800">
                      {formatDurationSec(session.durationSec)}
                    </strong>
                  </span>
                </div>

                {session.winner && (
                  <p className="text-xs font-semibold text-burgundy-600">
                    Birinci: {session.winner.nickname} (
                    {session.winner.totalScore.toLocaleString('tr-TR')} puan)
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Link
                  to={`/dashboard/history/${session.id}`}
                  className="inline-flex items-center justify-center gap-1.5 min-h-10 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-4 py-2 text-xs sm:text-sm font-semibold text-cream-50"
                >
                  <BarChartIcon className="h-4 w-4" />
                  <span>Detayları Gör</span>
                </Link>

                {session.status === 'FINISHED' && (
                  <>
                    <button
                      type="button"
                      disabled={loadingDetail}
                      onClick={() => void handleOpenDetail(session.id)}
                      className="inline-flex items-center justify-center gap-1.5 min-h-10 rounded-xl bg-navy-900 hover:bg-navy-950 px-3.5 py-2 text-xs sm:text-sm font-semibold text-cream-50 cursor-pointer disabled:opacity-60"
                    >
                      <EyeIcon />
                      <span>Sonuçları İncele</span>
                    </button>

                    <button
                      type="button"
                      disabled={downloadingCsvId === session.id}
                      onClick={() => void handleDownloadCsv(session.id, session.pin)}
                      className="inline-flex items-center justify-center gap-1.5 min-h-10 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-3 py-2 text-xs sm:text-sm font-semibold text-navy-900 cursor-pointer disabled:opacity-60"
                    >
                      <DownloadIcon className="h-4 w-4" />
                      <span>
                        {downloadingCsvId === session.id ? 'İndiriliyor...' : 'CSV İndir'}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={downloadingPdfId === session.id}
                      onClick={() => void handleDownloadPdf(session.id, session.pin)}
                      className="inline-flex items-center justify-center gap-1.5 min-h-10 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-3 py-2 text-xs sm:text-sm font-semibold text-navy-900 cursor-pointer disabled:opacity-60"
                    >
                      <DownloadIcon className="h-4 w-4" />
                      <span>
                        {downloadingPdfId === session.id ? 'Hazırlanıyor...' : 'PDF İndir'}
                      </span>
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby={dialogTitleId}
        onClose={() => {
          if (dialogRef.current) dialogRef.current.returnValue = '';
          setDetailOpen(false);
        }}
        onClick={(event) => handleLightDismissBackdropClick(event, dialogRef.current)}
        {...({ closedby: 'any' } as Record<string, string>)}
        className="m-auto w-[min(calc(100vw-2rem),38rem)] max-h-[85dvh] overflow-y-auto rounded-2xl bg-cream-50 border border-cream-300 p-6 text-navy-900 shadow-card"
      >
        {detail && (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4 border-b border-cream-300 pb-4">
              <div>
                <p className="text-xs font-semibold text-burgundy-600">
                  {detail.quizCategory} · PIN {formatPinDisplay(detail.pin)}
                </p>
                <h2
                  id={dialogTitleId}
                  className="mt-1 font-display font-bold text-xl text-navy-900"
                >
                  {detail.quizTitle}
                </h2>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Link
                  to={`/dashboard/history/${detail.id}`}
                  className="inline-flex items-center gap-1.5 min-h-10 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-3 py-2 text-xs font-semibold text-navy-900"
                >
                  Detaylı Analiz
                </Link>
                <button
                  type="button"
                  disabled={downloadingCsvId === detail.id}
                  onClick={() => void handleDownloadCsv(detail.id, detail.pin)}
                  className="inline-flex items-center gap-1.5 min-h-10 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-3.5 py-2 text-xs font-semibold text-cream-50 cursor-pointer disabled:opacity-60"
                >
                  <DownloadIcon className="h-4 w-4" />
                  <span>
                    {downloadingCsvId === detail.id ? 'İndiriliyor...' : 'CSV İndir'}
                  </span>
                </button>
                <button
                  type="button"
                  autoFocus
                  onClick={() => setDetailOpen(false)}
                  aria-label="Sonuç penceresini kapat"
                  className="inline-flex items-center justify-center min-w-10 min-h-10 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 text-navy-700 cursor-pointer"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>

            <LeaderboardTable
              showWrongCount
              showResponseTime
              entries={detail.results.map((r) => ({
                participantId: r.participantId,
                nickname: r.nickname,
                score: r.totalScore,
                rank: r.rank,
                correctCount: r.correctCount,
                wrongCount: r.wrongCount,
                unansweredCount: r.unansweredCount,
                totalResponseMs: r.avgResponseMs * r.correctCount,
                avgResponseMs: r.avgResponseMs,
                lastDelta: 0,
              }))}
            />
          </div>
        )}
      </dialog>
    </motion.div>
  );
}
