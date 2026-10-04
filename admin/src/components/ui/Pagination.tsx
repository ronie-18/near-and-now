import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../utils/cn';
import { formatNumber } from '../../utils/format';
import { IconButton } from './Button';
import { Select } from './Input';

export interface PaginationProps {
  /** 1-based current page; clamped into range before rendering. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
  className?: string;
}

const MAX_PAGE_BUTTONS = 5;

/** The window of up to five page numbers centred on `page`. */
function pageWindow(page: number, totalPages: number): number[] {
  const count = Math.min(MAX_PAGE_BUTTONS, totalPages);
  let start = Math.max(1, page - Math.floor(count / 2));
  start = Math.min(start, totalPages - count + 1);
  return Array.from({ length: count }, (_, i) => start + i);
}

/**
 * Footer bar for paginated tables: "Showing X–Y of N" on the left, page
 * controls on the right. Always renders the summary, hides the numbered
 * buttons when there is only one page.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  pageSizeOptions,
  onPageSizeChange,
  className,
}: PaginationProps) {
  const safeTotal = Math.max(0, Math.floor(total));
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.max(1, Math.ceil(safeTotal / safePageSize));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);

  const start = safeTotal === 0 ? 0 : (current - 1) * safePageSize + 1;
  const end = Math.min(current * safePageSize, safeTotal);

  // When the parent's `page` falls out of range (a filter shrank the list),
  // tell it the page actually shown so its state matches the display. Skipped
  // while `total` is 0 so a page restored from the URL is not reset to 1
  // before the first load completes.
  const onPageChangeRef = useRef(onPageChange);
  onPageChangeRef.current = onPageChange;
  useEffect(() => {
    if (safeTotal > 0 && page !== current) onPageChangeRef.current(current);
  }, [page, current, safeTotal]);

  const goTo = (next: number) => {
    const clamped = Math.min(Math.max(1, next), totalPages);
    if (clamped !== current) onPageChange(clamped);
  };

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 bg-white text-sm text-gray-600',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-4">
        <p className="tabular-nums">
          {safeTotal === 0 ? (
            'No results'
          ) : (
            <>
              Showing <span className="font-medium text-gray-900">{formatNumber(start)}</span>–
              <span className="font-medium text-gray-900">{formatNumber(end)}</span> of{' '}
              <span className="font-medium text-gray-900">{formatNumber(safeTotal)}</span>
            </>
          )}
        </p>

        {pageSizeOptions && pageSizeOptions.length > 0 && onPageSizeChange ? (
          <label className="flex items-center gap-2 text-xs text-gray-500">
            Rows per page
            <Select
              selectSize="sm"
              value={safePageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              containerClassName="w-20"
              aria-label="Rows per page"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </Select>
          </label>
        ) : null}
      </div>

      <div className="flex items-center gap-1">
        <IconButton
          variant="secondary"
          size="sm"
          aria-label="Previous page"
          disabled={current <= 1}
          onClick={() => goTo(current - 1)}
        >
          <ChevronLeft aria-hidden="true" />
        </IconButton>

        {totalPages > 1
          ? pageWindow(current, totalPages).map((n) => {
              const isActive = n === current;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => goTo(n)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={`Page ${n}`}
                  className={cn(
                    'inline-flex h-8 min-w-[2rem] items-center justify-center rounded-md border px-2 text-xs font-medium tabular-nums transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
                    isActive
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
                  )}
                >
                  {n}
                </button>
              );
            })
          : null}

        <IconButton
          variant="secondary"
          size="sm"
          aria-label="Next page"
          disabled={current >= totalPages}
          onClick={() => goTo(current + 1)}
        >
          <ChevronRight aria-hidden="true" />
        </IconButton>
      </div>
    </nav>
  );
}
