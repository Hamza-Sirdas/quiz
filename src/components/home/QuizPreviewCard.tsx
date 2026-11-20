import { useState } from 'react';
import { motion } from 'motion/react';
import { CheckIcon, ClockIcon } from '@/components/ui/Icons';
import { cn } from '@/utils/cn';

interface PreviewOption {
  id: string;
  label: string;
  isCorrect: boolean;
}

const PREVIEW_OPTIONS: readonly PreviewOption[] = [
  { id: 'A', label: 'İstanbul', isCorrect: false },
  { id: 'B', label: 'Ankara', isCorrect: true },
  { id: 'C', label: 'İzmir', isCorrect: false },
  { id: 'D', label: 'Bursa', isCorrect: false },
];

export function QuizPreviewCard() {
  const [selectedId, setSelectedId] = useState<string>('B');
  const selectedOption =
    PREVIEW_OPTIONS.find((option) => option.id === selectedId) ?? PREVIEW_OPTIONS[1];

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
      className="bg-cream-50 border border-cream-300 rounded-2xl p-6 sm:p-8 shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center rounded-lg bg-cream-200 border border-cream-300 px-3 py-1 text-xs font-semibold tabular-nums text-navy-900">
          Soru 1 / 10
        </span>
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums text-navy-900">
          <ClockIcon className="text-burgundy-600 shrink-0" />
          20 sn
        </span>
      </div>

      <div
        aria-hidden="true"
        className="mt-4 h-1.5 w-full rounded-full bg-cream-200 overflow-hidden"
      >
        <div className="h-full w-2/5 rounded-full bg-burgundy-600" />
      </div>

      <h2
        id="preview-question"
        className="mt-6 font-display font-bold text-xl sm:text-2xl leading-snug text-navy-900"
      >
        Türkiye&apos;nin başkenti hangisidir?
      </h2>

      <div
        role="group"
        aria-labelledby="preview-question"
        className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3"
      >
        {PREVIEW_OPTIONS.map((option) => {
          const isSelected = option.id === selectedId;

          return (
            <motion.button
              key={option.id}
              type="button"
              aria-pressed={isSelected}
              whileTap={{ scale: 0.99 }}
              transition={{ duration: 0.18 }}
              onClick={() => setSelectedId(option.id)}
              className={cn(
                'min-h-13 w-full rounded-xl border px-4 py-3 text-start font-display font-semibold text-base flex items-center justify-between gap-3 transition-colors duration-250 ease-out cursor-pointer',
                isSelected
                  ? 'bg-burgundy-600 border-burgundy-700 text-cream-50'
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
                  {option.id}
                </span>
                <span className="truncate">{option.label}</span>
              </span>
              {isSelected && <CheckIcon className="shrink-0" />}
            </motion.button>
          );
        })}
      </div>

      <div
        aria-live="polite"
        className="mt-5 pt-4 border-t border-cream-300 flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm"
      >
        <p className="text-navy-600">
          Seçili cevap:{' '}
          <span className="font-semibold text-navy-900">{selectedOption.label}</span>
        </p>
        <span
          className={cn(
            'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors duration-200',
            selectedOption.isCorrect
              ? 'bg-powder-100 border-powder-200 text-burgundy-600'
              : 'bg-cream-200 border-cream-300 text-navy-700',
          )}
        >
          {selectedOption.isCorrect ? 'Doğru cevap' : 'Önizleme seçimi'}
        </span>
      </div>
    </motion.div>
  );
}
