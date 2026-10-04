import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { ConfirmDialog, type ConfirmTone } from '../components/ui/ConfirmDialog';

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface ConfirmProviderProps {
  children: ReactNode;
}

/**
 * Mount once in App.tsx. Hosts a single ConfirmDialog and hands out
 * `useConfirm()`, the promise-based replacement for `window.confirm`.
 */
export function ConfirmProvider({ children }: ConfirmProviderProps) {
  const [request, setRequest] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setRequest(null);
    resolve?.(value);
  }, []);

  const confirm = useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve) => {
        // A second request while one is open supersedes it; the first caller
        // gets `false`, exactly as if the dialog had been dismissed.
        resolverRef.current?.(false);
        resolverRef.current = resolve;
        setRequest(options);
      }),
    [],
  );

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={request !== null}
        title={request?.title ?? ''}
        message={request?.message ?? null}
        confirmLabel={request?.confirmLabel}
        cancelLabel={request?.cancelLabel}
        tone={request?.tone}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmContext.Provider>
  );
}

/**
 * `const confirm = useConfirm(); if (await confirm({ title, message, tone: 'danger' })) { … }`
 * Resolves `true` on confirm and `false` on cancel, Escape or backdrop click.
 * The caller performs the action afterwards and reports via `useToast()`.
 */
export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    throw new Error('useConfirm must be used inside <ConfirmProvider>');
  }
  return confirm;
}
