-- Multi-image support for a store's cover photo — previously `stores.image_url`
-- was a single column, and uploadStoreImage() always wrote to a fixed path
-- (`${storeId}/cover.${ext}`), so a new upload silently overwrote the old one
-- with no way to keep more than one photo. Same reasoning the project already
-- applied to verification documents (single JSON blob -> one row per
-- document): a dedicated per-image table instead of a wider single column.
--
-- `stores.image_url` is kept, not dropped — it's still read as the "cover"
-- convenience field (nothing else in the monorepo reads store images today,
-- confirmed by grep, but keeping it in sync costs nothing and covers any
-- future customer-facing reader that expects a single quick field rather
-- than joining store_images). It's kept in sync with the lowest-sort_order
-- row by the backend, not a trigger — same manual-sync style already used
-- for stores.is_approved/approved_at elsewhere in this schema.

CREATE TABLE IF NOT EXISTS public.store_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_images_store_id_sort
  ON public.store_images (store_id, sort_order, created_at);

-- Backfill: any store with an existing image_url gets it as row 0 of its new
-- gallery, so nothing already uploaded is lost. The old single-image column
-- never stored the object path separately, only the public URL — but every
-- public Supabase Storage URL for this bucket has the fixed shape
-- ".../object/public/store-images/<path>[?querystring]", so the path is
-- recovered by taking everything after "store-images/" and dropping any
-- trailing query string.
INSERT INTO public.store_images (store_id, url, storage_path, sort_order)
SELECT
  id,
  image_url,
  split_part(substring(image_url from 'store-images/(.*)$'), '?', 1),
  0
FROM public.stores
WHERE image_url IS NOT NULL
  AND image_url != ''
  AND image_url ~ 'store-images/';

ALTER TABLE public.store_images ENABLE ROW LEVEL SECURITY;

-- Public bucket, but this table is metadata or the images (order, ids) — same
-- treatment as store_verification_documents/store_profile_change_requests:
-- backend-proxied only via supabaseAdmin (service_role), no client-facing
-- policy. The images themselves are still fetched by public Storage URL
-- directly, same as before — this table is only for the shopkeeper app and
-- backend to manage which images exist and in what order.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_images TO service_role;
