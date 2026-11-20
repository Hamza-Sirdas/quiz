import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { motion } from 'motion/react';
import {
  MAX_CHOICE_OPTIONS,
  MAX_ORDERING_ITEMS,
  MIN_CHOICE_OPTIONS,
  MIN_ORDERING_ITEMS,
  OPTION_LETTERS,
  QUESTION_TYPES,
  QUESTION_TYPE_DESCRIPTIONS,
  QUESTION_TYPE_LABELS,
  QUIZ_VISIBILITIES,
  QUIZ_VISIBILITY_DESCRIPTIONS,
  QUIZ_VISIBILITY_LABELS,
  type QuestionType,
  type QuizStatus,
} from '@shared/quizTypes';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '@/components/dashboard/ConfirmDialog';
import {
  QuizPreviewModal,
  type PreviewableQuiz,
} from '@/components/dashboard/QuizPreviewModal';
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronLeftIcon,
  CloseIcon,
  CopyIcon,
  EyeIcon,
  ImageIcon,
  PlusCircleIcon,
  SparklesIcon,
  TrashIcon,
} from '@/components/ui/Icons';
import { SafeImage } from '@/components/ui/SafeImage';
import { SortableList } from '@/components/ui/SortableList';
import { resolveMediaUrl } from '@/config/runtime';
import {
  convertQuestionType,
  createEmptyQuestion,
  createEmptyQuizForm,
  createOption,
  DEFAULT_POINTS,
  duplicateQuestionInput,
  MAX_POINTS,
  MIN_POINTS,
  NEW_QUIZ_DRAFT_KEY,
  QUIZ_CATEGORIES,
  quizDetailToFormState,
  TIME_LIMIT_OPTIONS,
  willQuestionTypeChangeLoseData,
  type QuizFormState,
} from '@/constants/quiz';
import { useDashboardToast } from '@/layouts/DashboardLayout';
import {
  ApiError,
  createQuiz,
  getQuiz,
  getUploadStatus,
  updateQuiz,
  uploadImage,
} from '@/services/quizApi';
import type {
  AllowedTimeLimit,
  QuizPayload,
  UploadStatusResponse,
} from '@/types/quiz';
import { cn } from '@/utils/cn';

type ErrorMap = Record<string, string>;

function serializeForm(form: QuizFormState): string {
  return JSON.stringify({
    status: form.status,
    visibility: form.visibility,
    allowPublicPreview: form.allowPublicPreview,
    title: form.title,
    description: form.description,
    category: form.category,
    coverImageUrl: form.coverImageUrl,
    questions: form.questions.map((q) => ({
      type: q.type,
      text: q.text,
      explanation: q.explanation,
      allowPartialCredit: q.allowPartialCredit,
      imageUrl: q.imageUrl,
      timeLimitSec: q.timeLimitSec,
      points: q.points,
      options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
    })),
  });
}

function hasMeaningfulDraftContent(form: QuizFormState): boolean {
  if (form.title.trim() || form.description.trim() || form.coverImageUrl) {
    return true;
  }
  return form.questions.some(
    (q) =>
      q.text.trim() ||
      q.explanation.trim() ||
      Boolean(q.imageUrl) ||
      q.options.some((o) => {
        const t = o.text.trim();
        return t.length > 0 && t !== 'Doğru' && t !== 'Yanlış';
      }),
  );
}

function validateQuizForm(form: QuizFormState): ErrorMap {
  const errors: ErrorMap = {};

  if (!form.title.trim()) {
    errors.title = 'Quiz başlığı boş bırakılamaz.';
  } else if (form.title.trim().length > 120) {
    errors.title = 'Quiz başlığı en fazla 120 karakter olabilir.';
  }

  if (form.description.trim().length > 500) {
    errors.description = 'Quiz açıklaması en fazla 500 karakter olabilir.';
  }

  if (!form.category.trim()) {
    errors.category = 'Lütfen bir kategori seçin.';
  }

  if (form.questions.length === 0) {
    errors.questions = 'En az bir soru eklemelisiniz.';
  }

  form.questions.forEach((question, qIndex) => {
    if (!question.text.trim()) {
      errors[`q.${qIndex}.text`] = `${qIndex + 1}. soru metni boş bırakılamaz.`;
    } else if (question.text.trim().length > 400) {
      errors[`q.${qIndex}.text`] = `${qIndex + 1}. soru metni en fazla 400 karakter olabilir.`;
    }

    if (question.explanation.trim().length > 600) {
      errors[`q.${qIndex}.explanation`] =
        `${qIndex + 1}. soru açıklaması en fazla 600 karakter olabilir.`;
    }

    if (
      !Number.isInteger(question.points) ||
      question.points < MIN_POINTS ||
      question.points > MAX_POINTS
    ) {
      errors[`q.${qIndex}.points`] =
        `${qIndex + 1}. soru puanı ${MIN_POINTS} ile ${MAX_POINTS} arasında tam sayı olmalıdır.`;
    }

    const correctCount = question.options.filter((opt) => opt.isCorrect).length;

    if (question.type === 'MULTIPLE_CHOICE') {
      if (
        question.options.length < MIN_CHOICE_OPTIONS ||
        question.options.length > MAX_CHOICE_OPTIONS
      ) {
        errors[`q.${qIndex}.options`] =
          `${qIndex + 1}. soruda ${MIN_CHOICE_OPTIONS}–${MAX_CHOICE_OPTIONS} arası seçenek bulunmalıdır.`;
      }
      if (correctCount !== 1) {
        errors[`q.${qIndex}.correct`] =
          `${qIndex + 1}. soru için yalnızca bir doğru cevap seçilmelidir.`;
      }
    } else if (question.type === 'TRUE_FALSE') {
      if (question.options.length !== 2) {
        errors[`q.${qIndex}.options`] =
          `${qIndex + 1}. soruda (Doğru / Yanlış) tam olarak 2 seçenek bulunmalıdır.`;
      }
      if (correctCount !== 1) {
        errors[`q.${qIndex}.correct`] =
          `${qIndex + 1}. soru için Doğru veya Yanlış seçeneklerinden biri işaretlenmelidir.`;
      }
    } else if (question.type === 'MULTI_SELECT') {
      if (
        question.options.length < MIN_CHOICE_OPTIONS ||
        question.options.length > MAX_CHOICE_OPTIONS
      ) {
        errors[`q.${qIndex}.options`] =
          `${qIndex + 1}. soruda ${MIN_CHOICE_OPTIONS}–${MAX_CHOICE_OPTIONS} arası seçenek bulunmalıdır.`;
      }
      if (correctCount < 2) {
        errors[`q.${qIndex}.correct`] =
          `${qIndex + 1}. soru (Çoklu Doğru Cevap) için en az 2 doğru cevap seçilmelidir.`;
      }
    } else if (question.type === 'ORDERING') {
      if (
        question.options.length < MIN_ORDERING_ITEMS ||
        question.options.length > MAX_ORDERING_ITEMS
      ) {
        errors[`q.${qIndex}.options`] =
          `${qIndex + 1}. soruda ${MIN_ORDERING_ITEMS}–${MAX_ORDERING_ITEMS} arası öğe bulunmalıdır.`;
      }
    }

    question.options.forEach((option, oIndex) => {
      if (!option.text.trim()) {
        const label =
          question.type === 'ORDERING'
            ? `${oIndex + 1}. sıra öğesi`
            : `${OPTION_LETTERS[oIndex] ?? String(oIndex + 1)} seçeneği`;
        errors[`q.${qIndex}.opt.${oIndex}`] =
          `${qIndex + 1}. sorunun ${label} boş bırakılamaz.`;
      }
    });
  });

  return errors;
}

function toQuizPayload(form: QuizFormState, status: QuizStatus): QuizPayload {
  return {
    status,
    visibility: status === 'DRAFT' ? 'PRIVATE' : form.visibility,
    allowPublicPreview: form.allowPublicPreview,
    ...(form.aiGenerated
      ? {
          aiGenerated: true,
          aiGenerationMethod: form.aiGenerationMethod ?? null,
          aiSourceType: form.aiSourceType ?? null,
          aiSourceSummary: form.aiSourceSummary ?? null,
          aiGeneratedAt: form.aiGeneratedAt ?? null,
        }
      : {}),
    title: form.title.trim(),
    description: form.description.trim(),
    category: form.category.trim(),
    coverImageUrl: form.coverImageUrl,
    questions: form.questions.map((question) => {
      const safePoints =
        status === 'DRAFT' &&
        (!Number.isInteger(question.points) ||
          question.points < MIN_POINTS ||
          question.points > MAX_POINTS)
          ? DEFAULT_POINTS
          : question.points;

      return {
        type: question.type,
        text: question.text.trim(),
        explanation: question.explanation.trim(),
        sourceReference: question.sourceReference ?? null,
        difficulty: question.difficulty ?? null,
        allowPartialCredit:
          question.type === 'MULTI_SELECT' ? question.allowPartialCredit : false,
        imageUrl: question.imageUrl,
        timeLimitSec: question.timeLimitSec,
        points: safePoints,
        options: question.options.map((option) => ({
          text: option.text.trim(),
          isCorrect: question.type === 'ORDERING' ? true : option.isCorrect,
        })),
      };
    }),
  };
}

export function QuizEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isRouteEditMode = Boolean(id);
  const navigate = useNavigate();
  const { showToast } = useDashboardToast();

  const [form, setForm] = useState<QuizFormState>(() => createEmptyQuizForm());
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() =>
    serializeForm(createEmptyQuizForm()),
  );
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [pointsDraft, setPointsDraft] = useState<string>(String(DEFAULT_POINTS));

  const [loadingInitial, setLoadingInitial] = useState(isRouteEditMode);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingQuestionImage, setUploadingQuestionImage] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatusResponse | null>(null);

  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<string | null>(null);
  const [pendingTypeChange, setPendingTypeChange] = useState<{
    questionIndex: number;
    targetType: QuestionType;
    reason: string;
  } | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const skipNavigationBlockRef = useRef(false);
  const persistedIdRef = useRef<string | null>(id ?? null);
  const autoSaveTimerRef = useRef<number | null>(null);
  const saveInFlightRef = useRef<Promise<unknown> | null>(null);
  const currentSerializedForm = useMemo(() => serializeForm(form), [form]);
  const latestFormSnapshotRef = useRef<string>(currentSerializedForm);
  latestFormSnapshotRef.current = currentSerializedForm;

  useEffect(() => {
    let active = true;
    getUploadStatus()
      .then((status) => {
        if (active) setUploadStatus(status);
      })
      .catch(() => {
        // Durum sorgulanamazsa varsayılan yükleme butonunu koru (sunucu hata verirse gösterir)
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    skipNavigationBlockRef.current = false;
    persistedIdRef.current = id ?? null;
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    if (!isRouteEditMode || !id) {
      try {
        window.localStorage.removeItem(NEW_QUIZ_DRAFT_KEY);
      } catch {
        // yoksay
      }
      const empty = createEmptyQuizForm();
      const emptySnapshot = serializeForm(empty);
      setForm(empty);
      setSavedSnapshot(emptySnapshot);
      setActiveQuestionIndex(0);
      setPointsDraft(String(DEFAULT_POINTS));
      setDraftStatus(null);
      setSubmitted(false);
      setTouched({});
      setServerError(null);
      setLoadingInitial(false);
      return;
    }

    let active = true;
    setLoadingInitial(true);
    setLoadError(null);

    getQuiz(id)
      .then(({ quiz }) => {
        if (!active) return;
        const loaded = quizDetailToFormState(quiz);
        setForm(loaded);
        setSavedSnapshot(serializeForm(loaded));
        setActiveQuestionIndex(0);
        setPointsDraft(String(loaded.questions[0]?.points ?? DEFAULT_POINTS));
        setDraftStatus(
          quiz.status === 'DRAFT' ? 'Taslak olarak kayıtlı' : 'Yayına hazır',
        );
      })
      .catch((err) => {
        if (!active) return;
        setLoadError(
          err instanceof ApiError
            ? err.message
            : 'Quiz bilgileri yüklenirken bir hata oluştu.',
        );
      })
      .finally(() => {
        if (active) setLoadingInitial(false);
      });

    return () => {
      active = false;
    };
  }, [id, isRouteEditMode]);

  const currentQuestion = form.questions[activeQuestionIndex] ?? form.questions[0];

  useEffect(() => {
    if (currentQuestion) {
      setPointsDraft(String(currentQuestion.points));
    }
  }, [activeQuestionIndex, currentQuestion?.localId]);

  const isDirty = currentSerializedForm !== savedSnapshot;

  // Yeni quizler ve Taslak quizler için DB'ye otomatik taslak kaydı (Yayına Hazır quizleri kendiliğinden taslağa düşürmez)
  useEffect(() => {
    if (loadingInitial || saving || !isDirty) return;
    if (form.status !== 'DRAFT') return;
    if (!persistedIdRef.current && !hasMeaningfulDraftContent(form)) return;

    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      const snapshotAtSend = latestFormSnapshotRef.current;
      const payload = toQuizPayload(form, 'DRAFT');

      const runSave = async () => {
        if (saveInFlightRef.current) {
          await saveInFlightRef.current.catch(() => undefined);
        }
        setAutoSaving(true);
        try {
          const targetId = persistedIdRef.current;
          const res = targetId
            ? await updateQuiz(targetId, payload)
            : await createQuiz(payload);
          persistedIdRef.current = res.quiz.id;
          setSavedSnapshot((prev) =>
            snapshotAtSend === latestFormSnapshotRef.current
              ? snapshotAtSend
              : prev,
          );
          const timeLabel = new Date().toLocaleTimeString('tr-TR', {
            hour: '2-digit',
            minute: '2-digit',
          });
          setDraftStatus(`Taslak otomatik kaydedildi · ${timeLabel}`);
        } catch {
          setDraftStatus('Otomatik taslak kaydı beklemede');
        } finally {
          setAutoSaving(false);
        }
      };

      const promise = runSave();
      saveInFlightRef.current = promise;
    }, 1200);

    return () => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [form, isDirty, loadingInitial, saving]);

  useEffect(() => {
    if (!isDirty || saving) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, saving]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty &&
      !saving &&
      !skipNavigationBlockRef.current &&
      currentLocation.pathname !== nextLocation.pathname,
  );

  const allErrors = useMemo(() => validateQuizForm(form), [form]);

  const visibleError = (key: string): string | undefined => {
    if (!submitted && !touched[key]) return undefined;
    return allErrors[key];
  };

  const markTouched = (key: string) => {
    setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  };

  const clearTouched = (key: string) => {
    setTouched((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const updateQuestionAt = useCallback(
    (
      index: number,
      updater: (q: QuizFormState['questions'][number]) => QuizFormState['questions'][number],
    ) => {
      setForm((prev) => ({
        ...prev,
        questions: prev.questions.map((item, idx) =>
          idx === index ? updater(item) : item,
        ),
      }));
    },
    [],
  );

  const handleAddQuestion = () => {
    const nextQuestion = createEmptyQuestion('MULTIPLE_CHOICE');
    setForm((prev) => ({
      ...prev,
      questions: [...prev.questions, nextQuestion],
    }));
    setActiveQuestionIndex(form.questions.length);
  };

  const handleDuplicateQuestion = (index: number) => {
    const source = form.questions[index];
    if (!source) return;
    if (form.questions.length >= 100) {
      showToast('Soru eklenemedi', 'Bir quizde en fazla 100 soru olabilir.', 'error');
      return;
    }

    const cloned = duplicateQuestionInput(source);
    setForm((prev) => {
      const next = [...prev.questions];
      next.splice(index + 1, 0, cloned);
      return { ...prev, questions: next };
    });
    setActiveQuestionIndex(index + 1);
    showToast('Soru kopyalandı', `${index + 1}. soru yeni kimlikle çoğaltıldı.`);
  };

  const handleDeleteQuestion = (index: number) => {
    if (form.questions.length <= 1) {
      showToast(
        'Soru silinemedi',
        'Bir quizde en az bir soru bulunmalıdır.',
        'error',
      );
      return;
    }

    setForm((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, idx) => idx !== index),
    }));
    setActiveQuestionIndex((prevIdx) => {
      if (prevIdx > index) return prevIdx - 1;
      if (prevIdx >= form.questions.length - 1) return Math.max(0, form.questions.length - 2);
      return prevIdx;
    });
  };

  const handleReorderQuestions = (nextQuestions: QuizFormState['questions']) => {
    const activeLocalId = form.questions[activeQuestionIndex]?.localId;
    setForm((prev) => ({ ...prev, questions: nextQuestions }));
    if (activeLocalId) {
      const nextIdx = nextQuestions.findIndex((q) => q.localId === activeLocalId);
      if (nextIdx !== -1) {
        setActiveQuestionIndex(nextIdx);
      }
    }
  };

  const handleSelectQuestionType = (targetType: QuestionType) => {
    if (!currentQuestion || currentQuestion.type === targetType) return;
    const risk = willQuestionTypeChangeLoseData(currentQuestion, targetType);
    if (risk.losesData) {
      setPendingTypeChange({
        questionIndex: activeQuestionIndex,
        targetType,
        reason: risk.reason,
      });
      return;
    }
    updateQuestionAt(activeQuestionIndex, (q) => convertQuestionType(q, targetType));
  };

  const validateFileBeforeUpload = (file: File): string | null => {
    const allowed = uploadStatus?.allowedTypes ?? [
      'image/jpeg',
      'image/png',
      'image/webp',
    ];
    const maxBytes = uploadStatus?.maxSizeBytes ?? 5 * 1024 * 1024;
    if (!allowed.includes(file.type)) {
      return 'Desteklenmeyen dosya türü. Yalnızca JPEG, PNG veya WebP yüklenebilir.';
    }
    if (file.size > maxBytes) {
      return 'Görsel boyutu en fazla 5 MB olabilir.';
    }
    return null;
  };

  const handleCoverUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const preError = validateFileBeforeUpload(file);
    if (preError) {
      showToast('Görsel yüklenemedi', preError, 'error');
      return;
    }

    setUploadingCover(true);
    try {
      const { url } = await uploadImage(file);
      setForm((prev) => ({ ...prev, coverImageUrl: url }));
      showToast('Kapak görseli yüklendi', 'Görsel quizinize eklendi.');
    } catch (err) {
      showToast(
        'Görsel yüklenemedi',
        err instanceof ApiError ? err.message : 'Lütfen geçerli bir görsel seçin.',
        'error',
      );
    } finally {
      setUploadingCover(false);
    }
  };

  const handleQuestionImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const preError = validateFileBeforeUpload(file);
    if (preError) {
      showToast('Görsel yüklenemedi', preError, 'error');
      return;
    }

    setUploadingQuestionImage(true);
    try {
      const { url } = await uploadImage(file);
      updateQuestionAt(activeQuestionIndex, (q) => ({ ...q, imageUrl: url }));
      showToast('Soru görseli yüklendi', 'Görsel aktif soruya eklendi.');
    } catch (err) {
      showToast(
        'Görsel yüklenemedi',
        err instanceof ApiError ? err.message : 'Lütfen geçerli bir görsel seçin.',
        'error',
      );
    } finally {
      setUploadingQuestionImage(false);
    }
  };

  const persistQuizWithStatus = async (targetStatus: QuizStatus) => {
    setServerError(null);
    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    if (targetStatus === 'PUBLISHED') {
      setSubmitted(true);
      const validationErrors = validateQuizForm(form);
      const errorEntries = Object.entries(validationErrors);
      if (errorEntries.length > 0) {
        const firstQuestionError = errorEntries.find(([key]) => key.startsWith('q.'));
        if (firstQuestionError && !validationErrors.title && !validationErrors.category) {
          const match = /^q\.(\d+)\./.exec(firstQuestionError[0]);
          if (match) {
            setActiveQuestionIndex(Number(match[1]));
          }
        }
        window.requestAnimationFrame(() => {
          errorSummaryRef.current?.focus();
        });
        return;
      }
    }

    setSaving(true);
    try {
      if (saveInFlightRef.current) {
        await saveInFlightRef.current.catch(() => undefined);
      }

      const payload = toQuizPayload(form, targetStatus);
      const existingId = persistedIdRef.current;
      const res = existingId
        ? await updateQuiz(existingId, payload)
        : await createQuiz(payload);

      persistedIdRef.current = res.quiz.id;
      const updatedState = quizDetailToFormState(res.quiz);
      setForm(updatedState);
      setSavedSnapshot(serializeForm(updatedState));

      if (targetStatus === 'DRAFT') {
        const timeLabel = new Date().toLocaleTimeString('tr-TR', {
          hour: '2-digit',
          minute: '2-digit',
        });
        setDraftStatus(`Taslak olarak kaydedildi · ${timeLabel}`);
        showToast(
          'Taslak kaydedildi',
          'Quiz taslak olarak saklandı; canlı yarışma için daha sonra tamamlayabilirsiniz.',
        );
        if (!isRouteEditMode) {
          skipNavigationBlockRef.current = true;
          navigate(`/dashboard/quizzes/${res.quiz.id}/edit`, { replace: true });
        }
        return;
      }

      skipNavigationBlockRef.current = true;
      showToast(
        isRouteEditMode ? 'Quiz güncellendi' : 'Quiz kaydedildi',
        `"${res.quiz.title}" yayına hazır olarak veritabanına kaydedildi.`,
      );
      navigate('/dashboard/quizzes');
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Quiz kaydedilirken beklenmeyen bir hata oluştu.';
      setServerError(message);
      window.requestAnimationFrame(() => {
        errorSummaryRef.current?.focus();
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await persistQuizWithStatus('PUBLISHED');
  };

  const previewQuiz: PreviewableQuiz = {
    title: form.title,
    description: form.description,
    category: form.category,
    coverImageUrl: form.coverImageUrl,
    questions: form.questions.map((q) => ({
      type: q.type,
      text: q.text,
      explanation: q.explanation,
      allowPartialCredit: q.allowPartialCredit,
      imageUrl: q.imageUrl,
      timeLimitSec: q.timeLimitSec,
      points: q.points,
      options: q.options.map((opt, idx) => ({
        id: opt.localId || `prev-${q.localId}-${idx}`,
        text: opt.text,
        isCorrect: opt.isCorrect,
      })),
    })),
  };

  const errorList = submitted ? Object.values(allErrors) : [];
  const questionHasError = (qIndex: number): boolean =>
    submitted &&
    Object.keys(allErrors).some((key) => key.startsWith(`q.${qIndex}.`));

  const uploadDisabled = uploadStatus?.configured === false;

  if (loadingInitial) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="h-8 w-56 rounded-lg bg-cream-200 animate-pulse" />
        <div className="rounded-2xl bg-cream-50 border border-cream-300 p-8 animate-pulse space-y-4">
          <div className="h-11 rounded-xl bg-cream-200" />
          <div className="h-24 rounded-xl bg-cream-200" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        role="alert"
        className="rounded-2xl bg-burgundy-50 border border-burgundy-500 p-6 text-navy-900"
      >
        <h1 className="font-display font-bold text-xl">Quiz açılamadı</h1>
        <p className="mt-2 text-sm text-navy-700">{loadError}</p>
        <Link
          to="/dashboard/quizzes"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-navy-900 px-4 py-2 text-sm font-semibold text-cream-50"
        >
          <ChevronLeftIcon />
          <span>Quiz Listesine Dön</span>
        </Link>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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
              style={{ fontSize: 'var(--text-h1)', lineHeight: 'var(--leading-h1)' }}
            >
              {isRouteEditMode ? 'Quizi Düzenle' : 'Yeni Quiz Oluştur'}
            </h1>
            <span
              className={cn(
                'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                form.status === 'PUBLISHED'
                  ? 'bg-powder-100 border-powder-200 text-burgundy-600'
                  : 'bg-cream-200 border-cream-300 text-navy-700',
              )}
            >
              {form.status === 'PUBLISHED' ? 'Yayına Hazır' : 'Taslak'}
            </span>
            {form.aiGenerated && (
              <span className="inline-flex items-center gap-1 rounded-full bg-cream-200 border border-cream-300 px-2.5 py-0.5 text-xs font-semibold text-navy-800">
                <SparklesIcon className="h-3.5 w-3.5 text-burgundy-600" />
                <span>Yapay Zekâ Taslağı</span>
              </span>
            )}
          </div>

          <div
            aria-live="polite"
            className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-navy-600"
          >
            {autoSaving ? (
              <span className="font-medium text-burgundy-600">
                Taslak kaydediliyor...
              </span>
            ) : (
              draftStatus && <span>{draftStatus}</span>
            )}
            {isDirty && (
              <span className="inline-flex items-center rounded-full bg-powder-100 border border-powder-200 px-2.5 py-0.5 font-semibold text-burgundy-600">
                Kaydedilmemiş değişiklikler var
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={saving}
            onClick={() => void persistQuizWithStatus('DRAFT')}
            className="min-h-10 rounded-xl border border-cream-300 bg-cream-50 hover:bg-cream-200 px-4 py-2 text-xs sm:text-sm font-semibold text-navy-900 cursor-pointer disabled:opacity-60"
          >
            Taslak Kaydet
          </button>
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="inline-flex items-center gap-2 min-h-10 rounded-xl border border-cream-300 bg-cream-50 hover:bg-cream-200 px-4 py-2 text-xs sm:text-sm font-semibold text-navy-900 cursor-pointer"
          >
            <EyeIcon />
            <span>Önizle</span>
          </button>
        </div>
      </div>

      {(errorList.length > 0 || serverError) && (
        <div
          ref={errorSummaryRef}
          tabIndex={-1}
          role="alert"
          aria-live="assertive"
          className="rounded-2xl bg-burgundy-50 border border-burgundy-500 p-4 sm:p-5 text-navy-900"
        >
          <div className="flex items-start gap-3">
            <AlertCircleIcon className="mt-0.5 shrink-0 text-burgundy-600" />
            <div>
              <p className="font-display font-bold text-sm sm:text-base text-burgundy-800">
                {serverError ?? 'Lütfen aşağıdaki form hatalarını düzeltin:'}
              </p>
              {errorList.length > 0 && (
                <ul className="mt-2 list-disc list-inside space-y-1 text-xs sm:text-sm text-navy-800">
                  {errorList.map((msg, idx) => (
                    <li key={idx}>{msg}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <form onSubmit={(event) => void handleSubmit(event)} noValidate className="space-y-6">
        <section
          aria-labelledby="quiz-genel-bilgiler"
          className="rounded-2xl bg-cream-50 border border-cream-300 p-5 sm:p-7 shadow-card space-y-5"
        >
          <h2
            id="quiz-genel-bilgiler"
            className="font-display font-bold text-lg text-navy-900"
          >
            Quiz Bilgileri
          </h2>

          <div className="grid gap-5 md:grid-cols-12">
            <div className="md:col-span-8">
              <label
                htmlFor="quiz-title"
                className="block text-sm font-semibold text-navy-900"
              >
                Quiz Başlığı <span className="text-burgundy-600" aria-hidden="true">*</span>
              </label>
              <input
                id="quiz-title"
                name="title"
                type="text"
                required
                maxLength={120}
                value={form.title}
                onChange={(event) => {
                  clearTouched('title');
                  setForm((prev) => ({ ...prev, title: event.target.value }));
                }}
                onBlur={() => markTouched('title')}
                aria-invalid={Boolean(visibleError('title'))}
                aria-describedby={visibleError('title') ? 'quiz-title-error' : undefined}
                placeholder="Örn. Türkiye Coğrafyası Bilgi Yarışması"
                className={cn(
                  'mt-1.5 w-full min-h-12 rounded-xl border bg-cream-100 px-4 py-2.5 text-base text-navy-900 placeholder:text-navy-500',
                  visibleError('title')
                    ? 'border-burgundy-600 bg-burgundy-50/40'
                    : 'border-cream-300 focus:border-burgundy-600',
                )}
              />
              {visibleError('title') && (
                <p id="quiz-title-error" className="mt-1.5 text-xs font-medium text-burgundy-600">
                  {visibleError('title')}
                </p>
              )}
            </div>

            <div className="md:col-span-4">
              <label
                htmlFor="quiz-category"
                className="block text-sm font-semibold text-navy-900"
              >
                Kategori <span className="text-burgundy-600" aria-hidden="true">*</span>
              </label>
              <select
                id="quiz-category"
                name="category"
                required
                value={form.category}
                onChange={(event) => {
                  clearTouched('category');
                  setForm((prev) => ({ ...prev, category: event.target.value }));
                }}
                onBlur={() => markTouched('category')}
                aria-invalid={Boolean(visibleError('category'))}
                className="mt-1.5 w-full min-h-12 rounded-xl border border-cream-300 bg-cream-100 px-3.5 py-2.5 text-base text-navy-900 focus:border-burgundy-600"
              >
                {QUIZ_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="quiz-description"
              className="block text-sm font-semibold text-navy-900"
            >
              Quiz Açıklaması{' '}
              <span className="text-xs font-normal text-navy-500">(isteğe bağlı)</span>
            </label>
            <textarea
              id="quiz-description"
              name="description"
              rows={3}
              maxLength={500}
              value={form.description}
              onChange={(event) => {
                clearTouched('description');
                setForm((prev) => ({ ...prev, description: event.target.value }));
              }}
              onBlur={() => markTouched('description')}
              placeholder="Öğrencilere veya katılımcılara quiz hakkında kısa bilgi verin..."
              className="mt-1.5 w-full rounded-xl border border-cream-300 bg-cream-100 px-4 py-2.5 text-base text-navy-900 placeholder:text-navy-500 focus:border-burgundy-600"
            />
          </div>

          <div>
            <span className="block text-sm font-semibold text-navy-900">
              Kapak Görseli{' '}
              <span className="text-xs font-normal text-navy-500">
                (isteğe bağlı · JPEG, PNG, WebP · maks. 5 MB)
              </span>
            </span>

            {uploadDisabled ? (
              <p className="mt-2 rounded-xl border border-cream-300 bg-cream-100 px-3.5 py-2.5 text-xs text-navy-600">
                Görsel yükleme depolama alanı şu anda yapılandırılmamış.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 min-h-10 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-4 py-2 text-sm font-semibold text-navy-900 cursor-pointer transition-colors duration-150">
                  <ImageIcon />
                  <span>{uploadingCover ? 'Yükleniyor...' : 'Kapak Görseli Seç'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploadingCover}
                    onChange={(event) => void handleCoverUpload(event)}
                    className="sr-only"
                  />
                </label>

                {form.coverImageUrl && (
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, coverImageUrl: null }))}
                    className="min-h-10 rounded-xl border border-burgundy-500/40 bg-burgundy-50 hover:bg-burgundy-100 px-3.5 py-2 text-xs font-semibold text-burgundy-700 cursor-pointer"
                  >
                    Görseli Kaldır
                  </button>
                )}
              </div>
            )}

            {form.coverImageUrl && (
              <div className="mt-3 max-w-md overflow-hidden rounded-xl border border-cream-300 bg-cream-200">
                <SafeImage
                  src={resolveMediaUrl(form.coverImageUrl)}
                  alt="Quiz kapak görseli önizlemesi"
                  className="w-full aspect-[16/7] object-cover"
                  fallbackClassName="rounded-none"
                />
              </div>
            )}
          </div>

          <div className="border-t border-cream-300 pt-5 space-y-3">
            <div>
              <label
                htmlFor="quiz-visibility"
                className="block text-sm font-semibold text-navy-900"
              >
                Görünürlük ve Paylaşım Ayarı
              </label>
              <p className="mt-0.5 text-xs text-navy-600">
                Quizin kimler tarafından görüntülenebileceğini ve kopyalanabileceğini belirleyin.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {QUIZ_VISIBILITIES.map((vis) => {
                const isSelected = form.visibility === vis;
                return (
                  <label
                    key={vis}
                    className={cn(
                      'flex flex-col justify-between rounded-xl border p-3.5 cursor-pointer transition-colors duration-150',
                      isSelected
                        ? 'bg-powder-100/80 border-burgundy-600'
                        : 'bg-cream-100 border-cream-300 hover:bg-cream-200/70',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="quiz-visibility"
                        value={vis}
                        checked={isSelected}
                        onChange={() =>
                          setForm((prev) => ({ ...prev, visibility: vis }))
                        }
                        className="accent-burgundy-600"
                      />
                      <span className="font-display font-bold text-sm text-navy-900">
                        {QUIZ_VISIBILITY_LABELS[vis]}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-navy-600 leading-relaxed">
                      {QUIZ_VISIBILITY_DESCRIPTIONS[vis]}
                    </p>
                  </label>
                );
              })}
            </div>

            {form.visibility !== 'PRIVATE' && (
              <div className="rounded-xl bg-cream-100 border border-cream-300 p-3.5 flex items-center justify-between gap-3">
                <div>
                  <label
                    htmlFor="quiz-allow-public-preview"
                    className="font-display font-bold text-xs sm:text-sm text-navy-900 cursor-pointer"
                  >
                    Soruların Önizlenmesine İzin Ver
                  </label>
                  <p className="text-xs text-navy-600">
                    Diğer öğretmenler quizi kendi kütüphanelerine eklemeden önce soruları inceleyebilir.
                  </p>
                </div>
                <input
                  id="quiz-allow-public-preview"
                  type="checkbox"
                  checked={form.allowPublicPreview}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      allowPublicPreview: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 accent-burgundy-600 cursor-pointer shrink-0"
                />
              </div>
            )}
          </div>
        </section>

        <section
          aria-labelledby="sorular-bolumu-baslik"
          className="grid gap-6 lg:grid-cols-12 items-start"
        >
          <aside className="lg:col-span-4 rounded-2xl bg-cream-50 border border-cream-300 p-5 shadow-card space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2
                id="sorular-bolumu-baslik"
                className="font-display font-bold text-base text-navy-900"
              >
                Sorular ({form.questions.length})
              </h2>

              <button
                type="button"
                onClick={handleAddQuestion}
                className="inline-flex items-center gap-1.5 min-h-9 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-3 py-1.5 text-xs font-semibold text-cream-50 transition-colors duration-150 cursor-pointer"
              >
                <PlusCircleIcon className="h-4 w-4" />
                <span>Soru Ekle</span>
              </button>
            </div>

            <SortableList
              items={form.questions}
              getId={(q) => q.localId}
              getLabel={(_, idx) => `Soru ${idx + 1}`}
              onReorder={handleReorderQuestions}
              ariaLabel="Sorular sıralama listesi"
              compactControls
              itemClassName={(_, controls) => {
                const isActive = controls.index === activeQuestionIndex;
                const hasError = questionHasError(controls.index);
                return cn(
                  isActive
                    ? 'bg-powder-100 border-powder-500'
                    : hasError
                      ? 'bg-burgundy-50/50 border-burgundy-500'
                      : 'bg-cream-100 border-cream-300 hover:bg-cream-200',
                );
              }}
              renderContent={(question, controls) => {
                const isActive = controls.index === activeQuestionIndex;
                return (
                  <div className="flex items-start justify-between gap-1.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => setActiveQuestionIndex(controls.index)}
                      className="flex-1 min-w-0 text-start cursor-pointer py-0.5"
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold tabular-nums',
                            isActive
                              ? 'bg-burgundy-600 text-cream-50'
                              : 'bg-cream-200 text-navy-900',
                          )}
                        >
                          {controls.index + 1}
                        </span>
                        <span className="truncate text-sm font-semibold text-navy-900">
                          {question.text.trim() || `Soru ${controls.index + 1}`}
                        </span>
                      </div>
                      <p className="mt-1 pl-6 text-[11px] text-navy-600 truncate">
                        {QUESTION_TYPE_LABELS[question.type]} · {question.timeLimitSec} sn ·{' '}
                        {question.points} p
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDuplicateQuestion(controls.index)}
                      aria-label={`Soru ${controls.index + 1} kopyala`}
                      title="Soruyu Kopyala"
                      className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-cream-300 bg-cream-50 text-navy-700 hover:bg-cream-200 cursor-pointer"
                    >
                      <CopyIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              }}
            />
          </aside>

          {currentQuestion && (
            <div className="lg:col-span-8 rounded-2xl bg-cream-50 border border-cream-300 p-5 sm:p-7 shadow-card space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cream-300 pb-4">
                <h3 className="font-display font-bold text-lg text-navy-900">
                  Soru {activeQuestionIndex + 1} Düzenleyici
                </h3>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDuplicateQuestion(activeQuestionIndex)}
                    className="inline-flex items-center gap-1.5 min-h-9 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-3 py-1.5 text-xs font-semibold text-navy-900 cursor-pointer"
                  >
                    <CopyIcon className="h-3.5 w-3.5" />
                    <span>Soruyu Kopyala</span>
                  </button>

                  <button
                    type="button"
                    disabled={form.questions.length <= 1}
                    onClick={() => handleDeleteQuestion(activeQuestionIndex)}
                    className="inline-flex items-center gap-1.5 min-h-9 rounded-xl border border-burgundy-500/40 bg-burgundy-50 hover:bg-burgundy-100 px-3 py-1.5 text-xs font-semibold text-burgundy-700 disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <TrashIcon />
                    <span>Soruyu Sil</span>
                  </button>
                </div>
              </div>

              <fieldset className="space-y-2.5">
                <legend className="text-sm font-semibold text-navy-900">
                  Soru Türü
                </legend>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {QUESTION_TYPES.map((qType) => {
                    const selected = currentQuestion.type === qType;
                    return (
                      <button
                        key={qType}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => handleSelectQuestionType(qType)}
                        className={cn(
                          'min-h-11 rounded-xl border px-3 py-2 text-start text-xs font-semibold transition-colors duration-150 cursor-pointer',
                          selected
                            ? 'bg-navy-900 border-navy-900 text-cream-50'
                            : 'bg-cream-100 border-cream-300 text-navy-800 hover:bg-cream-200',
                        )}
                      >
                        {QUESTION_TYPE_LABELS[qType]}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-navy-600">
                  {QUESTION_TYPE_DESCRIPTIONS[currentQuestion.type]}
                </p>
              </fieldset>

              <div>
                <label
                  htmlFor={`question-text-${activeQuestionIndex}`}
                  className="block text-sm font-semibold text-navy-900"
                >
                  Soru Metni <span className="text-burgundy-600" aria-hidden="true">*</span>
                </label>
                <textarea
                  id={`question-text-${activeQuestionIndex}`}
                  name={`question-text-${activeQuestionIndex}`}
                  rows={3}
                  required
                  maxLength={400}
                  value={currentQuestion.text}
                  onChange={(event) => {
                    clearTouched(`q.${activeQuestionIndex}.text`);
                    updateQuestionAt(activeQuestionIndex, (q) => ({
                      ...q,
                      text: event.target.value,
                    }));
                  }}
                  onBlur={() => markTouched(`q.${activeQuestionIndex}.text`)}
                  aria-invalid={Boolean(visibleError(`q.${activeQuestionIndex}.text`))}
                  aria-describedby={
                    visibleError(`q.${activeQuestionIndex}.text`)
                      ? `question-text-error-${activeQuestionIndex}`
                      : undefined
                  }
                  placeholder="Sorunuzu buraya yazın..."
                  className={cn(
                    'mt-1.5 w-full rounded-xl border bg-cream-100 px-4 py-2.5 text-base text-navy-900 placeholder:text-navy-500',
                    visibleError(`q.${activeQuestionIndex}.text`)
                      ? 'border-burgundy-600 bg-burgundy-50/40'
                      : 'border-cream-300 focus:border-burgundy-600',
                  )}
                />
                {visibleError(`q.${activeQuestionIndex}.text`) && (
                  <p
                    id={`question-text-error-${activeQuestionIndex}`}
                    className="mt-1.5 text-xs font-medium text-burgundy-600"
                  >
                    {visibleError(`q.${activeQuestionIndex}.text`)}
                  </p>
                )}
                {currentQuestion.sourceReference && (
                  <p className="mt-1.5 text-xs text-navy-600">
                    <strong>Kaynak Referansı:</strong>{' '}
                    {currentQuestion.sourceReference}
                  </p>
                )}
              </div>

              <div>
                <span className="block text-sm font-semibold text-navy-900">
                  Soru Görseli{' '}
                  <span className="text-xs font-normal text-navy-500">
                    (isteğe bağlı · JPEG, PNG, WebP · maks. 5 MB)
                  </span>
                </span>
                {uploadDisabled ? (
                  <p className="mt-2 rounded-xl border border-cream-300 bg-cream-100 px-3.5 py-2.5 text-xs text-navy-600">
                    Görsel yükleme depolama alanı şu anda yapılandırılmamış.
                  </p>
                ) : (
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <label className="inline-flex items-center gap-2 min-h-10 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-4 py-2 text-sm font-semibold text-navy-900 cursor-pointer transition-colors duration-150">
                      <ImageIcon />
                      <span>
                        {uploadingQuestionImage ? 'Yükleniyor...' : 'Soru Görseli Seç'}
                      </span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={uploadingQuestionImage}
                        onChange={(event) => void handleQuestionImageUpload(event)}
                        className="sr-only"
                      />
                    </label>

                    {currentQuestion.imageUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          updateQuestionAt(activeQuestionIndex, (q) => ({
                            ...q,
                            imageUrl: null,
                          }))
                        }
                        className="min-h-10 rounded-xl border border-burgundy-500/40 bg-burgundy-50 hover:bg-burgundy-100 px-3.5 py-2 text-xs font-semibold text-burgundy-700 cursor-pointer"
                      >
                        Soru Görselini Kaldır
                      </button>
                    )}
                  </div>
                )}

                {currentQuestion.imageUrl && (
                  <div className="mt-3 max-w-sm overflow-hidden rounded-xl border border-cream-300 bg-cream-100">
                    <SafeImage
                      src={resolveMediaUrl(currentQuestion.imageUrl)}
                      alt={`Soru ${activeQuestionIndex + 1} görseli`}
                      className="w-full max-h-48 object-contain"
                      fallbackClassName="rounded-none"
                    />
                  </div>
                )}
              </div>

              {(currentQuestion.type === 'MULTIPLE_CHOICE' ||
                currentQuestion.type === 'MULTI_SELECT') && (
                <fieldset className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <legend className="text-sm font-semibold text-navy-900">
                      {currentQuestion.type === 'MULTIPLE_CHOICE'
                        ? 'Cevap Seçenekleri ve Tek Doğru Cevap'
                        : 'Cevap Seçenekleri ve Doğru Cevaplar'}{' '}
                      <span className="text-burgundy-600" aria-hidden="true">*</span>
                    </legend>

                    {currentQuestion.options.length < MAX_CHOICE_OPTIONS && (
                      <button
                        type="button"
                        onClick={() =>
                          updateQuestionAt(activeQuestionIndex, (q) => ({
                            ...q,
                            options: [...q.options, createOption('', false)],
                          }))
                        }
                        className="inline-flex items-center gap-1 min-h-8 rounded-lg border border-cream-300 bg-cream-100 hover:bg-cream-200 px-2.5 py-1 text-xs font-semibold text-navy-900 cursor-pointer"
                      >
                        <PlusCircleIcon className="h-3.5 w-3.5" />
                        <span>Seçenek Ekle</span>
                      </button>
                    )}
                  </div>

                  <p className="text-xs text-navy-600">
                    {currentQuestion.type === 'MULTIPLE_CHOICE'
                      ? `${MIN_CHOICE_OPTIONS}–${MAX_CHOICE_OPTIONS} seçenek ekleyin ve yalnızca bir doğru cevabı işaretleyin.`
                      : `${MIN_CHOICE_OPTIONS}–${MAX_CHOICE_OPTIONS} seçenek ekleyin ve en az iki doğru cevabı işaretleyin.`}
                  </p>

                  {visibleError(`q.${activeQuestionIndex}.correct`) && (
                    <p className="text-xs font-medium text-burgundy-600">
                      {visibleError(`q.${activeQuestionIndex}.correct`)}
                    </p>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    {currentQuestion.options.map((option, optIdx) => {
                      const letter = OPTION_LETTERS[optIdx] ?? String(optIdx + 1);
                      const errorKey = `q.${activeQuestionIndex}.opt.${optIdx}`;
                      const fieldError = visibleError(errorKey);
                      const inputId = `q-${activeQuestionIndex}-opt-${optIdx}`;
                      const toggleId = `q-${activeQuestionIndex}-correct-${optIdx}`;
                      const canRemove =
                        currentQuestion.options.length > MIN_CHOICE_OPTIONS;

                      return (
                        <div
                          key={option.localId}
                          className={cn(
                            'rounded-xl border p-3.5 transition-colors duration-150',
                            option.isCorrect
                              ? 'bg-powder-100 border-burgundy-600'
                              : 'bg-cream-100 border-cream-300',
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <label
                              htmlFor={inputId}
                              className="text-xs font-bold uppercase tracking-wide text-navy-700"
                            >
                              {letter} Seçeneği
                            </label>

                            <div className="flex items-center gap-2">
                              <div className="inline-flex items-center gap-1.5">
                                <input
                                  id={toggleId}
                                  type={
                                    currentQuestion.type === 'MULTIPLE_CHOICE'
                                      ? 'radio'
                                      : 'checkbox'
                                  }
                                  name={`correct-option-${currentQuestion.localId}`}
                                  checked={option.isCorrect}
                                  onChange={() => {
                                    if (currentQuestion.type === 'MULTIPLE_CHOICE') {
                                      updateQuestionAt(activeQuestionIndex, (q) => ({
                                        ...q,
                                        options: q.options.map((opt, idx) => ({
                                          ...opt,
                                          isCorrect: idx === optIdx,
                                        })),
                                      }));
                                    } else {
                                      updateQuestionAt(activeQuestionIndex, (q) => ({
                                        ...q,
                                        options: q.options.map((opt, idx) =>
                                          idx === optIdx
                                            ? { ...opt, isCorrect: !opt.isCorrect }
                                            : opt,
                                        ),
                                      }));
                                    }
                                  }}
                                  className="h-4 w-4 accent-burgundy-600 cursor-pointer"
                                />
                                <label
                                  htmlFor={toggleId}
                                  className={cn(
                                    'text-xs font-semibold cursor-pointer select-none',
                                    option.isCorrect
                                      ? 'text-burgundy-600'
                                      : 'text-navy-600',
                                  )}
                                >
                                  Doğru Cevap
                                </label>
                              </div>

                              {canRemove && (
                                <button
                                  type="button"
                                  aria-label={`${letter} seçeneğini sil`}
                                  onClick={() => {
                                    updateQuestionAt(activeQuestionIndex, (q) => {
                                      const filtered = q.options.filter(
                                        (_, idx) => idx !== optIdx,
                                      );
                                      if (
                                        q.type === 'MULTIPLE_CHOICE' &&
                                        !filtered.some((o) => o.isCorrect) &&
                                        filtered[0]
                                      ) {
                                        filtered[0] = { ...filtered[0], isCorrect: true };
                                      }
                                      return { ...q, options: filtered };
                                    });
                                  }}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-cream-300 bg-cream-50 text-navy-600 hover:bg-burgundy-50 hover:text-burgundy-700 cursor-pointer"
                                >
                                  <CloseIcon className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          <input
                            id={inputId}
                            type="text"
                            required
                            maxLength={200}
                            value={option.text}
                            onChange={(event) => {
                              clearTouched(errorKey);
                              updateQuestionAt(activeQuestionIndex, (q) => ({
                                ...q,
                                options: q.options.map((opt, idx) =>
                                  idx === optIdx ? { ...opt, text: event.target.value } : opt,
                                ),
                              }));
                            }}
                            onBlur={() => markTouched(errorKey)}
                            aria-invalid={Boolean(fieldError)}
                            aria-describedby={fieldError ? `${inputId}-err` : undefined}
                            placeholder={`${letter} seçeneğini yazın...`}
                            className={cn(
                              'mt-2 w-full min-h-11 rounded-lg border bg-cream-50 px-3 py-2 text-base sm:text-sm text-navy-900 placeholder:text-navy-500',
                              fieldError
                                ? 'border-burgundy-600'
                                : 'border-cream-300 focus:border-burgundy-600',
                            )}
                          />
                          {fieldError && (
                            <p
                              id={`${inputId}-err`}
                              className="mt-1.5 text-xs font-medium text-burgundy-600"
                            >
                              {fieldError}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {currentQuestion.type === 'MULTI_SELECT' && (
                    <div className="pt-2 flex items-start gap-2.5 rounded-xl bg-cream-100 border border-cream-300 p-3.5">
                      <input
                        id={`partial-credit-${activeQuestionIndex}`}
                        type="checkbox"
                        checked={currentQuestion.allowPartialCredit}
                        onChange={(event) =>
                          updateQuestionAt(activeQuestionIndex, (q) => ({
                            ...q,
                            allowPartialCredit: event.target.checked,
                          }))
                        }
                        className="mt-0.5 h-4 w-4 accent-burgundy-600 cursor-pointer"
                      />
                      <label
                        htmlFor={`partial-credit-${activeQuestionIndex}`}
                        className="text-xs sm:text-sm text-navy-800 cursor-pointer"
                      >
                        <span className="font-semibold text-navy-900 block">
                          Kısmi puanlamaya izin ver
                        </span>
                        <span className="text-xs text-navy-600">
                          Açık olduğunda doğru seçeneklerin bir kısmını seçen öğrenciler yanlış
                          seçim düşülerek orantılı puan alır; kapalıyken yalnızca tüm doğrular
                          seçildiğinde puan verilir.
                        </span>
                      </label>
                    </div>
                  )}
                </fieldset>
              )}

              {currentQuestion.type === 'TRUE_FALSE' && (
                <fieldset className="space-y-3">
                  <legend className="text-sm font-semibold text-navy-900">
                    Doğru / Yanlış Cevap Seçimi{' '}
                    <span className="text-burgundy-600" aria-hidden="true">*</span>
                  </legend>
                  <p className="text-xs text-navy-600">
                    Bu ifade için doğru cevabı işaretleyin.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {currentQuestion.options.slice(0, 2).map((option, optIdx) => {
                      const radioId = `q-${activeQuestionIndex}-tf-${optIdx}`;
                      return (
                        <label
                          key={option.localId}
                          htmlFor={radioId}
                          className={cn(
                            'rounded-xl border p-4 flex items-center justify-between gap-3 cursor-pointer transition-colors duration-150',
                            option.isCorrect
                              ? 'bg-powder-100 border-burgundy-600 text-burgundy-700'
                              : 'bg-cream-100 border-cream-300 text-navy-900 hover:bg-cream-200',
                          )}
                        >
                          <span className="font-display font-bold text-base">
                            {option.text}
                          </span>
                          <input
                            id={radioId}
                            type="radio"
                            name={`tf-correct-${currentQuestion.localId}`}
                            checked={option.isCorrect}
                            onChange={() =>
                              updateQuestionAt(activeQuestionIndex, (q) => ({
                                ...q,
                                options: q.options.map((opt, idx) => ({
                                  ...opt,
                                  isCorrect: idx === optIdx,
                                })),
                              }))
                            }
                            className="h-4 w-4 accent-burgundy-600 cursor-pointer"
                          />
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}

              {currentQuestion.type === 'ORDERING' && (
                <fieldset className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <legend className="text-sm font-semibold text-navy-900">
                      Doğru Sıra Öğeleri (Yukarıdan Aşağıya){' '}
                      <span className="text-burgundy-600" aria-hidden="true">*</span>
                    </legend>
                    {currentQuestion.options.length < MAX_ORDERING_ITEMS && (
                      <button
                        type="button"
                        onClick={() =>
                          updateQuestionAt(activeQuestionIndex, (q) => ({
                            ...q,
                            options: [...q.options, createOption('', true)],
                          }))
                        }
                        className="inline-flex items-center gap-1 min-h-8 rounded-lg border border-cream-300 bg-cream-100 hover:bg-cream-200 px-2.5 py-1 text-xs font-semibold text-navy-900 cursor-pointer"
                      >
                        <PlusCircleIcon className="h-3.5 w-3.5" />
                        <span>Öğe Ekle</span>
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-navy-600">
                    Öğeleri doğru sırada tanımlayın ({MIN_ORDERING_ITEMS}–{MAX_ORDERING_ITEMS} öğe).
                    Öğrencilere canlı yarışmada karışık sırada sunulur.
                  </p>

                  <SortableList
                    items={currentQuestion.options}
                    getId={(opt) => opt.localId}
                    getLabel={(_, idx) => `${idx + 1}. sıra öğesi`}
                    onReorder={(nextOptions) =>
                      updateQuestionAt(activeQuestionIndex, (q) => ({
                        ...q,
                        options: nextOptions,
                      }))
                    }
                    ariaLabel="Doğru sıralama öğeleri"
                    compactControls
                    renderContent={(option, controls) => {
                      const optIdx = controls.index;
                      const errorKey = `q.${activeQuestionIndex}.opt.${optIdx}`;
                      const fieldError = visibleError(errorKey);
                      const inputId = `q-${activeQuestionIndex}-ord-${optIdx}`;
                      const canRemove =
                        currentQuestion.options.length > MIN_ORDERING_ITEMS;

                      return (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cream-200 text-xs font-bold tabular-nums text-navy-900">
                              {optIdx + 1}
                            </span>
                            <input
                              id={inputId}
                              type="text"
                              required
                              maxLength={200}
                              value={option.text}
                              onChange={(event) => {
                                clearTouched(errorKey);
                                updateQuestionAt(activeQuestionIndex, (q) => ({
                                  ...q,
                                  options: q.options.map((item, idx) =>
                                    idx === optIdx
                                      ? { ...item, text: event.target.value }
                                      : item,
                                  ),
                                }));
                              }}
                              onBlur={() => markTouched(errorKey)}
                              aria-label={`${optIdx + 1}. sıra öğesi`}
                              aria-invalid={Boolean(fieldError)}
                              placeholder={`${optIdx + 1}. sıra öğesini yazın...`}
                              className={cn(
                                'w-full min-h-10 rounded-lg border bg-cream-50 px-3 py-1.5 text-base sm:text-sm text-navy-900 placeholder:text-navy-500',
                                fieldError
                                  ? 'border-burgundy-600'
                                  : 'border-cream-300 focus:border-burgundy-600',
                              )}
                            />
                            {canRemove && (
                              <button
                                type="button"
                                aria-label={`${optIdx + 1}. öğeyi sil`}
                                onClick={() =>
                                  updateQuestionAt(activeQuestionIndex, (q) => ({
                                    ...q,
                                    options: q.options.filter((_, idx) => idx !== optIdx),
                                  }))
                                }
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-cream-300 bg-cream-50 text-navy-600 hover:bg-burgundy-50 hover:text-burgundy-700 cursor-pointer"
                              >
                                <CloseIcon className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                          {fieldError && (
                            <p className="pl-9 text-xs font-medium text-burgundy-600">
                              {fieldError}
                            </p>
                          )}
                        </div>
                      );
                    }}
                  />
                </fieldset>
              )}

              <div>
                <label
                  htmlFor={`question-explanation-${activeQuestionIndex}`}
                  className="block text-sm font-semibold text-navy-900"
                >
                  Soru Açıklaması{' '}
                  <span className="text-xs font-normal text-navy-500">
                    (isteğe bağlı · cevap açıklandığında gösterilir)
                  </span>
                </label>
                <textarea
                  id={`question-explanation-${activeQuestionIndex}`}
                  rows={2}
                  maxLength={600}
                  value={currentQuestion.explanation}
                  onChange={(event) =>
                    updateQuestionAt(activeQuestionIndex, (q) => ({
                      ...q,
                      explanation: event.target.value,
                    }))
                  }
                  placeholder="Doğru cevabın gerekçesini veya kısa ipucunu yazın..."
                  className="mt-1.5 w-full rounded-xl border border-cream-300 bg-cream-100 px-4 py-2 text-base sm:text-sm text-navy-900 placeholder:text-navy-500 focus:border-burgundy-600"
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-12 pt-2 border-t border-cream-300">
                <fieldset className="sm:col-span-8 space-y-2.5">
                  <legend className="text-sm font-semibold text-navy-900">
                    Soru Süresi
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {TIME_LIMIT_OPTIONS.map((seconds) => {
                      const radioId = `q-${activeQuestionIndex}-time-${seconds}`;
                      const checked = currentQuestion.timeLimitSec === seconds;
                      return (
                        <label
                          key={seconds}
                          htmlFor={radioId}
                          className={cn(
                            'inline-flex items-center gap-2 min-h-11 rounded-xl border px-3.5 py-2 text-sm font-semibold tabular-nums cursor-pointer transition-colors duration-150',
                            checked
                              ? 'bg-navy-900 border-navy-900 text-cream-50'
                              : 'bg-cream-100 border-cream-300 text-navy-900 hover:bg-cream-200',
                          )}
                        >
                          <input
                            id={radioId}
                            type="radio"
                            name={`time-limit-${currentQuestion.localId}`}
                            value={seconds}
                            checked={checked}
                            onChange={() =>
                              updateQuestionAt(activeQuestionIndex, (q) => ({
                                ...q,
                                timeLimitSec: seconds as AllowedTimeLimit,
                              }))
                            }
                            className="h-4 w-4 accent-burgundy-600 cursor-pointer"
                          />
                          <span>{seconds} sn</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="sm:col-span-4">
                  <label
                    htmlFor={`question-points-${activeQuestionIndex}`}
                    className="block text-sm font-semibold text-navy-900"
                  >
                    Soru Puanı
                  </label>
                  <input
                    id={`question-points-${activeQuestionIndex}`}
                    type="text"
                    inputMode="numeric"
                    value={pointsDraft}
                    onChange={(event) => {
                      const raw = event.target.value;
                      setPointsDraft(raw);
                      clearTouched(`q.${activeQuestionIndex}.points`);
                      const parsed = Number(raw.trim());
                      updateQuestionAt(activeQuestionIndex, (q) => ({
                        ...q,
                        points: Number.isFinite(parsed) && raw.trim() !== '' ? parsed : NaN,
                      }));
                    }}
                    onBlur={() => markTouched(`q.${activeQuestionIndex}.points`)}
                    aria-invalid={Boolean(
                      visibleError(`q.${activeQuestionIndex}.points`),
                    )}
                    aria-describedby={`question-points-hint-${activeQuestionIndex}`}
                    className={cn(
                      'mt-2 w-full min-h-11 rounded-xl border bg-cream-100 px-3.5 py-2 text-base sm:text-sm font-semibold tabular-nums text-navy-900',
                      visibleError(`q.${activeQuestionIndex}.points`)
                        ? 'border-burgundy-600'
                        : 'border-cream-300 focus:border-burgundy-600',
                    )}
                  />
                  <p
                    id={`question-points-hint-${activeQuestionIndex}`}
                    className={cn(
                      'mt-1 text-xs',
                      visibleError(`q.${activeQuestionIndex}.points`)
                        ? 'font-medium text-burgundy-600'
                        : 'text-navy-500',
                    )}
                  >
                    {visibleError(`q.${activeQuestionIndex}.points`) ??
                      `${MIN_POINTS}–${MAX_POINTS} arası tam sayı`}
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>

        <div className="rounded-2xl bg-cream-50 border border-cream-300 p-4 sm:p-5 shadow-card flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="inline-flex items-center gap-2 min-h-11 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-4 py-2 text-sm font-semibold text-navy-900 cursor-pointer"
          >
            <EyeIcon />
            <span>Quizi Önizle</span>
          </button>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={saving}
              onClick={() => void persistQuizWithStatus('DRAFT')}
              className="min-h-11 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-4 py-2.5 text-sm font-semibold text-navy-900 cursor-pointer disabled:opacity-60"
            >
              Taslak Kaydet
            </button>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 min-h-11 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-6 py-2.5 text-sm font-semibold text-cream-50 transition-colors duration-150 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <CheckIcon />
              <span>
                {saving
                  ? 'Kaydediliyor...'
                  : isRouteEditMode
                    ? 'Değişiklikleri Kaydet'
                    : 'Quizi Kaydet'}
              </span>
            </button>
          </div>
        </div>
      </form>

      <QuizPreviewModal
        open={previewOpen}
        quiz={previewQuiz}
        onClose={() => setPreviewOpen(false)}
      />

      <ConfirmDialog
        open={pendingTypeChange !== null}
        title="Soru türü değiştirilsin mi?"
        description={pendingTypeChange?.reason ?? ''}
        confirmLabel="Evet, Türü Değiştir"
        cancelLabel="Vazgeç"
        variant="primary"
        onConfirm={() => {
          if (pendingTypeChange) {
            updateQuestionAt(pendingTypeChange.questionIndex, (q) =>
              convertQuestionType(q, pendingTypeChange.targetType),
            );
          }
          setPendingTypeChange(null);
        }}
        onCancel={() => setPendingTypeChange(null)}
      />

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Kaydedilmemiş değişiklikleriniz var"
        description="Bu sayfadan ayrılırsanız henüz kaydetmediğiniz değişiklikler kaybolabilir. Yine de çıkmak istiyor musunuz?"
        confirmLabel="Değişiklikleri Bırak ve Çık"
        cancelLabel="Sayfada Kal"
        variant="primary"
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />
    </motion.div>
  );
}
