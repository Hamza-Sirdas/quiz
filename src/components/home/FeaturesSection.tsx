import type { ComponentType } from 'react';
import { motion } from 'motion/react';
import {
  BarChartIcon,
  LayersIcon,
  UsersIcon,
  ZapIcon,
} from '@/components/ui/Icons';

interface FeatureItem {
  id: string;
  title: string;
  description: string;
  Icon: ComponentType<{ className?: string }>;
}

const FEATURES: readonly FeatureItem[] = [
  {
    id: 'realtime',
    title: 'Gerçek Zamanlı',
    description: 'Anlık soru, cevap ve sıralama.',
    Icon: ZapIcon,
  },
  {
    id: 'players',
    title: '30+ Oyuncu',
    description: 'Aynı anda büyük gruplarla oynayın.',
    Icon: UsersIcon,
  },
  {
    id: 'results',
    title: 'Detaylı Sonuç',
    description: 'Performans ve istatistikler.',
    Icon: BarChartIcon,
  },
  {
    id: 'easy',
    title: 'Kolay Kullanım',
    description: 'Hemen quiz oluştur, oyunu başlat.',
    Icon: LayersIcon,
  },
];

export function FeaturesSection() {
  return (
    <section
      id="ozellikler"
      aria-labelledby="ozellikler-baslik"
      className="scroll-mt-20 bg-powder-300 border-t border-navy-900/10 py-9 sm:py-10"
    >
      <h2 id="ozellikler-baslik" className="sr-only">
        QUIZORA Özellikleri
      </h2>

      <div className="max-w-6xl mx-auto px-5 sm:px-6 lg:px-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
        {FEATURES.map(({ id, title, description, Icon }, index) => (
          <motion.div
            key={id}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{
              duration: 0.34,
              delay: index * 0.05,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="flex items-start gap-3.5"
          >
            <Icon className="mt-0.5 shrink-0 text-burgundy-600" />
            <div>
              <h3 className="font-display font-bold text-base text-navy-900">
                {title}
              </h3>
              <p className="mt-1 text-sm leading-snug text-navy-700">
                {description}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
