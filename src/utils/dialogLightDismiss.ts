import type { MouseEvent as ReactMouseEvent } from 'react';

/**
 * Browser fallback for `<dialog closedby="any">` (e.g. Safari) per light-dismiss spec:
 * closes the modal only when the user clicks directly on the backdrop outside the dialog box.
 */
export function handleLightDismissBackdropClick(
  event: ReactMouseEvent<HTMLDialogElement>,
  dialog: HTMLDialogElement | null,
): void {
  if (!dialog || 'closedBy' in HTMLDialogElement.prototype) return;
  if (event.target !== dialog) return;

  const rect = dialog.getBoundingClientRect();
  const isDialogContent =
    rect.top <= event.clientY &&
    event.clientY <= rect.top + rect.height &&
    rect.left <= event.clientX &&
    event.clientX <= rect.left + rect.width;

  if (!isDialogContent) {
    dialog.close();
  }
}
