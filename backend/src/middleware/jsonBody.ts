import express, { type Express } from 'express';

/**
 * JSON body-size caps.
 *
 * The default is deliberately small: an oversized JSON body against a public
 * or low-friction route (/api/places/*, checkout, …) would otherwise be read
 * and parsed in full before any of our own validation runs. 1 MB is generous
 * for every ordinary payload this API accepts — the largest is a checkout cart
 * with many line items, a few KB. Document/image uploads go through multer as
 * multipart, not JSON, so they are unaffected.
 *
 * The one exception is custom product submissions. The shopkeeper app sends
 * the product photo inline as a base64 `data:image/jpeg;base64,…` string in
 * `image_url` (near-now-store_owner app/(tabs)/stock.tsx), and the admin
 * console re-sends that same string when it PATCHes a correction to a pending
 * submission. A phone photo is a few MB once base64-encoded, so both routes
 * were answering 413 "larger than this route allows" for any real photo.
 *
 * Why 4 MB and not more: on Vercel a serverless function's request body is
 * hard-capped at 4.5 MB by the platform, before Express sees the request. A
 * larger Express limit would only change which layer rejects the body, and
 * the platform's rejection is not our JSON error shape. Payloads that still
 * exceed this have to shrink client-side, not grow the cap here: app builds
 * from 2026-10-26 on downscale the photo to 1024 px first (~100–250 KB, see
 * near-now-store_owner lib/productPhoto.ts); older builds send the full-size
 * photo, which is why the cap stays at 4 MB.
 *
 * Either way the photo is not stored inline: services/productImageStorage.ts
 * moves it to the product-images bucket and keeps only the URL.
 */
export const JSON_BODY_LIMIT = '1mb';
export const PRODUCT_SUBMISSION_JSON_BODY_LIMIT = '4mb';

/**
 * Mount paths (prefix match, segment-aligned — `/shopkeeper/product-submissions`
 * also covers `/shopkeeper/product-submissions/…` but not
 * `/shopkeeper/product-submissionsx`) that get the larger cap.
 */
export const PRODUCT_SUBMISSION_JSON_PATHS = [
  '/shopkeeper/product-submissions',
  '/api/admin/product-submissions',
] as const;

/**
 * Mounts the JSON parsers in the order that makes the per-route cap work:
 * the larger-limit parser first, scoped to its paths, then the global one.
 * body-parser marks a request it has handled (`req._body`), so the global
 * parser skips bodies the scoped one already parsed instead of re-reading
 * them against the smaller limit. Anything that must see the raw body (the
 * Razorpay webhook's express.raw) has to be mounted before this is called.
 */
export function mountJsonBodyParsers(app: Express): void {
  const large = express.json({ limit: PRODUCT_SUBMISSION_JSON_BODY_LIMIT });
  for (const path of PRODUCT_SUBMISSION_JSON_PATHS) {
    app.use(path, large);
  }
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
}
