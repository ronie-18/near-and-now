import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

export interface DescriptionItem {
  label: string;
  value: ReactNode;
  /** Span every column (long addresses, notes). */
  fullWidth?: boolean;
  className?: string;
}

export type DescriptionColumns = 1 | 2 | 3;

export interface DescriptionListProps {
  items: DescriptionItem[];
  columns?: DescriptionColumns;
  className?: string;
}

const COLUMNS: Record<DescriptionColumns, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
};

const FULL_WIDTH: Record<DescriptionColumns, string> = {
  1: '',
  2: 'sm:col-span-2',
  3: 'sm:col-span-2 lg:col-span-3',
};

/**
 * Key/value grid for detail pages (order, customer, store, rider). Empty
 * values render as an em dash so the grid never has holes.
 */
export function DescriptionList({ items, columns = 2, className }: DescriptionListProps) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-5', COLUMNS[columns], className)}>
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} className={cn(item.fullWidth && FULL_WIDTH[columns], item.className)}>
          <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{item.label}</dt>
          <dd className="mt-1 break-words text-sm text-gray-900">
            {item.value === null || item.value === undefined || item.value === '' ? '—' : item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
