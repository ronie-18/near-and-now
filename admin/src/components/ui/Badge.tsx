import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  tone?: BadgeTone;
  /** Leading coloured dot; useful when several badges sit in one column. */
  dot?: boolean;
  size?: BadgeSize;
  className?: string;
  title?: string;
  children: ReactNode;
}

export const BADGE_TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-gray-100 text-gray-700',
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-green-50 text-green-700',
  warning: 'bg-amber-50 text-amber-800',
  danger: 'bg-red-50 text-red-700',
  info: 'bg-blue-50 text-blue-700',
};

const BADGE_SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-px text-xs',
  md: 'px-2 py-0.5 text-xs',
};

/**
 * Small tonal label for categories, counts and states. For domain statuses
 * (orders, payments, verification, roles) use `StatusBadge`, which picks the
 * tone and label for you.
 */
export function Badge({ tone = 'neutral', dot = false, size = 'md', className, title, children }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded font-medium whitespace-nowrap',
        BADGE_TONE_CLASSES[tone],
        BADGE_SIZE_CLASSES[size],
        className,
      )}
    >
      {dot ? <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
