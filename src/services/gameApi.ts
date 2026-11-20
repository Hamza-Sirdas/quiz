import type {
  CreateGameResponse,
  GameHistoryDetail,
  GameHistorySummary,
  ValidatePinResponse,
} from '@shared/gameTypes';
import type { GameSessionAnalytics } from '@shared/analyticsTypes';
import { apiUrl } from '@/config/runtime';
import { notifySessionExpired } from '@/services/authSessionEvents';
import { ensureCsrfToken } from '@/services/csrfStore';
import { ApiError } from '@/services/quizApi';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
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
      'Sunucuya bağlanılamadı. Ağ bağlantınızı ve sunucu durumunu kontrol edin.',
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
    if (response.status === 401 && !path.startsWith('/api/games/validate/')) {
      notifySessionExpired();
    }
    const payload =
      data && typeof data === 'object' ? (data as { message?: string }) : {};
    throw new ApiError(
      payload.message ?? 'İşlem sırasında bir hata oluştu.',
      response.status,
    );
  }

  return data as T;
}

export function createGameSession(
  quizId: string,
  options?: { classroomMode?: boolean },
): Promise<CreateGameResponse> {
  return requestJson<CreateGameResponse>('/api/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quizId,
      classroomMode: Boolean(options?.classroomMode),
    }),
  });
}

export function validateGamePin(pin: string): Promise<ValidatePinResponse> {
  return requestJson<ValidatePinResponse>(
    `/api/games/validate/${encodeURIComponent(pin.trim())}`,
  );
}

export interface GetGameHistoryParams {
  search?: string;
  sort?: 'newest' | 'oldest';
  status?: string;
}

export function getGameHistory(
  params?: GetGameHistoryParams,
): Promise<{ history: GameHistorySummary[] }> {
  const query = new URLSearchParams();
  if (params?.search?.trim()) {
    query.set('search', params.search.trim());
  }
  if (params?.sort) {
    query.set('sort', params.sort);
  }
  if (params?.status) {
    query.set('status', params.status);
  }
  const qs = query.toString();
  return requestJson<{ history: GameHistorySummary[] }>(
    qs ? `/api/games/history?${qs}` : '/api/games/history',
  );
}

export function getGameHistoryDetail(
  id: string,
): Promise<{ session: GameHistoryDetail }> {
  return requestJson<{ session: GameHistoryDetail }>(
    `/api/games/history/${encodeURIComponent(id)}`,
  );
}

export function getGameSessionAnalytics(
  id: string,
): Promise<{ analytics: GameSessionAnalytics }> {
  return requestJson<{ analytics: GameSessionAnalytics }>(
    `/api/games/history/${encodeURIComponent(id)}/analytics`,
  );
}

async function downloadReportBlob(
  urlPath: string,
  filename: string,
  networkErrorMessage: string,
  defaultFailureMessage: string,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(apiUrl(urlPath), {
      credentials: 'include',
    });
  } catch {
    throw new ApiError(networkErrorMessage, 0);
  }

  if (!response.ok) {
    if (response.status === 401) {
      notifySessionExpired();
    }
    let message = defaultFailureMessage;
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      try {
        const errBody = (await response.json()) as { message?: string };
        if (errBody.message) message = errBody.message;
      } catch {
        // ignore parse failure
      }
    }
    throw new ApiError(message, response.status);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}

export async function downloadGameResultsCsv(
  sessionId: string,
  pin?: string,
): Promise<void> {
  const filename = pin
    ? `quizora-sonuclar-${pin}.csv`
    : `quizora-sonuclar-${sessionId}.csv`;
  return downloadReportBlob(
    `/api/games/history/${encodeURIComponent(sessionId)}/csv`,
    filename,
    'CSV dosyası indirilirken sunucuya bağlanılamadı.',
    'CSV dışa aktarma başarısız oldu.',
  );
}

export async function downloadGameResultsPdf(
  sessionId: string,
  pin?: string,
): Promise<void> {
  const filename = pin
    ? `quizora-rapor-${pin}.pdf`
    : `quizora-rapor-${sessionId}.pdf`;
  return downloadReportBlob(
    `/api/games/history/${encodeURIComponent(sessionId)}/pdf`,
    filename,
    'PDF raporu indirilirken sunucuya bağlanılamadı.',
    'PDF raporu dışa aktarma başarısız oldu.',
  );
}
