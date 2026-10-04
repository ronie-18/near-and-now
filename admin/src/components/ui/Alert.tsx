import type { ComponentType, ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '../../utils/cn';
import { IconButton } from './Button';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

export interface AlertProps {
  tone: AlertTone;
  title?: string;
  children?: ReactNode;
  /** Buttons rendered under the message (e.g. a Retry button). */
  actions?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

const TONE: Record<
  AlertTone,
  { box: string; icon: string; body: string; Icon: ComponentType<{ className?: string }>; role: 'alert' | 'status' }
> = {
  info: { box: 'bg-blue-50 border-blue-200 text-blue-800', icon: 'text-blue-600', body: 'text-blue-700', Icon: Info, role: 'status' },
  success: { box: 'bg-green-50 border-green-200 text-green-800', icon: 'text-green-600', body: 'text-green-700', Icon: CheckCircle2, role: 'status' },
  warning: { box: 'bg-amber-50 border-amber-200 text-amber-800', icon: 'text-amber-600', body: 'text-amber-700', Icon: AlertTriangle, role: 'alert' },
  danger: { box: 'bg-red-50 border-red-200 text-red-800', icon: 'text-red-600', body: 'text-red-700', Icon: XCircle, role: 'alert' },
};

/**
 * Inline message block for page-level feedback: load errors (with a retry
 * action), warnings about missing data, confirmations that persist. For
 * transient feedback use `useToast()` instead.
 */
export function Alert({ tone, title, children, actions, onDismiss, className }: AlertProps) {
  const { box, icon, body, Icon, role } = TONE[tone];
  return (
    <div role={role} className={cn('flex gap-3 rounded-md border p-4 text-sm', box, className)}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', icon)} />
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={cn(title && 'mt-1', body)}>{children}</div> : null}
        {actions ? <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {onDismiss ? (
        <IconButton
          variant="ghost"
          size="sm"
          aria-label="Dismiss"
          onClick={onDismiss}
          className={cn('-mr-1.5 -mt-1.5 shrink-0 hover:bg-white/60', icon)}
        >
          <X aria-hidden="true" />
        </IconButton>
      ) : null}
    </div>
  );
}
