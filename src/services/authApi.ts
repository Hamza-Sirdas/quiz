import { apiUrl } from '@/config/runtime';
import { notifySessionExpired } from '@/services/authSessionEvents';
import {
  clearCsrfToken,
  ensureCsrfToken,
  setCsrfToken,
} from '@/services/csrfStore';
import { ApiError } from '@/services/quizApi';

export interface TeacherProfile {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function authFetch<T>(
  path: string,
  init: RequestInit = {},
  options: { notifyOn401?: boolean } = {},
): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);

  if (MUTATING_METHODS.has(method)) {
    const csrf = await ensureCsrfToken();
    if (csrf) {
      headers.set('X-CSRF-Token', csrf);
    }
  }

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      credentials: 'include',
      ...init,
      headers,
    });
  } catch {
    throw new ApiError(
      'Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin.',
      0,
    );
  }

  let data: unknown = null;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && options.notifyOn401) {
      clearCsrfToken();
      notifySessionExpired();
    }
    const payload =
      data && typeof data === 'object' ? (data as { message?: string }) : {};
    throw new ApiError(
      payload.message ?? 'Kimlik doğrulama işlemi sırasında bir hata oluştu.',
      response.status,
    );
  }

  if (
    data &&
    typeof data === 'object' &&
    typeof (data as { csrfToken?: unknown }).csrfToken === 'string'
  ) {
    setCsrfToken((data as { csrfToken: string }).csrfToken);
  }

  return data as T;
}

export async function getMe(): Promise<{ teacher: TeacherProfile }> {
  return authFetch<{ teacher: TeacherProfile }>('/api/auth/me');
}

export function loginTeacher(payload: {
  email: string;
  password: string;
}): Promise<{ teacher: TeacherProfile }> {
  return authFetch<{ teacher: TeacherProfile }>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function registerTeacher(payload: {
  name: string;
  email: string;
  password: string;
  passwordConfirm: string;
  acceptedTerms: boolean;
}): Promise<{ teacher: TeacherProfile }> {
  return authFetch<{ teacher: TeacherProfile }>('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function logoutTeacher(): Promise<{ ok: boolean }> {
  try {
    return await authFetch<{ ok: boolean }>('/api/auth/logout', {
      method: 'POST',
    });
  } finally {
    clearCsrfToken();
  }
}

export async function logoutAllSessions(): Promise<{ ok: boolean }> {
  try {
    return await authFetch<{ ok: boolean }>(
      '/api/auth/logout-all',
      { method: 'POST' },
      { notifyOn401: true },
    );
  } finally {
    clearCsrfToken();
  }
}

export function updateTeacherProfile(payload: {
  name: string;
  email: string;
}): Promise<{ teacher: TeacherProfile }> {
  return authFetch<{ teacher: TeacherProfile }>(
    '/api/auth/profile',
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    { notifyOn401: true },
  );
}

export function changeTeacherPassword(payload: {
  currentPassword: string;
  newPassword: string;
  newPasswordConfirm: string;
}): Promise<{ ok: boolean; message: string }> {
  return authFetch<{ ok: boolean; message: string }>(
    '/api/auth/change-password',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    { notifyOn401: true },
  );
}

export function getPasswordResetStatus(): Promise<{
  emailDeliveryConfigured: boolean;
}> {
  return authFetch<{ emailDeliveryConfigured: boolean }>(
    '/api/auth/password-reset-status',
  );
}

export function requestPasswordReset(
  email: string,
): Promise<{ ok: boolean; message: string }> {
  return authFetch<{ ok: boolean; message: string }>(
    '/api/auth/forgot-password',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    },
  );
}

export function verifyPasswordResetToken(
  token: string,
): Promise<{ valid: boolean }> {
  return authFetch<{ valid: boolean }>('/api/auth/reset-password/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
}

export function resetPassword(payload: {
  token: string;
  newPassword: string;
  newPasswordConfirm: string;
}): Promise<{ ok: boolean; message: string }> {
  return authFetch<{ ok: boolean; message: string }>(
    '/api/auth/reset-password',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
}
