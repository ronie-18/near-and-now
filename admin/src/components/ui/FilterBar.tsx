import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

export interface FilterBarProps {
  children: ReactNode;
  /** Right-aligned controls (Refresh, Export, Add). */
  actions?: ReactNode;
  className?: string;
}

/**
 * Toolbar above a table: SearchInput and Select filters on the left,
 * optional action buttons pushed to the right. Sits directly inside a Card
 * above `TableContainer`.
 */
export function FilterBar({ children, actions, className }: FilterBarProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-4 py-3', className)}>
      {children}
      {actions ? <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
