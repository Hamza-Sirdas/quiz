import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { motion } from 'motion/react';
import {
  AI_DIFFICULTIES,
  AI_DIFFICULTY_LABELS,
  AI_GENERATION_METHODS,
  AI_GRADE_LEVELS,
  AI_LANGUAGES,
  AI_LIMITS,
  AI_METHOD_LABELS,
  AI_QUESTION_DIFFICULTY_LABELS,
  type AiDifficulty,
  type AiGeneratedQuestion,
  type AiGeneratedQuizDraft,
  type AiGenerationMethod,
  type AiServiceStatus,
  type PdfExtractionSummary,
} from '@shared/aiTypes';
import {
  MAX_CHOICE_OPTIONS,
  OPTION_LETTERS,
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  type QuestionType,
} from '@shared/quizTypes';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronLeftIcon,
  FileTextIcon,
  RefreshIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TrashIcon,
  UploadIcon,
} from '@/components/ui/Icons';
import { SortableList } from '@/components/ui/SortableList';
import {
  QUIZ_CATEGORIES,
  TIME_LIMIT_OPTIONS,
  createLocalId,
} from '@/constants/quiz';
import { useDashboardToast } from '@/layouts/DashboardLayout';
import {
  deletePdfSession,
  extractPdfForAi,
  generateAiQuiz,
  getAiStatus,
  regenerateAiQuestion,
} from '@/services/aiApi';
import { ApiError, createQuiz } from '@/services/quizApi';
import type { AllowedTimeLimit, QuizPayload } from '@/types/quiz';
import { cn } from '@/utils/cn';

interface EditableAiOption {
  localId: string;
  text: string;
  isCorrect: boolean;
}

interface EditableAiQuestion extends AiGeneratedQuestion {
  localId: string;
  options: EditableAiOption[];
}

interface EditableAiDraftState {
  title: string;
  description: string;
  category: string;
  generationMethod: AiGenerationMethod;
  sourceType: string;
  sourceSummary: string;
  generatedAt: string;
  warnings: string[];
  filteredDuplicatesCount: number;
  filteredInvalidCount: number;
  questions: EditableAiQuestion[];
}

const GENERATION_STEPS = [
  'İçerik hazırlanıyor ve güvenlik kontrolleri uygulanıyor',
  'Sorular ve cevap seçenekleri yapay zekâ ile oluşturuluyor',
  'Cevap anahtarı, soru türleri ve tekrarlar kontrol ediliyor',
  'Düzenlenebilir önizleme taslağı hazırlanıyor',
] as const;

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function toEditableDraft(draft: AiGeneratedQuizDraft): EditableAiDraftState {
  return {
    title: draft.title,
    description: draft.description,
    category: draft.category || QUIZ_CATEGORIES[0],
    generationMethod: draft.generationMethod,
    sourceType: draft.sourceType,
    sourceSummary: draft.sourceSummary,
    generatedAt: draft.generatedAt,
    warnings: draft.warnings,
    filteredDuplicatesCount: draft.filteredDuplicatesCount,
    filteredInvalidCount: draft.filteredInvalidCount,
    questions: draft.questions.map((q) => ({
      ...q,
      localId: createLocalId(),
      options: q.options.map((opt) => ({
        localId: createLocalId(),
        text: opt.text,
        isCorrect: opt.isCorrect,
      })),
    })),
  };
}

export function AiCreateQuizPage() {
  const navigate = useNavigate();
  const { showToast } = useDashboardToast();

  const [serviceStatus, setServiceStatus] = useState<AiServiceStatus | null>(
    null,
  );
  const [statusLoading, setStatusLoading] = useState(true);

  const [mode, setMode] = useState<AiGenerationMethod>('TOPIC');
  const [topic, setTopic] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [pdfExtraction, setPdfExtraction] =
    useState<PdfExtractionSummary | null>(null);
  const [extractingPdf, setExtractingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const [category, setCategory] = useState<string>(QUIZ_CATEGORIES[0]);
  const [gradeLevel, setGradeLevel] = useState<string>(AI_GRADE_LEVELS[1]);
  const [difficulty, setDifficulty] = useState<AiDifficulty>('MEDIUM');
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>([
    'MULTIPLE_CHOICE',
  ]);
  const [language, setLanguage] = useState<string>(AI_LANGUAGES[0]);
  const [timeLimitSec, setTimeLimitSec] = useState<AllowedTimeLimit>(20);
  const [points, setPoints] = useState<number>(1000);
  const [consentAccepted, setConsentAccepted] = useState<boolean>(false);

  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [regeneratingLocalId, setRegeneratingLocalId] = useState<string | null>(
    null,
  );
  const [savingDraft, setSavingDraft] = useState<boolean>(false);

  const [previewDraft, setPreviewDraft] =
    useState<EditableAiDraftState | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const pdfSessionIdRef = useRef<string | null>(null);
  const tabButtonRefs = useRef<Record<AiGenerationMethod, HTMLButtonElement | null>>({
    TOPIC: null,
    PDF: null,
    TEXT: null,
  });

  useEffect(() => {
    pdfSessionIdRef.current = pdfExtraction?.pdfSessionId ?? null;
  }, [pdfExtraction]);

  useEffect(() => {
    let active = true;
    setStatusLoading(true);
    getAiStatus()
      .then((status) => {
        if (active) setServiceStatus(status);
      })
      .catch(() => {
        if (active) setServiceStatus(null);
      })
      .finally(() => {
        if (active) setStatusLoading(false);
      });

    return () => {
      active = false;
      abortControllerRef.current?.abort();
      if (pdfSessionIdRef.current) {
        void deletePdfSession(pdfSessionIdRef.current).catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    if (!isGenerating) {
      setElapsedSec(0);
      return;
    }
    const timer = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isGenerating]);

  const activeStepIndex = !isGenerating
    ? 0
    : elapsedSec < 2
      ? 0
      : elapsedSec < 7
        ? 1
        : elapsedSec < 12
          ? 2
          : 3;

  const markTouched = (field: string) => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  };

  const clearTouched = (field: string) => {
    setTouched((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const validateForm = useCallback((): Record<string, string> => {
    const errors: Record<string, string> = {};

    if (mode === 'TOPIC') {
      const clean = topic.trim();
      if (clean.length < AI_LIMITS.MIN_TOPIC_CHARS) {
        errors.topic = `Lütfen en az ${AI_LIMITS.MIN_TOPIC_CHARS} karakterlik bir konu girin.`;
      } else if (clean.length > AI_LIMITS.MAX_TOPIC_CHARS) {
        errors.topic = `Konu en fazla ${AI_LIMITS.MAX_TOPIC_CHARS} karakter olabilir.`;
      }
    } else if (mode === 'PDF') {
      if (!pdfExtraction?.pdfSessionId) {
        errors.pdf = 'Lütfen metni başarıyla çıkarılmış bir PDF belgesi yükleyin.';
      }
    } else if (mode === 'TEXT') {
      const clean = sourceText.trim();
      const words = countWords(clean);
      if (clean.length < AI_LIMITS.MIN_TEXT_CHARS || words < AI_LIMITS.MIN_TEXT_WORDS) {
        errors.sourceText = `Metin yeterli değil. En az ${AI_LIMITS.MIN_TEXT_CHARS} karakter ve ${AI_LIMITS.MIN_TEXT_WORDS} kelime girmelisiniz.`;
      } else if (clean.length > AI_LIMITS.MAX_TEXT_CHARS) {
        errors.sourceText = `Metin en fazla ${AI_LIMITS.MAX_TEXT_CHARS.toLocaleString('tr-TR')} karakter olabilir.`;
      }
    }

    if (
      !Number.isInteger(questionCount) ||
      questionCount < AI_LIMITS.MIN_QUESTIONS ||
      questionCount > AI_LIMITS.MAX_QUESTIONS
    ) {
      errors.questionCount = `Soru sayısı ${AI_LIMITS.MIN_QUESTIONS} ile ${AI_LIMITS.MAX_QUESTIONS} arasında olmalıdır.`;
    }

    if (questionTypes.length === 0) {
      errors.questionTypes = 'En az bir soru türü seçmelisiniz.';
    }

    if (!Number.isInteger(points) || points < 100 || points > 5000) {
      errors.points = 'Soru puanı 100 ile 5000 arasında tam sayı olmalıdır.';
    }

    if (!consentAccepted) {
      errors.consent =
        'Harici yapay zekâ servisine içerik gönderimi için bilgilendirme onayını işaretlemelisiniz.';
    }

    return errors;
  }, [
    mode,
    topic,
    pdfExtraction,
    sourceText,
    questionCount,
    questionTypes,
    points,
    consentAccepted,
  ]);

  const allErrors = validateForm();
  const visibleError = (key: string): string | undefined =>
    submitted || touched[key] ? allErrors[key] : undefined;

  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentMethod: AiGenerationMethod,
  ) => {
    const idx = AI_GENERATION_METHODS.indexOf(currentMethod);
    let nextIdx: number | null = null;
    if (event.key === 'ArrowRight') {
      nextIdx = (idx + 1) % AI_GENERATION_METHODS.length;
    } else if (event.key === 'ArrowLeft') {
      nextIdx =
        (idx - 1 + AI_GENERATION_METHODS.length) %
        AI_GENERATION_METHODS.length;
    } else if (event.key === 'Home') {
      nextIdx = 0;
    } else if (event.key === 'End') {
      nextIdx = AI_GENERATION_METHODS.length - 1;
    }

    if (nextIdx !== null) {
      event.preventDefault();
      const targetMode = AI_GENERATION_METHODS[nextIdx]!;
      setMode(targetMode);
      setGenerationError(null);
      tabButtonRefs.current[targetMode]?.focus();
    }
  };

  const handlePdfFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setPdfError(null);
    setGenerationError(null);

    if (
      file.type !== 'application/pdf' &&
      !file.name.toLowerCase().endsWith('.pdf')
    ) {
      setPdfError('Yalnızca .pdf uzantılı PDF belgeleri yüklenebilir.');
      return;
    }

    if (file.size > AI_LIMITS.MAX_PDF_SIZE_BYTES) {
      setPdfError('PDF dosya boyutu en fazla 10 MB olabilir.');
      return;
    }

    if (pdfExtraction?.pdfSessionId) {
      void deletePdfSession(pdfExtraction.pdfSessionId).catch(() => undefined);
    }

    setExtractingPdf(true);
    setPdfExtraction(null);
    try {
      const { extraction } = await extractPdfForAi(file);
      setPdfExtraction(extraction);
      clearTouched('pdf');
      showToast(
        'PDF içeriği analiz edildi',
        `${extraction.totalPages} sayfadan ${extraction.extractedCharCount.toLocaleString('tr-TR')} karakter çıkarıldı.`,
      );
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'PDF metni çıkarılırken bir hata oluştu.';
      setPdfError(msg);
      markTouched('pdf');
    } finally {
      setExtractingPdf(false);
    }
  };

  const handleRemovePdf = async () => {
    const sessionId = pdfExtraction?.pdfSessionId;
    setPdfExtraction(null);
    setPdfError(null);
    if (sessionId) {
      await deletePdfSession(sessionId).catch(() => undefined);
    }
  };

  const handleToggleQuestionType = (type: QuestionType) => {
    clearTouched('questionTypes');
    setQuestionTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
  };

  const runGeneration = async () => {
    setGenerationError(null);
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsGenerating(true);
    try {
      const { draft } = await generateAiQuiz(
        {
          mode,
          topic: mode === 'TOPIC' ? topic.trim() : undefined,
          pdfSessionId:
            mode === 'PDF' ? pdfExtraction?.pdfSessionId : undefined,
          sourceText: mode === 'TEXT' ? sourceText.trim() : undefined,
          category,
          gradeLevel,
          difficulty,
          questionCount,
          questionTypes,
          language,
          timeLimitSec,
          points,
          consentAccepted,
        },
        controller.signal,
      );

      setPreviewDraft(toEditableDraft(draft));
      showToast(
        'Sorular önizlemeye hazır',
        `${draft.questions.length} soru oluşturuldu. Kaydetmeden önce inceleyip düzenleyebilirsiniz.`,
      );
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'Quiz oluşturulurken beklenmeyen bir hata oluştu.';
      setGenerationError(msg);
      window.requestAnimationFrame(() => {
        errorSummaryRef.current?.focus();
      });
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    setGenerationError(null);

    if (Object.keys(allErrors).length > 0) {
      window.requestAnimationFrame(() => {
        errorSummaryRef.current?.focus();
      });
      return;
    }

    await runGeneration();
  };

  const handleCancelGeneration = () => {
    abortControllerRef.current?.abort();
    setIsGenerating(false);
  };

  const updatePreviewQuestion = (
    localId: string,
    updater: (q: EditableAiQuestion) => EditableAiQuestion,
  ) => {
    setPreviewDraft((prev) =>
      prev
        ? {
            ...prev,
            questions: prev.questions.map((q) =>
              q.localId === localId ? updater(q) : q,
            ),
          }
        : prev,
    );
  };

  const handleDeletePreviewQuestion = (localId: string) => {
    setPreviewDraft((prev) => {
      if (!prev || prev.questions.length <= 1) return prev;
      return {
        ...prev,
        questions: prev.questions.filter((q) => q.localId !== localId),
      };
    });
  };

  const handleRegenerateSingleQuestion = async (
    targetQuestion: EditableAiQuestion,
  ) => {
    if (!previewDraft) return;
    setGenerationError(null);
    setRegeneratingLocalId(targetQuestion.localId);

    try {
      const existingQuestionTexts = previewDraft.questions
        .filter((q) => q.localId !== targetQuestion.localId)
        .map((q) => q.text);

      const { question } = await regenerateAiQuestion({
        mode: previewDraft.generationMethod,
        topic:
          previewDraft.generationMethod === 'TOPIC'
            ? topic.trim()
            : undefined,
        pdfSessionId:
          previewDraft.generationMethod === 'PDF'
            ? pdfExtraction?.pdfSessionId
            : undefined,
        sourceText:
          previewDraft.generationMethod === 'TEXT'
            ? sourceText.trim()
            : undefined,
        category: previewDraft.category,
        gradeLevel,
        difficulty,
        questionType: targetQuestion.type,
        language,
        timeLimitSec: targetQuestion.timeLimitSec,
        points: targetQuestion.points,
        previousQuestionText: targetQuestion.text,
        existingQuestionTexts,
        consentAccepted: true,
      });

      updatePreviewQuestion(targetQuestion.localId, () => ({
        ...question,
        localId: targetQuestion.localId,
        options: question.options.map((opt) => ({
          localId: createLocalId(),
          text: opt.text,
          isCorrect: opt.isCorrect,
        })),
      }));

      showToast(
        'Soru yenilendi',
        'Seçtiğiniz soru alternatif bir soru ile güncellendi.',
      );
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'Soru yeniden oluşturulamadı.';
      setGenerationError(msg);
      showToast('Soru yenilenemedi', msg, 'error');
    } finally {
      setRegeneratingLocalId(null);
    }
  };

  const handleSaveAndOpenEditor = async () => {
    if (!previewDraft) return;
    setGenerationError(null);

    const cleanTitle = previewDraft.title.trim();
    if (!cleanTitle) {
      setGenerationError('Kaydetmeden önce quiz başlığını girmelisiniz.');
      return;
    }

    if (previewDraft.questions.length === 0) {
      setGenerationError('En az bir soru bulunmalıdır.');
      return;
    }

    setSavingDraft(true);
    try {
      const payload: QuizPayload = {
        status: 'DRAFT',
        visibility: 'PRIVATE',
        allowPublicPreview: true,
        aiGenerated: true,
        aiGenerationMethod: previewDraft.generationMethod,
        aiSourceType: previewDraft.sourceType,
        aiSourceSummary: previewDraft.sourceSummary,
        aiGeneratedAt: previewDraft.generatedAt,
        title: cleanTitle.slice(0, 120),
        description: previewDraft.description.trim().slice(0, 500),
        category: previewDraft.category,
        coverImageUrl: null,
        questions: previewDraft.questions.map((q) => ({
          type: q.type,
          text: q.text.trim(),
          explanation: q.explanation.trim(),
          sourceReference: q.sourceReference ?? null,
          difficulty: q.difficulty ?? null,
          allowPartialCredit:
            q.type === 'MULTI_SELECT' ? q.allowPartialCredit : false,
          imageUrl: null,
          timeLimitSec: q.timeLimitSec,
          points: q.points,
          options: q.options.map((opt) => ({
            text: opt.text.trim(),
            isCorrect: q.type === 'ORDERING' ? true : opt.isCorrect,
          })),
        })),
      };

      const { quiz } = await createQuiz(payload);
      if (pdfExtraction?.pdfSessionId) {
        await deletePdfSession(pdfExtraction.pdfSessionId).catch(
          () => undefined,
        );
        setPdfExtraction(null);
      }

      showToast(
        'Taslak oluşturuldu',
        `"${quiz.title}" Özel Taslak olarak kaydedildi ve editörde açıldı.`,
      );
      navigate(`/dashboard/quizzes/${quiz.id}/edit`);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : 'Taslak quiz kaydedilirken bir hata oluştu.';
      setGenerationError(msg);
      showToast('Kayıt başarısız', msg, 'error');
    } finally {
      setSavingDraft(false);
    }
  };

  const textCharCount = sourceText.trim().length;
  const textWordCount = countWords(sourceText);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-6"
    >
      {/* Üst Başlık */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <Link
            to="/dashboard/quizzes"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-navy-600 hover:text-navy-900"
          >
            <ChevronLeftIcon />
            <span>Quizlerime Dön</span>
          </Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
            <h1
              className="font-display font-bold tracking-tight text-navy-900"
              style={{
                fontSize: 'var(--text-h1)',
                lineHeight: 'var(--leading-h1)',
              }}
            >
              Yapay Zekâ ile Quiz Oluştur
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-powder-100 border border-powder-200 px-3 py-0.5 text-xs font-semibold text-burgundy-700">
              <SparklesIcon className="h-3.5 w-3.5" />
              <span>Özel Taslak Olarak Üretir</span>
            </span>
          </div>
          <p className="mt-1.5 text-sm sm:text-base text-navy-600 max-w-2xl">
            Konu başlığından, yüklediğiniz PDF belgesinden veya ders notlarınızdan
            yapılandırılmış sorular oluşturun; önizleyip düzenledikten sonra mevcut
            editöre aktarın.
          </p>
        </div>

        <Link
          to="/dashboard/quizzes/new"
          className="inline-flex items-center justify-center rounded-xl border border-cream-300 bg-cream-50 hover:bg-cream-200 px-4 py-2.5 text-xs sm:text-sm font-semibold text-navy-900 shrink-0"
        >
          Manuel Quiz Editörüne Geç
        </Link>
      </div>

      {/* Yapay Zekâ Sağlayıcı Yapılandırma Durumu (Dürüst Bildirim) */}
      {!statusLoading && serviceStatus && !serviceStatus.configured && (
        <div
          role="status"
          className="rounded-2xl bg-powder-100 border border-burgundy-500/40 p-5 text-navy-900 space-y-2"
        >
          <div className="flex items-start gap-3">
            <AlertCircleIcon className="mt-0.5 shrink-0 text-burgundy-700" />
            <div className="space-y-1.5 text-sm">
              <p className="font-display font-bold text-burgundy-800">
                Sunucuda Yapay Zekâ API Anahtarı Yapılandırılmamış
              </p>
              <p className="text-navy-700">
                Gerçek yapay zekâ soru üretimi için backend sunucusunun{' '}
                <code className="rounded bg-cream-50 px-1.5 py-0.5 text-xs font-semibold border border-cream-300">
                  .env
                </code>{' '}
                dosyasına geçerli bir{' '}
                <code className="rounded bg-cream-50 px-1.5 py-0.5 text-xs font-semibold border border-cream-300">
                  GEMINI_API_KEY
                </code>{' '}
                tanımlanmalıdır. Anahtar yalnızca sunucuda tutulur; istemci koduna
                eklenmez. API anahtarı olmadan sahte soru üretimi yapılmaz.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Hata Özeti */}
      {((submitted && Object.keys(allErrors).length > 0) || generationError) && (
        <div
          ref={errorSummaryRef}
          tabIndex={-1}
          role="alert"
          aria-live="assertive"
          className="rounded-2xl bg-burgundy-50 border border-burgundy-500 p-4 sm:p-5 text-navy-900"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertCircleIcon className="mt-0.5 shrink-0 text-burgundy-600" />
              <div>
                <p className="font-display font-bold text-sm sm:text-base text-burgundy-800">
                  {generationError ??
                    'Lütfen aşağıdaki form eksikliklerini tamamlayın:'}
                </p>
                {submitted && Object.keys(allErrors).length > 0 && !generationError && (
                  <ul className="mt-2 list-disc list-inside space-y-1 text-xs sm:text-sm text-navy-800">
                    {Object.values(allErrors).map((msg, idx) => (
                      <li key={idx}>{msg}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {generationError && !isGenerating && !previewDraft && (
              <button
                type="button"
                onClick={() => void runGeneration()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-3.5 py-2 text-xs font-semibold text-cream-50 cursor-pointer shrink-0"
              >
                <RefreshIcon className="h-3.5 w-3.5" />
                <span>Tekrar Dene</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Aşama 1: Oluşturma Formu veya Dürüst Yüklenme Ekranı veya Önizleme Ekranı */}
      {isGenerating ? (
        <section
          aria-live="polite"
          className="rounded-2xl bg-cream-50 border border-cream-300 p-6 sm:p-8 shadow-card space-y-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="inline-flex items-center rounded-full bg-powder-100 border border-powder-200 px-3 py-0.5 text-xs font-semibold text-burgundy-700">
                {AI_METHOD_LABELS[mode]}
              </span>
              <h2 className="mt-2 font-display font-bold text-xl text-navy-900">
                Sorularınız Hazırlanıyor
              </h2>
            </div>

            <span className="rounded-xl bg-cream-200 border border-cream-300 px-3 py-1.5 text-xs font-semibold tabular-nums text-navy-800">
              Geçen süre: {elapsedSec} sn
            </span>
          </div>

          {/* Sahte yüzde göstermeyen yerel indeterminate ilerleme çubuğu */}
          <div className="space-y-2">
            <label
              htmlFor="ai-generation-progress"
              className="block text-xs font-semibold text-navy-700"
            >
              Sunucu yanıtı bekleniyor (tamamlandığında önizleme açılacaktır)
            </label>
            <progress
              id="ai-generation-progress"
              aria-label="Yapay zekâ soruları oluşturuyor"
              className="quizora-progress"
            />
          </div>

          <ol className="space-y-2.5">
            {GENERATION_STEPS.map((label, idx) => {
              const isDone = idx < activeStepIndex;
              const isCurrent = idx === activeStepIndex;
              return (
                <li
                  key={label}
                  className={cn(
                    'rounded-xl border px-4 py-3 text-sm flex items-center gap-3',
                    isCurrent
                      ? 'bg-powder-100 border-powder-400 font-semibold text-navy-900'
                      : isDone
                        ? 'bg-cream-100 border-cream-300 text-navy-700'
                        : 'bg-cream-50 border-cream-200 text-navy-500',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                      isCurrent
                        ? 'bg-burgundy-600 text-cream-50'
                        : isDone
                          ? 'bg-navy-900 text-cream-50'
                          : 'bg-cream-200 text-navy-600',
                    )}
                  >
                    {isDone ? <CheckIcon className="h-3.5 w-3.5" /> : idx + 1}
                  </span>
                  <span>{label}</span>
                </li>
              );
            })}
          </ol>

          {elapsedSec >= 12 && (
            <p className="rounded-xl bg-cream-100 border border-cream-300 px-4 py-3 text-xs sm:text-sm text-navy-700">
              İşlem içerik uzunluğu ve seçilen soru sayısına bağlı olarak biraz uzun
              sürebilir. Yapay zekâ sağlayıcısından yapılandırılmış yanıt bekleniyor.
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleCancelGeneration}
              className="min-h-11 rounded-xl border border-burgundy-500/40 bg-burgundy-50 hover:bg-burgundy-100 px-5 py-2.5 text-sm font-semibold text-burgundy-700 cursor-pointer"
            >
              İşlemi İptal Et
            </button>
          </div>
        </section>
      ) : previewDraft ? (
        <section
          aria-labelledby="ai-preview-heading"
          className="space-y-6"
        >
          {/* Doğruluk Uyarısı ve Taslak / Özel Kayıt Güvencesi */}
          <div className="rounded-2xl bg-powder-100 border border-powder-300 p-4 sm:p-5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-display font-bold text-sm text-burgundy-800">
                <ShieldCheckIcon className="h-4 w-4 shrink-0" />
                <span>Önizleme ve Öğretmen Onayı</span>
              </div>
              <span className="inline-flex items-center rounded-full bg-cream-50 border border-cream-300 px-3 py-0.5 text-xs font-semibold text-navy-800">
                Varsayılan Kayıt: Özel · Taslak
              </span>
            </div>
            <ul className="list-disc list-inside space-y-1 text-xs sm:text-sm text-navy-800">
              {previewDraft.warnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          </div>

          {/* Düzenlenebilir Başlık, Açıklama ve Kategori */}
          <div className="rounded-2xl bg-cream-50 border border-cream-300 p-5 sm:p-7 shadow-card space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cream-300 pb-4">
              <div>
                <h2
                  id="ai-preview-heading"
                  className="font-display font-bold text-lg sm:text-xl text-navy-900"
                >
                  Oluşturulan Quiz Taslağı ({previewDraft.questions.length} Soru)
                </h2>
                <p className="mt-0.5 text-xs text-navy-600">
                  Yöntem: {AI_METHOD_LABELS[previewDraft.generationMethod]} · Kaynak:{' '}
                  {previewDraft.sourceSummary}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setPreviewDraft(null)}
                  className="min-h-10 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-4 py-2 text-xs sm:text-sm font-semibold text-navy-900 cursor-pointer"
                >
                  Ayarlara Dön
                </button>
                <button
                  type="button"
                  disabled={savingDraft}
                  onClick={() => void handleSaveAndOpenEditor()}
                  className="inline-flex items-center gap-2 min-h-10 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-5 py-2 text-xs sm:text-sm font-semibold text-cream-50 cursor-pointer disabled:opacity-60"
                >
                  <CheckIcon className="h-4 w-4" />
                  <span>
                    {savingDraft
                      ? 'Kaydediliyor...'
                      : 'Taslak Olarak Kaydet ve Editörde Aç'}
                  </span>
                </button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-12">
              <div className="md:col-span-8">
                <label
                  htmlFor="ai-preview-title"
                  className="block text-sm font-semibold text-navy-900"
                >
                  Quiz Başlığı
                </label>
                <input
                  id="ai-preview-title"
                  type="text"
                  maxLength={120}
                  value={previewDraft.title}
                  onChange={(event) =>
                    setPreviewDraft((prev) =>
                      prev ? { ...prev, title: event.target.value } : prev,
                    )
                  }
                  className="mt-1.5 w-full min-h-11 rounded-xl border border-cream-300 bg-cream-100 px-4 py-2 text-base sm:text-sm text-navy-900 focus:border-burgundy-600"
                />
              </div>

              <div className="md:col-span-4">
                <label
                  htmlFor="ai-preview-category"
                  className="block text-sm font-semibold text-navy-900"
                >
                  Kategori
                </label>
                <select
                  id="ai-preview-category"
                  value={previewDraft.category}
                  onChange={(event) =>
                    setPreviewDraft((prev) =>
                      prev ? { ...prev, category: event.target.value } : prev,
                    )
                  }
                  className="mt-1.5 w-full min-h-11 rounded-xl border border-cream-300 bg-cream-100 px-3.5 py-2 text-base sm:text-sm text-navy-900 focus:border-burgundy-600"
                >
                  {QUIZ_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-12">
                <label
                  htmlFor="ai-preview-description"
                  className="block text-sm font-semibold text-navy-900"
                >
                  Quiz Açıklaması
                </label>
                <textarea
                  id="ai-preview-description"
                  rows={2}
                  maxLength={500}
                  value={previewDraft.description}
                  onChange={(event) =>
                    setPreviewDraft((prev) =>
                      prev
                        ? { ...prev, description: event.target.value }
                        : prev,
                    )
                  }
                  className="mt-1.5 w-full rounded-xl border border-cream-300 bg-cream-100 px-4 py-2 text-base sm:text-sm text-navy-900 focus:border-burgundy-600"
                />
              </div>
            </div>
          </div>

          {/* Sorular Listesi: Sıralama, Metin/Cevap Düzenleme, Tek Soru Yenileme ve Silme */}
          <SortableList
            items={previewDraft.questions}
            getId={(q) => q.localId}
            getLabel={(_, idx) => `Soru ${idx + 1}`}
            ariaLabel="Oluşturulan soruları sırala ve düzenle"
            compactControls
            onReorder={(reordered) =>
              setPreviewDraft((prev) =>
                prev ? { ...prev, questions: reordered } : prev,
              )
            }
            itemClassName={() => 'bg-cream-50 border-cream-300 shadow-card'}
            renderContent={(question, controls) => {
              const qIdx = controls.index;
              const isBusyRegen = regeneratingLocalId === question.localId;

              return (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cream-300 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-burgundy-600 text-xs font-bold tabular-nums text-cream-50">
                        {qIdx + 1}
                      </span>
                      <span className="inline-flex items-center rounded-lg bg-powder-100 border border-powder-200 px-2.5 py-0.5 text-xs font-semibold text-burgundy-700">
                        {QUESTION_TYPE_LABELS[question.type]}
                      </span>
                      <span className="inline-flex items-center rounded-lg bg-cream-200 border border-cream-300 px-2.5 py-0.5 text-xs font-semibold text-navy-800">
                        Zorluk: {AI_QUESTION_DIFFICULTY_LABELS[question.difficulty]}
                      </span>
                      {question.sourceReference && (
                        <span className="inline-flex items-center rounded-lg bg-cream-100 border border-cream-300 px-2.5 py-0.5 text-xs font-medium text-navy-700">
                          Kaynak: {question.sourceReference}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={isBusyRegen || regeneratingLocalId !== null}
                        onClick={() =>
                          void handleRegenerateSingleQuestion(question)
                        }
                        className="inline-flex items-center gap-1.5 min-h-9 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-3 py-1.5 text-xs font-semibold text-navy-900 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshIcon className="h-3.5 w-3.5" />
                        <span>
                          {isBusyRegen
                            ? 'Yenileniyor...'
                            : 'Bu Soruyu Yeniden Oluştur'}
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={previewDraft.questions.length <= 1}
                        onClick={() =>
                          handleDeletePreviewQuestion(question.localId)
                        }
                        className="inline-flex items-center gap-1.5 min-h-9 rounded-xl border border-burgundy-500/40 bg-burgundy-50 hover:bg-burgundy-100 px-3 py-1.5 text-xs font-semibold text-burgundy-700 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                      >
                        <TrashIcon />
                        <span>Soruyu Sil</span>
                      </button>
                    </div>
                  </div>

                  {question.qualityWarnings.length > 0 && (
                    <div className="rounded-xl bg-powder-50 border border-powder-300 px-3.5 py-2.5 text-xs text-burgundy-800 space-y-1">
                      {question.qualityWarnings.map((qw, wIdx) => (
                        <p key={wIdx}>Kalite Notu: {qw}</p>
                      ))}
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor={`ai-q-text-${question.localId}`}
                      className="block text-xs font-semibold text-navy-700"
                    >
                      Soru {qIdx + 1} Metni
                    </label>
                    <textarea
                      id={`ai-q-text-${question.localId}`}
                      rows={2}
                      maxLength={400}
                      value={question.text}
                      onChange={(event) =>
                        updatePreviewQuestion(question.localId, (curr) => ({
                          ...curr,
                          text: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-xl border border-cream-300 bg-cream-100 px-3.5 py-2 text-base sm:text-sm font-medium text-navy-900 focus:border-burgundy-600"
                    />
                  </div>

                  <div className="space-y-2">
                    <span className="block text-xs font-semibold text-navy-700">
                      {question.type === 'ORDERING'
                        ? 'Doğru Sıralama Öğeleri (Üstten alta doğru sıra)'
                        : 'Cevap Seçenekleri ve Doğru Cevap'}
                    </span>

                    <div className="grid gap-2 sm:grid-cols-2">
                      {question.options.map((opt, oIdx) => (
                        <div
                          key={opt.localId}
                          className={cn(
                            'rounded-xl border p-2.5 flex items-center gap-2.5',
                            question.type === 'ORDERING'
                              ? 'bg-cream-100 border-cream-300'
                              : opt.isCorrect
                                ? 'bg-powder-100 border-burgundy-600'
                                : 'bg-cream-100 border-cream-300',
                          )}
                        >
                          {question.type === 'ORDERING' ? (
                            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-navy-900 text-xs font-bold tabular-nums text-cream-50">
                              {oIdx + 1}
                            </span>
                          ) : (
                            <input
                              type={
                                question.type === 'MULTI_SELECT'
                                  ? 'checkbox'
                                  : 'radio'
                              }
                              name={`ai-correct-${question.localId}`}
                              aria-label={`Soru ${qIdx + 1} ${OPTION_LETTERS[oIdx] ?? oIdx + 1} doğru cevap`}
                              checked={opt.isCorrect}
                              onChange={() => {
                                updatePreviewQuestion(question.localId, (curr) => {
                                  if (curr.type === 'MULTI_SELECT') {
                                    return {
                                      ...curr,
                                      options: curr.options.map((item) =>
                                        item.localId === opt.localId
                                          ? { ...item, isCorrect: !item.isCorrect }
                                          : item,
                                      ),
                                    };
                                  }
                                  return {
                                    ...curr,
                                    options: curr.options.map((item) => ({
                                      ...item,
                                      isCorrect: item.localId === opt.localId,
                                    })),
                                  };
                                });
                              }}
                              className="h-4 w-4 accent-burgundy-600 cursor-pointer shrink-0"
                            />
                          )}

                          <input
                            type="text"
                            maxLength={200}
                            aria-label={`Soru ${qIdx + 1} seçenek ${OPTION_LETTERS[oIdx] ?? oIdx + 1}`}
                            value={opt.text}
                            onChange={(event) =>
                              updatePreviewQuestion(question.localId, (curr) => ({
                                ...curr,
                                options: curr.options.map((item) =>
                                  item.localId === opt.localId
                                    ? { ...item, text: event.target.value }
                                    : item,
                                ),
                              }))
                            }
                            className="flex-1 min-w-0 rounded-lg border border-cream-300 bg-cream-50 px-2.5 py-1.5 text-sm text-navy-900 focus:border-burgundy-600"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-12">
                    <div className="sm:col-span-6">
                      <label
                        htmlFor={`ai-q-exp-${question.localId}`}
                        className="block text-xs font-semibold text-navy-700"
                      >
                        Açıklama
                      </label>
                      <input
                        id={`ai-q-exp-${question.localId}`}
                        type="text"
                        maxLength={600}
                        value={question.explanation}
                        onChange={(event) =>
                          updatePreviewQuestion(question.localId, (curr) => ({
                            ...curr,
                            explanation: event.target.value,
                          }))
                        }
                        className="mt-1 w-full min-h-10 rounded-xl border border-cream-300 bg-cream-100 px-3 py-1.5 text-sm text-navy-900"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label
                        htmlFor={`ai-q-time-${question.localId}`}
                        className="block text-xs font-semibold text-navy-700"
                      >
                        Süre (sn)
                      </label>
                      <select
                        id={`ai-q-time-${question.localId}`}
                        value={question.timeLimitSec}
                        onChange={(event) =>
                          updatePreviewQuestion(question.localId, (curr) => ({
                            ...curr,
                            timeLimitSec: Number(
                              event.target.value,
                            ) as AllowedTimeLimit,
                          }))
                        }
                        className="mt-1 w-full min-h-10 rounded-xl border border-cream-300 bg-cream-100 px-3 py-1.5 text-sm text-navy-900"
                      >
                        {TIME_LIMIT_OPTIONS.map((sec) => (
                          <option key={sec} value={sec}>
                            {sec} sn
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-3">
                      <label
                        htmlFor={`ai-q-points-${question.localId}`}
                        className="block text-xs font-semibold text-navy-700"
                      >
                        Puan
                      </label>
                      <input
                        id={`ai-q-points-${question.localId}`}
                        type="number"
                        min={100}
                        max={5000}
                        step={50}
                        value={question.points}
                        onChange={(event) => {
                          const val = Number(event.target.value);
                          if (!Number.isFinite(val)) return;
                          updatePreviewQuestion(question.localId, (curr) => ({
                            ...curr,
                            points: Math.max(100, Math.min(5000, Math.round(val))),
                          }));
                        }}
                        className="mt-1 w-full min-h-10 rounded-xl border border-cream-300 bg-cream-100 px-3 py-1.5 text-sm tabular-nums text-navy-900"
                      />
                    </div>
                  </div>
                </div>
              );
            }}
          />

          <div className="rounded-2xl bg-cream-50 border border-cream-300 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs sm:text-sm text-navy-700">
              Onayladığınızda sorular <strong>Özel Taslak</strong> olarak kaydedilir ve
              mevcut quiz editörü açılır.
            </p>
            <button
              type="button"
              disabled={savingDraft}
              onClick={() => void handleSaveAndOpenEditor()}
              className="inline-flex items-center gap-2 min-h-11 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-6 py-2.5 text-sm font-semibold text-cream-50 cursor-pointer disabled:opacity-60"
            >
              <CheckIcon className="h-4 w-4" />
              <span>
                {savingDraft
                  ? 'Kaydediliyor...'
                  : 'Taslak Olarak Kaydet ve Editörde Aç'}
              </span>
            </button>
          </div>
        </section>
      ) : (
        <form
          onSubmit={(event) => void handleSubmit(event)}
          noValidate
          className="space-y-6"
        >
          {/* 3 Oluşturma Yöntemi Sekmeleri (modern-web-guidance tabs rehberine uygun tek satır + klavye desteği) */}
          <section className="rounded-2xl bg-cream-50 border border-cream-300 p-5 sm:p-7 shadow-card space-y-5">
            <div
              role="tablist"
              aria-label="Quiz oluşturma yöntemi"
              className="flex overflow-x-auto border-b border-cream-300 gap-2"
            >
              {AI_GENERATION_METHODS.map((method) => {
                const selected = mode === method;
                return (
                  <button
                    key={method}
                    ref={(el) => {
                      tabButtonRefs.current[method] = el;
                    }}
                    type="button"
                    role="tab"
                    id={`ai-tab-${method}`}
                    aria-selected={selected}
                    tabIndex={selected ? 0 : -1}
                    onKeyDown={(e) => handleTabKeyDown(e, method)}
                    onClick={() => {
                      setMode(method);
                      setGenerationError(null);
                    }}
                    className={cn(
                      'quizora-tab flex-none min-h-11 px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors duration-150 cursor-pointer',
                      selected
                        ? 'text-burgundy-700'
                        : 'text-navy-600 hover:text-navy-900',
                    )}
                  >
                    {AI_METHOD_LABELS[method]}
                  </button>
                );
              })}
            </div>

            {/* Sekme Paneli 1: Konudan Quiz Oluştur */}
            <div
              role="tabpanel"
              aria-labelledby="ai-tab-TOPIC"
              hidden={mode !== 'TOPIC'}
            >
              <div className="space-y-3">
                <label
                  htmlFor="ai-topic"
                  className="block text-sm font-semibold text-navy-900"
                >
                  Quiz Konusu <span className="text-burgundy-600" aria-hidden="true">*</span>
                </label>
                <input
                  id="ai-topic"
                  name="topic"
                  type="text"
                  maxLength={AI_LIMITS.MAX_TOPIC_CHARS}
                  value={topic}
                  onChange={(event) => {
                    clearTouched('topic');
                    setTopic(event.target.value);
                  }}
                  onBlur={() => markTouched('topic')}
                  aria-invalid={Boolean(visibleError('topic'))}
                  aria-describedby={
                    visibleError('topic') ? 'ai-topic-error' : 'ai-topic-hint'
                  }
                  placeholder="Örn: Türkiye Cumhuriyeti'nin kuruluş dönemi"
                  className={cn(
                    'w-full min-h-12 rounded-xl border bg-cream-100 px-4 py-2.5 text-base text-navy-900 placeholder:text-navy-500',
                    visibleError('topic')
                      ? 'border-burgundy-600 bg-burgundy-50/40'
                      : 'border-cream-300 focus:border-burgundy-600',
                  )}
                />
                <p id="ai-topic-hint" className="text-xs text-navy-600">
                  Konuyu ne kadar net tanımlarsanız sorular sınıf düzeyine ve
                  müfredata o kadar uygun hazırlanır ({topic.trim().length}/
                  {AI_LIMITS.MAX_TOPIC_CHARS}).
                </p>
                {visibleError('topic') && (
                  <p
                    id="ai-topic-error"
                    className="text-xs font-medium text-burgundy-600"
                  >
                    {visibleError('topic')}
                  </p>
                )}
              </div>
            </div>

            {/* Sekme Paneli 2: PDF'den Quiz Oluştur */}
            <div
              role="tabpanel"
              aria-labelledby="ai-tab-PDF"
              hidden={mode !== 'PDF'}
            >
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="ai-pdf-file"
                    className="block text-sm font-semibold text-navy-900"
                  >
                    PDF Ders Belgesi{' '}
                    <span className="text-xs font-normal text-navy-500">
                      (.pdf · maks. 10 MB · Metin tabanlı PDF)
                    </span>
                  </label>
                  <p className="mt-1 text-xs text-navy-600">
                    Sorular yalnızca PDF içindeki çıkarılan metne göre üretilir ve
                    sayfa referansı saklanır. Taranmış görsel PDF&apos;ler için
                    OCR desteği bulunmamaktadır.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <label
                    htmlFor="ai-pdf-file"
                    className={cn(
                      'inline-flex items-center gap-2 min-h-11 rounded-xl border border-navy-900/20 bg-navy-900 hover:bg-navy-950 px-5 py-2.5 text-sm font-semibold text-cream-50 cursor-pointer',
                      extractingPdf && 'opacity-60 pointer-events-none',
                    )}
                  >
                    <UploadIcon className="h-4 w-4" />
                    <span>
                      {extractingPdf ? 'PDF İşleniyor...' : 'PDF Dosyası Seç'}
                    </span>
                    <input
                      id="ai-pdf-file"
                      type="file"
                      accept="application/pdf,.pdf"
                      disabled={extractingPdf}
                      onChange={(e) => void handlePdfFileChange(e)}
                      className="sr-only"
                    />
                  </label>

                  {pdfExtraction && (
                    <button
                      type="button"
                      onClick={() => void handleRemovePdf()}
                      className="inline-flex items-center gap-1.5 min-h-11 rounded-xl border border-burgundy-500/40 bg-burgundy-50 hover:bg-burgundy-100 px-4 py-2 text-xs font-semibold text-burgundy-700 cursor-pointer"
                    >
                      <TrashIcon />
                      <span>Belgeyi Kaldır</span>
                    </button>
                  )}
                </div>

                {(pdfError || visibleError('pdf')) && (
                  <div
                    role="alert"
                    className="rounded-xl bg-burgundy-50 border border-burgundy-500 p-3.5 text-xs sm:text-sm text-burgundy-800"
                  >
                    {pdfError ?? visibleError('pdf')}
                  </div>
                )}

                {pdfExtraction && (
                  <div className="rounded-2xl bg-cream-100 border border-cream-300 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-display font-bold text-sm text-navy-900">
                        <FileTextIcon className="text-burgundy-600" />
                        <span>{pdfExtraction.fileName}</span>
                      </div>
                      <span className="text-xs font-semibold tabular-nums text-navy-600">
                        {formatBytes(pdfExtraction.fileSizeBytes)} ·{' '}
                        {pdfExtraction.totalPages} sayfa ·{' '}
                        {pdfExtraction.extractedCharCount.toLocaleString('tr-TR')}{' '}
                        karakter
                      </span>
                    </div>

                    {pdfExtraction.truncated && (
                      <p className="rounded-lg bg-powder-100 border border-powder-200 px-3 py-2 text-xs font-medium text-burgundy-800">
                        Büyük PDF belgesi token sınırını aşmamak için kontrollü
                        parçalara ayrıldı (incelenen sayfalar:{' '}
                        {pdfExtraction.analyzedPages.join(', ')}).
                      </p>
                    )}

                    <div>
                      <p className="text-xs font-semibold text-navy-700">
                        Çıkarılan Metin Önizlemesi:
                      </p>
                      <p className="mt-1 rounded-lg bg-cream-50 border border-cream-300 p-3 text-xs leading-relaxed text-navy-700">
                        {pdfExtraction.previewExcerpt}
                      </p>
                    </div>

                    <p className="text-[11px] text-navy-500">
                      {pdfExtraction.retentionNotice}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Sekme Paneli 3: Metinden Quiz Oluştur */}
            <div
              role="tabpanel"
              aria-labelledby="ai-tab-TEXT"
              hidden={mode !== 'TEXT'}
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="ai-source-text"
                    className="block text-sm font-semibold text-navy-900"
                  >
                    Ders Notu veya Kaynak Metin{' '}
                    <span className="text-burgundy-600" aria-hidden="true">*</span>
                  </label>
                  <span className="text-xs font-semibold tabular-nums text-navy-600">
                    {textCharCount.toLocaleString('tr-TR')} karakter ·{' '}
                    {textWordCount} kelime
                  </span>
                </div>

                <textarea
                  id="ai-source-text"
                  name="sourceText"
                  rows={9}
                  maxLength={AI_LIMITS.MAX_TEXT_CHARS}
                  value={sourceText}
                  onChange={(event) => {
                    clearTouched('sourceText');
                    setSourceText(event.target.value);
                  }}
                  onBlur={() => markTouched('sourceText')}
                  aria-invalid={Boolean(visibleError('sourceText'))}
                  aria-describedby={
                    visibleError('sourceText')
                      ? 'ai-text-error'
                      : 'ai-text-hint'
                  }
                  placeholder="Ders notlarınızı, okuma parçasını veya özet metninizi buraya yapıştırın..."
                  className={cn(
                    'w-full rounded-xl border bg-cream-100 p-4 text-base text-navy-900 placeholder:text-navy-500 resize-y min-h-48',
                    visibleError('sourceText')
                      ? 'border-burgundy-600 bg-burgundy-50/40'
                      : 'border-cream-300 focus:border-burgundy-600',
                  )}
                />

                <p id="ai-text-hint" className="text-xs text-navy-600">
                  Sorular yalnızca girdiğiniz metindeki bilgilere dayanarak üretilir.
                  En az {AI_LIMITS.MIN_TEXT_CHARS} karakter ve{' '}
                  {AI_LIMITS.MIN_TEXT_WORDS} kelime gereklidir.
                </p>

                {visibleError('sourceText') && (
                  <p
                    id="ai-text-error"
                    className="text-xs font-medium text-burgundy-600"
                  >
                    {visibleError('sourceText')}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Quiz Ayarları */}
          <section className="rounded-2xl bg-cream-50 border border-cream-300 p-5 sm:p-7 shadow-card space-y-6">
            <h2 className="font-display font-bold text-lg text-navy-900">
              Soru ve Zorluk Ayarları
            </h2>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label
                  htmlFor="ai-category"
                  className="block text-sm font-semibold text-navy-900"
                >
                  Kategori
                </label>
                <select
                  id="ai-category"
                  name="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1.5 w-full min-h-12 rounded-xl border border-cream-300 bg-cream-100 px-3.5 py-2 text-base sm:text-sm text-navy-900 focus:border-burgundy-600"
                >
                  {QUIZ_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="ai-grade-level"
                  className="block text-sm font-semibold text-navy-900"
                >
                  Sınıf / Düzey
                </label>
                <select
                  id="ai-grade-level"
                  name="gradeLevel"
                  value={gradeLevel}
                  onChange={(e) => setGradeLevel(e.target.value)}
                  className="mt-1.5 w-full min-h-12 rounded-xl border border-cream-300 bg-cream-100 px-3.5 py-2 text-base sm:text-sm text-navy-900 focus:border-burgundy-600"
                >
                  {AI_GRADE_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="ai-language"
                  className="block text-sm font-semibold text-navy-900"
                >
                  Soruların Dili
                </label>
                <select
                  id="ai-language"
                  name="language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="mt-1.5 w-full min-h-12 rounded-xl border border-cream-300 bg-cream-100 px-3.5 py-2 text-base sm:text-sm text-navy-900 focus:border-burgundy-600"
                >
                  {AI_LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>
                      {lang}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Zorluk Seviyesi (4 görünür radyo kartı) */}
            <fieldset className="space-y-2.5">
              <legend className="text-sm font-semibold text-navy-900">
                Zorluk Seviyesi
              </legend>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {AI_DIFFICULTIES.map((level) => (
                  <label
                    key={level}
                    className={cn(
                      'min-h-12 rounded-xl border px-4 py-2.5 flex items-center gap-2.5 text-sm font-semibold cursor-pointer transition-colors duration-150',
                      difficulty === level
                        ? 'bg-powder-100 border-burgundy-600 text-burgundy-800'
                        : 'bg-cream-100 border-cream-300 text-navy-800 hover:bg-cream-200',
                    )}
                  >
                    <input
                      type="radio"
                      name="ai-difficulty"
                      value={level}
                      checked={difficulty === level}
                      onChange={() => setDifficulty(level)}
                      className="h-4 w-4 accent-burgundy-600"
                    />
                    <span>{AI_DIFFICULTY_LABELS[level]}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Soru Sayısı, Süre ve Puan */}
            <div className="grid gap-5 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="ai-question-count"
                  className="block text-sm font-semibold text-navy-900"
                >
                  Soru Sayısı ({AI_LIMITS.MIN_QUESTIONS}–{AI_LIMITS.MAX_QUESTIONS})
                </label>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    id="ai-question-count"
                    name="questionCount"
                    type="number"
                    min={AI_LIMITS.MIN_QUESTIONS}
                    max={AI_LIMITS.MAX_QUESTIONS}
                    value={questionCount}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (!Number.isFinite(val)) return;
                      setQuestionCount(Math.round(val));
                    }}
                    onBlur={() => markTouched('questionCount')}
                    aria-invalid={Boolean(visibleError('questionCount'))}
                    className="w-24 min-h-12 rounded-xl border border-cream-300 bg-cream-100 px-3 py-2 text-base sm:text-sm font-bold tabular-nums text-navy-900"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {[5, 10, 15, 20, 30].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setQuestionCount(preset)}
                        className={cn(
                          'min-h-10 rounded-lg border px-2.5 py-1 text-xs font-semibold tabular-nums cursor-pointer',
                          questionCount === preset
                            ? 'bg-navy-900 border-navy-900 text-cream-50'
                            : 'bg-cream-100 border-cream-300 text-navy-800 hover:bg-cream-200',
                        )}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
                {visibleError('questionCount') && (
                  <p className="mt-1.5 text-xs font-medium text-burgundy-600">
                    {visibleError('questionCount')}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="ai-time-limit"
                  className="block text-sm font-semibold text-navy-900"
                >
                  Her Soru İçin Süre
                </label>
                <select
                  id="ai-time-limit"
                  name="timeLimitSec"
                  value={timeLimitSec}
                  onChange={(e) =>
                    setTimeLimitSec(Number(e.target.value) as AllowedTimeLimit)
                  }
                  className="mt-1.5 w-full min-h-12 rounded-xl border border-cream-300 bg-cream-100 px-3.5 py-2 text-base sm:text-sm text-navy-900 focus:border-burgundy-600"
                >
                  {TIME_LIMIT_OPTIONS.map((sec) => (
                    <option key={sec} value={sec}>
                      {sec} saniye
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="ai-points"
                  className="block text-sm font-semibold text-navy-900"
                >
                  Her Soru İçin Puan
                </label>
                <input
                  id="ai-points"
                  name="points"
                  type="number"
                  min={100}
                  max={5000}
                  step={50}
                  value={points}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    if (!Number.isFinite(val)) return;
                    setPoints(Math.round(val));
                  }}
                  onBlur={() => markTouched('points')}
                  aria-invalid={Boolean(visibleError('points'))}
                  className="mt-1.5 w-full min-h-12 rounded-xl border border-cream-300 bg-cream-100 px-3.5 py-2 text-base sm:text-sm font-semibold tabular-nums text-navy-900"
                />
                {visibleError('points') && (
                  <p className="mt-1.5 text-xs font-medium text-burgundy-600">
                    {visibleError('points')}
                  </p>
                )}
              </div>
            </div>

            {/* Soru Türleri (4 checkbox) */}
            <fieldset className="space-y-2.5">
              <legend className="text-sm font-semibold text-navy-900">
                Oluşturulacak Soru Türleri
              </legend>
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                {QUESTION_TYPES.slice(0, MAX_CHOICE_OPTIONS).map((qType) => {
                  const checked = questionTypes.includes(qType);
                  return (
                    <label
                      key={qType}
                      className={cn(
                        'min-h-12 rounded-xl border px-3.5 py-2.5 flex items-center gap-2.5 text-xs sm:text-sm font-semibold cursor-pointer transition-colors duration-150',
                        checked
                          ? 'bg-powder-100 border-burgundy-600 text-burgundy-800'
                          : 'bg-cream-100 border-cream-300 text-navy-800 hover:bg-cream-200',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleToggleQuestionType(qType)}
                        className="h-4 w-4 accent-burgundy-600"
                      />
                      <span>{QUESTION_TYPE_LABELS[qType]}</span>
                    </label>
                  );
                })}
              </div>
              {visibleError('questionTypes') && (
                <p className="text-xs font-medium text-burgundy-600">
                  {visibleError('questionTypes')}
                </p>
              )}
            </fieldset>

            {/* Harici Yapay Zekâ Gizlilik Bilgilendirmesi ve Açık Onay */}
            <div className="rounded-xl bg-cream-100 border border-cream-300 p-4 space-y-3">
              <div className="flex items-start gap-2.5 text-xs text-navy-700 leading-relaxed">
                <ShieldCheckIcon className="h-4 w-4 mt-0.5 shrink-0 text-burgundy-600" />
                <p>
                  <strong>Gizlilik ve Veri İşleme Bilgilendirmesi:</strong>{' '}
                  Girdiğiniz konu başlığı, metin veya PDF belgesinden çıkarılan
                  metin, soru oluşturmak amacıyla QUIZORA sunucusu üzerinden
                  harici yapay zekâ sağlayıcısına (Google Gemini API) iletilir.
                  Kişisel veya gizli öğrenci verileri içeren belgeleri paylaşmayınız.
                  PDF dosyaları disk üzerinde saklanmaz ve işlem sonrası bellekten
                  otomatik silinir.
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <input
                  id="ai-consent"
                  name="consentAccepted"
                  type="checkbox"
                  checked={consentAccepted}
                  onChange={(e) => {
                    clearTouched('consent');
                    setConsentAccepted(e.target.checked);
                  }}
                  aria-invalid={Boolean(visibleError('consent'))}
                  className="mt-0.5 h-4 w-4 accent-burgundy-600 cursor-pointer shrink-0"
                />
                <label
                  htmlFor="ai-consent"
                  className="text-xs sm:text-sm font-medium text-navy-900 cursor-pointer"
                >
                  Bilgilendirmeyi okudum; seçili içeriğin soru üretimi için harici
                  yapay zekâ sağlayıcısına gönderilmesini onaylıyorum.
                </label>
              </div>

              {visibleError('consent') && (
                <p className="text-xs font-medium text-burgundy-600">
                  {visibleError('consent')}
                </p>
              )}
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-navy-600">
              Üretilen sorular doğrudan canlı yarışmaya başlatılmaz; önce önizleme ve
              düzenleme ekranına aktarılır.
            </p>
            <button
              type="submit"
              disabled={isGenerating || extractingPdf}
              className="inline-flex items-center justify-center gap-2 min-h-12 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-6 py-3 text-sm font-semibold text-cream-50 cursor-pointer disabled:opacity-60"
            >
              <SparklesIcon className="h-4 w-4" />
              <span>Soruları Oluştur</span>
            </button>
          </div>
        </form>
      )}
    </motion.div>
  );
}
