import { useEffect, useId, useRef } from 'react';
import { AlertCircleIcon } from '@/components/ui/Icons';
import { cn } from '@/utils/cn';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Vazgeç',
  variant = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleClose = () => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const action = dialog.returnValue;
    dialog.returnValue = '';

    if (action === 'confirm') {
      onConfirm();
    } else {
      onCancel();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClose={handleClose}
      className="m-auto w-[min(calc(100vw-2rem),28rem)] rounded-2xl bg-cream-50 border border-cream-300 p-6 text-navy-900 shadow-card"
    >
      <div className="flex items-start gap-3.5">
        <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-powder-100 border border-powder-200 text-burgundy-600">
          <AlertCircleIcon />
        </span>

        <div className="min-w-0 flex-1">
          <h2
            id={titleId}
            className="font-display font-bold text-lg text-navy-900"
          >
            {title}
          </h2>
          <p
            id={descriptionId}
            className="mt-2 text-sm leading-relaxed text-navy-600"
          >
            {description}
          </p>
        </div>
      </div>

      <form
        method="dialog"
        className="mt-6 flex flex-wrap items-center justify-end gap-3"
      >
        <button
          type="submit"
          value="cancel"
          autoFocus
          disabled={busy}
          className="min-h-10 rounded-xl border border-cream-300 bg-cream-100 hover:bg-cream-200 px-4 py-2 text-sm font-semibold text-navy-900 transition-colors duration-150 cursor-pointer disabled:opacity-60"
        >
          {cancelLabel}
        </button>

        <button
          type="submit"
          value="confirm"
          disabled={busy}
          className={cn(
            'min-h-10 rounded-xl px-4 py-2 text-sm font-semibold text-cream-50 transition-colors duration-150 cursor-pointer disabled:opacity-60',
            variant === 'danger'
              ? 'bg-burgundy-600 hover:bg-burgundy-700'
              : 'bg-navy-900 hover:bg-navy-950',
          )}
        >
          {busy ? 'İşleniyor...' : confirmLabel}
        </button>
      </form>
    </dialog>
  );
}
