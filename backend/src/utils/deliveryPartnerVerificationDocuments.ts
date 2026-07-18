export const DOC_TYPES = [
  'aadhaar_front', 'aadhaar_back',
  'pan_front', 'pan_back',
  'driving_license_front', 'driving_license_back',
  'vehicle_registration',
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const VERIFICATION_DOCS_BUCKET = 'delivery-partner-documents';

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

export const VEHICLE_TYPES = ['cycle', 'e-bike', 'bike', 'scooty'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export function isVehicleType(value: unknown): value is VehicleType {
  return typeof value === 'string' && (VEHICLE_TYPES as readonly string[]).includes(value);
}

/** Human-readable label per doc type — used in admin-notification messages. */
export const DOC_LABELS: Record<DocType, string> = {
  aadhaar_front: 'Aadhaar Card (Front)',
  aadhaar_back: 'Aadhaar Card (Back)',
  pan_front: 'PAN Card (Front)',
  pan_back: 'PAN Card (Back)',
  driving_license_front: 'Driving License (Front)',
  driving_license_back: 'Driving License (Back)',
  vehicle_registration: 'Vehicle Registration (RC)',
};

/**
 * vehicle_registration is only a required document for motorized vehicles
 * (bike/scooty) — cycle/e-bike riders don't need one. This mirrors the
 * completeness check in the atomic Postgres function
 * (mark_rider_verification_submitted_if_ready) — keep both in sync.
 */
export function isVehicleRegistrationRequired(vehicleType: string | null | undefined): boolean {
  return vehicleType !== 'cycle' && vehicleType !== 'e-bike';
}

/**
 * Format checks for the centrally-standardized documents. Driving License and
 * Vehicle Registration deliberately have no entry — like Trade License on the
 * shopkeeper side, they're issued by state RTOs with no single fixed national
 * format, so any regex would reject legitimate real numbers. The "back" side
 * of Aadhaar/PAN/Driving License also has no entry — the number is printed on
 * the front only, so the back is an image-only upload with no number field.
 */
export const DOC_NUMBER_PATTERNS: Partial<Record<DocType, RegExp>> = {
  aadhaar_front: /^[2-9][0-9]{11}$/,
  pan_front: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
};

export const DOC_NUMBER_FORMATS: Partial<Record<DocType, { description: string; example: string }>> = {
  aadhaar_front: { description: '12 digits', example: '234567890123' },
  pan_front: { description: '5 letters + 4 digits + 1 letter (10 characters)', example: 'ABCDE1234F' },
};

export function docNumberErrorMessage(docType: DocType): string {
  const format = DOC_NUMBER_FORMATS[docType];
  if (!format) return 'Invalid document number format';
  const label = docType.replace(/_/g, ' ').toUpperCase();
  return `Invalid ${label} number.\nFormat: ${format.description}\nExample: ${format.example}`;
}

export function validateDocNumber(docType: DocType, number: string): boolean {
  const pattern = DOC_NUMBER_PATTERNS[docType];
  if (!pattern) return true; // driving_license_front / vehicle_registration — no fixed format to check
  return pattern.test(number);
}

/** Signed URLs are short-lived — regenerated on every GET, never persisted. */
export const SIGNED_URL_TTL_SECONDS = 600;

/** Human-readable size (e.g. "340 KB", "1.2 MB") — stored as-is, not recomputed later. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
