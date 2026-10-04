import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

/** White bordered surface. Every block of page content lives in one. */
export function Card({ className, children, ...rest }: CardProps) {
  return (
    <div className={cn('bg-white border border-gray-200 rounded-md', className)} {...rest}>
      {children}
    </div>
  );
}

export interface CardHeaderProps {
  title?: ReactNode;
  description?: ReactNode;
  /** Right-aligned controls (buttons, a Select, a SegmentedControl). */
  actions?: ReactNode;
  className?: string;
  /** Custom content when `title` is not enough; rendered in place of it. */
  children?: ReactNode;
}

/** Card title row with optional description and right-aligned actions. */
export function CardHeader({ title, description, actions, className, children }: CardHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between gap-4 px-5 py-4 border-b border-gray-200', className)}>
      <div className="min-w-0">
        {children ?? (
          <>
            {title ? <h3 className="text-base font-semibold text-gray-900">{title}</h3> : null}
            {description ? <p className="mt-0.5 text-sm text-gray-500">{description}</p> : null}
          </>
        )}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export type CardPadding = 'none' | 'sm' | 'md';

const PADDING: Record<CardPadding, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
};

export interface CardBodyProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
  children?: ReactNode;
}

/** Card content area. Use `padding="none"` when it directly wraps a table. */
export function CardBody({ padding = 'md', className, children, ...rest }: CardBodyProps) {
  return (
    <div className={cn(PADDING[padding], className)} {...rest}>
      {children}
    </div>
  );
}

export interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

/** Grey footer bar for form actions or summary text. */
export function CardFooter({ className, children, ...rest }: CardFooterProps) {
  return (
    <div className={cn('px-5 py-3 border-t border-gray-200 bg-gray-50 rounded-b-md', className)} {...rest}>
      {children}
    </div>
  );
}
