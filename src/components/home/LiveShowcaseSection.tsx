import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { AnimatedNumber } from '@/components/home/motion/AnimatedNumber';
import { EASE_OUT_EXPO } from '@/components/home/motion/tokens';
import { gsap, useScrollScene } from '@/components/home/motion/useScrollScene';
import {
  ClockIcon,
  MonitorIcon,
  PauseIcon,
  PlayIcon,
  UsersIcon,
} from '@/components/ui/Icons';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { cn } from '@/utils/cn';

type ShowcaseStage = 'question' | 'leaderboard' | 'classroom';

const SHOWCASE_TABS: ReadonlyArray<{ id: ShowcaseStage; label: string }> = [
  { id: 'question', label: 'Soru & Katılım Ekranı' },
  { id: 'leaderboard', label: 'Sıralama & Puan Değişimi' },
  { id: 'classroom', label: 'Sınıf & Projeksiyon Modu' },
];

interface DemoPlayerRow {
  id: string;
  rank: number;
  name: string;
  score: number;
  delta: string;
  move: string;
}

/**
 * Kontrollü demo turları: her turda liderlik yer değiştirmesi gerçek oyuncu
 * iddiası taşımayan etiketlerle ("Örnek Oyuncu A–D") canlandırılır.
 */
const DEMO_ROUNDS: ReadonlyArray<ReadonlyArray<DemoPlayerRow>> = [
  [
    { id: 'demo-a', rank: 1, name: 'Örnek Oyuncu A', score: 3180, delta: '+860 p', move: '↑1' },
    { id: 'demo-b', rank: 2, name: 'Örnek Oyuncu B', score: 3090, delta: '+790 p', move: '↓1' },
    { id: 'demo-c', rank: 3, name: 'Örnek Oyuncu C', score: 2940, delta: '+740 p', move: '—' },
    { id: 'demo-d', rank: 4, name: 'Örnek Oyuncu D', score: 2810, delta: '+690 p', move: '—' },
  ],
  [
    { id: 'demo-b', rank: 1, name: 'Örnek Oyuncu B', score: 3980, delta: '+890 p', move: '↑1' },
    { id: 'demo-a', rank: 2, name: 'Örnek Oyuncu A', score: 3910, delta: '+730 p', move: '↓1' },
    { id: 'demo-d', rank: 3, name: 'Örnek Oyuncu D', score: 3720, delta: '+910 p', move: '↑1' },
    { id: 'demo-c', rank: 4, name: 'Örnek Oyuncu C', score: 3620, delta: '+680 p', move: '↓1' },
  ],
  [
    { id: 'demo-d', rank: 1, name: 'Örnek Oyuncu D', score: 4690, delta: '+970 p', move: '↑2' },
    { id: 'demo-b', rank: 2, name: 'Örnek Oyuncu B', score: 4640, delta: '+660 p', move: '↓1' },
    { id: 'demo-c', rank: 3, name: 'Örnek Oyuncu C', score: 4530, delta: '+910 p', move: '↑1' },
    { id: 'demo-a', rank: 4, name: 'Örnek Oyuncu A', score: 4490, delta: '+580 p', move: '↓2' },
  ],
  [
    { id: 'demo-a', rank: 1, name: 'Örnek Oyuncu A', score: 5450, delta: '+960 p', move: '↑3' },
    { id: 'demo-d', rank: 2, name: 'Örnek Oyuncu D', score: 5380, delta: '+690 p', move: '↓1' },
    { id: 'demo-b', rank: 3, name: 'Örnek Oyuncu B', score: 5290, delta: '+650 p', move: '↓1' },
    { id: 'demo-c', rank: 4, name: 'Örnek Oyuncu C', score: 5180, delta: '+650 p', move: '—' },
  ],
];

const QUESTION_CHOICES = [
  { key: 'A', label: 'Aynada görüntü oluşumu', ratio: '11%' },
  {
    key: 'B',
    label: 'Su dolu bardakta kalemin bükülmüş görünmesi',
    ratio: '79%',
    highlight: true,
  },
  { key: 'C', label: 'Düz yüzeyde gölge oluşumu', ratio: '6%' },
  { key: 'D', label: 'Işık kaynağının ısınması', ratio: '4%' },
] as const;

export function LiveShowcaseSection() {
  const reducedMotion = usePrefersReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const [stage, setStage] = useState<ShowcaseStage>('question');
  const [roundIndex, setRoundIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // Bölümün görünürlüğünü izleyerek ekran dışındayken gereksiz zamanlayıcıyı durdurur.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          setIsVisible(entry.isIntersecting);
        }
      },
      { threshold: 0.15 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Azaltılmış harekette, duraklatıldığında veya görünür değilken tur dönmez.
  useEffect(() => {
    if (reducedMotion || isPaused || !isVisible) return;

    const timer = window.setInterval(() => {
      setRoundIndex((prev) => (prev + 1) % DEMO_ROUNDS.length);
    }, 3300);

    return () => window.clearInterval(timer);
  }, [reducedMotion, isPaused, isVisible]);

  // Bölüme özgü scroll sahnesi: masaüstünde zıt yönlü hafif derinlik parallax'ı.
  useScrollScene(sectionRef, {
    desktop: ({ root, q }) => {
      gsap.from(q('[data-anim="live-header"] > *'), {
        y: 18,
        opacity: 0,
        duration: 0.5,
        stagger: 0.08,
        ease: 'power3.out',
        scrollTrigger: { trigger: root, start: 'top 78%', once: true },
      });

      const leftPanel = q('[data-anim="live-left"]')[0];
      const rightPanel = q('[data-anim="live-right"]')[0];

      if (leftPanel) {
        gsap.fromTo(
          leftPanel,
          { yPercent: 2 },
          {
            yPercent: -2,
            ease: 'none',
            scrollTrigger: {
              trigger: root,
              start: 'top bottom',
              end: 'bottom top',
              scrub: true,
            },
          },
        );
      }

      if (rightPanel) {
        gsap.fromTo(
          rightPanel,
          { yPercent: -2.5 },
          {
            yPercent: 2.5,
            ease: 'none',
            scrollTrigger: {
              trigger: root,
              start: 'top bottom',
              end: 'bottom top',
              scrub: true,
            },
          },
        );
      }
    },
    mobile: ({ root, q }) => {
      gsap.from(q('[data-anim="live-header"]'), {
        y: 18,
        opacity: 0,
        duration: 0.45,
        ease: 'power2.out',
        scrollTrigger: { trigger: root, start: 'top 82%', once: true },
      });
    },
  });

  const activeStandings = DEMO_ROUNDS[roundIndex] ?? DEMO_ROUNDS[0];

  return (
    <section
      ref={sectionRef}
      id="canli-vitrin"
      aria-labelledby="canli-vitrin-baslik"
      className="scroll-mt-20 bg-powder-100/70 py-14 sm:py-20 border-b border-cream-300 overflow-x-clip"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div data-anim="live-header" className="flex flex-col gap-5">
          <div className="space-y-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-cream-50 border border-powder-300 px-3.5 py-1 text-xs font-semibold text-burgundy-700">
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full bg-burgundy-600 shrink-0"
              />
              <span>Canlı Yarışma Vitrini · Kontrollü Demo Verisi</span>
            </span>
            <h2
              id="canli-vitrin-baslik"
              className="font-display font-extrabold tracking-tight text-navy-900"
              style={{
                fontSize: 'clamp(1.65rem, 1.2rem + 1.5vw, 2.35rem)',
                lineHeight: 1.15,
              }}
            >
              Saniye saniye senkronize yarışma deneyimi.
            </h2>
          </div>

          {/* Bakış Açısı Sekmeleri (kayan arka plan göstergesi ile) */}
          <LayoutGroup id="live-showcase-tabs">
            <div
              role="tablist"
              aria-label="Canlı yarışma vitrini görünümleri"
              className="w-fit max-w-full flex flex-wrap gap-2 rounded-2xl bg-cream-50 border border-cream-300 p-1.5"
            >
              {SHOWCASE_TABS.map((tab) => {
                const active = stage === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setStage(tab.id)}
                    className={cn(
                      'q-press q-focus relative min-h-10 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-semibold transition-colors cursor-pointer',
                      active ? 'text-cream-50' : 'text-navy-700 hover:bg-cream-200',
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="live-showcase-tab-pill"
                        transition={{ duration: reducedMotion ? 0 : 0.28, ease: EASE_OUT_EXPO }}
                        className="absolute inset-0 rounded-xl bg-navy-900"
                        aria-hidden="true"
                      />
                    )}
                    <span className="relative z-10">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </LayoutGroup>
        </div>

        {/* Katmanlı Canlı Vitrin Sahnesi */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Sol Panel: Aktif Soru + Cevaplayan Oyuncu Sayısı + Geri Sayım */}
          <div
            data-anim="live-left"
            className="lg:col-span-7 rounded-3xl bg-cream-50 border border-cream-300 p-5 sm:p-7 shadow-card flex flex-col justify-between gap-6"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={stage}
                initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reducedMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
                transition={{ duration: reducedMotion ? 0 : 0.22, ease: EASE_OUT_EXPO }}
                className="space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-lg bg-powder-100 border border-powder-200 px-3 py-1 text-xs font-bold text-burgundy-700">
                      {stage === 'classroom'
                        ? 'Projeksiyon Görünümü · Örnek'
                        : 'Soru 4 / 8 · Örnek Oturum'}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-cream-200 px-3 py-1 text-xs font-semibold tabular-nums text-navy-900">
                      <UsersIcon className="h-3.5 w-3.5 text-burgundy-600" />
                      <span>24 / 28 Oyuncu Cevapladı</span>
                    </span>
                  </div>

                  <span className="inline-flex items-center gap-1.5 rounded-xl bg-burgundy-600 px-3 py-1.5 text-xs sm:text-sm font-bold tabular-nums text-cream-50">
                    <ClockIcon className="h-4 w-4" />
                    <span>08 sn</span>
                  </span>
                </div>

                <div aria-hidden="true" className="h-2 rounded-full bg-cream-200 overflow-hidden">
                  <motion.div
                    initial={reducedMotion ? false : { scaleX: 0.72 }}
                    animate={{ scaleX: stage === 'question' ? 0.42 : 1 }}
                    transition={{ duration: reducedMotion ? 0 : 0.5, ease: EASE_OUT_EXPO }}
                    style={{ originX: 0 }}
                    className="h-full w-full rounded-full bg-burgundy-600"
                  />
                </div>

                <h3 className="font-display font-bold text-lg sm:text-2xl leading-snug text-navy-900">
                  Aşağıdaki olaylardan hangisi ışığın kırılması sonucunda gözlemlenir?
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {QUESTION_CHOICES.map((choice) => {
                    const showOutcome = stage !== 'question' && 'highlight' in choice && choice.highlight;
                    return (
                      <div
                        key={choice.key}
                        className={cn(
                          'rounded-xl border p-3.5 flex items-center justify-between gap-3 transition-colors duration-200',
                          showOutcome
                            ? 'bg-powder-100 border-burgundy-600'
                            : 'bg-cream-100 border-cream-300',
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={cn(
                              'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors duration-200',
                              showOutcome
                                ? 'bg-burgundy-600 text-cream-50'
                                : 'bg-cream-50 border border-cream-300 text-navy-700',
                            )}
                          >
                            {choice.key}
                          </span>
                          <span className="text-xs sm:text-sm font-semibold text-navy-900 break-words">
                            {choice.label}
                          </span>
                        </div>
                        {stage !== 'question' && (
                          <span className="text-xs font-bold tabular-nums text-navy-700 shrink-0">
                            {choice.ratio}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="pt-4 border-t border-cream-300 flex flex-wrap items-center justify-between gap-2 text-xs text-navy-600">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <MonitorIcon className="h-4 w-4 text-burgundy-600" />
                <span>
                  {stage === 'classroom'
                    ? 'Öğretmen ekranında kontroller, tahtada yalnızca soru ve grafik görünür.'
                    : 'Sunucu zamanı tüm cihazlarda tek saat kaynağıyla eşitlenir.'}
                </span>
              </span>
              <span className="font-semibold text-navy-700">Demo Vitrin</span>
            </div>
          </div>

          {/* Sağ Panel: Anlık Sıralama Tablosu & FLIP Puan Değişimleri */}
          <div
            data-anim="live-right"
            className="lg:col-span-5 rounded-3xl bg-navy-900 text-cream-50 p-5 sm:p-7 shadow-card flex flex-col justify-between gap-5"
          >
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display font-bold text-lg text-cream-50">
                  Canlı Sıralama Tablosu
                </h3>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-cream-50/10 border border-cream-50/15 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-powder-200">
                    Tur {roundIndex + 1} / {DEMO_ROUNDS.length} · Demo
                  </span>
                  <span className="rounded-full bg-cream-50/10 border border-cream-50/15 px-2.5 py-0.5 text-[11px] font-semibold text-powder-200">
                    Örnek Puanlar · Demo
                  </span>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-cream-200/80">
                  Her turda puanlar güncellenerek sıra değişimi canlandırılır.
                </p>
                {/* WCAG 2.2.2: Otomatik değişen demo için görünür duraklat/oynat düğmesi (aria-pressed kullanılmaz) */}
                <button
                  type="button"
                  onClick={() => setIsPaused((prev) => !prev)}
                  className="q-press q-focus-light inline-flex items-center gap-1.5 min-h-9 rounded-lg border border-cream-50/20 bg-cream-50/10 hover:bg-cream-50/20 px-2.5 py-1 text-[11px] font-semibold text-cream-50 cursor-pointer"
                >
                  {isPaused ? (
                    <>
                      <PlayIcon className="h-3.5 w-3.5 shrink-0" />
                      <span>Demoyu Oynat</span>
                    </>
                  ) : (
                    <>
                      <PauseIcon className="h-3.5 w-3.5 shrink-0" />
                      <span>Demoyu Duraklat</span>
                    </>
                  )}
                </button>
              </div>

              <LayoutGroup id="live-showcase-board">
                <ul className="mt-4 space-y-2.5">
                  {activeStandings.map((row) => (
                    <motion.li
                      layout={!reducedMotion}
                      key={row.id}
                      transition={{
                        layout: { duration: reducedMotion ? 0 : 0.45, ease: EASE_OUT_EXPO },
                      }}
                      className={cn(
                        'rounded-2xl border px-3.5 py-3 flex items-center justify-between gap-3 transition-colors duration-300',
                        row.rank === 1
                          ? 'bg-burgundy-600/35 border-powder-300/40'
                          : 'bg-navy-950/60 border-cream-50/10',
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <motion.span
                          key={`${row.id}-rank-${row.rank}`}
                          initial={reducedMotion ? false : { scale: 0.85 }}
                          animate={{ scale: 1 }}
                          transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
                          className={cn(
                            'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold tabular-nums transition-colors duration-200',
                            row.rank === 1
                              ? 'bg-powder-200 text-navy-950'
                              : 'bg-navy-700 text-cream-100',
                          )}
                        >
                          {row.rank}
                        </motion.span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-cream-50">
                            {row.name}
                          </p>
                          <p className="text-[11px] font-semibold text-powder-200 tabular-nums">
                            {row.delta} · Sıra {row.move}
                          </p>
                        </div>
                      </div>

                      <AnimatedNumber
                        value={row.score}
                        suffix=" p"
                        duration={0.6}
                        className="font-display font-bold text-sm sm:text-base tabular-nums text-cream-50 shrink-0"
                      />
                    </motion.li>
                  ))}
                </ul>
              </LayoutGroup>
            </div>

            <div className="rounded-2xl bg-navy-950/75 border border-cream-50/10 px-4 py-3 text-xs leading-relaxed text-cream-200/85">
              Bu liste hareketli bir önizlemedir; gerçek yarışmalarda puanlar yalnız sunucu
              tarafında hesaplanır ve öğrenci koptuğunda kendi sırasına geri bağlanır.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
