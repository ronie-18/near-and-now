-- Quick seed script to add sample products
-- Run this in your Supabase SQL Editor

-- First, ensure categories exist
INSERT INTO categories (name, description, display_order, image_url) VALUES
('Personal Care', 'Personal care products including cosmetics, soaps, and skincare', 1, 'https://images.unsplash.com/photo-1596462502278-27d080fb6785?w=400'),
('Food & Beverages', 'Food items, drinks, and consumables', 2, 'https://images.unsplash.com/photo-1543362906-acfc16c67564?w=400'),
('Dairy', 'Dairy products including milk, cheese, and ghee', 3, 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400'),
('Snacks', 'Snacks and munchies', 4, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400'),
('Rice, Atta, Dal and Maida', 'Kitchen staples and cooking essentials', 5, 'https://images.unsplash.com/photo-1525373612132-b3e820b87cea?w=400')
ON CONFLICT (name) DO NOTHING;

-- Insert sample products
INSERT INTO master_products (name, category, brand, description, image_url, base_price, discounted_price, unit, is_loose, min_quantity, max_quantity, rating, rating_count, is_active, in_stock) VALUES
('Lakme 9 To 5 Vitamin C Serum', 'Personal Care', 'Lakme', 'Lightweight serum enriched with Vitamin C. Reduces dullness and fights aging.', 'https://images.unsplash.com/photo-1570172619644-dfd03ed06d30?w=400', 649, 456, '30 gm', false, 1, 100, 4.5, 12, true, true),
('Cadbury Dairy Milk Chocolate', 'Food & Beverages', 'Cadbury', 'Premium milk chocolate bar', 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400', 50, 45, '43 gm', false, 1, 100, 4.5, 25, true, true),
('Provedic Desi Ghee', 'Dairy', 'Provedic', 'Pure desi ghee. Traditional clarified butter.', 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400', 300, 271, '500 ml', false, 1, 100, 4.5, 18, true, true),
('Lays Classic Potato Chips', 'Snacks', 'Lays', 'Classic potato chips with perfect crunch', 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400', 50, 47, '80 gm', false, 1, 100, 4.5, 30, true, true),
('Organic Turmeric Powder', 'Rice, Atta, Dal and Maida', 'Organic', 'Pure organic turmeric powder for cooking', 'https://images.unsplash.com/photo-1525373612132-b3e820b87cea?w=400', 120, 99, '200 gm', false, 1, 100, 4.5, 15, true, true),
('Garnier Micellar Water', 'Personal Care', 'Garnier', 'No-rinse micellar water that removes makeup and impurities', 'https://images.unsplash.com/photo-1570172619644-dfd03ed06d30?w=400', 249, 245, '125 ml', false, 1, 100, 4.5, 20, true, true),
('Amul Fresh Milk', 'Dairy', 'Amul', 'Fresh and pure milk', 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400', 56, 52, '1 ltr', false, 1, 100, 4.5, 40, true, true),
('Bingo Mad Angles', 'Snacks', 'Bingo', 'Tangy and crunchy snack', 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400', 40, 35, '52 gm', false, 1, 100, 4.5, 22, true, true),
('Basmati Rice Premium', 'Rice, Atta, Dal and Maida', 'India Gate', 'Premium quality basmati rice', 'https://images.unsplash.com/photo-1525373612132-b3e820b87cea?w=400', 450, 399, '5 kg', false, 1, 100, 4.5, 28, true, true),
('Nivea Soft Cream', 'Personal Care', 'Nivea', 'Moisturizing soft cream for smooth skin', 'https://images.unsplash.com/photo-1570172619644-dfd03ed06d30?w=400', 180, 162, '75 ml', false, 1, 100, 4.5, 16, true, true)
ON CONFLICT (name) DO NOTHING;

-- Verify insertion
SELECT 'Products seeded successfully!' as status;
