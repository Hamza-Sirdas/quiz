import { motion } from 'motion/react';
import { QuizPreviewCard } from '@/components/home/QuizPreviewCard';
import {
  EASE_OUT_EXPO,
  heroContainerVariants,
  heroItemVariants,
  staticVariants,
} from '@/components/home/motion/tokens';
import { PlayIcon, PlusSquareIcon } from '@/components/ui/Icons';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

interface HeroSectionProps {
  onJoinGame: () => void;
  onCreateQuiz: () => void;
}

const HERO_PILLARS = [
  {
    label: '4 Soru Türü',
    detail: 'Çoktan Seçmeli, Doğru/Yanlış, Çoklu Seçim, Sıralama',
  },
  {
    label: 'Sınıf & Projeksiyon Modu',
    detail: 'Öğretmen kontrol merkezi ve akıllı tahta sunum ekranı',
  },
  {
    label: 'Anlık Analiz & Rapor',
    detail: 'Soru başarı dağılımı, liderlik tablosu, CSV ve PDF çıktı',
  },
] as const;

export function HeroSection({ onJoinGame, onCreateQuiz }: HeroSectionProps) {
  const reducedMotion = usePrefersReducedMotion();
  const item = reducedMotion ? staticVariants : heroItemVariants;

  return (
    <section
      id="ana-sayfa"
      className="scroll-mt-20 relative bg-powder-300 border-b border-navy-900/10 overflow-x-clip"
    >
      {/* Kontrollü mimari ızgara ve geometrik çerçeve dokusu */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-45"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgb(35 43 58 / 0.05) 1px, transparent 1px), linear-gradient(to bottom, rgb(35 43 58 / 0.05) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }}
      />

      <motion.div
        aria-hidden="true"
        initial={reducedMotion ? false : { opacity: 0, rotate: 0, scale: 0.9 }}
        animate={{ opacity: 1, rotate: 6, scale: 1 }}
        transition={{ duration: 0.7, delay: 0.25, ease: EASE_OUT_EXPO }}
        className="pointer-events-none hidden lg:block absolute top-10 right-[6%] h-28 w-28 rounded-3xl border border-burgundy-600/20"
      />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-10 sm:pt-12 sm:pb-14 lg:pt-14 lg:pb-16">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
          <motion.div
            variants={heroContainerVariants}
            initial="hidden"
            animate="visible"
            className="lg:col-span-6 min-w-0"
          >
            <motion.div
              variants={item}
              className="inline-flex items-center gap-2 rounded-full bg-cream-50/75 border border-navy-900/15 px-3.5 py-1.5 text-xs font-semibold text-navy-900 max-w-full"
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full bg-burgundy-600 shrink-0"
              />
              <span>Gerçek Zamanlı Sınıf ve Bilgi Yarışması Platformu</span>
            </motion.div>

            <h1
              id="ana-sayfa-baslik"
              tabIndex={-1}
              className="mt-5 font-display font-extrabold tracking-[-0.03em]"
              style={{
                fontSize: 'clamp(2.1rem, 1.35rem + 2.7vw, 3.85rem)',
                lineHeight: 1.06,
              }}
            >
              <motion.span variants={item} className="block text-navy-900">
                Bilgini
              </motion.span>
              <motion.span
                variants={item}
                className="relative inline-block text-burgundy-600"
              >
                Yarışmayla
                <motion.span
                  aria-hidden="true"
                  initial={reducedMotion ? false : { scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.55, delay: 0.42, ease: EASE_OUT_EXPO }}
                  style={{ originX: 0 }}
                  className="block h-1.5 w-full rounded-full bg-burgundy-600/25 -mt-1"
                />
              </motion.span>
              <motion.span variants={item} className="block text-navy-900">
                Kanıtla.
              </motion.span>
            </h1>

            <motion.p
              variants={item}
              className="mt-5 max-w-[48ch] text-base sm:text-lg leading-relaxed text-navy-700"
            >
              Sınıfta akıllı tahtadan veya uzaktan eğitimde öğrencilerle aynı anda yarış.
              Saniyeler içinde quiz oluştur, QR kod veya PIN ile başlat, ayrıntılı
              analizlerle her öğrencinin gelişimini gör.
            </motion.p>

            <motion.div variants={item} className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onJoinGame}
                className="q-press q-focus inline-flex items-center justify-center gap-2.5 min-h-12 rounded-xl bg-navy-900 hover:bg-navy-950 px-6 py-3 text-sm sm:text-base font-semibold text-cream-50 cursor-pointer shadow-card"
              >
                <PlayIcon />
                Oyuna Katıl
              </button>

              <button
                type="button"
                onClick={onCreateQuiz}
                className="q-press q-focus inline-flex items-center justify-center gap-2.5 min-h-12 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-6 py-3 text-sm sm:text-base font-semibold text-cream-50 cursor-pointer shadow-card"
              >
                <PlusSquareIcon />
                Quiz Oluştur
              </button>

              <a
                href="#mini-quiz"
                className="q-press q-focus inline-flex items-center justify-center min-h-12 rounded-xl border border-navy-900/25 bg-cream-50/60 hover:bg-cream-50 px-5 py-3 text-sm font-semibold text-navy-900"
              >
                Mini Quizi Dene
              </a>
            </motion.div>
          </motion.div>

          <div className="lg:col-span-6 min-w-0">
            <QuizPreviewCard />
          </div>
        </div>

        {/* Alt mimari ürün yetenek şeridi */}
        <motion.div
          variants={{
            hidden: {},
            visible: { transition: { staggerChildren: 0.07, delayChildren: 0.5 } },
          }}
          initial="hidden"
          animate="visible"
          className="mt-10 sm:mt-12 pt-6 border-t border-navy-900/12 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6"
        >
          {HERO_PILLARS.map((pillar, idx) => (
            <motion.div
              key={pillar.label}
              variants={item}
              className="q-lift rounded-2xl bg-cream-50/60 border border-navy-900/10 px-4 py-3.5 flex items-start gap-3"
            >
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-navy-900 text-xs font-bold tabular-nums text-cream-50">
                0{idx + 1}
              </span>
              <div className="min-w-0">
                <p className="font-display font-bold text-sm text-navy-900">
                  {pillar.label}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-navy-700">
                  {pillar.detail}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
