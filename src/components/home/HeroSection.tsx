import { motion } from 'motion/react';
import { QuizPreviewCard } from '@/components/home/QuizPreviewCard';
import { PlayIcon, PlusSquareIcon } from '@/components/ui/Icons';

interface HeroSectionProps {
  onJoinGame: () => void;
  onCreateQuiz: () => void;
}

export function HeroSection({ onJoinGame, onCreateQuiz }: HeroSectionProps) {
  return (
    <section
      id="ana-sayfa"
      className="scroll-mt-20 bg-powder-300 pt-8 pb-10 sm:pt-12 sm:pb-14 lg:pt-12 lg:pb-14"
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-6 lg:px-8 grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="lg:col-span-6"
        >
          <span className="inline-flex items-center rounded-full bg-cream-50/55 border border-navy-900/15 px-3.5 py-1.5 text-xs font-semibold text-navy-900">
            Canlı Bilgi Yarışması Platformu
          </span>

          <h1
            id="ana-sayfa-baslik"
            tabIndex={-1}
            className="mt-5 font-display font-extrabold tracking-[-0.03em]"
            style={{
              fontSize: 'clamp(2.25rem, 1.5rem + 2.8vw, 3.75rem)',
              lineHeight: 1.06,
            }}
          >
            <span className="block text-navy-900">Bilgini</span>
            <span className="block text-burgundy-600">Yarışmayla</span>
            <span className="block text-navy-900">Kanıtla.</span>
          </h1>

          <p className="mt-5 max-w-[44ch] text-base sm:text-lg leading-relaxed text-navy-700">
            Sınıfta, etkinlikte veya çevrimiçi ortamda 30+ kişiyle aynı anda yarışabileceğin
            modern quiz platformu.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3.5">
            <motion.button
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.99 }}
              transition={{ duration: 0.2 }}
              onClick={onJoinGame}
              className="inline-flex items-center gap-2.5 rounded-xl bg-navy-900 hover:bg-navy-950 px-6 py-3.5 text-sm sm:text-base font-semibold text-cream-50 transition-colors duration-200 cursor-pointer"
            >
              <PlayIcon />
              Oyuna Katıl
            </motion.button>

            <motion.button
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.99 }}
              transition={{ duration: 0.2 }}
              onClick={onCreateQuiz}
              className="inline-flex items-center gap-2.5 rounded-xl border border-navy-700/75 bg-cream-50/45 hover:bg-cream-50/80 px-6 py-3.5 text-sm sm:text-base font-semibold text-navy-900 transition-colors duration-200 cursor-pointer"
            >
              <PlusSquareIcon />
              Quiz Oluştur
            </motion.button>
          </div>
        </motion.div>

        <div className="lg:col-span-6">
          <QuizPreviewCard />
        </div>
      </div>
    </section>
  );
}
