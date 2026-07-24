import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

/**
 * Shows a full, un-truncated ID on a single line with a copy button.
 * Standardizes what used to be a mix of 8-char truncated pills (no way to
 * see/copy the real ID) and, on StoresPage, a raw unwrapped UUID that broke
 * onto 4-5 lines and blew up row height.
 */
export default function IdCell({ id, prefix = '' }: { id: string; prefix?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
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
    <span className="inline-flex items-center gap-1 font-mono text-[11px] leading-none text-gray-400 whitespace-nowrap">
      {prefix}
      {id}
      <button
        type="button"
        onClick={handleCopy}
        title="Copy ID"
        className="text-gray-300 hover:text-emerald-600 transition-colors shrink-0"
      >
        {copied ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
      </button>
    </span>
  );
}
