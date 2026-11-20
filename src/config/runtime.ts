export const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(
  /\/$/,
  '',
);

export const SOCKET_URL = (
  import.meta.env.VITE_SOCKET_URL ?? API_BASE_URL
).replace(/\/$/, '');

export const PUBLIC_APP_URL = (import.meta.env.VITE_PUBLIC_APP_URL ?? '')
  .trim()
  .replace(/\/$/, '');

function isLocalHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '[::1]' ||
    lower.endsWith('.local') ||
    /^192\.168\./.test(lower) ||
    /^10\./.test(lower) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(lower)
  );
}

/**
 * QR kodlar ve kopyalanabilir paylaşım bağlantıları için herkese açık ana uygulama URL'si.
 * - VITE_PUBLIC_APP_URL tanımlıysa her ortamda (preview dahil) gerçek production alan adını döndürür.
 * - Özel alan adında yayınlandığında VITE_PUBLIC_APP_URL boş bırakılırsa veya yeni alan adına
 *   güncellenirse window.location.origin üzerinden dinamik olarak çalışır.
 */
export function getPublicAppOrigin(): string {
  if (PUBLIC_APP_URL) {
    return PUBLIC_APP_URL;
  }
  if (typeof window !== 'undefined') {
    const { origin, hostname } = window.location;
    if (!isLocalHostname(hostname)) {
      return origin.replace(/\/$/, '');
    }
    return origin.replace(/\/$/, '');
  }
  return '';
}

export function buildGameJoinUrl(pin: string): string {
  const cleanPin = pin.replace(/\D/g, '').slice(0, 6);
  const path = cleanPin ? `/join/${cleanPin}` : '/join';
  const origin = getPublicAppOrigin();
  return origin ? `${origin}${path}` : path;
}

export function buildGamePresentUrl(pin: string, presenterToken: string): string {
  const cleanPin = pin.replace(/\D/g, '').slice(0, 6);
  const path = `/present/${cleanPin}?token=${encodeURIComponent(presenterToken)}`;
  const origin = getPublicAppOrigin();
  return origin ? `${origin}${path}` : path;
}

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return API_BASE_URL ? `${API_BASE_URL}${normalized}` : normalized;
}

export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/uploads/') && API_BASE_URL) {
    return `${API_BASE_URL}${url}`;
  }
  return url;
}
