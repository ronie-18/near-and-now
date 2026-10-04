import { useEffect, useId, useRef, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { IconButton } from './Button';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

const SIZE: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-6xl',
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  size?: ModalSize;
  footer?: ReactNode;
  children?: ReactNode;
  /** Clicking the dark backdrop closes the dialog (default true). */
  closeOnOverlay?: boolean;
  /** Element to focus when the dialog opens; defaults to the panel itself. */
  initialFocusRef?: RefObject<HTMLElement>;
  /** Id of a custom heading when `title` is not used (ConfirmDialog). */
  labelledBy?: string;
  className?: string;
  bodyClassName?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Centered dialog rendered in a portal. Handles Escape, backdrop click, body
 * scroll lock, initial focus and Tab containment. Compose forms inside it
 * and put the action buttons in `footer`.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  children,
  closeOnOverlay = true,
  initialFocusRef,
  labelledBy,
  className,
  bodyClassName,
}: ModalProps) {
  const autoTitleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const mouseDownOnOverlay = useRef(false);

  // Keep the latest onClose without re-running the open/close effect when the
  // parent passes a new function identity on every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const initialFocus = useRef(initialFocusRef);
  initialFocus.current = initialFocusRef;

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      const target = initialFocus.current?.current ?? panelRef.current;
      target?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key === 'Tab' && panelRef.current) {
        const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (focusable.length === 0) {
          event.preventDefault();
          panelRef.current.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || active === panelRef.current)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const titleId = title ? autoTitleId : labelledBy;

  const handleOverlayMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    mouseDownOnOverlay.current = event.target === event.currentTarget;
  };

  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    const startedOnOverlay = mouseDownOnOverlay.current;
    mouseDownOnOverlay.current = false;
    if (closeOnOverlay && startedOnOverlay && event.target === event.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 sm:p-6"
      onMouseDown={handleOverlayMouseDown}
      onClick={handleOverlayClick}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={title && description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn('flex w-full max-h-[90vh] flex-col rounded-lg bg-white shadow-modal focus:outline-none', SIZE[size], className)}
      >
        {title ? (
          <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4">
            <div className="min-w-0">
              <h2 id={autoTitleId} className="text-base font-semibold text-gray-900">
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="mt-1 text-sm text-gray-500">
                  {description}
                </p>
              ) : null}
            </div>
            <IconButton variant="ghost" size="sm" aria-label="Close" onClick={onClose} className="-mr-2 -mt-1 shrink-0">
              <X aria-hidden="true" />
            </IconButton>
          </div>
        ) : null}

        <div className={cn('overflow-y-auto px-6 py-5', bodyClassName)}>{children}</div>

        {footer ? (
          <div className="flex justify-end gap-2 rounded-b-lg border-t border-gray-200 bg-gray-50 px-6 py-4">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
