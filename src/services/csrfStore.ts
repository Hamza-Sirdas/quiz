import { apiUrl } from '@/config/runtime';

let memoryCsrfToken: string | null = null;
let inflightRequest: Promise<string | null> | null = null;

export function getCsrfToken(): string | null {
  return memoryCsrfToken;
}

export function setCsrfToken(token: string | null | undefined): void {
  if (typeof token === 'string' && token.trim().length > 0) {
    memoryCsrfToken = token.trim();
  }
}

export function clearCsrfToken(): void {
  memoryCsrfToken = null;
  inflightRequest = null;
}

export async function ensureCsrfToken(): Promise<string | null> {
  if (memoryCsrfToken) {
    return memoryCsrfToken;
  }

  if (inflightRequest) {
    return inflightRequest;
  }

  inflightRequest = fetch(apiUrl('/api/auth/csrf'), {
    credentials: 'include',
  })
    .then(async (res) => {
      if (!res.ok) return null;
      const body = (await res.json()) as { csrfToken?: string };
      if (body.csrfToken) {
        memoryCsrfToken = body.csrfToken;
        return body.csrfToken;
      }
      return null;
    })
    .catch(() => null)
    .finally(() => {
      inflightRequest = null;
    });

  return inflightRequest;
}
