import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  QUIZ_VISIBILITY_LABELS,
  type QuizStatus,
  type QuizVisibility,
} from '@shared/quizTypes';
import { Link, useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '@/components/dashboard/ConfirmDialog';
import {
  QuizPreviewModal,
  type PreviewableQuiz,
} from '@/components/dashboard/QuizPreviewModal';
import {
  QuizShareModal,
  type ShareableQuizTarget,
} from '@/components/dashboard/QuizShareModal';
import {
  BookOpenIcon,
  CompassIcon,
  EditIcon,
  EyeIcon,
  GlobeIcon,
  LinkIcon,
  LockIcon,
  MonitorIcon,
  PlayIcon,
  PlusCircleIcon,
  SearchIcon,
  ShareIcon,
  SparklesIcon,
  TrashIcon,
} from '@/components/ui/Icons';
import { SafeImage } from '@/components/ui/SafeImage';
import { resolveMediaUrl } from '@/config/runtime';
import { QUIZ_CATEGORIES } from '@/constants/quiz';
import { useDashboardToast } from '@/layouts/DashboardLayout';
import { createGameSession } from '@/services/gameApi';
import {
  ApiError,
  deleteQuiz,
  getQuiz,
  listQuizzes,
} from '@/services/quizApi';
import type { QuizShareState, QuizSummary } from '@/types/quiz';
import { cn } from '@/utils/cn';
import { formatShortDate } from '@/utils/formatDate';
import { saveHostToken, savePresenterToken } from '@/utils/gameStorage';

export function QuizListPage() {
  const navigate = useNavigate();
  const { showToast } = useDashboardToast();
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Tümü');
  const [statusFilter, setStatusFilter] = useState<'Tümü' | QuizStatus>('Tümü');
  const [visibilityFilter, setVisibilityFilter] = useState<
    'Tümü' | QuizVisibility
  >('Tümü');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [previewQuiz, setPreviewQuiz] = useState<PreviewableQuiz | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const [shareTarget, setShareTarget] = useState<ShareableQuizTarget | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<QuizSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [startingQuizId, setStartingQuizId] = useState<string | null>(null);

  const fetchList = useCallback(
    async (
      searchValue: string,
      categoryValue: string,
      statusValue: 'Tümü' | QuizStatus,
      visibilityValue: 'Tümü' | QuizVisibility,
    ) => {
      setLoading(true);
      setError(null);
      try {
        const data = await listQuizzes({
          search: searchValue,
          category: categoryValue,
          status: statusValue,
          visibility: visibilityValue,
        });
        setQuizzes(data.quizzes);
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : 'Quiz listesi yüklenirken bir hata oluştu.',
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchList(search, category, statusFilter, visibilityFilter);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [search, category, statusFilter, visibilityFilter, fetchList]);

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

  const handleShareUpdated = (share: QuizShareState) => {
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
    setShareTarget((prev) =>
      prev && prev.id === share.quizId
        ? {
            ...prev,
            visibility: share.visibility,
            allowPublicPreview: share.allowPublicPreview,
            shareToken: share.shareToken,
          }
        : prev,
    );
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteQuiz(deleteTarget.id);
      const deletedTitle = deleteTarget.title.trim() || 'Başlıksız Taslak';
      setDeleteTarget(null);
      showToast(
        'Quiz silindi',
        `"${deletedTitle}" quizi ve ilişkili tüm soruları silindi.`,
      );
      await fetchList(search, category, statusFilter, visibilityFilter);
    } catch (err) {
      showToast(
        'Silme işlemi başarısız',
        err instanceof ApiError ? err.message : 'Quiz silinemedi.',
        'error',
      );
    } finally {
      setDeleting(false);
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

  const hasFilters =
    search.trim().length > 0 ||
    category !== 'Tümü' ||
    statusFilter !== 'Tümü' ||
    visibilityFilter !== 'Tümü';

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
            : vis === 'UNLISTED'
              ? 'bg-cream-200 border-cream-300 text-navy-900'
              : 'bg-cream-100 border-cream-300 text-navy-600',
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
            Quizlerim
          </h1>
          <p className="mt-1.5 text-sm sm:text-base text-navy-600">
            Kayıtlı quizlerinizi arayın, görünürlük ve paylaşım ayarlarını yönetin veya canlı yarışma başlatın.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Link
            to="/explore"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-cream-300 bg-cream-50 hover:bg-cream-200 px-4 py-2.5 text-sm font-semibold text-navy-900 transition-colors duration-150"
          >
            <CompassIcon className="h-4 w-4" />
            <span>Keşfet</span>
          </Link>
          <Link
            to="/dashboard/ai-create"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-burgundy-600 bg-powder-100 hover:bg-powder-200 px-4 py-2.5 text-sm font-semibold text-burgundy-700 transition-colors duration-150"
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

      <search>
        <form
          onSubmit={(event) => event.preventDefault()}
          aria-label="Quiz arama ve filtreleme"
          className="rounded-2xl bg-cream-50 border border-cream-300 p-4 sm:p-5 shadow-card grid gap-4 sm:grid-cols-12"
        >
          <div className="sm:col-span-5">
            <label
              htmlFor="quiz-search"
              className="block text-xs font-semibold text-navy-700"
            >
              Quiz Ara
            </label>
            <div className="relative mt-1.5">
              <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-navy-500" />
              <input
                id="quiz-search"
                name="search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Başlık veya açıklama ile ara..."
                className="w-full min-h-11 rounded-xl border border-cream-300 bg-cream-100 pl-10 pr-4 py-2 text-base sm:text-sm text-navy-900 placeholder:text-navy-500 focus:border-burgundy-600"
              />
            </div>
          </div>

          <div className="sm:col-span-3">
            <label
              htmlFor="quiz-category"
              className="block text-xs font-semibold text-navy-700"
            >
              Kategori Filtresi
            </label>
            <select
              id="quiz-category"
              name="category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="mt-1.5 w-full min-h-11 rounded-xl border border-cream-300 bg-cream-100 px-3.5 py-2 text-base sm:text-sm text-navy-900 focus:border-burgundy-600"
            >
              <option value="Tümü">Tüm Kategoriler</option>
              {QUIZ_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="quiz-status"
              className="block text-xs font-semibold text-navy-700"
            >
              Durum Filtresi
            </label>
            <select
              id="quiz-status"
              name="status"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as 'Tümü' | QuizStatus)
              }
              className="mt-1.5 w-full min-h-11 rounded-xl border border-cream-300 bg-cream-100 px-3 py-2 text-base sm:text-sm text-navy-900 focus:border-burgundy-600"
            >
              <option value="Tümü">Tümü</option>
              <option value="PUBLISHED">Yayına Hazır</option>
              <option value="DRAFT">Taslaklar</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label
              htmlFor="quiz-visibility-filter"
              className="block text-xs font-semibold text-navy-700"
            >
              Görünürlük
            </label>
            <select
              id="quiz-visibility-filter"
              name="visibility"
              value={visibilityFilter}
              onChange={(event) =>
                setVisibilityFilter(
                  event.target.value as 'Tümü' | QuizVisibility,
                )
              }
              className="mt-1.5 w-full min-h-11 rounded-xl border border-cream-300 bg-cream-100 px-3 py-2 text-base sm:text-sm text-navy-900 focus:border-burgundy-600"
            >
              <option value="Tümü">Tümü</option>
              <option value="PRIVATE">Özel</option>
              <option value="UNLISTED">Bağlantıya Özel</option>
              <option value="PUBLIC">Herkese Açık</option>
            </select>
          </div>
        </form>
      </search>

      {loading && (
        <div className="grid gap-4 md:grid-cols-2" aria-busy="true">
          {[0, 1].map((item) => (
            <div
              key={item}
              className="rounded-2xl bg-cream-50 border border-cream-300 p-6 animate-pulse"
            >
              <div className="h-4 w-28 rounded bg-cream-200" />
              <div className="mt-3 h-6 w-3/4 rounded bg-cream-200" />
              <div className="mt-5 h-10 w-full rounded bg-cream-200" />
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
            onClick={() =>
              void fetchList(search, category, statusFilter, visibilityFilter)
            }
            className="mt-4 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-4 py-2 text-sm font-semibold text-cream-50 cursor-pointer"
          >
            Tekrar Dene
          </button>
        </div>
      )}

      {!loading && !error && quizzes.length === 0 && (
        <div className="rounded-2xl bg-cream-50 border border-cream-300 p-8 sm:p-10 text-center shadow-card">
          <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-powder-100 border border-powder-200 text-burgundy-600">
            <BookOpenIcon />
          </div>
          <h2 className="mt-4 font-display font-bold text-xl text-navy-900">
            {hasFilters
              ? 'Arama kriterlerine uygun quiz bulunamadı'
              : 'Henüz quiz oluşturmadınız'}
          </h2>
          <p className="mx-auto mt-2 max-w-[46ch] text-sm text-navy-600">
            {hasFilters
              ? 'Farklı bir arama kelimesi, kategori veya görünürlük filtresi seçmeyi deneyin.'
              : 'Yeni bir quiz oluşturarak sorularınızı veritabanına kaydedebilir veya Keşfet sayfasından hazır quizleri kütüphanenize ekleyebilirsiniz.'}
          </p>
          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setCategory('Tümü');
                setStatusFilter('Tümü');
                setVisibilityFilter('Tümü');
              }}
              className="mt-5 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-4 py-2 text-sm font-semibold text-navy-900 cursor-pointer"
            >
              Filtreleri Temizle
            </button>
          ) : (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/dashboard/quizzes/new"
                className="inline-flex items-center gap-2 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-5 py-2.5 text-sm font-semibold text-cream-50"
              >
                <PlusCircleIcon className="h-4 w-4" />
                <span>Yeni Quiz Oluştur</span>
              </Link>
              <Link
                to="/explore"
                className="inline-flex items-center gap-2 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-5 py-2.5 text-sm font-semibold text-navy-900"
              >
                <CompassIcon className="h-4 w-4" />
                <span>Quizleri Keşfet</span>
              </Link>
            </div>
          )}
        </div>
      )}

      {!loading && !error && quizzes.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {quizzes.map((quiz) => (
            <article
              key={quiz.id}
              className="rounded-2xl bg-cream-50 border border-cream-300 p-5 sm:p-6 shadow-card flex flex-col justify-between gap-4"
            >
              <div>
                {quiz.coverImageUrl && (
                  <div className="mb-4 overflow-hidden rounded-xl border border-cream-300 bg-cream-200">
                    <SafeImage
                      src={resolveMediaUrl(quiz.coverImageUrl)}
                      alt={`${quiz.title} kapak görseli`}
                      loading="lazy"
                      className="w-full aspect-[16/7] object-cover"
                      fallbackClassName="rounded-none"
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center rounded-full bg-powder-100 border border-powder-200 px-3 py-0.5 text-xs font-semibold text-burgundy-600">
                      {quiz.category || 'Kategori Yok'}
                    </span>
                    <span
                      className={
                        quiz.status === 'PUBLISHED'
                          ? 'inline-flex items-center rounded-full bg-cream-200 border border-cream-300 px-2.5 py-0.5 text-xs font-semibold text-navy-900'
                          : 'inline-flex items-center rounded-full bg-burgundy-50 border border-burgundy-500/35 px-2.5 py-0.5 text-xs font-semibold text-burgundy-700'
                      }
                    >
                      {quiz.status === 'PUBLISHED' ? 'Yayına Hazır' : 'Taslak'}
                    </span>
                    {quiz.aiGenerated && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-cream-200 border border-cream-300 px-2.5 py-0.5 text-xs font-semibold text-navy-800">
                        <SparklesIcon className="h-3 w-3 text-burgundy-600" />
                        <span>Yapay Zekâ</span>
                      </span>
                    )}
                    {renderVisibilityBadge(quiz.visibility)}
                  </div>
                  <span className="inline-flex items-center rounded-lg bg-cream-200 border border-cream-300 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-navy-900">
                    {quiz.questionCount} Soru
                  </span>
                </div>

                <h2 className="mt-3 font-display font-bold text-lg sm:text-xl text-navy-900">
                  {quiz.title.trim() || 'Başlıksız Taslak'}
                </h2>

                {quiz.description && (
                  <p className="mt-1.5 text-sm text-navy-600 line-clamp-2">
                    {quiz.description}
                  </p>
                )}

                {quiz.originalQuizId && (
                  <p className="mt-2 text-xs text-navy-500">
                    Kütüphaneye kopyalandı
                    {quiz.originalQuizTitle
                      ? ` · Kaynak: ${quiz.originalQuizTitle}`
                      : ''}
                  </p>
                )}

                <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-cream-100 border border-cream-300 p-3 text-xs">
                  <div>
                    <dt className="text-navy-500">Oluşturulma</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums text-navy-900">
                      {formatShortDate(quiz.createdAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-navy-500">Son Düzenlenme</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums text-navy-900">
                      {formatShortDate(quiz.updatedAt)}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="pt-3 border-t border-cream-300 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={quiz.status !== 'PUBLISHED' || startingQuizId === quiz.id}
                    title={
                      quiz.status !== 'PUBLISHED'
                        ? 'Taslak durumundaki quizlerle canlı yarışma başlatılamaz.'
                        : undefined
                    }
                    onClick={() => void handleStartLiveGame(quiz.id, false)}
                    className="inline-flex items-center gap-1.5 min-h-9 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-3.5 py-1.5 text-xs font-semibold text-cream-50 transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <PlayIcon className="h-3.5 w-3.5" />
                    <span>
                      {quiz.status !== 'PUBLISHED'
                        ? 'Taslak (Başlatılamaz)'
                        : startingQuizId === quiz.id
                          ? 'Açılıyor...'
                          : 'Yarışma Başlat'}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={quiz.status !== 'PUBLISHED' || startingQuizId === quiz.id}
                    title={
                      quiz.status !== 'PUBLISHED'
                        ? 'Taslak durumundaki quizlerle sınıf modu başlatılamaz.'
                        : 'Projeksiyon ve öğretmen kontrol merkeziyle sınıf modunda başlat'
                    }
                    onClick={() => void handleStartLiveGame(quiz.id, true)}
                    className="inline-flex items-center gap-1.5 min-h-9 rounded-xl border border-burgundy-600 bg-powder-100 hover:bg-powder-200 px-3.5 py-1.5 text-xs font-semibold text-burgundy-700 transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <MonitorIcon className="h-3.5 w-3.5" />
                    <span>Sınıf Modunda Başlat</span>
                  </button>
                  <Link
                    to={`/dashboard/quizzes/${quiz.id}/edit`}
                    className="inline-flex items-center gap-1.5 min-h-9 rounded-xl bg-navy-900 hover:bg-navy-950 px-3.5 py-1.5 text-xs font-semibold text-cream-50 transition-colors duration-150"
                  >
                    <EditIcon />
                    <span>Düzenle</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => void handleOpenPreview(quiz.id)}
                    className="inline-flex items-center gap-1.5 min-h-9 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-3.5 py-1.5 text-xs font-semibold text-navy-900 transition-colors duration-150 cursor-pointer"
                  >
                    <EyeIcon />
                    <span>Önizle</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenShare(quiz)}
                    className="inline-flex items-center gap-1.5 min-h-9 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-3.5 py-1.5 text-xs font-semibold text-navy-900 transition-colors duration-150 cursor-pointer"
                  >
                    <ShareIcon className="h-3.5 w-3.5" />
                    <span>Paylaş</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setDeleteTarget(quiz)}
                  className="inline-flex items-center gap-1.5 min-h-9 rounded-xl border border-burgundy-500/40 bg-burgundy-50 hover:bg-burgundy-100 px-3.5 py-1.5 text-xs font-semibold text-burgundy-700 transition-colors duration-150 cursor-pointer"
                >
                  <TrashIcon />
                  <span>Sil</span>
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

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Quizi silmek istediğinize emin misiniz?"
        description={
          deleteTarget
            ? `"${deleteTarget.title}" quizi ve içindeki ${deleteTarget.questionCount} soru kalıcı olarak silinecek. Bu işlem geri alınamaz.`
            : ''
        }
        confirmLabel="Evet, Quizi Sil"
        cancelLabel="Vazgeç"
        variant="danger"
        busy={deleting}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => {
          if (!deleting) setDeleteTarget(null);
        }}
      />
    </motion.div>
  );
}
