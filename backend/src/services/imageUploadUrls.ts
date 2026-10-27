import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../config/database.js';
import { AppError } from '../utils/httpError.js';

/**
 * Signed upload URLs for the public image buckets.
 *
 * Why (2026-10-27): the admin panel, the shopkeeper app and the rider app
 * uploaded photos straight to Storage with the anon key, so the buckets had
 * to let anon INSERT/UPDATE — anyone holding the (public) key could overwrite
 * any store, owner or rider photo, or fill the buckets. Now the backend checks
 * who is asking, picks a fresh path in that caller's own folder, and returns a
 * one-object upload token (`createSignedUploadUrl`). The client uploads with
 * `uploadToSignedUrl`, which needs no Storage policy at all, so the anon write
 * policies can be dropped. The file still goes straight to Storage — not
 * through this function, whose request body Vercel caps at 4.5 MB.
 *
 * Every upload gets a new path (UUID), so nothing is ever overwritten and a
 * replaced photo never shows a stale CDN copy.
 */
export type ImageBucket = 'product-images' | 'store-images' | 'store-owner-images' | 'delivery_partner_image';

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/gif': 'gif',
};

/** What each bucket accepts: catalogue photos may be GIFs, phone photos HEIC. */
const CATALOGUE = { types: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'], label: 'JPEG, PNG, WebP or GIF' };
const PHONE = { types: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'], label: 'JPEG, PNG, WebP or HEIC' };
const ALLOWED: Record<ImageBucket, { types: string[]; label: string }> = {
  'product-images': CATALOGUE,
  'store-images': PHONE,
  'store-owner-images': PHONE,
  delivery_partner_image: PHONE,
};

export type ImageUploadUrl = {
  bucket: ImageBucket;
  path: string;
  token: string;
  public_url: string;
};

/**
 * A one-object upload token for `<folder>/<prefix><uuid>.<ext>` in `bucket`.
 * `folder` must already be the caller's own (their store id, user id…) — the
 * route decides it from the authenticated identity, never from the request.
 */
export async function createImageUploadUrl(
  bucket: ImageBucket,
  folder: string,
  contentType: unknown,
  prefix = ''
): Promise<ImageUploadUrl> {
  const type = typeof contentType === 'string' ? contentType.trim().toLowerCase() : '';
  if (!ALLOWED[bucket].types.includes(type)) {
    throw new AppError(`Photos must be ${ALLOWED[bucket].label} images`, 400);
  }
  const path = `${folder}/${prefix}${randomUUID()}.${EXTENSIONS[type]}`;

  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data?.token) {
    console.error('createImageUploadUrl failed:', error?.message ?? error, { bucket });
    throw new AppError('Could not prepare the photo upload. Please try again.', 502, { expose: true });
  }
  return {
    bucket,
    path: data.path ?? path,
    token: data.token,
    public_url: supabaseAdmin.storage.from(bucket).getPublicUrl(path).data.publicUrl,
  };
}
