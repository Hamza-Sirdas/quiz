import type {
  AiDailyQuotaStatus,
  AiGenerateRequest,
  AiGeneratedQuestion,
  AiGeneratedQuizDraft,
  AiRegenerateQuestionRequest,
  AiServiceStatus,
  AiUsageSummary,
  PdfExtractionSummary,
} from '@shared/aiTypes';
import { apiUrl } from '@/config/runtime';
import { notifySessionExpired } from '@/services/authSessionEvents';
import { ensureCsrfToken } from '@/services/csrfStore';
import { ApiError } from '@/services/quizApi';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function requestAiJson<T>(
  path: string,
  init: RequestInit = {},
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
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('İşlem iptal edildi.', 408, undefined, 'AI_ABORTED');
    }
    throw new ApiError(
      'Sunucuya bağlanılamadı. Ağ bağlantınızı kontrol edin.',
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
    if (response.status === 401) {
      notifySessionExpired();
    }
    const payload =
      data && typeof data === 'object'
        ? (data as { message?: string; code?: string })
        : {};
    throw new ApiError(
      payload.message ?? 'Yapay zekâ işlemi sırasında bir hata oluştu.',
      response.status,
      undefined,
      payload.code,
    );
  }

  return data as T;
}

export function getAiStatus(): Promise<AiServiceStatus> {
  return requestAiJson<AiServiceStatus>('/api/ai/status');
}

export function extractPdfForAi(
  file: File,
  signal?: AbortSignal,
): Promise<{ extraction: PdfExtractionSummary }> {
  const formData = new FormData();
  formData.append('file', file);

  return requestAiJson<{ extraction: PdfExtractionSummary }>(
    '/api/ai/extract-pdf',
    {
      method: 'POST',
      body: formData,
      signal,
    },
  );
}

export function deletePdfSession(pdfSessionId: string): Promise<{ deleted: boolean }> {
  return requestAiJson<{ deleted: boolean }>(
    `/api/ai/pdf-session/${encodeURIComponent(pdfSessionId)}`,
    {
      method: 'DELETE',
    },
  );
}

export function generateAiQuiz(
  payload: AiGenerateRequest,
  signal?: AbortSignal,
): Promise<{
  draft: AiGeneratedQuizDraft;
  usage: AiUsageSummary;
  dailyQuota?: AiDailyQuotaStatus;
}> {
  return requestAiJson<{
    draft: AiGeneratedQuizDraft;
    usage: AiUsageSummary;
    dailyQuota?: AiDailyQuotaStatus;
  }>(
    '/api/ai/generate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    },
  );
}

export function regenerateAiQuestion(
  payload: AiRegenerateQuestionRequest,
  signal?: AbortSignal,
): Promise<{ question: AiGeneratedQuestion; usage: AiUsageSummary }> {
  return requestAiJson<{ question: AiGeneratedQuestion; usage: AiUsageSummary }>(
    '/api/ai/regenerate-question',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    },
  );
}
