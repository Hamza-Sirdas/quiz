import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  QUIZ_VISIBILITY_LABELS,
  type QuizVisibility,
} from '@shared/quizTypes';
import { Link } from 'react-router-dom';
import {
  QuizPreviewModal,
  type PreviewableQuiz,
} from '@/components/dashboard/QuizPreviewModal';
import {
  QuizShareModal,
  type ShareableQuizTarget,
} from '@/components/dashboard/QuizShareModal';
import {
  CompassIcon,
  EditIcon,
  EyeIcon,
  GlobeIcon,
  LinkIcon,
  LockIcon,
  ShareIcon,
} from '@/components/ui/Icons';
import { useDashboardToast } from '@/layouts/DashboardLayout';
import {
  ApiError,
  getQuiz,
  listQuizzes,
  updateQuizShareSettings,
} from '@/services/quizApi';
import type { QuizShareState, QuizSummary } from '@/types/quiz';
import { cn } from '@/utils/cn';
import { formatShortDate } from '@/utils/formatDate';

export function SharedQuizzesPage() {
  const { showToast } = useDashboardToast();
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [previewQuiz, setPreviewQuiz] = useState<PreviewableQuiz | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const [shareTarget, setShareTarget] = useState<ShareableQuizTarget | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadSharedQuizzes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listQuizzes({ visibility: 'SHARED' });
      setQuizzes(data.quizzes);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Paylaşılan quizler yüklenirken bir hata oluştu.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSharedQuizzes();
  }, [loadSharedQuizzes]);

  const handleOpenPreview = async (quizId: string) => {
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

  const handleOpenShare = (quiz: QuizSummary) => {
    setShareTarget({
      id: quiz.id,
      title: quiz.title,
      status: quiz.status,
      visibility: quiz.visibility ?? 'PRIVATE',
      allowPublicPreview: quiz.allowPublicPreview ?? true,
      shareToken: quiz.shareToken ?? null,
    });
    setShareOpen(true);
  };

  const handleQuickRevoke = async (quiz: QuizSummary) => {
    setRevokingId(quiz.id);
    try {
      await updateQuizShareSettings(quiz.id, {
        visibility: 'PRIVATE',
        action: 'REVOKE_LINK',
      });
      showToast(
        'Paylaşım kapatıldı',
        `"${quiz.title}" quizi Özel duruma alındı ve paylaşım bağlantısı iptal edildi.`,
      );
      await loadSharedQuizzes();
    } catch (err) {
      showToast(
        'İşlem başarısız',
        err instanceof ApiError
          ? err.message
          : 'Paylaşım kapatılırken bir hata oluştu.',
        'error',
      );
    } finally {
      setRevokingId(null);
    }
  };

  const handleShareUpdated = (share: QuizShareState) => {
    if (share.visibility === 'PRIVATE' && !share.shareToken) {
      setQuizzes((prev) => prev.filter((q) => q.id !== share.quizId));
    } else {
      setQuizzes((prev) =>
        prev.map((q) =>
          q.id === share.quizId
            ? {
                ...q,
                visibility: share.visibility,
                allowPublicPreview: share.allowPublicPreview,
                shareToken: share.shareToken,
              }
            : q,
        ),
      );
    }
  };

  const renderVisibilityBadge = (vis: QuizVisibility = 'PRIVATE') => {
    const label = QUIZ_VISIBILITY_LABELS[vis] ?? 'Özel';
    const Icon =
      vis === 'PUBLIC'
        ? GlobeIcon
        : vis === 'UNLISTED'
          ? LinkIcon
          : LockIcon;

    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
          vis === 'PUBLIC'
            ? 'bg-powder-100 border-powder-200 text-burgundy-700'
            : 'bg-cream-200 border-cream-300 text-navy-900',
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </span>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1
            className="font-display font-bold tracking-tight text-navy-900"
            style={{ fontSize: 'var(--text-h1)', lineHeight: 'var(--leading-h1)' }}
          >
            Paylaşılan Quizler
          </h1>
          <p className="mt-1.5 text-sm sm:text-base text-navy-600">
            Herkese açık veya bağlantıya özel olarak paylaştığınız quizleri ve erişim bağlantılarını yönetin.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Link
            to="/explore"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-cream-300 bg-cream-50 hover:bg-cream-200 px-4 py-2 text-sm font-semibold text-navy-900"
          >
            <CompassIcon className="h-4 w-4" />
            <span>Keşfet Sayfasına Git</span>
          </Link>
          <Link
            to="/dashboard/quizzes"
            className="inline-flex items-center justify-center rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-4 py-2 text-sm font-semibold text-cream-50"
          >
            Tüm Quizlerim
          </Link>
        </div>
      </div>

      {loading && (
        <div className="grid gap-4 md:grid-cols-2" aria-busy="true">
          {[0, 1].map((item) => (
            <div
              key={item}
              className="rounded-2xl bg-cream-50 border border-cream-300 p-6 animate-pulse"
            >
              <div className="h-4 w-32 rounded bg-cream-200" />
              <div className="mt-3 h-6 w-3/4 rounded bg-cream-200" />
            </div>
          ))}
        </div>
      )}

      {error && !loading && (
        <div
          role="alert"
          className="rounded-2xl bg-burgundy-50 border border-burgundy-500 p-6 text-navy-900"
        >
          <p className="font-display font-bold text-base">Liste yüklenemedi</p>
          <p className="mt-1 text-sm text-navy-700">{error}</p>
          <button
            type="button"
            onClick={() => void loadSharedQuizzes()}
            className="mt-4 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-4 py-2 text-sm font-semibold text-cream-50 cursor-pointer"
          >
            Tekrar Dene
          </button>
        </div>
      )}

      {!loading && !error && quizzes.length === 0 && (
        <section className="rounded-2xl bg-cream-50 border border-cream-300 p-8 sm:p-10 text-center shadow-card">
          <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-powder-100 border border-powder-200 text-burgundy-600">
            <ShareIcon />
          </div>
          <h2 className="mt-4 font-display font-bold text-xl text-navy-900">
            Henüz paylaşılmış bir quiziniz yok
          </h2>
          <p className="mx-auto mt-2 max-w-[50ch] text-sm leading-relaxed text-navy-600">
            Quizlerim sayfasından herhangi bir yayına hazır quizi &quot;Herkese Açık&quot; veya &quot;Bağlantıya Özel&quot; duruma getirerek diğer öğretmenlerle paylaşabilirsiniz.
          </p>
          <Link
            to="/dashboard/quizzes"
            className="mt-6 inline-flex items-center rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-5 py-2.5 text-sm font-semibold text-cream-50"
          >
            Quizlerimden Paylaşım Başlat
          </Link>
        </section>
      )}

      {!loading && !error && quizzes.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {quizzes.map((quiz) => (
            <article
              key={quiz.id}
              className="rounded-2xl bg-cream-50 border border-cream-300 p-5 sm:p-6 shadow-card flex flex-col justify-between gap-4"
            >
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center rounded-full bg-powder-100 border border-powder-200 px-3 py-0.5 text-xs font-semibold text-burgundy-600">
                      {quiz.category}
                    </span>
                    {renderVisibilityBadge(quiz.visibility)}
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-navy-600">
                    {quiz.questionCount} Soru
                  </span>
                </div>

                <h2 className="font-display font-bold text-lg text-navy-900">
                  {quiz.title}
                </h2>

                {quiz.description && (
                  <p className="text-sm text-navy-600 line-clamp-2">
                    {quiz.description}
                  </p>
                )}

                <p className="text-xs text-navy-500">
                  Son güncelleme: {formatShortDate(quiz.updatedAt)} ·{' '}
                  {quiz.allowPublicPreview
                    ? 'Soru önizlemesi açık'
                    : 'Soru önizlemesi kapalı'}
                </p>
              </div>

              <div className="pt-3 border-t border-cream-300 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenShare(quiz)}
                    className="inline-flex items-center gap-1.5 min-h-9 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-3.5 py-1.5 text-xs font-semibold text-cream-50 cursor-pointer"
                  >
                    <ShareIcon className="h-3.5 w-3.5" />
                    <span>Paylaşım Ayarları</span>
                  </button>

                  <Link
                    to={
                      quiz.shareToken
                        ? `/explore/${quiz.id}?token=${encodeURIComponent(quiz.shareToken)}`
                        : `/explore/${quiz.id}`
                    }
                    className="inline-flex items-center gap-1.5 min-h-9 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-3.5 py-1.5 text-xs font-semibold text-navy-900"
                  >
                    <EyeIcon />
                    <span>Detay Sayfası</span>
                  </Link>

                  <Link
                    to={`/dashboard/quizzes/${quiz.id}/edit`}
                    className="inline-flex items-center gap-1.5 min-h-9 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-3 py-1.5 text-xs font-semibold text-navy-900"
                  >
                    <EditIcon />
                    <span>Düzenle</span>
                  </Link>
                </div>

                <button
                  type="button"
                  disabled={revokingId === quiz.id}
                  onClick={() => void handleQuickRevoke(quiz)}
                  className="inline-flex items-center gap-1.5 min-h-9 rounded-xl border border-burgundy-500/40 bg-burgundy-50 hover:bg-burgundy-100 px-3 py-1.5 text-xs font-semibold text-burgundy-700 cursor-pointer disabled:opacity-50"
                >
                  <span>
                    {revokingId === quiz.id ? 'Kapatılıyor...' : 'Paylaşımı Kapat'}
                  </span>
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <QuizPreviewModal
        open={previewOpen}
        quiz={previewQuiz}
        onClose={() => setPreviewOpen(false)}
      />

      <QuizShareModal
        open={shareOpen}
        quiz={shareTarget}
        onClose={() => setShareOpen(false)}
        onUpdated={handleShareUpdated}
        onOpenPreview={(quizId) => {
          setShareOpen(false);
          void handleOpenPreview(quizId);
        }}
      />
    </motion.div>
  );
}
