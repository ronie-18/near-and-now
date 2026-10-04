import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '../../utils/cn';
import { Skeleton } from './Spinner';

export type CellAlign = 'left' | 'right' | 'center';

const ALIGN: Record<CellAlign, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

export interface TableContainerProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

/**
 * Bordered, horizontally scrollable wrapper for `Table`. When the table sits
 * inside a `Card`, pass `className="border-0 rounded-none"`.
 */
export function TableContainer({ className, children, ...rest }: TableContainerProps) {
  return (
    <div className={cn('overflow-x-auto rounded-md border border-gray-200 bg-white', className)} {...rest}>
      {children}
    </div>
  );
}

export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  children?: ReactNode;
}

/** The `<table>` element with the shared typography and dividers. */
export function Table({ className, children, ...rest }: TableProps) {
  return (
    <table className={cn('min-w-full divide-y divide-gray-200 text-sm', className)} {...rest}>
      {children}
    </table>
  );
}

export interface THeadProps extends HTMLAttributes<HTMLTableSectionElement> {
  children?: ReactNode;
}

/** Grey header band; put `Th` cells inside a `Tr`. */
export function THead({ className, children, ...rest }: THeadProps) {
  return (
    <thead className={cn('bg-gray-50', className)} {...rest}>
      {children}
    </thead>
  );
}

export interface TBodyProps extends HTMLAttributes<HTMLTableSectionElement> {
  children?: ReactNode;
}

/** Table body with row dividers. */
export function TBody({ className, children, ...rest }: TBodyProps) {
  return (
    <tbody className={cn('divide-y divide-gray-200 bg-white', className)} {...rest}>
      {children}
    </tbody>
  );
}

export interface TrProps extends HTMLAttributes<HTMLTableRowElement> {
  /** Row navigates somewhere on click: adds hover and pointer. */
  clickable?: boolean;
  /** Row is the current selection: brand tint. */
  selected?: boolean;
  children?: ReactNode;
}

/** Table row. Pass `onClick` with `clickable` for row navigation. */
export function Tr({ clickable = false, selected = false, className, children, ...rest }: TrProps) {
  return (
    <tr
      className={cn(
        'transition-colors',
        clickable && 'cursor-pointer hover:bg-gray-50',
        selected && 'bg-brand-50',
        className,
      )}
      {...rest}
    >
      {children}
    </tr>
  );
}

export interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  align?: CellAlign;
  children?: ReactNode;
}

/** Column header cell: small uppercase grey label. */
export function Th({ align = 'left', className, children, ...rest }: ThProps) {
  return (
    <th
      scope="col"
      className={cn(
        'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap',
        ALIGN[align],
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  align?: CellAlign;
  /** Secondary information: grey text. */
  muted?: boolean;
  nowrap?: boolean;
  children?: ReactNode;
}

/** Body cell. Use `align="right"` plus `tabular-nums` for money and counts. */
export function Td({ align = 'left', muted = false, nowrap = false, className, children, ...rest }: TdProps) {
  return (
    <td
      className={cn(
        'px-4 py-3 align-middle',
        muted ? 'text-gray-500' : 'text-gray-700',
        nowrap && 'whitespace-nowrap',
        ALIGN[align],
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

export interface TableEmptyRowProps {
  colSpan: number;
  children: ReactNode;
}

/** Single full-width row that hosts an `EmptyState` when there is no data. */
export function TableEmptyRow({ colSpan, children }: TableEmptyRowProps) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-2">
        {children}
      </td>
    </tr>
  );
}

export interface TableSkeletonRowsProps {
  rows: number;
  cols: number;
}

// Varying widths keep skeleton rows from looking like a solid grey block.
const SKELETON_WIDTHS = ['w-32', 'w-20', 'w-40', 'w-16', 'w-24', 'w-28'];

/** Placeholder rows while a list loads; match `cols` to the header. */
export function TableSkeletonRows({ rows, cols }: TableSkeletonRowsProps) {
  const rowCount = Math.max(0, Math.floor(rows));
  const colCount = Math.max(1, Math.floor(cols));
  return (
    <>
      {Array.from({ length: rowCount }, (_, r) => (
        <tr key={r} aria-hidden="true">
          {Array.from({ length: colCount }, (_, c) => (
            <td key={c} className="px-4 py-3">
              <Skeleton className={cn('h-4 max-w-full', SKELETON_WIDTHS[(r + c) % SKELETON_WIDTHS.length])} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
