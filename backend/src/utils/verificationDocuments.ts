export const DOC_TYPES = ['aadhaar', 'pan', 'trade', 'gst', 'fssai'] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const VERIFICATION_DOCS_BUCKET = 'store-documents';

export const MAX_DOC_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_DOC_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export function isDocType(value: unknown): value is DocType {
  return typeof value === 'string' && (DOC_TYPES as readonly string[]).includes(value);
}

/**
 * Format checks for the 4 centrally-standardized documents. Trade License
 * deliberately has no entry — unlike Aadhaar/PAN/GST/FSSAI, it's issued by
 * local municipal corporations with no single national format, so any fixed
 * pattern would be wrong for shopkeepers in most cities.
 */
export const DOC_NUMBER_PATTERNS: Partial<Record<DocType, RegExp>> = {
  aadhaar: /^[2-9][0-9]{11}$/,
  pan: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
  gst: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
  fssai: /^[0-9]{14}$/,
};

export const DOC_NUMBER_FORMAT_HINTS: Partial<Record<DocType, string>> = {
  aadhaar: '12-digit Aadhaar number',
  pan: '10-character PAN (e.g. ABCDE1234F)',
  gst: '15-character GSTIN (e.g. 22AAAAA0000A1Z5)',
  fssai: '14-digit FSSAI number',
};

export function validateDocNumber(docType: DocType, number: string): boolean {
  const pattern = DOC_NUMBER_PATTERNS[docType];
  if (!pattern) return true; // trade — no fixed format to check
  return pattern.test(number);
}

/** Signed URLs are short-lived — regenerated on every GET, never persisted. */
export const SIGNED_URL_TTL_SECONDS = 600;

/** Human-readable size (e.g. "340 KB", "1.2 MB") — stored as-is, not recomputed later. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
