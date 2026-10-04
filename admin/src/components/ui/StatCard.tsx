import type { ComponentType, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Skeleton } from './Spinner';

export type DeltaDirection = 'up' | 'down' | 'flat';

export interface StatDelta {
  value: string;
  direction: DeltaDirection;
  label?: string;
}

export interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ComponentType<{ className?: string }>;
  /** Only pass when backed by a real comparison; never fabricate trends. */
  delta?: StatDelta;
  /** Makes the whole card a link. */
  to?: string;
  /** Makes the whole card a button (e.g. a quick filter). */
  onClick?: () => void;
  /** Highlights the card when it acts as the selected filter. */
  active?: boolean;
  loading?: boolean;
  className?: string;
}

const DELTA: Record<DeltaDirection, { className: string; Icon: ComponentType<{ className?: string }> }> = {
  up: { className: 'text-green-700', Icon: ArrowUpRight },
  down: { className: 'text-red-700', Icon: ArrowDownRight },
  flat: { className: 'text-gray-500', Icon: Minus },
};

/**
 * Key figure tile for dashboards and list pages. Shows a label, a large
 * number and an optional icon, hint or real delta. Pass `to` or `onClick`
 * to make it navigable.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  delta,
  to,
  onClick,
  active = false,
  loading = false,
  className,
}: StatCardProps) {
  const interactive = Boolean(to || onClick);

  const classes = cn(
    'block w-full rounded-md border bg-white p-5 text-left transition-colors',
    active ? 'border-brand-500 ring-1 ring-brand-500' : 'border-gray-200',
    interactive && 'hover:border-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
    className,
  );

  const content = (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        {/* Labels wrap rather than truncate: six-column grids leave ~180px per
            card and "Pending approval" must stay readable. */}
        <p className="text-sm leading-5 text-gray-500">{label}</p>
        {loading ? (
          <Skeleton className="mt-2 h-7 w-24" />
        ) : (
          <p className="mt-1 text-2xl font-semibold text-gray-900 tabular-nums">{value}</p>
        )}
        {!loading && (delta || hint) ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs">
            {delta ? <DeltaText delta={delta} /> : null}
            {hint ? <span className="text-gray-500">{hint}</span> : null}
          </div>
        ) : null}
      </div>
      {Icon ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600">
          <Icon className="h-5 w-5" />
        </span>
      ) : null}
    </div>
  );

  if (to) {
    return (
      <Link to={to} className={classes} aria-current={active ? 'true' : undefined}>
        {content}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes} aria-pressed={active}>
        {content}
      </button>
    );
  }

  return <div className={classes}>{content}</div>;
}

function DeltaText({ delta }: { delta: StatDelta }) {
  const { className, Icon } = DELTA[delta.direction];
  return (
    <span className={cn('inline-flex items-center gap-0.5 font-medium tabular-nums', className)}>
      <Icon className="h-3.5 w-3.5" />
      {delta.value}
      {delta.label ? <span className="ml-1 font-normal text-gray-500">{delta.label}</span> : null}
    </span>
  );
}

export type StatGridColumns = 2 | 3 | 4 | 5 | 6;

const GRID_COLUMNS: Record<StatGridColumns, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 xl:grid-cols-3',
  4: 'sm:grid-cols-2 xl:grid-cols-4',
  5: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
  6: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6',
};

export interface StatGridProps {
  columns?: StatGridColumns;
  className?: string;
  children: ReactNode;
}

/** Responsive grid for a row of `StatCard`s (default four across). */
export function StatGrid({ columns = 4, className, children }: StatGridProps) {
  return <div className={cn('grid gap-4', GRID_COLUMNS[columns], className)}>{children}</div>;
}
