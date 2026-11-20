import type { QuizStatus, QuizVisibility } from '@shared/quizTypes';
import { apiUrl } from '@/config/runtime';
import { notifySessionExpired } from '@/services/authSessionEvents';
import { ensureCsrfToken } from '@/services/csrfStore';
import type {
  ApiValidationError,
  DashboardSummary,
  ExploreQuizDetail,
  ExploreQuizzesResponse,
  HealthStatus,
  QuizDetail,
  QuizPayload,
  QuizShareState,
  QuizSummary,
  UploadStatusResponse,
} from '@/types/quiz';

export class ApiError extends Error {
  status: number;
  code?: string;
  errors?: ApiValidationError[];

  constructor(
    message: string,
    status: number,
    errors?: ApiValidationError[],
    code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
    this.code = code;
  }
}

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
    if (
      response.status === 401 &&
      path !== '/api/health' &&
      !path.startsWith('/api/explore')
    ) {
      notifySessionExpired();
    }
    const payload =
      data && typeof data === 'object'
        ? (data as {
            message?: string;
            code?: string;
            errors?: ApiValidationError[];
          })
        : {};
    throw new ApiError(
      payload.message ?? 'İşlem sırasında bir hata oluştu.',
      response.status,
      payload.errors,
      payload.code,
    );
  }

  return data as T;
}

export function getHealth(): Promise<HealthStatus> {
  return requestJson<HealthStatus>('/api/health');
}

export function getDashboardSummary(): Promise<DashboardSummary> {
  return requestJson<DashboardSummary>('/api/dashboard/summary');
}

export function listQuizzes(params?: {
  search?: string;
  category?: string;
  status?: QuizStatus | 'Tümü';
  visibility?: QuizVisibility | 'SHARED' | 'Tümü';
}): Promise<{ quizzes: QuizSummary[] }> {
  const searchParams = new URLSearchParams();
  if (params?.search?.trim()) {
    searchParams.set('search', params.search.trim());
  }
  if (params?.category && params.category !== 'Tümü') {
    searchParams.set('category', params.category);
  }
  if (params?.status && params.status !== 'Tümü') {
    searchParams.set('status', params.status);
  }
  if (params?.visibility && params.visibility !== 'Tümü') {
    searchParams.set('visibility', params.visibility);
  }

  const query = searchParams.toString();
  return requestJson<{ quizzes: QuizSummary[] }>(
    query ? `/api/quizzes?${query}` : '/api/quizzes',
  );
}

export function getQuiz(id: string): Promise<{ quiz: QuizDetail }> {
  return requestJson<{ quiz: QuizDetail }>(`/api/quizzes/${encodeURIComponent(id)}`);
}

export function createQuiz(payload: QuizPayload): Promise<{ quiz: QuizDetail }> {
  return requestJson<{ quiz: QuizDetail }>('/api/quizzes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function updateQuiz(
  id: string,
  payload: QuizPayload,
): Promise<{ quiz: QuizDetail }> {
  return requestJson<{ quiz: QuizDetail }>(`/api/quizzes/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function deleteQuiz(id: string): Promise<{ deletedId: string }> {
  return requestJson<{ deletedId: string }>(`/api/quizzes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function updateQuizShareSettings(
  id: string,
  payload: {
    visibility?: QuizVisibility;
    allowPublicPreview?: boolean;
    action?: 'GENERATE_LINK' | 'REVOKE_LINK';
  },
): Promise<{ share: QuizShareState }> {
  return requestJson<{ share: QuizShareState }>(
    `/api/quizzes/${encodeURIComponent(id)}/share`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
}

export function cloneQuizToLibrary(
  id: string,
  shareToken?: string | null,
): Promise<{ quiz: QuizDetail }> {
  return requestJson<{ quiz: QuizDetail }>(
    `/api/quizzes/${encodeURIComponent(id)}/clone`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shareToken: shareToken ?? null }),
    },
  );
}

export interface ListExploreQuizzesParams {
  search?: string;
  category?: string;
  minQuestions?: number | null;
  maxQuestions?: number | null;
  sort?: 'newest' | 'oldest' | 'questions_desc' | 'questions_asc' | 'title_asc';
  page?: number;
  pageSize?: number;
}

export function listExploreQuizzes(
  params?: ListExploreQuizzesParams,
): Promise<ExploreQuizzesResponse> {
  const sp = new URLSearchParams();
  if (params?.search?.trim()) {
    sp.set('search', params.search.trim());
  }
  if (params?.category && params.category !== 'Tümü') {
    sp.set('category', params.category);
  }
  if (
    typeof params?.minQuestions === 'number' &&
    Number.isFinite(params.minQuestions) &&
    params.minQuestions > 0
  ) {
    sp.set('minQuestions', String(params.minQuestions));
  }
  if (
    typeof params?.maxQuestions === 'number' &&
    Number.isFinite(params.maxQuestions) &&
    params.maxQuestions > 0
  ) {
    sp.set('maxQuestions', String(params.maxQuestions));
  }
  if (params?.sort) {
    sp.set('sort', params.sort);
  }
  if (params?.page && params.page >= 1) {
    sp.set('page', String(params.page));
  }
  if (params?.pageSize && params.pageSize >= 1) {
    sp.set('pageSize', String(params.pageSize));
  }

  const qs = sp.toString();
  return requestJson<ExploreQuizzesResponse>(
    qs ? `/api/explore?${qs}` : '/api/explore',
  );
}

export function getExploreQuizDetail(
  quizId: string,
  shareToken?: string | null,
): Promise<{ quiz: ExploreQuizDetail }> {
  const sp = new URLSearchParams();
  if (shareToken?.trim()) {
    sp.set('token', shareToken.trim());
  }
  const qs = sp.toString();
  return requestJson<{ quiz: ExploreQuizDetail }>(
    qs
      ? `/api/explore/${encodeURIComponent(quizId)}?${qs}`
      : `/api/explore/${encodeURIComponent(quizId)}`,
  );
}

export function getExploreQuizByShareToken(
  shareToken: string,
): Promise<{ quiz: ExploreQuizDetail }> {
  return requestJson<{ quiz: ExploreQuizDetail }>(
    `/api/explore/share/${encodeURIComponent(shareToken.trim())}`,
  );
}

export function getUploadStatus(): Promise<UploadStatusResponse> {
  return requestJson<UploadStatusResponse>('/api/uploads/status');
}

export function uploadImage(file: File): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append('file', file);

  return requestJson<{ url: string }>('/api/uploads', {
    method: 'POST',
    body: formData,
  });
}
