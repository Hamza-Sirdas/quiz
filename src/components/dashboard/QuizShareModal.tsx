import { useEffect, useId, useRef, useState } from 'react';
import {
  QUIZ_VISIBILITIES,
  QUIZ_VISIBILITY_DESCRIPTIONS,
  QUIZ_VISIBILITY_LABELS,
  type QuizStatus,
  type QuizVisibility,
} from '@shared/quizTypes';
import {
  CheckIcon,
  CloseIcon,
  CopyIcon,
  EyeIcon,
  GlobeIcon,
  LinkIcon,
  LockIcon,
} from '@/components/ui/Icons';
import { ApiError, updateQuizShareSettings } from '@/services/quizApi';
import type { QuizShareState } from '@/types/quiz';
import { cn } from '@/utils/cn';
import { getPublicAppOrigin } from '@/config/runtime';
import { handleLightDismissBackdropClick } from '@/utils/dialogLightDismiss';

export interface ShareableQuizTarget {
  id: string;
  title: string;
  status: QuizStatus;
  visibility: QuizVisibility;
  allowPublicPreview: boolean;
  shareToken: string | null;
}

interface QuizShareModalProps {
  open: boolean;
  quiz: ShareableQuizTarget | null;
  onClose: () => void;
  onUpdated: (share: QuizShareState) => void;
  onOpenPreview: (quizId: string) => void;
}

function legacyCopyText(text: string): boolean {
  const field = Object.assign(document.createElement('textarea'), {
    value: text,
  });
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;inset-block-start:0;opacity:0';
  document.body.append(field);
  field.select();
  try {
    return document.execCommand('copy');
  } finally {
    field.remove();
  }
}

export function QuizShareModal({
  open,
  quiz,
  onClose,
  onUpdated,
  onOpenPreview,
}: QuizShareModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const shareUrlInputId = useId();
  const copyTimerRef = useRef<number | null>(null);
  const lastAnnouncedRef = useRef<string>('');

  const [visibility, setVisibility] = useState<QuizVisibility>('PRIVATE');
  const [allowPublicPreview, setAllowPublicPreview] = useState(true);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [copyAnnouncement, setCopyAnnouncement] = useState('');

  useEffect(() => {
    if (!quiz) return;
    setVisibility(quiz.visibility ?? 'PRIVATE');
    setAllowPublicPreview(
      typeof quiz.allowPublicPreview === 'boolean'
        ? quiz.allowPublicPreview
        : true,
    );
    setShareToken(quiz.shareToken ?? null);
    setError(null);
    setCopyStatus('idle');
    setCopyAnnouncement('');
  }, [quiz]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && quiz) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, quiz]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  if (!open || !quiz) {
    return (
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={onClose}
        onClick={(event) => handleLightDismissBackdropClick(event, dialogRef.current)}
        {...({ closedby: 'any' } as Record<string, string>)}
        className="m-auto w-[min(calc(100vw-2rem),36rem)] rounded-2xl bg-cream-50 border border-cream-300 p-0 text-navy-900 shadow-card"
      />
    );
  }

  const origin = getPublicAppOrigin();

  const shareUrl =
    visibility === 'PRIVATE'
      ? ''
      : shareToken
        ? `${origin}/explore/${quiz.id}?token=${encodeURIComponent(shareToken)}`
        : `${origin}/explore/${quiz.id}`;

  const applyUpdate = async (payload: {
    visibility?: QuizVisibility;
    allowPublicPreview?: boolean;
    action?: 'GENERATE_LINK' | 'REVOKE_LINK';
  }) => {
    setBusy(true);
    setError(null);
    try {
      const { share } = await updateQuizShareSettings(quiz.id, payload);
      setVisibility(share.visibility);
      setAllowPublicPreview(share.allowPublicPreview);
      setShareToken(share.shareToken);
      onUpdated(share);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Paylaşım ayarları güncellenirken bir hata oluştu.',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleCopyShareUrl = async () => {
    if (!shareUrl) return;
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }

    let ok = false;
    try {
      await navigator.clipboard.writeText(shareUrl);
      ok = true;
    } catch {
      ok = legacyCopyText(shareUrl);
    }

    setCopyStatus(ok ? 'copied' : 'failed');
    let msg = ok ? 'Bağlantı kopyalandı' : 'Kopyalama başarısız';
    if (msg === lastAnnouncedRef.current) {
      msg += '\u00A0';
    }
    lastAnnouncedRef.current = msg;
    setCopyAnnouncement(msg);

    copyTimerRef.current = window.setTimeout(() => {
      setCopyStatus('idle');
      setCopyAnnouncement('');
      copyTimerRef.current = null;
    }, 2200);
  };

  const renderVisibilityIcon = (vis: QuizVisibility) => {
    if (vis === 'PRIVATE') return <LockIcon />;
    if (vis === 'UNLISTED') return <LinkIcon />;
    return <GlobeIcon />;
  };

  const isDraft = quiz.status === 'DRAFT';

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => handleLightDismissBackdropClick(event, dialogRef.current)}
      {...({ closedby: 'any' } as Record<string, string>)}
      className="m-auto w-[min(calc(100vw-2rem),38rem)] max-h-[90dvh] overflow-y-auto rounded-2xl bg-cream-50 border border-cream-300 p-6 text-navy-900 shadow-card"
    >
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4 border-b border-cream-300 pb-4">
          <div className="min-w-0">
            <span className="inline-flex items-center rounded-full bg-powder-100 border border-powder-200 px-2.5 py-0.5 text-xs font-semibold text-burgundy-600">
              Paylaşım ve Gizlilik Ayarları
            </span>
            <h2
              id={titleId}
              className="mt-1.5 font-display font-bold text-xl text-navy-900 truncate"
            >
              {quiz.title.trim() || 'Başlıksız Quiz'}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Paylaşım penceresini kapat"
            className="inline-flex items-center justify-center min-w-10 min-h-10 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 text-navy-700 cursor-pointer shrink-0"
          >
            <CloseIcon />
          </button>
        </div>

        {isDraft && (
          <div
            role="status"
            className="rounded-xl bg-powder-100 border border-powder-200 p-3.5 text-xs text-navy-800"
          >
            Bu quiz şu anda <strong>Taslak</strong> durumundadır. Taslak quizler yalnızca Özel olarak saklanabilir. Paylaşıma açmak için önce quizi düzenleyip yayına hazır olarak kaydedin.
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-xl bg-burgundy-50 border border-burgundy-500 p-3.5 text-xs font-semibold text-burgundy-700"
          >
            {error}
          </div>
        )}

        {/* Görünürlük Seçimi */}
        <fieldset className="space-y-2.5" disabled={busy || isDraft}>
          <legend className="text-xs font-bold uppercase tracking-wide text-navy-600">
            Görünürlük Durumu
          </legend>

          <div className="space-y-2">
            {QUIZ_VISIBILITIES.map((optionVis) => {
              const selected = visibility === optionVis;
              return (
                <label
                  key={optionVis}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-colors duration-150',
                    selected
                      ? 'bg-powder-100/70 border-burgundy-600'
                      : 'bg-cream-100 border-cream-300 hover:bg-cream-200/70',
                    (busy || isDraft) && 'opacity-60 cursor-not-allowed',
                  )}
                >
                  <input
                    type="radio"
                    name="share-visibility"
                    value={optionVis}
                    checked={selected}
                    onChange={() => void applyUpdate({ visibility: optionVis })}
                    className="mt-1 accent-burgundy-600"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-display font-bold text-sm text-navy-900">
                      <span className="text-burgundy-600">
                        {renderVisibilityIcon(optionVis)}
                      </span>
                      <span>{QUIZ_VISIBILITY_LABELS[optionVis]}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-navy-600 leading-relaxed">
                      {QUIZ_VISIBILITY_DESCRIPTIONS[optionVis]}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Soruların Önizlenmesine İzin Ver */}
        {visibility !== 'PRIVATE' && (
          <div className="rounded-xl bg-cream-100 border border-cream-300 p-3.5 flex items-start justify-between gap-3">
            <div>
              <label
                htmlFor="share-allow-preview"
                className="font-display font-bold text-sm text-navy-900 cursor-pointer"
              >
                Soruların Önizlenmesine İzin Ver
              </label>
              <p className="mt-0.5 text-xs text-navy-600">
                Diğer öğretmenler quizi kendi kütüphanelerine eklemeden önce soruları inceleyebilir.
              </p>
            </div>
            <input
              id="share-allow-preview"
              type="checkbox"
              disabled={busy}
              checked={allowPublicPreview}
              onChange={(event) =>
                void applyUpdate({ allowPublicPreview: event.target.checked })
              }
              className="mt-1 h-4 w-4 accent-burgundy-600 cursor-pointer"
            />
          </div>
        )}

        {/* Paylaşım Bağlantısı ve Kopyalama */}
        <div className="rounded-xl bg-cream-100 border border-cream-300 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor={shareUrlInputId}
              className="text-xs font-bold uppercase tracking-wide text-navy-700"
            >
              Paylaşım Bağlantısı
            </label>

            {!isDraft && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void applyUpdate({ action: 'GENERATE_LINK' })}
                  className="rounded-lg border border-cream-300 bg-cream-50 hover:bg-cream-200 px-2.5 py-1 text-xs font-semibold text-navy-900 cursor-pointer disabled:opacity-50"
                >
                  {shareToken ? 'Bağlantıyı Yenile' : 'Paylaşım Bağlantısı Oluştur'}
                </button>

                {(visibility !== 'PRIVATE' || shareToken) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void applyUpdate({ action: 'REVOKE_LINK' })}
                    className="rounded-lg border border-burgundy-500/40 bg-burgundy-50 hover:bg-burgundy-100 px-2.5 py-1 text-xs font-semibold text-burgundy-700 cursor-pointer disabled:opacity-50"
                  >
                    Paylaşımı Kapat
                  </button>
                )}
              </div>
            )}
          </div>

          {visibility === 'PRIVATE' ? (
            <p className="text-xs text-navy-600">
              Quiz şu anda <strong>Özel</strong> durumdadır. Paylaşım bağlantısı oluşturmak için yukarıdan &quot;Bağlantıya Özel&quot; veya &quot;Herkese Açık&quot; seçeneğini işaretleyin ya da &quot;Paylaşım Bağlantısı Oluştur&quot; düğmesine tıklayın.
            </p>
          ) : (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                id={shareUrlInputId}
                type="text"
                readOnly
                value={shareUrl}
                aria-label="Paylaşım bağlantısı adresi"
                className="flex-1 min-h-10 rounded-xl border border-cream-300 bg-cream-50 px-3 py-2 text-xs font-mono text-navy-900"
              />

              <span className="relative inline-flex items-center">
                <button
                  type="button"
                  onClick={() => void handleCopyShareUrl()}
                  {...({
                    command: '--copy',
                    commandfor: shareUrlInputId,
                    ...(copyStatus === 'copied' ? { 'data-copied': '' } : {}),
                    ...(copyStatus === 'failed' ? { 'data-failed': '' } : {}),
                  } as Record<string, string>)}
                  className="inline-flex items-center justify-center gap-1.5 min-w-10 min-h-10 rounded-xl bg-burgundy-600 hover:bg-burgundy-700 px-3.5 py-2 text-xs font-semibold text-cream-50 cursor-pointer w-full sm:w-auto"
                >
                  {copyStatus === 'copied' ? (
                    <CheckIcon className="h-4 w-4" />
                  ) : (
                    <CopyIcon className="h-4 w-4" />
                  )}
                  <span>
                    {copyStatus === 'copied'
                      ? 'Kopyalandı'
                      : 'Bağlantıyı Kopyala'}
                  </span>
                </button>
                <span
                  role="status"
                  className={cn(
                    'sr-only',
                    copyStatus !== 'idle' && 'opacity-100',
                  )}
                >
                  {copyAnnouncement}
                </span>
              </span>
            </div>
          )}
        </div>

        {/* Alt eylemler */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-cream-300 pt-4">
          <button
            type="button"
            onClick={() => onOpenPreview(quiz.id)}
            className="inline-flex items-center gap-1.5 min-h-10 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-4 py-2 text-xs sm:text-sm font-semibold text-navy-900 cursor-pointer"
          >
            <EyeIcon />
            <span>Quiz Önizlemesi</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center min-h-10 rounded-xl bg-navy-900 hover:bg-navy-950 px-5 py-2 text-xs sm:text-sm font-semibold text-cream-50 cursor-pointer"
          >
            Tamam
          </button>
        </div>
      </div>
    </dialog>
  );
}
