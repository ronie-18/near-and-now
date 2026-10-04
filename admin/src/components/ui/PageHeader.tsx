import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface Breadcrumb {
  label: string;
  to?: string;
}

export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Right-aligned buttons; wrap in a fragment, spacing is handled here. */
  actions?: ReactNode;
  breadcrumbs?: Breadcrumb[];
  /** Renders a "Back" link above the title (detail pages). */
  backTo?: string;
  backLabel?: string;
  className?: string;
  /** Extra row under the title, e.g. `Tabs` or a status line. */
  children?: ReactNode;
}

/**
 * Top of every page: title, optional description, breadcrumbs or back link,
 * and the primary actions. Pages should not render their own `<h1>`.
 */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  backTo,
  backLabel = 'Back',
  className,
  children,
}: PageHeaderProps) {
  return (
    <div className={cn('mb-6', className)}>
      {backTo ? (
        <Link
          to={backTo}
          className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          {backLabel}
        </Link>
      ) : null}

      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-sm text-gray-500">
          {breadcrumbs.map((crumb, index) => {
            const isLast = index === breadcrumbs.length - 1;
            return (
              <Fragment key={`${crumb.label}-${index}`}>
                {index > 0 ? <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden="true" /> : null}
                {crumb.to && !isLast ? (
                  <Link to={crumb.to} className="transition-colors hover:text-gray-900">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className={cn(isLast && 'font-medium text-gray-900')} aria-current={isLast ? 'page' : undefined}>
                    {crumb.label}
                  </span>
                )}
              </Fragment>
            );
          })}
        </nav>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
          {description ? <p className="mt-1 text-sm text-gray-500">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>

      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
