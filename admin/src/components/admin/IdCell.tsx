import { useState, type MouseEvent } from 'react';
import { Copy, Check } from 'lucide-react';

const COPY_BUTTON_CLASS =
  'shrink-0 rounded text-gray-400 transition-colors hover:text-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500';

/**
 * Shows a full, un-truncated ID on a single line with a copy button.
 * Standardizes what used to be a mix of 8-char truncated pills (no way to
 * see/copy the real ID) and, on StoresPage, a raw unwrapped UUID that broke
 * onto 4-5 lines and blew up row height.
 */
export default function IdCell({
  id,
  prefix = '',
  wrap = false,
}: {
  id: string;
  prefix?: string;
  /**
   * Let the ID break onto a second line (at its hyphens) instead of always
   * using one line, for tables that need the width for other columns.
   */
  wrap?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: MouseEvent) => {
    // Rows are clickable — never let the copy click open the row.
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can fail (permissions/non-secure context) — non-critical, ignore.
    }
  };

  return (
    <span
      className={
        wrap
          ? 'inline-flex items-start gap-1.5 font-mono text-xs leading-4 text-gray-600'
          : 'inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-xs leading-none text-gray-600'
      }
    >
      {wrap ? (
        <span className="max-w-[19ch] [overflow-wrap:anywhere]">
          {prefix}
          {id}
        </span>
      ) : (
        <>
          {prefix}
          {id}
        </>
      )}
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy ID"
        title="Copy ID"
        className={wrap ? `${COPY_BUTTON_CLASS} mt-0.5` : COPY_BUTTON_CLASS}
      >
        {copied ? (
          <Check size={12} className="text-brand-600" aria-hidden="true" />
        ) : (
          <Copy size={12} aria-hidden="true" />
        )}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? 'ID copied' : ''}
      </span>
    </span>
  );
}
