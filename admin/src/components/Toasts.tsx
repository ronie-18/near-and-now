import type { ComponentType } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useToast, type ToastType } from '../context/ToastContext';
import { IconButton } from './ui';

const TONE: Record<ToastType, { border: string; icon: string; Icon: ComponentType<{ className?: string }> }> = {
  success: { border: 'border-l-green-600', icon: 'text-green-600', Icon: CheckCircle2 },
  error: { border: 'border-l-red-600', icon: 'text-red-600', Icon: XCircle },
  warning: { border: 'border-l-amber-500', icon: 'text-amber-500', Icon: AlertTriangle },
  info: { border: 'border-l-brand-600', icon: 'text-brand-600', Icon: Info },
};

// Renders whatever ToastProvider's showToast() calls produce.
// The context previously had no visual consumer anywhere — calling
// showToast() updated state but nothing ever displayed it.
//
// The live region is always mounted (even when empty) so screen readers pick
// up new toasts; `pointer-events-none` keeps the empty region from blocking
// clicks on the header beneath it. z-[100] must stay above Modal (z-50) and
// the sidebar (z-50).
export function Toasts() {
  const { toasts, removeToast } = useToast();

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed right-4 top-4 z-[100] w-full max-w-sm space-y-2"
    >
      {toasts.map((toast) => {
        const { border, icon, Icon } = TONE[toast.type];
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-md border border-gray-200 border-l-4 bg-white p-4 shadow-popover ${border}`}
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${icon}`} aria-hidden="true" />
            <p className="min-w-0 flex-1 break-words text-sm text-gray-800">{toast.message}</p>
            <IconButton
              variant="ghost"
              size="sm"
              aria-label="Dismiss"
              onClick={() => removeToast(toast.id)}
              className="-mr-2 -mt-2 shrink-0"
            >
              <X aria-hidden="true" />
            </IconButton>
          </div>
        );
      })}
    </div>
  );
}
