// Document-upload validation (store + rider verification docs) trusted the
// client-supplied `mimetype` header alone — a renamed/relabeled non-image
// file could pass the ALLOWED_DOC_MIME_TYPES check untouched. This inspects
// the actual file bytes (magic numbers) instead. Low-severity in practice
// (Supabase Storage just serves whatever content-type was declared either
// way), but a real trust gap: nothing previously verified the bytes matched
// the claim. Found 2026-08-11 during a rider-onboarding audit.

const SIGNATURES: { ext: string; bytes: number[]; offset?: number }[] = [
  { ext: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  { ext: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { ext: 'pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // "%PDF"
  // WEBP: "RIFF" .... "WEBP" — two separate anchors, checked specially below.
];

function bytesMatch(buffer: Buffer, bytes: number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) {
    if (buffer[offset + i] !== bytes[i]) return false;
  }
  return true;
}

/** Returns the file extension the byte signature actually matches, or null if unrecognized. */
export function sniffFileExt(buffer: Buffer): string | null {
  if (bytesMatch(buffer, [0x52, 0x49, 0x46, 0x46]) && bytesMatch(buffer, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'webp';
  }
  for (const sig of SIGNATURES) {
    if (bytesMatch(buffer, sig.bytes, sig.offset ?? 0)) return sig.ext;
  }
  return null;
}

/** True if the file's actual bytes match the extension its declared mimetype maps to. */
export function fileMatchesDeclaredExt(buffer: Buffer, declaredExt: string): boolean {
  return sniffFileExt(buffer) === declaredExt;
}
