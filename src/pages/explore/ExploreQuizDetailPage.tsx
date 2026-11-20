import { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  OPTION_LETTERS,
  QUESTION_TYPE_LABELS,
  QUIZ_VISIBILITY_LABELS,
} from '@shared/quizTypes';
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { QuizoraLogo } from '@/components/brand/QuizoraLogo';
import {
  QuizPreviewModal,
  type PreviewableQuiz,
} from '@/components/dashboard/QuizPreviewModal';
import {
  AlertCircleIcon,
  BookOpenIcon,
  CheckIcon,
  ChevronLeftIcon,
  ClockIcon,
  CompassIcon,
  CopyIcon,
  EditIcon,
  EyeIcon,
  LayoutDashboardIcon,
  LockIcon,
  UserIcon,
} from '@/components/ui/Icons';
import { SafeImage } from '@/components/ui/SafeImage';
import { resolveMediaUrl } from '@/config/runtime';
import { useAuth } from '@/context/AuthContext';
import {
  ApiError,
  cloneQuizToLibrary,
  getExploreQuizDetail,
} from '@/services/quizApi';
import type { ExploreQuizDetail } from '@/types/quiz';
import { formatShortDate } from '@/utils/formatDate';

export function ExploreQuizDetailPage() {
  const { quizId } = useParams<{ quizId: string }>();
  const [searchParams] = useSearchParams();
  const shareToken = searchParams.get('token');
  const location = useLocation();
  const navigate = useNavigate();
  const { teacher } = useAuth();

  const [quiz, setQuiz] = useState<ExploreQuizDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{
    title: string;
    message: string;
    code?: string;
  } | null>(null);

  const [cloning, setCloning] = useState(false);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [clonedQuizId, setClonedQuizId] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);

  const loadQuizDetail = useCallback(async () => {
    if (!quizId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getExploreQuizDetail(quizId, shareToken);
      setQuiz(data.quiz);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'SHARE_LINK_EXPIRED' || err.code === 'SHARE_LINK_INVALID') {
          setError({
            title: 'Paylaşım bağlantısının süresi dolmuş veya bağlantı iptal edilmiş',
            message: err.message,
            code: err.code,
          });
        } else if (err.status === 403 || err.code === 'QUIZ_PRIVATE') {
          setError({
            title: 'Quiz artık erişilebilir değil',
            message: err.message,
            code: err.code,
          });
        } else {
          setError({
            title: 'Quiz bulunamadı',
            message: err.message,
            code: err.code,
          });
        }
      } else {
        setError({
          title: 'Quiz yüklenemedi',
          message: 'Quiz detayları getirilirken beklenmeyen bir hata oluştu.',
        });
      }
    } finally {
      setLoading(false);
    }
  }, [quizId, shareToken]);

  useEffect(() => {
    void loadQuizDetail();
  }, [loadQuizDetail]);

  const handleAddToLibrary = async () => {
    if (!quiz) return;
    if (!teacher) {
      const nextTarget = `${location.pathname}${location.search}`;
      navigate(`/login?next=${encodeURIComponent(nextTarget)}`);
      return;
    }

    setCloning(true);
    setCloneError(null);
    try {
      const res = await cloneQuizToLibrary(quiz.id, shareToken);
      setClonedQuizId(res.quiz.id);
    } catch (err) {
      setCloneError(
        err instanceof ApiError
          ? err.message
          : 'Quiz kütüphanenize kopyalanamadı. Lütfen tekrar deneyin.',
      );
    } finally {
      setCloning(false);
    }
  };

  const previewableQuiz: PreviewableQuiz | null = quiz
    ? {
        title: quiz.title,
        description: quiz.description,
        category: quiz.category,
        coverImageUrl: quiz.coverImageUrl,
        questions: quiz.questions,
      }
    : null;

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
            <Link
              to="/explore"
              className="inline-flex items-center gap-1.5 rounded-full bg-powder-100 hover:bg-powder-200 border border-powder-200 px-3 py-1 text-xs font-semibold text-burgundy-600 transition-colors duration-150"
            >
              <CompassIcon className="h-3.5 w-3.5" />
              <span>Keşfet</span>
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
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

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-7 sm:py-9 space-y-6">
        <div>
          <Link
            to="/explore"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-burgundy-600 hover:text-burgundy-700"
          >
            <ChevronLeftIcon />
            <span>Keşfet Sayfasına Dön</span>
          </Link>
        </div>

        {loading && (
          <div
            className="rounded-2xl bg-cream-50 border border-cream-300 p-8 animate-pulse space-y-4"
            aria-busy="true"
          >
            <div className="h-6 w-48 rounded bg-cream-200" />
            <div className="h-8 w-3/4 rounded bg-cream-200" />
            <div className="h-24 w-full rounded bg-cream-200" />
          </div>
        )}

        {error && !loading && (
          <section
            role="alert"
            className="rounded-2xl bg-cream-50 border border-cream-300 p-8 sm:p-10 text-center shadow-card space-y-4"
          >
            <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-burgundy-50 border border-burgundy-500/40 text-burgundy-600">
              <LockIcon />
            </div>
            <h1 className="font-display font-bold text-xl sm:text-2xl text-navy-900">
              {error.title}
            </h1>
            <p className="mx-auto max-w-[50ch] text-sm text-navy-600 leading-relaxed">
              {error.message}
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/explore"
                className="inline-flex items-center gap-1.5 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-5 py-2.5 text-sm font-semibold text-cream-50"
              >
                <CompassIcon className="h-4 w-4" />
                <span>Herkese Açık Quizleri Keşfet</span>
              </Link>
              {teacher && (
                <Link
                  to="/dashboard/quizzes"
                  className="inline-flex items-center rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-5 py-2.5 text-sm font-semibold text-navy-900"
                >
                  Quizlerime Dön
                </Link>
              )}
            </div>
          </section>
        )}

        {quiz && !loading && !error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            {/* Üst Quiz Özeti Kartı */}
            <article className="rounded-2xl bg-cream-50 border border-cream-300 p-6 sm:p-8 shadow-card space-y-6">
              {quiz.coverImageUrl && (
                <div className="overflow-hidden rounded-xl border border-cream-300 bg-cream-200 max-h-72">
                  <SafeImage
                    src={resolveMediaUrl(quiz.coverImageUrl)}
                    alt={`${quiz.title} kapak görseli`}
                    fetchPriority="high"
                    className="w-full h-full max-h-72 object-cover"
                    fallbackClassName="h-44 rounded-none"
                  />
                </div>
              )}

              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                <div className="space-y-3 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-powder-100 border border-powder-200 px-3 py-0.5 text-xs font-semibold text-burgundy-600">
                      {quiz.category}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-cream-200 border border-cream-300 px-3 py-0.5 text-xs font-semibold text-navy-900">
                      {QUIZ_VISIBILITY_LABELS[quiz.visibility]}
                    </span>
                    <span className="inline-flex items-center rounded-lg bg-cream-100 border border-cream-300 px-2.5 py-0.5 text-xs font-bold tabular-nums text-navy-800">
                      {quiz.questionCount} Soru
                    </span>
                  </div>

                  <h1
                    className="font-display font-bold tracking-tight text-navy-900"
                    style={{
                      fontSize: 'var(--text-h1)',
                      lineHeight: 'var(--leading-h1)',
                    }}
                  >
                    {quiz.title}
                  </h1>

                  <p className="text-sm sm:text-base text-navy-700 leading-relaxed">
                    {quiz.description ||
                      'Bu quiz için hazırlayan öğretmen tarafından ek bir açıklama girilmemiştir.'}
                  </p>

                  <div className="flex flex-wrap items-center gap-4 pt-1 text-xs sm:text-sm text-navy-600">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-navy-900">
                      <UserIcon className="h-4 w-4 text-burgundy-600" />
                      <span>Hazırlayan: {quiz.authorName}</span>
                    </span>
                    <span className="tabular-nums">
                      Son güncelleme: {formatShortDate(quiz.updatedAt)}
                    </span>
                  </div>
                </div>

                {/* Eylem Butonları */}
                <div className="flex flex-wrap lg:flex-col items-stretch gap-2.5 shrink-0 lg:min-w-56">
                  {clonedQuizId ? (
                    <div className="rounded-xl bg-powder-100 border border-burgundy-600 p-4 space-y-2.5">
                      <div className="flex items-center gap-2 text-xs font-bold text-burgundy-700">
                        <CheckIcon className="h-4 w-4 shrink-0" />
                        <span>Kütüphanenize Eklendi (Özel Kopya)</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link
                          to={`/dashboard/quizzes/${clonedQuizId}/edit`}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-3.5 py-2 text-xs font-semibold text-cream-50"
                        >
                          <EditIcon />
                          <span>Kopyayı Düzenle</span>
                        </Link>
                        <Link
                          to="/dashboard/quizzes"
                          className="inline-flex items-center justify-center rounded-xl border border-cream-300 bg-cream-50 hover:bg-cream-200 px-3.5 py-2 text-xs font-semibold text-navy-900"
                        >
                          Quizlerime Git
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={cloning}
                      onClick={() => void handleAddToLibrary()}
                      className="inline-flex items-center justify-center gap-2 min-h-11 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-5 py-2.5 text-sm font-semibold text-cream-50 cursor-pointer disabled:opacity-60"
                    >
                      <CopyIcon />
                      <span>
                        {cloning
                          ? 'Kütüphaneye Ekleniyor...'
                          : 'Kütüphaneme Ekle'}
                      </span>
                    </button>
                  )}

                  {(quiz.allowPublicPreview || quiz.isOwnQuiz) &&
                    quiz.questions.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setPreviewOpen(true)}
                        className="inline-flex items-center justify-center gap-2 min-h-11 rounded-xl bg-navy-900 hover:bg-navy-950 px-5 py-2.5 text-sm font-semibold text-cream-50 cursor-pointer"
                      >
                        <EyeIcon />
                        <span>Etkileşimli Önizle</span>
                      </button>
                    )}

                  {quiz.isOwnQuiz && (
                    <Link
                      to={`/dashboard/quizzes/${quiz.id}/edit`}
                      className="inline-flex items-center justify-center gap-2 min-h-10 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-4 py-2 text-xs sm:text-sm font-semibold text-navy-900"
                    >
                      <EditIcon />
                      <span>Quizi Düzenle</span>
                    </Link>
                  )}
                </div>
              </div>

              {cloneError && (
                <div
                  role="alert"
                  className="rounded-xl bg-burgundy-50 border border-burgundy-500 p-4 flex items-start gap-3 text-navy-900"
                >
                  <AlertCircleIcon className="mt-0.5 text-burgundy-600 shrink-0" />
                  <div>
                    <p className="font-display font-bold text-sm text-burgundy-800">
                      Quiz kopyalanamadı
                    </p>
                    <p className="mt-0.5 text-xs text-navy-700">{cloneError}</p>
                  </div>
                </div>
              )}
            </article>

            {/* Soru Önizleme Listesi */}
            <section
              aria-labelledby="detay-sorular-baslik"
              className="space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2
                    id="detay-sorular-baslik"
                    className="font-display font-bold text-xl text-navy-900"
                  >
                    Quiz Soruları ve Önizleme ({quiz.questionCount} Soru)
                  </h2>
                  <p className="mt-0.5 text-xs sm:text-sm text-navy-600">
                    Önizleme yalnızca inceleme amaçlıdır; canlı yarışma oturumu oluşturmaz.
                  </p>
                </div>
              </div>

              {!quiz.allowPublicPreview && !quiz.isOwnQuiz ? (
                <div className="rounded-2xl bg-cream-50 border border-cream-300 p-8 text-center shadow-card space-y-2">
                  <h3 className="font-display font-bold text-base text-navy-900">
                    Soru önizlemesi hazırlayan öğretmen tarafından sınırlandırılmış
                  </h3>
                  <p className="mx-auto max-w-[48ch] text-xs sm:text-sm text-navy-600">
                    Bu quizi <strong>&quot;Kütüphaneme Ekle&quot;</strong> düğmesiyle kendi hesabınıza kopyalayarak tüm soruları inceleyebilir ve düzenleyebilirsiniz.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {quiz.questions.map((question, qIdx) => (
                    <article
                      key={question.id || qIdx}
                      className="rounded-2xl bg-cream-50 border border-cream-300 p-5 sm:p-6 shadow-card space-y-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center rounded-lg bg-navy-900 px-2.5 py-1 text-xs font-bold text-cream-50">
                            Soru {qIdx + 1}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-powder-100 border border-powder-200 px-2.5 py-0.5 text-xs font-semibold text-burgundy-600">
                            {QUESTION_TYPE_LABELS[question.type]}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 text-xs font-semibold text-navy-600 tabular-nums">
                          <span className="inline-flex items-center gap-1">
                            <ClockIcon className="h-3.5 w-3.5" />
                            <span>{question.timeLimitSec} sn</span>
                          </span>
                          <span>·</span>
                          <span>{question.points} puan</span>
                        </div>
                      </div>

                      {question.imageUrl && (
                        <div className="overflow-hidden rounded-xl border border-cream-300 bg-cream-100 max-h-56">
                          <SafeImage
                            src={resolveMediaUrl(question.imageUrl)}
                            alt={`Soru ${qIdx + 1} görseli`}
                            loading="lazy"
                            className="w-full max-h-56 object-contain"
                            fallbackClassName="rounded-none"
                          />
                        </div>
                      )}

                      <h3 className="font-display font-bold text-base sm:text-lg text-navy-900">
                        {question.text}
                      </h3>

                      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {question.options.map((opt, optIdx) => {
                          const label =
                            question.type === 'ORDERING'
                              ? `${optIdx + 1}. Sıra`
                              : OPTION_LETTERS[optIdx] ?? String(optIdx + 1);
                          return (
                            <li
                              key={opt.id || optIdx}
                              className="rounded-xl bg-cream-100 border border-cream-300 px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs sm:text-sm"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="inline-flex items-center justify-center rounded-md bg-cream-200 px-2 py-0.5 text-xs font-bold text-navy-800 shrink-0">
                                  {label}
                                </span>
                                <span className="font-medium text-navy-900 break-words">
                                  {opt.text}
                                </span>
                              </div>
                              {opt.isCorrect && question.type !== 'ORDERING' && (
                                <span className="inline-flex items-center rounded-md bg-powder-100 border border-powder-200 px-2 py-0.5 text-[11px] font-bold text-burgundy-700 shrink-0">
                                  Doğru
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </motion.div>
        )}
      </main>

      <QuizPreviewModal
        open={previewOpen}
        quiz={previewableQuiz}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
}
