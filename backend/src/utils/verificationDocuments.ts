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

/** Signed URLs are short-lived — regenerated on every GET, never persisted. */
export const SIGNED_URL_TTL_SECONDS = 600;

/** Human-readable size (e.g. "340 KB", "1.2 MB") — stored as-is, not recomputed later. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
