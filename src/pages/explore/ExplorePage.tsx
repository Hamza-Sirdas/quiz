import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { CANONICAL_QUIZ_CATEGORIES } from '@shared/quizTypes';
import { Link, useSearchParams } from 'react-router-dom';
import { QuizoraLogo } from '@/components/brand/QuizoraLogo';
import {
  QuizPreviewModal,
  type PreviewableQuiz,
} from '@/components/dashboard/QuizPreviewModal';
import {
  BookOpenIcon,
  CompassIcon,
  EyeIcon,
  LayoutDashboardIcon,
  SearchIcon,
  UserIcon,
} from '@/components/ui/Icons';
import { SafeImage } from '@/components/ui/SafeImage';
import { resolveMediaUrl } from '@/config/runtime';
import { useAuth } from '@/context/AuthContext';
import {
  ApiError,
  getExploreQuizDetail,
  listExploreQuizzes,
  type ListExploreQuizzesParams,
} from '@/services/quizApi';
import type { ExploreQuizItem } from '@/types/quiz';
import { cn } from '@/utils/cn';
import { formatShortDate } from '@/utils/formatDate';

type QuestionCountBucket = 'ALL' | '1-5' | '6-10' | '11+';
type SortOption =
  | 'newest'
  | 'oldest'
  | 'questions_desc'
  | 'questions_asc'
  | 'title_asc';

function parseQuestionCountRange(bucket: QuestionCountBucket): {
  minQuestions: number | null;
  maxQuestions: number | null;
} {
  if (bucket === '1-5') return { minQuestions: 1, maxQuestions: 5 };
  if (bucket === '6-10') return { minQuestions: 6, maxQuestions: 10 };
  if (bucket === '11+') return { minQuestions: 11, maxQuestions: null };
  return { minQuestions: null, maxQuestions: null };
}

export function ExplorePage() {
  const { teacher } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const urlSearch = searchParams.get('q') ?? '';
  const urlCategory = searchParams.get('category') ?? 'Tümü';
  const urlCountBucket =
    (searchParams.get('count') as QuestionCountBucket) || 'ALL';
  const urlSort = (searchParams.get('sort') as SortOption) || 'newest';
  const urlPage = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);

  const [searchInput, setSearchInput] = useState(urlSearch);

  const [quizzes, setQuizzes] = useState<ExploreQuizItem[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 12,
    totalCount: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [previewQuiz, setPreviewQuiz] = useState<PreviewableQuiz | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    setSearchInput(urlSearch);
  }, [urlSearch]);

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams);
      for (const [k, v] of Object.entries(updates)) {
        if (!v || v === 'Tümü' || v === 'ALL' || (k === 'page' && v === '1')) {
          next.delete(k);
        } else {
          next.set(k, v);
        }
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  // Arama alanı için debounce -> URL parametresini güncelle
  useEffect(() => {
    if (searchInput === urlSearch) return;
    const timer = window.setTimeout(() => {
      updateParams({ q: searchInput.trim() || null, page: '1' });
    }, 240);
    return () => window.clearTimeout(timer);
  }, [searchInput, urlSearch, updateParams]);

  const fetchExplore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { minQuestions, maxQuestions } =
        parseQuestionCountRange(urlCountBucket);
      const params: ListExploreQuizzesParams = {
        search: urlSearch,
        category: urlCategory,
        minQuestions,
        maxQuestions,
        sort: urlSort,
        page: urlPage,
        pageSize: 12,
      };
      const res = await listExploreQuizzes(params);
      setQuizzes(res.quizzes);
      setPagination(res.pagination);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Keşfet kütüphanesi yüklenirken bir hata oluştu.',
      );
    } finally {
      setLoading(false);
    }
  }, [urlSearch, urlCategory, urlCountBucket, urlSort, urlPage]);

  useEffect(() => {
    void fetchExplore();
  }, [fetchExplore]);

  const handleOpenPreview = async (quizId: string) => {
    setPreviewLoadingId(quizId);
    setPreviewError(null);
    try {
      const { quiz } = await getExploreQuizDetail(quizId);
      setPreviewQuiz({
        title: quiz.title,
        description: quiz.description,
        category: quiz.category,
        coverImageUrl: quiz.coverImageUrl,
        questions: quiz.questions,
      });
      setPreviewOpen(true);
    } catch (err) {
      setPreviewError(
        err instanceof ApiError
          ? err.message
          : 'Quiz önizlemesi yüklenirken bir hata oluştu.',
      );
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const hasActiveFilters = useMemo(
    () =>
      urlSearch.trim().length > 0 ||
      urlCategory !== 'Tümü' ||
      urlCountBucket !== 'ALL',
    [urlSearch, urlCategory, urlCountBucket],
  );

  return (
    <div className="min-h-dvh flex flex-col bg-cream-100 text-navy-900 overflow-x-clip">
      <header className="sticky top-0 z-20 bg-cream-50 border-b border-cream-300">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 min-h-16 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="inline-flex rounded-lg"
              aria-label="QUIZORA Ana Sayfa"
            >
              <QuizoraLogo size="md" />
            </Link>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-powder-100 border border-powder-200 px-3 py-1 text-xs font-semibold text-burgundy-600">
              <CompassIcon className="h-3.5 w-3.5" />
              <span>Quiz Kütüphanesi ve Keşfet</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              to="/join"
              className="inline-flex items-center rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-3.5 py-2 text-xs sm:text-sm font-semibold text-navy-800"
            >
              Oyuna Katıl
            </Link>

            {teacher ? (
              <>
                <Link
                  to="/dashboard/quizzes"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-3.5 py-2 text-xs sm:text-sm font-semibold text-navy-900"
                >
                  <BookOpenIcon className="h-4 w-4" />
                  <span>Quizlerim</span>
                </Link>
                <Link
                  to="/dashboard"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-4 py-2 text-xs sm:text-sm font-semibold text-cream-50"
                >
                  <LayoutDashboardIcon className="h-4 w-4" />
                  <span>Öğretmen Paneli</span>
                </Link>
              </>
            ) : (
              <Link
                to="/login"
                className="inline-flex items-center rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-4 py-2 text-xs sm:text-sm font-semibold text-cream-50"
              >
                Oturum Aç
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-7 sm:py-9 space-y-6">
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
                style={{
                  fontSize: 'var(--text-h1)',
                  lineHeight: 'var(--leading-h1)',
                }}
              >
                Quiz Kütüphanesini Keşfet
              </h1>
              <p className="mt-1.5 text-sm sm:text-base text-navy-600">
                Öğretmenler tarafından herkese açık paylaşılan bilgi yarışmalarını inceleyin, soruları önizleyin ve kendi kütüphanenize ekleyin.
              </p>
            </div>

            {teacher && (
              <Link
                to="/dashboard/shared"
                className="inline-flex items-center justify-center rounded-xl border border-cream-300 bg-cream-50 hover:bg-cream-200 px-4 py-2 text-xs sm:text-sm font-semibold text-navy-900 shrink-0"
              >
                Paylaşılan Quizlerim
              </Link>
            )}
          </div>

          {/* Arama ve Filtreleme Alanı */}
          <search>
            <form
              onSubmit={(event) => event.preventDefault()}
              aria-label="Keşfet quiz arama ve filtreleme"
              className="rounded-2xl bg-cream-50 border border-cream-300 p-4 sm:p-5 shadow-card space-y-4"
            >
              <div className="grid gap-4 sm:grid-cols-12">
                <div className="sm:col-span-6">
                  <label
                    htmlFor="explore-search"
                    className="block text-xs font-semibold text-navy-700"
                  >
                    Quiz Ara
                  </label>
                  <div className="relative mt-1.5">
                    <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-navy-500" />
                    <input
                      id="explore-search"
                      name="q"
                      type="search"
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                      placeholder="Başlık, açıklama veya kategoriye göre ara..."
                      className="w-full min-h-11 rounded-xl border border-cream-300 bg-cream-100 pl-10 pr-4 py-2 text-base sm:text-sm text-navy-900 placeholder:text-navy-500 focus:border-burgundy-600"
                    />
                  </div>
                </div>

                <div className="sm:col-span-3">
                  <label
                    htmlFor="explore-question-count"
                    className="block text-xs font-semibold text-navy-700"
                  >
                    Soru Sayısı
                  </label>
                  <select
                    id="explore-question-count"
                    value={urlCountBucket}
                    onChange={(event) =>
                      updateParams({ count: event.target.value, page: '1' })
                    }
                    className="mt-1.5 w-full min-h-11 rounded-xl border border-cream-300 bg-cream-100 px-3.5 py-2 text-base sm:text-sm text-navy-900 focus:border-burgundy-600"
                  >
                    <option value="ALL">Tüm Soru Sayıları</option>
                    <option value="1-5">1 – 5 Soru (Kısa)</option>
                    <option value="6-10">6 – 10 Soru (Orta)</option>
                    <option value="11+">11+ Soru (Kapsamlı)</option>
                  </select>
                </div>

                <div className="sm:col-span-3">
                  <label
                    htmlFor="explore-sort"
                    className="block text-xs font-semibold text-navy-700"
                  >
                    Sıralama
                  </label>
                  <select
                    id="explore-sort"
                    value={urlSort}
                    onChange={(event) =>
                      updateParams({ sort: event.target.value, page: '1' })
                    }
                    className="mt-1.5 w-full min-h-11 rounded-xl border border-cream-300 bg-cream-100 px-3.5 py-2 text-base sm:text-sm text-navy-900 focus:border-burgundy-600"
                  >
                    <option value="newest">En Yeni Eklenenler</option>
                    <option value="oldest">En Eski Eklenenler</option>
                    <option value="questions_desc">Soru Sayısı (Çoktan Aza)</option>
                    <option value="questions_asc">Soru Sayısı (Azdan Çoğa)</option>
                    <option value="title_asc">Başlığa Göre (A – Z)</option>
                  </select>
                </div>
              </div>

              {/* Kategori Hapları */}
              <div className="space-y-1.5">
                <span className="block text-xs font-semibold text-navy-700">
                  Kategoriler
                </span>
                <div
                  role="group"
                  aria-label="Kategori filtreleri"
                  className="flex flex-wrap items-center gap-2"
                >
                  {(['Tümü', ...CANONICAL_QUIZ_CATEGORIES] as const).map(
                    (cat) => {
                      const active = urlCategory === cat;
                      return (
                        <button
                          key={cat}
                          type="button"
                          aria-pressed={active}
                          onClick={() =>
                            updateParams({ category: cat, page: '1' })
                          }
                          className={cn(
                            'min-h-9 rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition-colors duration-150 cursor-pointer',
                            active
                              ? 'bg-burgundy-600 border-burgundy-600 text-cream-50'
                              : 'bg-cream-100 border-cream-300 text-navy-800 hover:bg-cream-200',
                          )}
                        >
                          {cat}
                        </button>
                      );
                    },
                  )}
                </div>
              </div>
            </form>
          </search>

          {previewError && (
            <div
              role="alert"
              className="rounded-xl bg-burgundy-50 border border-burgundy-500 p-3.5 text-xs font-semibold text-burgundy-700"
            >
              {previewError}
            </div>
          )}

          {loading && (
            <div
              className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
              aria-busy="true"
            >
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="rounded-2xl bg-cream-50 border border-cream-300 p-5 animate-pulse space-y-4"
                >
                  <div className="h-32 w-full rounded-xl bg-cream-200" />
                  <div className="h-5 w-3/4 rounded bg-cream-200" />
                  <div className="h-4 w-1/2 rounded bg-cream-200" />
                </div>
              ))}
            </div>
          )}

          {error && !loading && (
            <div
              role="alert"
              className="rounded-2xl bg-burgundy-50 border border-burgundy-500 p-6 text-navy-900"
            >
              <p className="font-display font-bold text-base">
                Keşfet listesi yüklenemedi
              </p>
              <p className="mt-1 text-sm text-navy-700">{error}</p>
              <button
                type="button"
                onClick={() => void fetchExplore()}
                className="mt-4 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-4 py-2 text-sm font-semibold text-cream-50 cursor-pointer"
              >
                Tekrar Dene
              </button>
            </div>
          )}

          {!loading && !error && quizzes.length === 0 && (
            <section className="rounded-2xl bg-cream-50 border border-cream-300 p-8 sm:p-10 text-center shadow-card">
              <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-powder-100 border border-powder-200 text-burgundy-600">
                <CompassIcon />
              </div>
              <h2 className="mt-4 font-display font-bold text-xl text-navy-900">
                {hasActiveFilters
                  ? 'Arama sonucu bulunamadı'
                  : 'Henüz herkese açık quiz yok'}
              </h2>
              <p className="mx-auto mt-2 max-w-[48ch] text-sm leading-relaxed text-navy-600">
                {hasActiveFilters
                  ? 'Seçtiğiniz arama terimi, kategori veya soru sayısı aralığına uygun herkese açık quiz bulunamadı.'
                  : 'Öğretmenler hazırladıkları quizlerin görünürlüğünü "Herkese Açık" olarak ayarladığında burada listelenir.'}
              </p>

              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('');
                    setSearchParams(new URLSearchParams(), { replace: true });
                  }}
                  className="mt-5 inline-flex items-center rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-4 py-2 text-sm font-semibold text-navy-900 cursor-pointer"
                >
                  Filtreleri Temizle
                </button>
              ) : (
                teacher && (
                  <Link
                    to="/dashboard/quizzes/new"
                    className="mt-5 inline-flex items-center rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-5 py-2.5 text-sm font-semibold text-cream-50"
                  >
                    İlk Herkese Açık Quizi Oluştur
                  </Link>
                )
              )}
            </section>
          )}

          {!loading && !error && quizzes.length > 0 && (
            <>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {quizzes.map((quiz) => (
                  <article
                    key={quiz.id}
                    className="rounded-2xl bg-cream-50 border border-cream-300 p-5 shadow-card flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-3">
                      {/* Kapak görseli veya tasarım sistemine uygun varsayılan editoryal kapak */}
                      <div className="overflow-hidden rounded-xl border border-cream-300 bg-powder-100/70">
                        {(() => {
                          const defaultEditorialCover = (
                            <div className="w-full aspect-[16/9] p-4 flex flex-col justify-between bg-cream-100">
                              <div className="flex items-center justify-between gap-2">
                                <span className="inline-flex items-center rounded-full bg-powder-100 border border-powder-200 px-2.5 py-0.5 text-[11px] font-bold text-burgundy-700">
                                  {quiz.category}
                                </span>
                                <span className="text-xs font-bold tabular-nums text-navy-700">
                                  {quiz.questionCount} Soru
                                </span>
                              </div>
                              <p className="font-display font-bold text-sm text-navy-800 line-clamp-2">
                                {quiz.title}
                              </p>
                            </div>
                          );

                          if (!quiz.coverImageUrl) {
                            return defaultEditorialCover;
                          }

                          return (
                            <SafeImage
                              src={resolveMediaUrl(quiz.coverImageUrl)}
                              alt={`${quiz.title} kapak görseli`}
                              loading="lazy"
                              className="w-full aspect-[16/9] object-cover"
                              fallback={defaultEditorialCover}
                            />
                          );
                        })()}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center rounded-full bg-powder-100 border border-powder-200 px-2.5 py-0.5 text-xs font-semibold text-burgundy-600">
                          {quiz.category}
                        </span>
                        <span className="inline-flex items-center rounded-lg bg-cream-200 border border-cream-300 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-navy-900">
                          {quiz.questionCount} Soru
                        </span>
                      </div>

                      <h2 className="font-display font-bold text-lg text-navy-900 leading-snug break-words">
                        <Link
                          to={`/explore/${quiz.id}`}
                          className="hover:text-burgundy-600 transition-colors duration-150"
                        >
                          {quiz.title}
                        </Link>
                      </h2>

                      <p className="text-xs sm:text-sm text-navy-600 line-clamp-2">
                        {quiz.description ||
                          'Bu quiz için ek açıklama belirtilmemiş.'}
                      </p>
                    </div>

                    <div className="space-y-3 pt-3 border-t border-cream-300">
                      <div className="flex items-center justify-between gap-2 text-xs text-navy-600">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-navy-800 truncate">
                          <UserIcon className="h-3.5 w-3.5 text-burgundy-600 shrink-0" />
                          <span className="truncate">{quiz.authorName}</span>
                        </span>
                        <span className="tabular-nums text-navy-500 shrink-0">
                          {formatShortDate(quiz.updatedAt)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/explore/${quiz.id}`}
                          className="flex-1 inline-flex items-center justify-center min-h-9 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-3.5 py-1.5 text-xs font-semibold text-cream-50 transition-colors duration-150"
                        >
                          Detayları İncele
                        </Link>

                        {quiz.allowPublicPreview && (
                          <button
                            type="button"
                            disabled={previewLoadingId === quiz.id}
                            onClick={() => void handleOpenPreview(quiz.id)}
                            className="inline-flex items-center justify-center gap-1.5 min-h-9 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-3 py-1.5 text-xs font-semibold text-navy-900 cursor-pointer disabled:opacity-50"
                          >
                            <EyeIcon />
                            <span>
                              {previewLoadingId === quiz.id
                                ? 'Açılıyor...'
                                : 'Önizle'}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              {/* Sayfalama */}
              {pagination.totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-cream-50 border border-cream-300 px-5 py-3.5 text-xs sm:text-sm shadow-card">
                  <span className="text-navy-600 tabular-nums">
                    Toplam {pagination.totalCount} quiz · Sayfa {pagination.page}{' '}
                    / {pagination.totalPages}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={pagination.page <= 1}
                      onClick={() =>
                        updateParams({ page: String(pagination.page - 1) })
                      }
                      className="rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-3.5 py-1.5 font-semibold text-navy-900 cursor-pointer disabled:opacity-50"
                    >
                      Önceki Sayfa
                    </button>
                    <button
                      type="button"
                      disabled={pagination.page >= pagination.totalPages}
                      onClick={() =>
                        updateParams({ page: String(pagination.page + 1) })
                      }
                      className="rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-3.5 py-1.5 font-semibold text-navy-900 cursor-pointer disabled:opacity-50"
                    >
                      Sonraki Sayfa
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>
      </main>

      <QuizPreviewModal
        open={previewOpen}
        quiz={previewQuiz}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
}
