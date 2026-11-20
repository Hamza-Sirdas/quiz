import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { AnimatedNumber } from '@/components/home/motion/AnimatedNumber';
import {
  EASE_OUT_EXPO,
  pulseKeyframes,
  shakeKeyframes,
} from '@/components/home/motion/tokens';
import { gsap, useScrollScene } from '@/components/home/motion/useScrollScene';
import {
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  RefreshIcon,
  SparklesIcon,
} from '@/components/ui/Icons';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { cn } from '@/utils/cn';

interface MiniQuestion {
  id: string;
  category: string;
  prompt: string;
  points: number;
  options: Array<{ id: string; text: string }>;
  correctId: string;
  explanation: string;
}

const MINI_QUESTIONS: readonly MiniQuestion[] = [
  {
    id: 'mq-astronomy',
    category: 'Bilim ve Astronomi',
    prompt:
      "Güneş sistemimizde yüzeyindeki demir oksit nedeniyle 'Kızıl Gezegen' olarak bilinen gezegen hangisidir?",
    points: 940,
    options: [
      { id: 'A', text: 'Venüs' },
      { id: 'B', text: 'Mars' },
      { id: 'C', text: 'Jüpiter' },
      { id: 'D', text: 'Satürn' },
    ],
    correctId: 'B',
    explanation:
      'Mars yüzeyi yoğun demir oksit (pas) mineralleri içerdiği için kızıl renkte görünür.',
  },
  {
    id: 'mq-history',
    category: 'Tarih ve Kültür',
    prompt:
      'Cumhuriyet döneminde Türk kadınına milletvekili seçme ve seçilme hakkı hangi yıl tanınmıştır?',
    points: 960,
    options: [
      { id: 'A', text: '1930' },
      { id: 'B', text: '1932' },
      { id: 'C', text: '1934' },
      { id: 'D', text: '1936' },
    ],
    correctId: 'C',
    explanation:
      '5 Aralık 1934 tarihinde yapılan anayasa değişikliği ile kadınlara milletvekili seçme ve seçilme hakkı tanınmıştır.',
  },
  {
    id: 'mq-tech',
    category: 'Bilişim ve Ağ',
    prompt:
      'Web tarayıcısı ile sunucu arasında tek bağlantı üzerinden çift yönlü gerçek zamanlı iletişim sağlayan protokol hangisidir?',
    points: 980,
    options: [
      { id: 'A', text: 'FTP' },
      { id: 'B', text: 'SMTP' },
      { id: 'C', text: 'WebSocket' },
      { id: 'D', text: 'POP3' },
    ],
    correctId: 'C',
    explanation:
      'WebSocket protokolü kalıcı ve tam çift yönlü kanalıyla canlı yarışma akışlarında düşük gecikme sağlar.',
  },
];

export function InteractiveMiniQuizSection() {
  const reducedMotion = usePrefersReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [selectedByQ, setSelectedByQ] = useState<Record<number, string>>({});
  const [completed, setCompleted] = useState(false);
  const [gain, setGain] = useState<{ key: number; points: number } | null>(null);

  const currentQ = MINI_QUESTIONS[questionIdx]!;
  const chosenId = selectedByQ[questionIdx] ?? null;
  const isAnswered = chosenId !== null;
  const isCorrect = isAnswered && chosenId === currentQ.correctId;

  const totalDemoScore = MINI_QUESTIONS.reduce((sum, q, idx) => {
    return sum + (selectedByQ[idx] === q.correctId ? q.points : 0);
  }, 0);

  const correctCount = MINI_QUESTIONS.filter(
    (q, idx) => selectedByQ[idx] === q.correctId,
  ).length;

  // Bölüme özgü scroll sahnesi: sol anlatım soldan, quiz kartı alttan derinlikle gelir.
  useScrollScene(sectionRef, {
    desktop: ({ root, q }) => {
      gsap.from(q('[data-anim="mq-intro"] > *'), {
        x: -28,
        opacity: 0,
        duration: 0.6,
        stagger: 0.08,
        ease: 'power3.out',
        scrollTrigger: { trigger: root, start: 'top 72%', once: true },
      });
      gsap.from(q('[data-anim="mq-card"]'), {
        y: 44,
        scale: 0.975,
        opacity: 0,
        duration: 0.75,
        ease: 'power3.out',
        scrollTrigger: { trigger: root, start: 'top 68%', once: true },
      });
    },
    mobile: ({ root, q }) => {
      gsap.from(q('[data-anim="mq-intro"], [data-anim="mq-card"]'), {
        y: 22,
        opacity: 0,
        duration: 0.5,
        stagger: 0.1,
        ease: 'power2.out',
        scrollTrigger: { trigger: root, start: 'top 80%', once: true },
      });
    },
  });

  const handleSelectOption = (optionId: string) => {
    if (isAnswered || completed) return;
    setSelectedByQ((prev) => ({ ...prev, [questionIdx]: optionId }));
    if (optionId === currentQ.correctId) {
      setGain({ key: Date.now(), points: currentQ.points });
    }
  };

  const handleNext = () => {
    if (questionIdx + 1 < MINI_QUESTIONS.length) {
      setQuestionIdx((prev) => prev + 1);
    } else {
      setCompleted(true);
    }
  };

  const handleReset = () => {
    setSelectedByQ({});
    setQuestionIdx(0);
    setCompleted(false);
    setGain(null);
  };

  const stageKey = completed ? 'summary' : `q-${questionIdx}`;

  return (
    <section
      ref={sectionRef}
      id="mini-quiz"
      aria-labelledby="mini-quiz-baslik"
      className="scroll-mt-20 bg-cream-100 py-14 sm:py-20 border-b border-cream-300 overflow-x-clip"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 grid items-start gap-8 lg:grid-cols-12 lg:gap-12">
        {/* Sol Editoryal Anlatım + Demo Skor Özeti */}
        <div data-anim="mq-intro" className="lg:col-span-5 min-w-0 space-y-5">
          <div className="inline-flex flex-wrap items-center gap-2 rounded-full bg-powder-100 border border-powder-200 px-3.5 py-1 text-xs font-semibold text-burgundy-700">
            <SparklesIcon className="h-3.5 w-3.5 text-burgundy-600 shrink-0" />
            <span>Etkileşimli Mini Quiz · Bağımsız Demo</span>
          </div>

          <h2
            id="mini-quiz-baslik"
            className="font-display font-extrabold tracking-tight text-navy-900"
            style={{
              fontSize: 'clamp(1.65rem, 1.2rem + 1.5vw, 2.35rem)',
              lineHeight: 1.15,
            }}
          >
            Öğrenci deneyimini hemen burada test et.
          </h2>

          <p className="max-w-[50ch] text-sm sm:text-base leading-relaxed text-navy-600">
            Bir oturum açmadan veya PIN girmeden 3 örnek soruyu yanıtlayarak anlık geri
            bildirim, açıklama kutusu ve demo puanlama akışını doğrudan deneyimleyin.
          </p>

          <div className="rounded-2xl bg-cream-50 border border-cream-300 p-5 shadow-card grid grid-cols-2 gap-4">
            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-wide text-navy-500">
                Demo Puanın
              </p>
              <p className="mt-1 font-display font-extrabold text-2xl sm:text-3xl tabular-nums text-burgundy-600">
                <AnimatedNumber
                  value={totalDemoScore}
                  duration={0.7}
                  data-testid="mini-quiz-score"
                />
              </p>
              {/* Puan kazanma rozeti: yalnızca görsel, ekran okuyucu geri bildirim panelini okur */}
              {!reducedMotion && gain && (
                <motion.span
                  key={gain.key}
                  aria-hidden="true"
                  initial={{ opacity: 0, y: 6, scale: 0.9 }}
                  animate={{ opacity: [0, 1, 1, 0], y: [6, -6, -14, -24], scale: 1 }}
                  transition={{ duration: 1.1, times: [0, 0.2, 0.7, 1], ease: 'easeOut' }}
                  className="pointer-events-none absolute left-24 top-6 rounded-full bg-burgundy-600 px-2 py-0.5 text-xs font-bold tabular-nums text-cream-50"
                >
                  +{gain.points}
                </motion.span>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-navy-500">
                Doğru Yanıt
              </p>
              <p className="mt-1 font-display font-extrabold text-2xl sm:text-3xl tabular-nums text-navy-900">
                {correctCount} / {MINI_QUESTIONS.length}
              </p>
            </div>
            <p className="col-span-2 text-xs text-navy-600 pt-2 border-t border-cream-300">
              Bu bölüm tarayıcı içinde çalışan örnek bir önizlemedir; gerçek öğrenci verisi
              veya sunucu kaydı oluşturmaz.
            </p>
          </div>
        </div>

        {/* Sağ Oynanabilir Mini Quiz Kartı */}
        <div data-anim="mq-card" className="lg:col-span-7 min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={stageKey}
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -16 }}
              transition={{ duration: reducedMotion ? 0.12 : 0.26, ease: EASE_OUT_EXPO }}
            >
              {completed ? (
                <div className="rounded-3xl bg-cream-50 border border-cream-300 p-6 sm:p-8 shadow-card space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cream-300 pb-4">
                    <div>
                      <span className="inline-flex items-center rounded-full bg-powder-100 border border-powder-200 px-3 py-0.5 text-xs font-semibold text-burgundy-700">
                        Demo Tamamlandı
                      </span>
                      <h3 className="mt-2 font-display font-bold text-2xl text-navy-900">
                        Mini Quiz Özetin Hazır
                      </h3>
                    </div>
                    <span className="rounded-2xl bg-navy-900 px-4 py-2 font-display font-extrabold text-lg tabular-nums text-cream-50">
                      {totalDemoScore.toLocaleString('tr-TR')} Demo Puan
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {MINI_QUESTIONS.map((q, idx) => {
                      const answeredRight = selectedByQ[idx] === q.correctId;
                      return (
                        <motion.div
                          key={q.id}
                          initial={reducedMotion ? false : { opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            duration: 0.35,
                            delay: 0.08 + idx * 0.07,
                            ease: EASE_OUT_EXPO,
                          }}
                          className={cn(
                            'rounded-2xl border p-4',
                            answeredRight
                              ? 'bg-powder-100/75 border-burgundy-600/35'
                              : 'bg-cream-100 border-cream-300',
                          )}
                        >
                          <p className="text-xs font-bold tabular-nums text-navy-600">
                            Soru {idx + 1} · {q.category}
                          </p>
                          <p className="mt-1.5 font-display font-bold text-sm text-navy-900">
                            {answeredRight ? `+${q.points} Puan` : '0 Puan'}
                          </p>
                          <p className="mt-1 text-xs text-navy-600">
                            {answeredRight ? 'Doğru yanıtlandı' : 'Yanlış seçim'}
                          </p>
                        </motion.div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleReset}
                      className="q-press q-focus inline-flex items-center justify-center gap-2 min-h-11 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-4.5 py-2.5 text-sm font-semibold text-navy-900 cursor-pointer"
                    >
                      <RefreshIcon className="h-4 w-4" />
                      <span>Mini Quizi Sıfırla</span>
                    </button>
                    <Link
                      to="/dashboard/quizzes/new"
                      className="q-press q-focus inline-flex items-center justify-center gap-2 min-h-11 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-5 py-2.5 text-sm font-semibold text-cream-50"
                    >
                      <span>Kendi Quizini Oluştur</span>
                      <ChevronRightIcon className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl bg-cream-50 border border-cream-300 p-6 sm:p-8 shadow-card">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-lg bg-navy-900 px-3 py-1 text-xs font-bold tabular-nums text-cream-50">
                        Soru {questionIdx + 1} / {MINI_QUESTIONS.length}
                      </span>
                      <span className="inline-flex items-center rounded-lg bg-powder-100 border border-powder-200 px-3 py-1 text-xs font-semibold text-burgundy-700">
                        {currentQ.category}
                      </span>
                    </div>
                    <span className="text-xs font-semibold tabular-nums text-navy-600">
                      Maks. {currentQ.points} Demo Puan
                    </span>
                  </div>

                  {/* İlerleme Adımları: transform tabanlı dolum */}
                  <div aria-hidden="true" className="mt-4 grid grid-cols-3 gap-2">
                    {MINI_QUESTIONS.map((q, idx) => {
                      const fill =
                        idx < questionIdx ? 1 : idx === questionIdx ? (isAnswered ? 1 : 0.4) : 0;
                      return (
                        <div
                          key={q.id}
                          className="h-1.5 rounded-full bg-cream-200 overflow-hidden"
                        >
                          <motion.div
                            initial={false}
                            animate={{ scaleX: fill }}
                            transition={{
                              duration: reducedMotion ? 0 : 0.45,
                              ease: EASE_OUT_EXPO,
                            }}
                            style={{ originX: 0 }}
                            className={cn(
                              'h-full w-full rounded-full',
                              idx < questionIdx ? 'bg-navy-900' : 'bg-burgundy-600',
                            )}
                          />
                        </div>
                      );
                    })}
                  </div>

                  <h3 className="mt-5 font-display font-bold text-lg sm:text-xl leading-snug text-navy-900">
                    {currentQ.prompt}
                  </h3>

                  <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {currentQ.options.map((opt) => {
                      const selected = chosenId === opt.id;
                      const rightOption = opt.id === currentQ.correctId;
                      const wrongPick = isAnswered && selected && !rightOption;
                      const revealRight = isAnswered && rightOption;

                      let buttonTone =
                        'bg-cream-200 border-cream-300 text-navy-900 hover:bg-powder-100 hover:border-powder-500';
                      if (isAnswered) {
                        if (rightOption) {
                          buttonTone = 'bg-burgundy-600 border-burgundy-700 text-cream-50';
                        } else if (selected && !rightOption) {
                          buttonTone = 'bg-navy-900 border-navy-950 text-cream-50';
                        } else {
                          buttonTone =
                            'bg-cream-100 border-cream-300 text-navy-500 opacity-75';
                        }
                      }

                      const feedbackAnimation = reducedMotion
                        ? { x: 0, scale: 1 }
                        : wrongPick
                          ? { x: shakeKeyframes, scale: 1 }
                          : revealRight
                            ? { x: 0, scale: pulseKeyframes }
                            : { x: 0, scale: 1 };

                      return (
                        <motion.button
                          key={opt.id}
                          type="button"
                          disabled={isAnswered}
                          aria-pressed={selected}
                          animate={feedbackAnimation}
                          whileTap={
                            reducedMotion || isAnswered ? undefined : { scale: 0.98 }
                          }
                          transition={{
                            duration: wrongPick ? 0.38 : 0.32,
                            ease: 'easeOut',
                          }}
                          onClick={() => handleSelectOption(opt.id)}
                          className={cn(
                            'q-focus min-h-14 w-full rounded-xl border px-4 py-3 text-start font-display font-semibold text-sm sm:text-base flex items-center justify-between gap-2.5 transition-colors duration-200 select-none',
                            isAnswered ? 'cursor-default' : 'cursor-pointer',
                            buttonTone,
                          )}
                        >
                          <span className="inline-flex items-center gap-2.5 min-w-0">
                            <span
                              className={cn(
                                'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors duration-200',
                                revealRight
                                  ? 'bg-burgundy-800 text-cream-50'
                                  : wrongPick
                                    ? 'bg-navy-700 text-cream-50'
                                    : 'bg-cream-50 border border-cream-300 text-navy-700',
                              )}
                            >
                              {opt.id}
                            </span>
                            <span className="break-words">{opt.text}</span>
                          </span>

                          {revealRight && (
                            <motion.span
                              initial={reducedMotion ? false : { scale: 0.3, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ duration: 0.25, delay: 0.05, ease: EASE_OUT_EXPO }}
                              className="inline-flex shrink-0"
                            >
                              <CheckIcon className="h-4 w-4" />
                            </motion.span>
                          )}
                          {wrongPick && (
                            <motion.span
                              initial={reducedMotion ? false : { scale: 0.3, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                              className="inline-flex shrink-0"
                            >
                              <CloseIcon className="h-4 w-4" />
                            </motion.span>
                          )}
                        </motion.button>
                      );
                    })}
                  </div>

                  {/* Anlık Geri Bildirim ve Sonraki Soru */}
                  <div aria-live="polite" className="mt-5">
                    {isAnswered ? (
                      <motion.div
                        initial={reducedMotion ? false : { opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.08, ease: EASE_OUT_EXPO }}
                        className={cn(
                          'rounded-2xl border p-4 space-y-3',
                          isCorrect
                            ? 'bg-powder-100/80 border-burgundy-600/35'
                            : 'bg-cream-200 border-cream-300',
                        )}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-display font-bold text-sm sm:text-base text-navy-900">
                            {isCorrect
                              ? `Doğru Cevap! +${currentQ.points} Demo Puan`
                              : 'Yanlış Cevap — Doğru seçenek işaretlendi'}
                          </p>
                          <button
                            type="button"
                            onClick={handleNext}
                            className="q-press q-focus inline-flex items-center gap-1.5 min-h-10 rounded-xl bg-navy-900 hover:bg-navy-950 px-4 py-2 text-xs sm:text-sm font-semibold text-cream-50 cursor-pointer"
                          >
                            <span>
                              {questionIdx + 1 < MINI_QUESTIONS.length
                                ? 'Sonraki Soruya Geç'
                                : 'Demo Sonucunu Gör'}
                            </span>
                            <ChevronRightIcon className="h-4 w-4" />
                          </button>
                        </div>
                        <p className="text-xs sm:text-sm leading-relaxed text-navy-700">
                          {currentQ.explanation}
                        </p>
                      </motion.div>
                    ) : (
                      <p className="text-xs sm:text-sm text-navy-500">
                        Devam etmek için yukarıdaki seçeneklerden birini seçin.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
