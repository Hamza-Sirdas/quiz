export const API_BASE_URL = (import.meta.env.VITE_API_URL ?? '').replace(
  /\/$/,
  '',
);

export const SOCKET_URL = (
  import.meta.env.VITE_SOCKET_URL ?? API_BASE_URL
).replace(/\/$/, '');

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
