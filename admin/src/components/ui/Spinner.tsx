import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';

export type SpinnerSize = 'sm' | 'md' | 'lg';

const SPINNER_SIZE: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};

export interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
  label?: string;
}

/** Inline loading indicator (16/24/32px). Use inside buttons or next to text. */
export function Spinner({ size = 'md', className, label = 'Loading' }: SpinnerProps) {
  return (
    <Loader2
      role="status"
      aria-label={label}
      className={cn('animate-spin text-brand-600', SPINNER_SIZE[size], className)}
    />
  );
}

export interface PageLoaderProps {
  label?: string;
  className?: string;
}

/** Full-area loader for Suspense fallbacks, auth checks and first page loads. */
export function PageLoader({ label, className }: PageLoaderProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-24', className)}>
      <Spinner size="md" label={label ?? 'Loading'} />
      {label ? <p className="text-sm text-gray-500">{label}</p> : null}
    </div>
  );
}

export interface SkeletonProps {
  className?: string;
}

/**
 * Grey placeholder block shown while data loads. Size it with `className`
 * (e.g. `h-4 w-32`). This is the only place `animate-pulse` is allowed.
 */
export function Skeleton({ className }: SkeletonProps) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded bg-gray-200', className)} />;
}
