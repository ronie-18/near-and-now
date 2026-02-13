-- Update stores with generic/minimal address to have fuller details
-- Run in Supabase SQL Editor after store-proximity-functions.sql

-- Fix stores that have 'Local store near your area' (from old ensure_stores)
UPDATE stores
SET address = 'Pickup point, serving your delivery area.'
WHERE address = 'Local store near your area'
   OR address IS NULL
   OR trim(address) = '';
