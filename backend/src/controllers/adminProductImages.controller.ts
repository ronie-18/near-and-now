import { Request, Response } from 'express';
import { sendError } from '../utils/httpError.js';
import { createImageUploadUrl } from '../services/imageUploadUrls.js';

/**
 * POST /api/admin/product-images/upload-url { content_type }
 *
 * A one-photo upload token for a fresh path under product-images/products/.
 * The admin panel uploads the file itself with uploadToSignedUrl and saves
 * the public_url on the product as before. It used to upload with the anon
 * key (plus x-admin-token, which Storage policies cannot see), so the bucket
 * let anyone insert, overwrite and delete catalogue photos.
 * (services/imageUploadUrls.ts, 2026-10-27)
 */
export async function createProductImageUploadUrl(req: Request, res: Response) {
  try {
    const upload = await createImageUploadUrl('product-images', 'products', req.body?.content_type);
    res.json({ success: true, ...upload });
  } catch (error) {
    return sendError(res, 'adminProductImages.createProductImageUploadUrl', 'Could not prepare the photo upload', error, undefined, { success: false });
  }
}
