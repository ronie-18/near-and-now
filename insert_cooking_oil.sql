-- Insert Cooking Oil products into oils category
-- Total products: 25
-- Generated automatically
-- Run this script in Supabase SQL Editor

-- STEP 1: Create oils category if it doesn't exist
INSERT INTO categories (name, description, display_order)
VALUES ('oils', 'High-quality cooking oils for all your culinary needs', 4)
ON CONFLICT (name) DO NOTHING;

-- STEP 2: Ensure products table auto-generates IDs
ALTER TABLE products ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

-- STEP 3: Insert all products
INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Best Choice Refined Soyabean Oil (pouch) - 750 Gm x 3', 321, 438, 'oils', '3 x 750 gm', 'https://media.dealshare.in/img/offer/1752810276743:8438AE2D63_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Fortune Kachi Ghani Pure Mustard Oil (Pouch) - 1 Ltr x 3', 537, 675, 'oils', '3 x 1 ltr', 'https://media.dealshare.in/img/offer/1752838452765:5354C8AA0A_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Emami Healthy & Tasty Kachchi Ghani Mustard Oil (pouch) Strong - 825 Gm x 3', 498, 540, 'oils', '3 x 825 gm', 'https://media.dealshare.in/img/offer/1752810278035:7D3277E2B3_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Best Choice Refined Soyabean Oil (pouch) - 750 Gm', 107, 146, 'oils', '750 gm', 'https://images.dealshare.in/1750590906675:8438AE2D63_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Emami Healthy & Tasty Kachchi Ghani Mustard Oil (pouch) Strong - 825 Gm', 166, 180, 'oils', '825 gm', 'https://media.dealshare.in/img/offer/1745397204325:7D3277E2B3_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Doctors Choice Kachi Ghani Mustard Oil (Pouch) - 750 Gm', 155, 185, 'oils', '750 gm', 'https://images.dealshare.in/1754458295190LE3E7E3C45_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Fortune Kachi Ghani Mustard Oil - 5 Ltr', 949, 1025, 'oils', '5 ltr', 'https://media.dealshare.in/img/offer/1751011292405:FB532D627B_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Mahakosh Refined Soyabean Oil (pouch) - 750 Gm', 116, 144, 'oils', '750 gm', 'https://media.dealshare.in/img/offer/696B50FB26_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Fortune Rice Bran Health Oil (pouch) - 870 Gm', 139, 195, 'oils', '870 gm', 'https://media.dealshare.in/img/offer/1742884004784:B876140DED_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Fortune Refined Soyabean Oil - 4.35 Kg', 769, 885, 'oils', '4.35 kg', 'https://media.dealshare.in/img/offer/1751011292010:DCC51871CA_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Emami Healthy & Tasty Refined Rice Bran Oil (pouch) - 825 Gm', 136, 160, 'oils', '825 gm', 'https://images.dealshare.in/1750427559418:15CC1A3303_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Fortune Sun Lite Refined Sunflower Oil - 870 Gm', 176, 180, 'oils', '870 gm', 'https://media.dealshare.in/img/offer/1745846109567:B11DBC1F33_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Saffola Active Oil - 1 Ltr', 155, 187, 'oils', '1 ltr', 'https://media.dealshare.in/img/offer/375C32A47C_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Engine Brand Mustard Oil  (pouch) - 1 Ltr', 197, 199, 'oils', '1 ltr', 'https://media.dealshare.in/img/offer/1725687583389:4512C3C20F_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Fortune Rice Bran Health Oil (pouch) - 870 Gm x 3', 416, 585, 'oils', '3 x 870 gm', 'https://media.dealshare.in/img/offer/1752810280029:B876140DED_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Emami Healthy & Tasty Refined Soyabean Oil (pouch) - 825 Gm x 3', 404, 480, 'oils', '3 x 825 gm', 'https://media.dealshare.in/img/offer/1752810278442:B488B42291_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Fortune Sunlite Refined Sunflower Oil - 4.35 Kg', 854, 930, 'oils', '4.35 kg', 'https://media.dealshare.in/img/offer/1746535993492:98F2096C64_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Emami Healthy & Tasty Refined Sunflower Oil (pouch) - 825 Gm', 150, 170, 'oils', '825 gm', 'https://images.dealshare.in/1750590904692:7CE031A768_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sunrich Refined Sunflower Oil (Pouch) - 850 Gm', 145, 163, 'oils', '850 gm', 'https://media.dealshare.in/img/offer/1745116287699:5182D2B777_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Emami Healthy & Tasty Refined Rice Bran Oil (Pouch) - 825 Gm x 3', 407, 480, 'oils', '3 x 825 gm', 'https://media.dealshare.in/img/offer/1752810279428:15CC1A3303_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Fortune Sun Lite Refined Sunflower Oil - 870 Gm x 3', 527, 540, 'oils', '3 x 870 gm', 'https://media.dealshare.in/img/offer/1752810280540:B11DBC1F33_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Emami Healthy & Tasty Refined Sunflower Oil (pouch) - 825 Gm x 3', 449, 510, 'oils', '3 x 825 gm', 'https://media.dealshare.in/img/offer/1752810281333:7CE031A768_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Buy Fortune Sunlite Refined Sunflower Oil - 4.35 Kg & Get Free Agro Fresh Chana Besan - 500 Gm', 850, 1010, 'oils', 'Combo of 2', 'https://media.dealshare.in/img/offer/1753972935208:Combo_kol18262.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Fortune Kachi Ghani Pure Mustard Oil (Pouch) - 1 Ltr', 179, 225, 'oils', '1 ltr', 'https://media.dealshare.in/img/offer/1752838452765:5354C8AA0A_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Emami Healthy & Tasty Refined Soyabean Oil (pouch) - 825 Gm', 135, 160, 'oils', '825 gm', 'https://media.dealshare.in/img/offer/1745397205137:B488B42291_1.png', true, 4.5);

