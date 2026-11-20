import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { validateAndEvaluateAnswer } from '@shared/answerEvaluation';
import {
  OPTION_LETTERS,
  QUESTION_TYPE_LABELS,
  shuffleOrderingIds,
  type QuestionType,
} from '@shared/quizTypes';
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
} from '@/components/ui/Icons';
import { SafeImage } from '@/components/ui/SafeImage';
import { SortableList } from '@/components/ui/SortableList';
import { resolveMediaUrl } from '@/config/runtime';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { cn } from '@/utils/cn';
import { handleLightDismissBackdropClick } from '@/utils/dialogLightDismiss';

export interface PreviewableOption {
  id?: string;
  text: string;
  isCorrect: boolean;
}

export interface PreviewableQuestion {
  type?: QuestionType;
  text: string;
  explanation?: string;
  allowPartialCredit?: boolean;
  imageUrl?: string | null;
  timeLimitSec: number;
  points: number;
  options: PreviewableOption[];
}

export interface PreviewableQuiz {
  title: string;
  description?: string;
  category: string;
  coverImageUrl?: string | null;
  questions: PreviewableQuestion[];
}

interface QuizPreviewModalProps {
  open: boolean;
  quiz: PreviewableQuiz | null;
  onClose: () => void;
}

interface PreviewOptionNode {
  id: string;
  order: number;
  text: string;
  isCorrect: boolean;
}

export function QuizPreviewModal({ open, quiz, onClose }: QuizPreviewModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const reducedMotion = usePrefersReducedMotion();

  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [selectedMultiIds, setSelectedMultiIds] = useState<string[]>([]);
  const [orderedItems, setOrderedItems] = useState<PreviewOptionNode[]>([]);
  const [checkedAnswer, setCheckedAnswer] = useState(false);
  const [showSolution, setShowSolution] = useState(false);

  const [remainingSec, setRemainingSec] = useState(20);
  const [timerRunning, setTimerRunning] = useState(true);

  const questions = quiz?.questions ?? [];
  const currentQuestion = questions[questionIndex];
  const currentType: QuestionType = currentQuestion?.type ?? 'MULTIPLE_CHOICE';

  const normalizedOptions = useMemo<PreviewOptionNode[]>(() => {
    if (!currentQuestion) return [];
    return currentQuestion.options.map((opt, idx) => ({
      id: opt.id || `preview-q${questionIndex}-opt${idx}`,
      order: idx + 1,
      text: opt.text,
      isCorrect: opt.isCorrect,
    }));
  }, [currentQuestion, questionIndex]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && quiz) {
      setQuestionIndex(0);
      setSelectedOptionId(null);
      setSelectedMultiIds([]);
      setCheckedAnswer(false);
      setShowSolution(false);
      setRemainingSec(quiz.questions[0]?.timeLimitSec ?? 20);
      setTimerRunning(true);
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, quiz]);

  useEffect(() => {
    if (!currentQuestion) {
      setOrderedItems([]);
      return;
    }

    setRemainingSec(currentQuestion.timeLimitSec);
    setTimerRunning(true);
    setSelectedOptionId(null);
    setSelectedMultiIds([]);
    setCheckedAnswer(false);
    setShowSolution(false);

    if ((currentQuestion.type ?? 'MULTIPLE_CHOICE') === 'ORDERING') {
      setOrderedItems(shuffleOrderingIds(normalizedOptions));
    } else {
      setOrderedItems([]);
    }
  }, [questionIndex, currentQuestion, normalizedOptions]);

  useEffect(() => {
    if (!open || !timerRunning || remainingSec <= 0) return;
    const timer = window.setInterval(() => {
      setRemainingSec((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [open, timerRunning, remainingSec]);

  const handleDialogClose = () => {
    const dialog = dialogRef.current;
    if (dialog) {
      dialog.returnValue = '';
    }
    onClose();
  };

  const goToQuestion = (nextIndex: number) => {
    setQuestionIndex(nextIndex);
  };

  const evaluation = useMemo(() => {
    if (!currentQuestion || !checkedAnswer) return null;

    return validateAndEvaluateAnswer(
      {
        type: currentType,
        allowPartialCredit: Boolean(currentQuestion.allowPartialCredit),
        options: normalizedOptions,
      },
      currentType === 'MULTI_SELECT'
        ? { optionIds: selectedMultiIds }
        : currentType === 'ORDERING'
          ? { orderedOptionIds: orderedItems.map((item) => item.id) }
          : { optionId: selectedOptionId ?? '' },
    );
  }, [
    currentQuestion,
    checkedAnswer,
    currentType,
    normalizedOptions,
    selectedMultiIds,
    orderedItems,
    selectedOptionId,
  ]);

  const totalSec = currentQuestion?.timeLimitSec ?? 20;
  const timerRatio = totalSec > 0 ? Math.max(0, Math.min(1, remainingSec / totalSec)) : 0;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={handleDialogClose}
      onClick={(event) => handleLightDismissBackdropClick(event, dialogRef.current)}
      {...({ closedby: 'any' } as Record<string, string>)}
      className="m-auto w-[min(calc(100vw-2rem),46rem)] max-h-[90dvh] overflow-y-auto rounded-2xl bg-cream-50 border border-cream-300 p-0 text-navy-900 shadow-card"
    >
      {open && quiz && (
        <div className="p-5 sm:p-8">
          <div className="flex items-start justify-between gap-4 border-b border-cream-300 pb-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-powder-100 border border-powder-200 px-3 py-0.5 text-xs font-semibold text-burgundy-600">
                  {quiz.category || 'Genel Kültür'} · Önizleme
                </span>
                <span className="text-xs text-navy-500">
                  Gerçek yarışma oturumu ve istatistik oluşturmaz
                </span>
              </div>
              <h2
                id={titleId}
                className="mt-2 font-display font-bold text-xl sm:text-2xl text-navy-900"
              >
                {quiz.title.trim() || 'Başlıksız Quiz'}
              </h2>
              {quiz.description?.trim() && (
                <p className="mt-1 text-sm text-navy-600">{quiz.description}</p>
              )}
            </div>

            <button
              type="button"
              autoFocus
              onClick={onClose}
              aria-label="Önizlemeyi kapat"
              className="inline-flex items-center justify-center min-w-10 min-h-10 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 text-navy-700 hover:text-navy-900 transition-colors duration-150 cursor-pointer shrink-0"
            >
              <CloseIcon />
            </button>
          </div>

          {quiz.coverImageUrl && (
            <div className="mt-5 overflow-hidden rounded-xl border border-cream-300 bg-cream-200">
              <SafeImage
                src={resolveMediaUrl(quiz.coverImageUrl)}
                alt={`${quiz.title || 'Quiz'} kapak görseli`}
                fetchPriority="high"
                className="w-full aspect-[16/7] object-cover"
                fallbackClassName="rounded-none"
              />
            </div>
          )}

          {currentQuestion ? (
            <div className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-lg bg-cream-200 border border-cream-300 px-3 py-1 text-xs font-semibold tabular-nums text-navy-900">
                    Soru {questionIndex + 1} / {questions.length}
                  </span>
                  <span className="inline-flex items-center rounded-lg bg-powder-100 border border-powder-200 px-2.5 py-1 text-xs font-semibold text-burgundy-700">
                    {QUESTION_TYPE_LABELS[currentType]}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm font-semibold tabular-nums text-navy-900">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1',
                      remainingSec <= 5
                        ? 'bg-burgundy-600 border-burgundy-700 text-cream-50'
                        : 'bg-cream-200 border-cream-300 text-navy-900',
                    )}
                  >
                    <ClockIcon className="h-4 w-4" />
                    <span>
                      {remainingSec > 0 ? `${remainingSec} sn` : 'Süre doldu'}
                    </span>
                  </span>

                  <button
                    type="button"
                    onClick={() => setTimerRunning((prev) => !prev)}
                    className="min-h-8 rounded-lg border border-cream-300 bg-cream-100 hover:bg-cream-200 px-2.5 py-1 text-xs font-semibold text-navy-800 cursor-pointer"
                  >
                    {timerRunning ? 'Duraklat' : 'Devam Et'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRemainingSec(currentQuestion.timeLimitSec);
                      setTimerRunning(true);
                    }}
                    className="min-h-8 rounded-lg border border-cream-300 bg-cream-100 hover:bg-cream-200 px-2.5 py-1 text-xs font-semibold text-navy-800 cursor-pointer"
                  >
                    Sıfırla
                  </button>

                  <span className="inline-flex items-center rounded-lg bg-powder-100 border border-powder-200 px-2.5 py-1 text-xs font-semibold text-burgundy-600">
                    {currentQuestion.points} puan
                  </span>
                </div>
              </div>

              <div
                aria-hidden="true"
                className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-cream-200"
              >
                <div
                  className={cn(
                    'h-full w-full origin-left rounded-full bg-burgundy-600',
                    !reducedMotion && 'transition-transform duration-300',
                  )}
                  style={{ transform: `scaleX(${timerRatio})` }}
                />
              </div>

              {currentQuestion.imageUrl && (
                <div className="mt-4 overflow-hidden rounded-xl border border-cream-300 bg-cream-200">
                  <SafeImage
                    src={resolveMediaUrl(currentQuestion.imageUrl)}
                    alt={`Soru ${questionIndex + 1} görseli`}
                    className="w-full max-h-60 object-contain bg-cream-100"
                    fallbackClassName="rounded-none"
                  />
                </div>
              )}

              <h3 className="mt-5 font-display font-bold text-lg sm:text-xl leading-snug text-navy-900">
                {currentQuestion.text.trim() || 'Soru metni henüz girilmedi.'}
              </h3>

              {(currentType === 'MULTIPLE_CHOICE' || currentType === 'TRUE_FALSE') && (
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {normalizedOptions.map((option, optionIdx) => {
                    const isSelected = selectedOptionId === option.id;
                    const revealCorrect = showSolution && option.isCorrect;
                    const letter = OPTION_LETTERS[optionIdx] ?? String(optionIdx + 1);

                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => {
                          setSelectedOptionId(option.id);
                          setCheckedAnswer(true);
                        }}
                        className={cn(
                          'min-h-14 w-full rounded-xl border px-4 py-3 text-start font-display font-semibold text-sm sm:text-base flex items-center justify-between gap-3 transition-colors duration-200 cursor-pointer',
                          isSelected
                            ? 'bg-burgundy-600 border-burgundy-700 text-cream-50'
                            : revealCorrect
                              ? 'bg-powder-100 border-burgundy-600 text-navy-900'
                              : 'bg-cream-200 border-cream-300 text-navy-900 hover:bg-powder-100 hover:border-powder-500',
                        )}
                      >
                        <span className="inline-flex items-center gap-2.5 min-w-0">
                          {currentType === 'MULTIPLE_CHOICE' && (
                            <span
                              className={cn(
                                'text-xs font-bold shrink-0',
                                isSelected ? 'text-powder-200' : 'text-navy-600',
                              )}
                            >
                              {letter}
                            </span>
                          )}
                          <span className="break-words">
                            {option.text.trim() || `${letter} seçeneği`}
                          </span>
                        </span>
                        {(isSelected || revealCorrect) && (
                          <CheckIcon className="shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {currentType === 'MULTI_SELECT' && (
                <div className="mt-5 space-y-3">
                  <p className="text-xs font-medium text-navy-600">
                    Birden fazla seçenek işaretleyin ve kontrol edin.{' '}
                    {currentQuestion.allowPartialCredit
                      ? '(Kısmi puanlama aktif)'
                      : '(Tam doğru eşleşme gerekir)'}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {normalizedOptions.map((option, optionIdx) => {
                      const isSelected = selectedMultiIds.includes(option.id);
                      const revealCorrect = showSolution && option.isCorrect;
                      const letter = OPTION_LETTERS[optionIdx] ?? String(optionIdx + 1);

                      return (
                        <button
                          key={option.id}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => {
                            setCheckedAnswer(false);
                            setSelectedMultiIds((prev) =>
                              prev.includes(option.id)
                                ? prev.filter((item) => item !== option.id)
                                : [...prev, option.id],
                            );
                          }}
                          className={cn(
                            'min-h-14 w-full rounded-xl border px-4 py-3 text-start font-display font-semibold text-sm sm:text-base flex items-center justify-between gap-3 transition-colors duration-200 cursor-pointer',
                            isSelected
                              ? 'bg-burgundy-600 border-burgundy-700 text-cream-50'
                              : revealCorrect
                                ? 'bg-powder-100 border-burgundy-600 text-navy-900'
                                : 'bg-cream-200 border-cream-300 text-navy-900 hover:bg-powder-100 hover:border-powder-500',
                          )}
                        >
                          <span className="inline-flex items-center gap-2.5 min-w-0">
                            <span
                              className={cn(
                                'text-xs font-bold shrink-0',
                                isSelected ? 'text-powder-200' : 'text-navy-600',
                              )}
                            >
                              {letter}
                            </span>
                            <span className="break-words">
                              {option.text.trim() || `${letter} seçeneği`}
                            </span>
                          </span>
                          {(isSelected || revealCorrect) && (
                            <CheckIcon className="shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    disabled={selectedMultiIds.length === 0}
                    onClick={() => setCheckedAnswer(true)}
                    className="min-h-10 rounded-xl bg-navy-900 hover:bg-navy-950 px-4 py-2 text-xs sm:text-sm font-semibold text-cream-50 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    Cevabı Kontrol Et
                  </button>
                </div>
              )}

              {currentType === 'ORDERING' && (
                <div className="mt-5 space-y-3">
                  <p className="text-xs font-medium text-navy-600">
                    Öğeleri doğru sıraya getirin (sürükleyin veya ok düğmelerini kullanın).
                  </p>
                  <SortableList
                    items={orderedItems}
                    getId={(item) => item.id}
                    getLabel={(item, idx) =>
                      item.text.trim() || `${idx + 1}. sıra öğesi`
                    }
                    onReorder={(next) => {
                      setOrderedItems(next);
                      setCheckedAnswer(false);
                    }}
                    ariaLabel="Önizleme sıralama listesi"
                    compactControls
                    renderContent={(item, controls) => (
                      <div className="flex items-center gap-2.5 py-1">
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-cream-200 text-xs font-bold tabular-nums text-navy-900">
                          {controls.index + 1}
                        </span>
                        <span className="text-sm font-semibold text-navy-900 break-words">
                          {item.text.trim() || `${controls.index + 1}. Öğe`}
                        </span>
                      </div>
                    )}
                  />

                  <button
                    type="button"
                    disabled={orderedItems.length === 0}
                    onClick={() => setCheckedAnswer(true)}
                    className="min-h-10 rounded-xl bg-navy-900 hover:bg-navy-950 px-4 py-2 text-xs sm:text-sm font-semibold text-cream-50 cursor-pointer disabled:opacity-45"
                  >
                    Sıralamayı Kontrol Et
                  </button>
                </div>
              )}

              <div className="mt-5 pt-4 border-t border-cream-300 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
                <div aria-live="polite" className="text-navy-700 font-medium">
                  {!evaluation ? (
                    <span>
                      Önizlemek için seçim yapın veya doğru cevabı görüntüleyin.
                    </span>
                  ) : !evaluation.ok ? (
                    <span className="text-burgundy-700">{evaluation.message}</span>
                  ) : evaluation.isCorrect ? (
                    <span className="text-burgundy-700 font-semibold">
                      Doğru cevap! Tam puan ({currentQuestion.points} p).
                    </span>
                  ) : evaluation.isPartial ? (
                    <span className="text-burgundy-700 font-semibold">
                      Kısmi doğru! (%{Math.round(evaluation.scoreRatio * 100)} oranında puan)
                    </span>
                  ) : (
                    <span className="text-navy-700">
                      Bu deneme önizlemede yanlış cevap olarak değerlendirildi.
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowSolution((prev) => !prev)}
                  className="min-h-9 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-3 py-1.5 text-xs font-semibold text-navy-900 cursor-pointer"
                >
                  {showSolution ? 'Doğru Cevabı Gizle' : 'Doğru Cevabı Göster'}
                </button>
              </div>

              {showSolution && (
                <div className="mt-3 rounded-xl bg-powder-100 border border-powder-200 p-4 text-xs sm:text-sm text-navy-900 space-y-2">
                  <p className="font-display font-bold text-burgundy-700">
                    {currentType === 'ORDERING' ? 'Beklenen Doğru Sıra' : 'Doğru Cevap'}
                  </p>
                  {currentType === 'ORDERING' ? (
                    <ol className="list-decimal list-inside space-y-1 font-medium">
                      {normalizedOptions.map((opt) => (
                        <li key={opt.id}>{opt.text.trim() || 'Boş öğe'}</li>
                      ))}
                    </ol>
                  ) : (
                    <p className="font-semibold">
                      {normalizedOptions
                        .filter((opt) => opt.isCorrect)
                        .map((opt) => opt.text.trim() || 'Seçenek')
                        .join(', ') || 'Doğru cevap henüz işaretlenmemiş.'}
                    </p>
                  )}

                  {currentQuestion.explanation?.trim() && (
                    <p className="pt-1 border-t border-powder-200 text-navy-700">
                      <strong className="font-semibold text-navy-900">Açıklama: </strong>
                      {currentQuestion.explanation}
                    </p>
                  )}
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-cream-300 pt-4">
                <button
                  type="button"
                  disabled={questionIndex === 0}
                  onClick={() => goToQuestion(questionIndex - 1)}
                  className="inline-flex items-center gap-1.5 min-h-10 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-3.5 py-2 text-sm font-semibold text-navy-900 transition-colors duration-150 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  <ChevronLeftIcon />
                  Önceki Soru
                </button>

                <div className="flex flex-wrap items-center gap-1.5">
                  {questions.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => goToQuestion(idx)}
                      aria-label={`Soru ${idx + 1}`}
                      aria-current={idx === questionIndex ? 'step' : undefined}
                      className={cn(
                        'min-w-8 min-h-8 rounded-lg border px-2 text-xs font-semibold tabular-nums transition-colors duration-150 cursor-pointer',
                        idx === questionIndex
                          ? 'bg-navy-900 border-navy-900 text-cream-50'
                          : 'bg-cream-100 border-cream-300 text-navy-700 hover:bg-cream-200',
                      )}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={questionIndex >= questions.length - 1}
                  onClick={() => goToQuestion(questionIndex + 1)}
                  className="inline-flex items-center gap-1.5 min-h-10 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-3.5 py-2 text-sm font-semibold text-navy-900 transition-colors duration-150 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  Sonraki Soru
                  <ChevronRightIcon />
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-6 text-sm text-navy-600">
              Henüz görüntülenecek soru eklenmedi.
            </p>
          )}
        </div>
      )}
    </dialog>
  );
}
