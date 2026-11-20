import type { LogoSize } from '@/types';
import { cn } from '@/utils/cn';

interface QuizoraLogoProps {
  size?: LogoSize;
  showWordmark?: boolean;
  className?: string;
}

const SIZE_CONFIG: Record<LogoSize, { iconPx: number; textClass: string; gapClass: string }> = {
  sm: { iconPx: 28, textClass: 'text-lg', gapClass: 'gap-2' },
  md: { iconPx: 34, textClass: 'text-xl', gapClass: 'gap-2.5' },
  lg: { iconPx: 44, textClass: 'text-2xl', gapClass: 'gap-3' },
};

export function QuizoraLogo({
  size = 'md',
  showWordmark = true,
  className,
}: QuizoraLogoProps) {
  const { iconPx, textClass, gapClass } = SIZE_CONFIG[size];

  return (
    <div className={cn('inline-flex items-center', gapClass, className)}>
      <svg
        width={iconPx}
        height={iconPx}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden={showWordmark ? true : undefined}
        role={showWordmark ? undefined : 'img'}
        aria-label={showWordmark ? undefined : 'QUIZORA'}
        className="shrink-0"
      >
        {/* Üst-sol pudra pembesi faset */}
        <path
          d="M18 18L5.98 11.08Q6.45 10.25 7.4 9.7L16.1 4.6Q18 3.5 19.9 4.6L28.6 9.7Q29.55 10.25 30.02 11.08Z"
          fill="#D9B4B7"
        />
        {/* Sağ ana bordo faset */}
        <path
          d="M18 18L30.02 11.08Q30.5 11.9 30.5 13V23Q30.5 25.2 28.6 26.3L19.9 31.4Q18.95 31.95 18 31.95Z"
          fill="#6B1D2F"
        />
        {/* Alt-sol koyu şarap derinlik faseti */}
        <path
          d="M18 18V31.95Q17.05 31.95 16.1 31.4L7.4 26.3Q5.5 25.2 5.5 23V13Q5.5 11.9 5.98 11.08Z"
          fill="#4D1321"
        />
        {/* İç geometriyi belirginleştiren krem kat çizgisi */}
        <path
          d="M6.4 11.3L18 18L29.6 11.3M18 18V31.4"
          stroke="#FAF7F4"
          strokeWidth="1.35"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {showWordmark && (
        <span
          className={cn(
            'font-display font-extrabold uppercase tracking-[0.04em] leading-none text-navy-900 select-none',
            textClass,
          )}
        >
          QUIZORA
        </span>
      )}
    </div>
  );
}
