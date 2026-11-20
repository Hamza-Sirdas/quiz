import { VolumeOffIcon, VolumeOnIcon } from '@/components/ui/Icons';
import { useGameSound } from '@/hooks/useGameSound';
import { cn } from '@/utils/cn';

interface SoundToggleButtonProps {
  className?: string;
}

export function SoundToggleButton({ className }: SoundToggleButtonProps) {
  const { soundEnabled, toggleSound } = useGameSound();

  return (
    <button
      type="button"
      onClick={toggleSound}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 min-h-10 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors duration-150 cursor-pointer shrink-0',
        soundEnabled
          ? 'border-cream-300 bg-cream-100 hover:bg-cream-200 text-navy-900'
          : 'border-powder-400 bg-powder-100 hover:bg-powder-200 text-burgundy-700',
        className,
      )}
    >
      {soundEnabled ? (
        <VolumeOnIcon className="h-4 w-4 shrink-0" />
      ) : (
        <VolumeOffIcon className="h-4 w-4 shrink-0" />
      )}
      <span>{soundEnabled ? 'Sesi Kapat' : 'Sesi Aç'}</span>
    </button>
  );
}
