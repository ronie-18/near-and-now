import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

export type TooltipSide = 'top' | 'right' | 'bottom' | 'left';

export interface TooltipProps {
  content: string;
  side?: TooltipSide;
  className?: string;
  children: ReactNode;
}

// The positioning layer is a flex box the size of the trigger's edge, so the
// bubble centres itself without transforms (and may overflow both sides).
const SIDE: Record<TooltipSide, string> = {
  top: 'bottom-full inset-x-0 mb-1.5 justify-center',
  bottom: 'top-full inset-x-0 mt-1.5 justify-center',
  left: 'right-full inset-y-0 mr-1.5 items-center',
  right: 'left-full inset-y-0 ml-1.5 items-center',
};

/**
 * Pure-CSS hover/focus tooltip for icon buttons and collapsed sidebar
 * items. Keep `content` to a few words; it never wraps. Uses a named group
 * so hovering an unrelated ancestor `.group` (a table row) does not show it.
 */
export function Tooltip({ content, side = 'top', className, children }: TooltipProps) {
  if (!content) return <>{children}</>;
  return (
    <span className={cn('group/tooltip relative inline-flex', className)}>
      {children}
      <span
        className={cn(
          'pointer-events-none absolute z-50 flex invisible group-hover/tooltip:visible group-focus-within/tooltip:visible',
          SIDE[side],
        )}
      >
        <span role="tooltip" className="whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-popover">
          {content}
        </span>
      </span>
    </span>
  );
}
