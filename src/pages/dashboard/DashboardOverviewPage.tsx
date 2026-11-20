import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Link, useNavigate } from 'react-router-dom';
import {
  QuizPreviewModal,
  type PreviewableQuiz,
} from '@/components/dashboard/QuizPreviewModal';
import {
  BookOpenIcon,
  EditIcon,
  EyeIcon,
  MonitorIcon,
  PlayIcon,
  PlusCircleIcon,
  SparklesIcon,
} from '@/components/ui/Icons';
import { useAuth } from '@/context/AuthContext';
import { useDashboardToast } from '@/layouts/DashboardLayout';
import { createGameSession } from '@/services/gameApi';
import { ApiError, getDashboardSummary, getQuiz } from '@/services/quizApi';
import type { DashboardSummary } from '@/types/quiz';
import { formatShortDate } from '@/utils/formatDate';
import { saveHostToken, savePresenterToken } from '@/utils/gameStorage';

export function DashboardOverviewPage() {
  const navigate = useNavigate();
  const { teacher } = useAuth();
  const { showToast } = useDashboardToast();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewQuiz, setPreviewQuiz] = useState<PreviewableQuiz | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [startingQuizId, setStartingQuizId] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDashboardSummary();
      setSummary(data);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Panel verileri yüklenirken bir hata oluştu.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const handlePreview = async (quizId: string) => {
    try {
      const { quiz } = await getQuiz(quizId);
      setPreviewQuiz(quiz);
      setPreviewOpen(true);
    } catch (err) {
      showToast(
        'Önizleme açılamadı',
        err instanceof ApiError ? err.message : 'Quiz detayları getirilemedi.',
        'error',
      );
    }
  };

  const handleStartLiveGame = async (
    quizId: string,
    classroomMode = false,
  ) => {
    setStartingQuizId(quizId);
    try {
      const session = await createGameSession(quizId, { classroomMode });
      saveHostToken(session.pin, session.hostToken);
      savePresenterToken(session.pin, session.presenterToken);
      navigate(
        classroomMode
          ? `/host/${session.pin}?classroom=1`
          : `/host/${session.pin}`,
      );
    } catch (err) {
      showToast(
        'Yarışma başlatılamadı',
        err instanceof ApiError ? err.message : 'Oyun oturumu oluşturulamadı.',
        'error',
      );
    } finally {
      setStartingQuizId(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-7"
    >
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1
            className="font-display font-bold tracking-tight text-navy-900"
            style={{ fontSize: 'var(--text-h1)', lineHeight: 'var(--leading-h1)' }}
          >
            Hoş geldin, {teacher?.name ?? 'Öğretmen'}
          </h1>
          <p className="mt-1.5 text-sm sm:text-base text-navy-600">
            Quizlerini yönet, yeni sorular hazırla ve kayıtlı içeriklerini düzenle.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Link
            to="/dashboard/ai-create"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-burgundy-600 bg-powder-100 hover:bg-powder-200 px-4 py-2.5 text-sm font-semibold text-burgundy-700 transition-colors duration-150"
          >
            <SparklesIcon className="h-4 w-4" />
            <span>Yapay Zekâ ile Oluştur</span>
          </Link>
          <Link
            to="/dashboard/quizzes/new"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-5 py-2.5 text-sm font-semibold text-cream-50 transition-colors duration-150"
          >
            <PlusCircleIcon className="h-4 w-4" />
            <span>Yeni Quiz Oluştur</span>
          </Link>
        </div>
      </div>

      {loading && (
        <div className="grid gap-4 sm:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="rounded-2xl bg-cream-50 border border-cream-300 p-6 animate-pulse"
            >
              <div className="h-3 w-24 rounded bg-cream-200" />
              <div className="mt-4 h-8 w-16 rounded bg-cream-200" />
            </div>
          ))}
        </div>
      )}

      {error && !loading && (
        <div
          role="alert"
          className="rounded-2xl bg-burgundy-50 border border-burgundy-500 p-6 text-navy-900"
        >
          <p className="font-display font-bold text-base">Veriler alınamadı</p>
          <p className="mt-1 text-sm text-navy-700">{error}</p>
          <button
            type="button"
            onClick={() => void loadSummary()}
            className="mt-4 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-4 py-2 text-sm font-semibold text-cream-50 cursor-pointer"
          >
            Tekrar Dene
          </button>
        </div>
      )}

      {summary && !loading && !error && (
        <>
          <section
            aria-label="Quiz özet istatistikleri"
            className="grid gap-4 sm:grid-cols-3"
          >
            <article className="rounded-2xl bg-cream-50 border border-cream-300 p-6 shadow-card">
              <p className="text-xs font-semibold uppercase tracking-wide text-navy-600">
                Toplam Quiz
              </p>
              <p className="mt-2 font-display font-extrabold text-3xl tabular-nums text-navy-900">
                {summary.totalQuizzes}
              </p>
              <p className="mt-1 text-xs tabular-nums text-navy-600">
                {summary.publishedCount} yayına hazır · {summary.draftCount} taslak
              </p>
            </article>

            <article className="rounded-2xl bg-cream-50 border border-cream-300 p-6 shadow-card">
              <p className="text-xs font-semibold uppercase tracking-wide text-navy-600">
                Oluşturulan Toplam Soru
              </p>
              <p className="mt-2 font-display font-extrabold text-3xl tabular-nums text-burgundy-600">
                {summary.totalQuestions}
              </p>
              <p className="mt-1 text-xs text-navy-600">
                Tüm quizlerdeki toplam soru adedi
              </p>
            </article>

            <article className="rounded-2xl bg-cream-50 border border-cream-300 p-6 shadow-card">
              <p className="text-xs font-semibold uppercase tracking-wide text-navy-600">
                Son Düzenleme
              </p>
              <p className="mt-2 font-display font-bold text-xl sm:text-2xl tabular-nums text-navy-900">
                {summary.lastUpdatedAt ? formatShortDate(summary.lastUpdatedAt) : 'Henüz yok'}
              </p>
              {summary.completedSessionsCount > 0 ? (
                <p className="mt-1 text-xs tabular-nums text-navy-600">
                  {summary.completedSessionsCount} tamamlanan yarışma ·{' '}
                  {summary.totalParticipantsCount} katılımcı{' '}
                  <Link
                    to="/dashboard/history"
                    className="font-semibold text-burgundy-600 hover:text-burgundy-700 underline underline-offset-2"
                  >
                    Geçmişi Gör
                  </Link>
                </p>
              ) : (
                <p className="mt-1 text-xs text-navy-600">
                  Henüz tamamlanmış canlı yarışma yok
                </p>
              )}
            </article>
          </section>

          {summary.totalQuizzes === 0 ? (
            <section className="rounded-2xl bg-cream-50 border border-cream-300 p-8 sm:p-10 text-center shadow-card">
              <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-powder-100 border border-powder-200 text-burgundy-600">
                <BookOpenIcon />
              </div>
              <h2 className="mt-4 font-display font-bold text-xl text-navy-900">
                Henüz kayıtlı bir quiz bulunmuyor
              </h2>
              <p className="mx-auto mt-2 max-w-[46ch] text-sm text-navy-600">
                İlk quizinizi oluşturarak soruları, cevap seçeneklerini, süre ve puan
                ayarlarını kaydedebilirsiniz.
              </p>
              <Link
                to="/dashboard/quizzes/new"
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-5 py-2.5 text-sm font-semibold text-cream-50 transition-colors duration-150"
              >
                <PlusCircleIcon className="h-4 w-4" />
                <span>İlk Quizini Oluştur</span>
              </Link>
            </section>
          ) : (
            <>
              <section aria-labelledby="son-quizler-baslik" className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2
                    id="son-quizler-baslik"
                    className="font-display font-bold text-lg sm:text-xl text-navy-900"
                  >
                    Son Düzenlenen Quizler
                  </h2>
                  <Link
                    to="/dashboard/quizzes"
                    className="text-sm font-semibold text-burgundy-600 hover:text-burgundy-700"
                  >
                    Tümünü Gör
                  </Link>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {summary.recentQuizzes.map((quiz) => (
                    <article
                      key={quiz.id}
                      className="rounded-2xl bg-cream-50 border border-cream-300 p-5 shadow-card flex flex-col justify-between gap-4"
                    >
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center rounded-full bg-powder-100 border border-powder-200 px-2.5 py-0.5 text-xs font-semibold text-burgundy-600">
                              {quiz.category || 'Kategori Yok'}
                            </span>
                            <span
                              className={
                                quiz.status === 'PUBLISHED'
                                  ? 'inline-flex items-center rounded-full bg-cream-200 border border-cream-300 px-2 py-0.5 text-[11px] font-semibold text-navy-900'
                                  : 'inline-flex items-center rounded-full bg-burgundy-50 border border-burgundy-500/35 px-2 py-0.5 text-[11px] font-semibold text-burgundy-700'
                              }
                            >
                              {quiz.status === 'PUBLISHED' ? 'Yayına Hazır' : 'Taslak'}
                            </span>
                          </div>
                          <span className="text-xs font-semibold tabular-nums text-navy-600">
                            {quiz.questionCount} Soru
                          </span>
                        </div>

                        <h3 className="mt-3 font-display font-bold text-lg text-navy-900">
                          {quiz.title.trim() || 'Başlıksız Taslak'}
                        </h3>

                        {quiz.description && (
                          <p className="mt-1 text-sm text-navy-600 line-clamp-2">
                            {quiz.description}
                          </p>
                        )}
                      </div>

                      <div className="pt-3 border-t border-cream-300 flex flex-wrap items-center justify-between gap-3">
                        <span className="text-xs tabular-nums text-navy-500">
                          Güncelleme: {formatShortDate(quiz.updatedAt)}
                        </span>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={quiz.status !== 'PUBLISHED' || startingQuizId === quiz.id}
                            onClick={() => void handleStartLiveGame(quiz.id, false)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-burgundy-600 hover:bg-burgundy-700 px-3 py-1.5 text-xs font-semibold text-cream-50 transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <PlayIcon className="h-3.5 w-3.5" />
                            <span>
                              {quiz.status !== 'PUBLISHED'
                                ? 'Taslak'
                                : startingQuizId === quiz.id
                                  ? 'Açılıyor...'
                                  : 'Yarışma Başlat'}
                            </span>
                          </button>
                          <button
                            type="button"
                            disabled={quiz.status !== 'PUBLISHED' || startingQuizId === quiz.id}
                            onClick={() => void handleStartLiveGame(quiz.id, true)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-burgundy-600 bg-powder-100 hover:bg-powder-200 px-3 py-1.5 text-xs font-semibold text-burgundy-700 transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <MonitorIcon className="h-3.5 w-3.5" />
                            <span>Sınıf Modunda Başlat</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handlePreview(quiz.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-cream-300 bg-cream-100 hover:bg-cream-200 px-3 py-1.5 text-xs font-semibold text-navy-900 transition-colors duration-150 cursor-pointer"
                          >
                            <EyeIcon />
                            <span>Önizle</span>
                          </button>
                          <Link
                            to={`/dashboard/quizzes/${quiz.id}/edit`}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900 hover:bg-navy-950 px-3 py-1.5 text-xs font-semibold text-cream-50 transition-colors duration-150"
                          >
                            <EditIcon />
                            <span>Düzenle</span>
                          </Link>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section aria-labelledby="kayitli-quizler-baslik" className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2
                    id="kayitli-quizler-baslik"
                    className="font-display font-bold text-lg sm:text-xl text-navy-900"
                  >
                    Kayıtlı Quizler
                  </h2>
                  <span className="text-xs font-semibold tabular-nums text-navy-600">
                    {summary.quizzes.length} kayıt
                  </span>
                </div>

                <div className="rounded-2xl bg-cream-50 border border-cream-300 divide-y divide-cream-300 shadow-card overflow-hidden">
                  {summary.quizzes.map((quiz) => (
                    <div
                      key={quiz.id}
                      className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to={`/dashboard/quizzes/${quiz.id}/edit`}
                            className="font-display font-bold text-base text-navy-900 hover:text-burgundy-600 transition-colors duration-150"
                          >
                            {quiz.title.trim() || 'Başlıksız Taslak'}
                          </Link>
                          <span className="inline-flex items-center rounded-full bg-cream-200 border border-cream-300 px-2.5 py-0.5 text-xs font-medium text-navy-700">
                            {quiz.category || 'Kategori Yok'}
                          </span>
                          <span
                            className={
                              quiz.status === 'PUBLISHED'
                                ? 'inline-flex items-center rounded-full bg-powder-100 border border-powder-200 px-2 py-0.5 text-[11px] font-semibold text-burgundy-600'
                                : 'inline-flex items-center rounded-full bg-burgundy-50 border border-burgundy-500/35 px-2 py-0.5 text-[11px] font-semibold text-burgundy-700'
                            }
                          >
                            {quiz.status === 'PUBLISHED' ? 'Yayına Hazır' : 'Taslak'}
                          </span>
                        </div>
                        <p className="mt-1 text-xs tabular-nums text-navy-600">
                          {quiz.questionCount} soru · Son düzenleme:{' '}
                          {formatShortDate(quiz.updatedAt)}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={quiz.status !== 'PUBLISHED' || startingQuizId === quiz.id}
                          onClick={() => void handleStartLiveGame(quiz.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-burgundy-600 hover:bg-burgundy-700 px-3 py-1.5 text-xs font-semibold text-cream-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <PlayIcon className="h-3.5 w-3.5" />
                          <span>
                            {quiz.status !== 'PUBLISHED' ? 'Taslak' : 'Yarışma Başlat'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handlePreview(quiz.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-cream-300 bg-cream-100 hover:bg-cream-200 px-3 py-1.5 text-xs font-semibold text-navy-900 cursor-pointer"
                        >
                          <EyeIcon />
                          <span>Önizle</span>
                        </button>
                        <Link
                          to={`/dashboard/quizzes/${quiz.id}/edit`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-powder-200 bg-powder-100 hover:bg-powder-200 px-3 py-1.5 text-xs font-semibold text-burgundy-600"
                        >
                          <EditIcon />
                          <span>Düzenle</span>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </>
      )}

      <QuizPreviewModal
        open={previewOpen}
        quiz={previewQuiz}
        onClose={() => setPreviewOpen(false)}
      />
    </motion.div>
  );
}
