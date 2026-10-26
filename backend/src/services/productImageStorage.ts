import { createHash } from 'crypto';
import { supabaseAdmin } from '../config/database.js';
import { AppError } from '../utils/httpError.js';
import { sniffFileExt } from '../utils/fileSignature.js';

/**
 * Product photos that arrive inline as `data:image/…;base64,…` strings are
 * moved into the public product-images bucket, and only the public URL is
 * kept in image_url.
 *
 * Why (2026-10-26): the shopkeeper app sends a custom product's photo inline
 * in POST /shopkeeper/product-submissions (middleware/jsonBody.ts lets that
 * route take 4 MB for it). Stored as-is, review_product_submission copied the
 * multi-MB string into master_products.image_url. From there the website and
 * customer app echo it back as each cart line's `image` in POST /api/orders,
 * which is capped at 1 MB, so every checkout containing that product got a
 * 413. The same string also landed in order_items on every order and in the
 * unpaginated submission lists, which Vercel cuts off at 4.5 MB.
 *
 * Same bucket the admin console uploads product images to
 * (admin/src/services/adminService.ts uploadProductImage): public, 5 MB,
 * JPEG/PNG/WebP/GIF.
 */
export const PRODUCT_IMAGES_BUCKET = 'product-images';

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

/** True for a `data:` URL (any case, surrounding whitespace ignored). */
export function isInlineImage(value: unknown): value is string {
  return typeof value === 'string' && /^\s*data:/i.test(value);
}

/**
 * Decodes an inline image and checks its bytes. The type comes from the file
 * signature, not the `data:` label: app builds before 2026-10-26 label every
 * photo image/jpeg, including PNGs picked from the gallery.
 */
export function decodeInlineImage(dataUrl: string): { buffer: Buffer; ext: string; contentType: string } {
  const match = /^\s*data:[^,]*;base64,([\s\S]*)$/i.exec(dataUrl);
  if (!match) {
    throw new AppError('Product photo must be an uploaded image or an https link', 400);
  }
  const buffer = Buffer.from(match[1].replace(/\s+/g, ''), 'base64');
  // utils/fileSignature knows the document formats; GIF is image-only.
  const ext = sniffFileExt(buffer) ?? (buffer.subarray(0, 4).toString('latin1') === 'GIF8' ? 'gif' : null);
  const contentType = ext ? CONTENT_TYPES[ext] : undefined;
  if (!ext || !contentType) {
    throw new AppError('Product photo must be a JPEG, PNG, WebP or GIF image', 400);
  }
  return { buffer, ext, contentType };
}

/**
 * Returns `imageUrl` unchanged unless it is inline, in which case the image is
 * uploaded and its public URL returned. The object name is the content hash,
 * so re-sending the same photo (an admin PATCH re-posting an untouched inline
 * image, a retried submit, the backfill script) reuses one object.
 */
export async function storeInlineProductImage(imageUrl: string): Promise<string> {
  if (!isInlineImage(imageUrl)) return imageUrl;

  const { buffer, ext, contentType } = decodeInlineImage(imageUrl);
  const hash = createHash('sha256').update(buffer).digest('hex');
  const path = `submissions/${hash}.${ext}`;

  const upload = () =>
    supabaseAdmin.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .upload(path, buffer, { contentType, cacheControl: '31536000', upsert: true });

  let { error } = await upload();
  if (error && /bucket not found/i.test(error.message ?? '')) {
    // Same fallback as the admin console's uploadProductImage.
    await supabaseAdmin.storage.createBucket(PRODUCT_IMAGES_BUCKET, {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    });
    ({ error } = await upload());
  }
  if (error) {
    console.error('storeInlineProductImage upload failed:', error.message ?? error);
    throw new AppError('Could not save the product photo. Please try again.', 502, { expose: true });
  }

  return supabaseAdmin.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;
}
