import type { ComponentType, ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface EmptyStateProps {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  /** Usually a primary Button or LinkButton that creates the first item. */
  action?: ReactNode;
  /** Tighter vertical padding for use inside tables and cards. */
  compact?: boolean;
  className?: string;
}

/**
 * Centred "nothing here" message. Use inside `TableEmptyRow` for empty
 * lists and on its own for empty pages or filtered-out results.
 */
export function EmptyState({ icon: Icon = Inbox, title, description, action, compact = false, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-4 text-center', compact ? 'py-8' : 'py-16', className)}>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-4 text-sm font-medium text-gray-900">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-gray-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
