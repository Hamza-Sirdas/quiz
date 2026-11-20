import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { motion } from 'motion/react';
import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon } from '@/components/ui/Icons';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { cn } from '@/utils/cn';

export interface SortableItemControls {
  index: number;
  total: number;
  isDragging: boolean;
  isKeyboardGrabbed: boolean;
}

interface SortableListProps<T> {
  items: readonly T[];
  getId: (item: T) => string;
  getLabel: (item: T, index: number) => string;
  onReorder: (nextItems: T[]) => void;
  renderContent: (item: T, controls: SortableItemControls) => ReactNode;
  disabled?: boolean;
  className?: string;
  itemClassName?: (item: T, controls: SortableItemControls) => string;
  ariaLabel?: string;
  compactControls?: boolean;
}

interface ActivePointerDrag {
  id: string;
  originIndex: number;
  pointerId: number;
  startClientY: number;
  containerTop: number;
  containerBottom: number;
  midpoints: number[];
  slotEdges: number[];
}

export function SortableList<T>({
  items,
  getId,
  getLabel,
  onReorder,
  renderContent,
  disabled = false,
  className,
  itemClassName,
  ariaLabel = 'Sıralanabilir liste',
  compactControls = false,
}: SortableListProps<T>) {
  const reducedMotion = usePrefersReducedMotion();
  const listRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const handleRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const upBtnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const downBtnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const dragRef = useRef<ActivePointerDrag | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [dropSlot, setDropSlot] = useState<number | null>(null);
  const [dropIndicatorY, setDropIndicatorY] = useState<number | null>(null);

  const [keyboardGrab, setKeyboardGrab] = useState<{
    id: string;
    originalOrderIds: string[];
  } | null>(null);
  const ignoreBlurRef = useRef(false);

  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const announceOnce = (message: string) => {
    setLiveAnnouncement('');
    window.requestAnimationFrame(() => {
      setLiveAnnouncement(message);
    });
  };

  const cleanupPointerDrag = () => {
    dragRef.current = null;
    setDraggingId(null);
    setDragOffsetY(0);
    setDropSlot(null);
    setDropIndicatorY(null);
    document.documentElement.classList.remove('is-dragging-sortable');
  };

  useEffect(() => {
    return () => {
      document.documentElement.classList.remove('is-dragging-sortable');
    };
  }, []);

  useEffect(() => {
    if (!draggingId) return;

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        const originId = dragRef.current?.id;
        cleanupPointerDrag();
        announceOnce('Sürükleyerek sıralama iptal edildi.');
        if (originId) {
          window.requestAnimationFrame(() => {
            handleRefs.current.get(originId)?.focus({ preventScroll: true });
          });
        }
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [draggingId]);

  const moveItemToIndex = (
    fromIndex: number,
    toIndex: number,
    focusTarget: 'handle' | 'up' | 'down',
  ) => {
    if (
      disabled ||
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= items.length ||
      toIndex >= items.length
    ) {
      return;
    }

    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    if (!moved) return;
    next.splice(toIndex, 0, moved);

    const movedId = getId(moved);
    const movedLabel = getLabel(moved, fromIndex);

    ignoreBlurRef.current = true;
    onReorder(next);
    announceOnce(`${movedLabel}, ${toIndex + 1}. sıraya taşındı.`);

    window.requestAnimationFrame(() => {
      const li = itemRefs.current.get(movedId);
      li?.scrollIntoView({ block: 'nearest', inline: 'nearest' });

      if (focusTarget === 'handle') {
        handleRefs.current.get(movedId)?.focus({ preventScroll: true });
      } else if (focusTarget === 'up') {
        if (toIndex === 0) {
          downBtnRefs.current.get(movedId)?.focus({ preventScroll: true });
        } else {
          upBtnRefs.current.get(movedId)?.focus({ preventScroll: true });
        }
      } else {
        if (toIndex === next.length - 1) {
          upBtnRefs.current.get(movedId)?.focus({ preventScroll: true });
        } else {
          downBtnRefs.current.get(movedId)?.focus({ preventScroll: true });
        }
      }

      window.setTimeout(() => {
        ignoreBlurRef.current = false;
      }, 30);
    });
  };

  const handlePointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
    itemId: string,
    index: number,
  ) => {
    if (disabled || items.length < 2) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (dragRef.current) return;

    const listEl = listRef.current;
    if (!listEl) return;

    const containerRect = listEl.getBoundingClientRect();
    const rects = items.map((entry) => {
      const el = itemRefs.current.get(getId(entry));
      return el ? el.getBoundingClientRect() : null;
    });

    if (rects.some((r) => r === null)) return;

    const validRects = rects as DOMRect[];
    const midpoints = validRects.map((r) => r.top + r.height / 2);
    const slotEdges: number[] = [];

    for (let i = 0; i <= validRects.length; i += 1) {
      if (i === 0) {
        slotEdges.push(validRects[0]!.top - containerRect.top);
      } else if (i === validRects.length) {
        slotEdges.push(validRects[validRects.length - 1]!.bottom - containerRect.top);
      } else {
        const prevBottom = validRects[i - 1]!.bottom;
        const nextTop = validRects[i]!.top;
        slotEdges.push((prevBottom + nextTop) / 2 - containerRect.top);
      }
    }

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Sentetik test ortamlarında pointer capture desteklenmeyebilir.
    }

    document.documentElement.classList.add('is-dragging-sortable');

    dragRef.current = {
      id: itemId,
      originIndex: index,
      pointerId: event.pointerId,
      startClientY: event.clientY,
      containerTop: containerRect.top,
      containerBottom: containerRect.bottom,
      midpoints,
      slotEdges,
    };

    setDraggingId(itemId);
    setDragOffsetY(0);
    setDropSlot(null);
    setDropIndicatorY(null);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const active = dragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;

    setDragOffsetY(event.clientY - active.startClientY);

    const clampedY = Math.max(
      active.containerTop,
      Math.min(active.containerBottom, event.clientY),
    );

    let nextSlot = active.midpoints.length;
    for (let i = 0; i < active.midpoints.length; i += 1) {
      if (clampedY < active.midpoints[i]!) {
        nextSlot = i;
        break;
      }
    }

    if (nextSlot === active.originIndex || nextSlot === active.originIndex + 1) {
      setDropSlot(null);
      setDropIndicatorY(null);
    } else {
      setDropSlot(nextSlot);
      setDropIndicatorY(active.slotEdges[nextSlot] ?? null);
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const active = dragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;

    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // yoksay
    }

    const chosenSlot = dropSlot;
    const originIdx = active.originIndex;
    const draggedId = active.id;

    cleanupPointerDrag();

    if (chosenSlot !== null) {
      const targetIndex = chosenSlot > originIdx ? chosenSlot - 1 : chosenSlot;
      if (targetIndex !== originIdx) {
        const next = [...items];
        const [moved] = next.splice(originIdx, 1);
        if (moved) {
          next.splice(targetIndex, 0, moved);
          onReorder(next);
          announceOnce(`${getLabel(moved, originIdx)}, ${targetIndex + 1}. sıraya taşındı.`);
          window.requestAnimationFrame(() => {
            itemRefs.current
              .get(draggedId)
              ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          });
        }
      }
    }
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const active = dragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    cleanupPointerDrag();
    announceOnce('Sürükleme iptal edildi.');
  };

  const handleKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    item: T,
    index: number,
  ) => {
    if (disabled || items.length < 2) return;
    const itemId = getId(item);
    const grabbedHere = keyboardGrab?.id === itemId;

    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (grabbedHere) {
        setKeyboardGrab(null);
        announceOnce(
          `${getLabel(item, index)} ${index + 1}. sıraya bırakıldı.`,
        );
      } else {
        setKeyboardGrab({
          id: itemId,
          originalOrderIds: items.map((entry) => getId(entry)),
        });
        announceOnce(
          `${getLabel(item, index)} tutuldu (${index + 1}. sıra). Yukarı veya aşağı ok tuşlarıyla taşıyın, Space ile bırakın, Escape ile iptal edin.`,
        );
      }
      return;
    }

    if (!grabbedHere) return;

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (index > 0) {
        moveItemToIndex(index, index - 1, 'handle');
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (index < items.length - 1) {
        moveItemToIndex(index, index + 1, 'handle');
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      const mapById = new Map(items.map((entry) => [getId(entry), entry]));
      const restored = keyboardGrab.originalOrderIds
        .map((id) => mapById.get(id))
        .filter((entry): entry is T => Boolean(entry));
      setKeyboardGrab(null);
      if (restored.length === items.length) {
        onReorder(restored);
      }
      announceOnce(`${getLabel(item, index)} için sıralama iptal edildi.`);
      window.requestAnimationFrame(() => {
        handleRefs.current.get(itemId)?.focus({ preventScroll: true });
      });
    }
  };

  return (
    <div className="relative">
      <p role="status" className="sr-only">
        {liveAnnouncement}
      </p>

      <ul
        ref={listRef}
        aria-label={ariaLabel}
        className={cn('relative space-y-2.5', className)}
      >
        {items.map((item, idx) => {
          const id = getId(item);
          const isDragging = draggingId === id;
          const isKeyboardGrabbed = keyboardGrab?.id === id;
          const label = getLabel(item, idx);
          const controls: SortableItemControls = {
            index: idx,
            total: items.length,
            isDragging,
            isKeyboardGrabbed,
          };

          return (
            <motion.li
              key={id}
              data-sortable-id={id}
              ref={(el) => {
                if (el) {
                  itemRefs.current.set(id, el);
                } else {
                  itemRefs.current.delete(id);
                }
              }}
              layout={!reducedMotion && draggingId === null}
              transition={
                reducedMotion
                  ? { duration: 0 }
                  : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }
              }
              style={
                isDragging
                  ? {
                      transform: `translate3d(0, ${dragOffsetY}px, 0) scale(1.01)`,
                      zIndex: 20,
                      position: 'relative',
                    }
                  : undefined
              }
              className={cn(
                'rounded-xl border p-2.5 transition-colors duration-150',
                isDragging || isKeyboardGrabbed
                  ? 'shadow-card ring-2 ring-burgundy-600/35 bg-powder-50 border-burgundy-600'
                  : 'bg-cream-100 border-cream-300',
                itemClassName?.(item, controls),
              )}
            >
              <div className="flex items-start gap-2">
                {items.length > 1 && (
                  <button
                    type="button"
                    ref={(el) => {
                      if (el) handleRefs.current.set(id, el);
                      else handleRefs.current.delete(id);
                    }}
                    disabled={disabled}
                    aria-pressed={isKeyboardGrabbed}
                    aria-label={`${label} sürükle veya Space ile sırala (${idx + 1}/${items.length})`}
                    onPointerDown={(e) => handlePointerDown(e, id, idx)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerCancel}
                    onLostPointerCapture={() => {
                      if (dragRef.current?.id === id) {
                        cleanupPointerDrag();
                      }
                    }}
                    onKeyDown={(e) => handleKeyDown(e, item, idx)}
                    onBlur={() => {
                      if (!ignoreBlurRef.current && isKeyboardGrabbed) {
                        setKeyboardGrab(null);
                      }
                    }}
                    className={cn(
                      'sortable-handle mt-0.5 inline-flex shrink-0 items-center justify-center rounded-lg border transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed',
                      compactControls ? 'h-8 w-7' : 'h-9 w-8',
                      isKeyboardGrabbed || isDragging
                        ? 'bg-burgundy-600 border-burgundy-700 text-cream-50'
                        : 'bg-cream-50 border-cream-300 text-navy-600 hover:bg-powder-100 hover:text-navy-900',
                    )}
                  >
                    <GripVerticalIcon className="h-4 w-4" />
                  </button>
                )}

                <div className="flex-1 min-w-0">{renderContent(item, controls)}</div>

                {items.length > 1 && (
                  <div className="flex items-center gap-1 shrink-0 pt-0.5">
                    <button
                      type="button"
                      ref={(el) => {
                        if (el) upBtnRefs.current.set(id, el);
                        else upBtnRefs.current.delete(id);
                      }}
                      disabled={disabled || idx === 0}
                      onClick={() => moveItemToIndex(idx, idx - 1, 'up')}
                      aria-label={`${label} yukarı taşı`}
                      className={cn(
                        'inline-flex items-center justify-center rounded-lg border border-cream-300 bg-cream-50 text-navy-700 hover:bg-cream-200 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed',
                        compactControls ? 'h-8 w-8' : 'h-9 w-9',
                      )}
                    >
                      <ArrowUpIcon />
                    </button>
                    <button
                      type="button"
                      ref={(el) => {
                        if (el) downBtnRefs.current.set(id, el);
                        else downBtnRefs.current.delete(id);
                      }}
                      disabled={disabled || idx === items.length - 1}
                      onClick={() => moveItemToIndex(idx, idx + 1, 'down')}
                      aria-label={`${label} aşağı taşı`}
                      className={cn(
                        'inline-flex items-center justify-center rounded-lg border border-cream-300 bg-cream-50 text-navy-700 hover:bg-cream-200 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed',
                        compactControls ? 'h-8 w-8' : 'h-9 w-9',
                      )}
                    >
                      <ArrowDownIcon />
                    </button>
                  </div>
                )}
              </div>

              {isKeyboardGrabbed && (
                <p
                  aria-hidden="true"
                  className="mt-1.5 pl-9 text-[11px] font-semibold text-burgundy-700"
                >
                  Ok tuşları: taşı · Space: bırak · Esc: iptal
                </p>
              )}
            </motion.li>
          );
        })}

        {draggingId && dropIndicatorY !== null && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1 right-1 z-30 flex items-center"
            style={{ top: `${dropIndicatorY - 2}px` }}
          >
            <span className="h-2.5 w-2.5 rounded-full bg-burgundy-600 -ml-0.5 shrink-0" />
            <span className="h-0.5 w-full bg-burgundy-600 rounded-full" />
          </div>
        )}
      </ul>
    </div>
  );
}
