import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { Badge } from './Badge';
import { formatNumber } from '../../utils/format';

export interface TabItem<T extends string = string> {
  value: T;
  label: string;
  count?: number;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  items: TabItem<T>[];
  className?: string;
  'aria-label'?: string;
}

/**
 * Underline tabs for switching views of the same data (Pending / Approved /
 * All). Generic over the value union so `onChange` stays typed.
 */
export function Tabs<T extends string = string>({ value, onChange, items, className, 'aria-label': ariaLabel }: TabsProps<T>) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn('flex gap-6 overflow-x-auto border-b border-gray-200', className)}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={cn(
              '-mb-px inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium whitespace-nowrap transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 rounded-sm',
              'disabled:cursor-not-allowed disabled:opacity-50',
              active
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
            )}
          >
            {item.icon ? (
              <span className="inline-flex shrink-0 [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">
                {item.icon}
              </span>
            ) : null}
            {item.label}
            {typeof item.count === 'number' ? (
              <Badge tone="neutral" size="sm" className="tabular-nums">
                {formatNumber(item.count)}
              </Badge>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export interface SegmentedControlItem<T extends string = string> {
  value: T;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  items: SegmentedControlItem<T>[];
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
}

const SEGMENT_SIZE = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-8 px-3 text-sm',
};

/**
 * Bordered button group for small, mutually exclusive choices such as a
 * 7d / 30d / 90d range picker. Use `Tabs` for switching page content.
 */
export function SegmentedControl<T extends string = string>({
  value,
  onChange,
  items,
  size = 'sm',
  className,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn('inline-flex rounded-md border border-gray-300 bg-white p-0.5', className)}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded font-medium whitespace-nowrap transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
              'disabled:cursor-not-allowed disabled:opacity-50',
              SEGMENT_SIZE[size],
              active ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:text-gray-900',
            )}
          >
            {item.icon ? (
              <span className="inline-flex shrink-0 [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">
                {item.icon}
              </span>
            ) : null}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
