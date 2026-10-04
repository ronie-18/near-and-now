/**
 * Shared display formatting for the admin panel. Pages should use these
 * instead of ad-hoc toLocaleString()/toFixed() so money, counts and dates
 * read the same everywhere.
 */

const inrWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const inrPaise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrCompact = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const number = new Intl.NumberFormat('en-IN');

function toNumber(value: unknown): number {
  const n = typeof value === 'string' ? parseFloat(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) ? n : 0;
}

/** ₹1,23,456 — whole rupees by default; pass { paise: true } for ₹1,234.50. */
export function formatCurrency(
  value: unknown,
  options: { paise?: boolean; compact?: boolean } = {},
): string {
  const n = toNumber(value);
  if (options.compact) return inrCompact.format(n);
  return options.paise ? inrPaise.format(n) : inrWhole.format(n);
}

/** 12,345 */
export function formatNumber(value: unknown): string {
  return number.format(toNumber(value));
}

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 04 Oct 2026 */
export function formatDate(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** 04 Oct 2026, 14:05 */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '—';
  return `${formatDate(d)}, ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}

/** 14:05 */
export function formatTime(value: string | number | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '—';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** "just now", "5m ago", "3h ago", "2d ago", else a short date. */
export function timeAgo(value: string | number | Date | null | undefined, now: number = Date.now()): string {
  const d = toDate(value);
  if (!d) return '—';
  const diff = now - d.getTime();
  if (diff < 0) return formatDate(d);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}

/** "picking_up" → "Picking up"; "super_admin" → "Super admin". */
export function humanize(value: string | null | undefined): string {
  if (!value) return '—';
  const words = String(value).replace(/[_-]+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** First letters of the first two words, upper-cased. */
export function initials(name: string | null | undefined, fallback = 'AD'): string {
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  return parts
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

/** Shorten a UUID for display when the full value is available elsewhere. */
export function shortId(id: string | null | undefined, length = 8): string {
  if (!id) return '—';
  return id.length > length ? `${id.slice(0, length)}…` : id;
}
