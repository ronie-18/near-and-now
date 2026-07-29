-- Mark unbranded fresh produce (Fruits/Vegetables) as sellable loose, so stores
-- can offer these by weight from inventory instead of only in fixed packs.
-- Excludes floral/pooja items miscategorized under Fruits/Vegetables that are
-- not sold as loose-by-weight grocery produce.

UPDATE public.master_products
SET is_loose = true,
    updated_at = now()
WHERE category IN ('Fruits', 'Vegetables')
  AND is_loose = false
  AND name NOT IN (
    'Aak Flower Garland',
    'Assorted Fruits for Pooja (Panch Phal) (Mishrit Phol)',
    'Bel Patra (Aegle Marmelos Leaves)',
    'Dhatura for Pooja',
    'Fresh Garland - Orange Marigold (Genda)',
    'Fresh Garland - Yellow Marigold (Phool String)',
    'Gundi Paan',
    'Pink Lotus Flower (Komal)',
    'Pooja Flower Mix (Phool Mix)',
    'Red Rose Single Flower',
    'Rose Flowers & Petals Mix (Gulab)',
    'Yellow Marigold'
  );
