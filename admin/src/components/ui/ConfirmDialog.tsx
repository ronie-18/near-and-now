import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { Modal } from './Modal';

export type ConfirmTone = 'danger' | 'primary';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  /** Externally controlled busy state (the confirm button spins, closing is blocked). */
  loading?: boolean;
  /** May return a promise; the dialog shows a spinner until it settles. */
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Small yes/no dialog for destructive or irreversible actions. Prefer
 * `useConfirm()` from ConfirmContext, which renders this for you and returns
 * a promise; use the component directly only for custom flows.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) setBusy(false);
  }, [open]);

  const isLoading = loading || busy;

  const handleConfirm = async () => {
    const result = onConfirm();
    if (result && typeof (result as Promise<void>).then === 'function') {
      setBusy(true);
      try {
        await result;
      } finally {
        if (mounted.current) setBusy(false);
      }
    }
  };

  const handleCancel = () => {
    if (!isLoading) onCancel();
  };

  return (
    <Modal
      open={open}
      onClose={handleCancel}
      size="sm"
      closeOnOverlay={!isLoading}
      initialFocusRef={cancelRef}
      labelledBy={titleId}
      footer={
        <>
          <Button ref={cancelRef} variant="secondary" onClick={handleCancel} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={handleConfirm} loading={isLoading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-4">
        {tone === 'danger' ? (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-red-50 text-red-600">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-base font-semibold text-gray-900">
            {title}
          </h2>
          <div className="mt-2 text-sm text-gray-600">{message}</div>
        </div>
      </div>
    </Modal>
  );
}
