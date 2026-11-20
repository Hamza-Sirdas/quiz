import { useEffect, useState, type ReactNode } from 'react';
import { ImageIcon } from '@/components/ui/Icons';
import { cn } from '@/utils/cn';

interface SafeImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  decoding?: 'async' | 'sync' | 'auto';
  fetchPriority?: 'high' | 'low' | 'auto';
  fallback?: ReactNode;
  fallbackClassName?: string;
  fallbackLabel?: string;
}

export function SafeImage({
  src,
  alt,
  className,
  loading,
  decoding = 'async',
  fetchPriority,
  fallback,
  fallbackClassName,
  fallbackLabel = 'Görsel yüklenemedi',
}: SafeImageProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    if (fallback !== undefined) {
      return <>{fallback}</>;
    }

    return (
      <div
        role="img"
        aria-label={alt || fallbackLabel}
        className={cn(
          'flex min-h-24 w-full items-center justify-center gap-2 rounded-xl bg-cream-100 px-4 py-5 text-xs font-medium text-navy-600',
          fallbackClassName,
        )}
      >
        <ImageIcon className="h-4 w-4 shrink-0 text-navy-500" />
        <span>{fallbackLabel}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      decoding={decoding}
      {...(fetchPriority ? { fetchPriority } : {})}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
