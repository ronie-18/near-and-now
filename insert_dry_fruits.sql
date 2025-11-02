-- Insert Dry Fruits products into Dry Fruits category
-- Total products: 33
-- Generated automatically
-- Run this script in Supabase SQL Editor

-- STEP 1: Create Dry Fruits category if it doesn't exist
INSERT INTO categories (name, description, display_order)
VALUES ('Dry Fruits', 'Premium quality dry fruits, nuts, and seeds for healthy snacking', 6)
ON CONFLICT (name) DO NOTHING;

-- STEP 2: Ensure products table auto-generates IDs
ALTER TABLE products ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

-- STEP 3: Insert all products
INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Super Saver Raisins - 500 Gm', 219, 250, 'Dry Fruits', '500 gm', 'https://media.dealshare.in/img/offer/1751010093143:40635EBA52_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Super Saver Almond - 500 Gm', 389, 675, 'Dry Fruits', '500 gm', 'https://media.dealshare.in/img/offer/1751011291037:8E85208F2B_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Super Saver Cashew - 500 Gm', 432, 700, 'Dry Fruits', '500 gm', 'https://media.dealshare.in/img/offer/1751010092713:6FB612C11A_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Phool Makhana - 100 Gm', 155, 185, 'Dry Fruits', '100 gm', 'https://media.dealshare.in/img/offer/1738734937974:C628948FE7_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Super Saver Mixed Dry Fruits - 500 Gm', 241, 480, 'Dry Fruits', '500 gm', 'https://media.dealshare.in/img/offer/37911B1963_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Kismis Premium - 250 Gm', 149, 150, 'Dry Fruits', '250 gm', 'https://media.dealshare.in/img/offer/1738062476635:EDFCF859C7_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Indian Kishmis - 250 Gm', 159, 220, 'Dry Fruits', '250 gm', 'https://media.dealshare.in/img/offer/1738062476531:E440B4C63F_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Kaju 400 Count - 100 Gm', 110, 160, 'Dry Fruits', '100 gm', 'https://media.dealshare.in/img/offer/1751366487736:BE78066CE6_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Chia Seed - 100 Gm', 39, 75, 'Dry Fruits', '100 gm', 'https://media.dealshare.in/img/offer/1734757173646:322E178747_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Badam Premium - 100 Gm', 115, 165, 'Dry Fruits', '100 gm', 'https://media.dealshare.in/img/offer/995D9CFAD8_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Kismis Premium - 500 Gm', 299, 350, 'Dry Fruits', '500 gm', 'https://media.dealshare.in/img/offer/1738062476241:5702CD0416_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Pista Salted - 200 Gm', 298, 395, 'Dry Fruits', '200 gm', 'https://media.dealshare.in/img/offer/1738734938168:F94C8FFD57_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Cashew Premuim - 100 Gm', 120, 165, 'Dry Fruits', '100 gm', 'https://media.dealshare.in/img/offer/7623BA2F1E_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Kismis Premuim - 100 Gm', 59, 80, 'Dry Fruits', '100 gm', 'https://media.dealshare.in/img/offer/1739849049150:7CEFFCB916_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Akhrot Giri - 100 Gm', 144, 220, 'Dry Fruits', '100 gm', 'https://media.dealshare.in/img/offer/1738063364680:27D02C57EF_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Pumpkin Seeds - 100 Gm', 72, 155, 'Dry Fruits', '100 gm', 'https://media.dealshare.in/img/offer/1738734937960:970209F2B4_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Super Saver (Almond - 500 Gm + Cashew - 500 Gm) Combo Pack', 934, 1375, 'Dry Fruits', 'Combo of 2', 'https://media.dealshare.in/img/offer/1737023993207:Combo_Ncr27363.webp?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Badam American - 100 Gm', 115, 135, 'Dry Fruits', '100 gm', 'https://media.dealshare.in/img/offer/E0191BCD1D_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Kaju 400 Count - 50 Gm', 57, 80, 'Dry Fruits', '50 gm', 'https://media.dealshare.in/img/offer/904CF3EDC4_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Pista Salted - 100 Gm', 145, 210, 'Dry Fruits', '100 gm', 'https://media.dealshare.in/img/offer/1738734937429:7B2C28AA7F_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Anjeer - 100 Gm', 154, 200, 'Dry Fruits', '100 gm', 'https://media.dealshare.in/img/offer/1734611161188:86FFC8F990_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Flax Seed - 100 Gm', 19, 43, 'Dry Fruits', '100 gm', 'https://images.dealshare.in/1753346349265:1D718926E7_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Akhrot Giri Tudki- 500 Gm', 509, 710, 'Dry Fruits', '500 gm', 'https://media.dealshare.in/img/offer/1738734937436:8AC52141BB_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Anjeer - 200 Gm', 295, 395, 'Dry Fruits', '200 gm', 'https://media.dealshare.in/img/offer/1734611161061:19DBB0E001_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Badam Premium - 500 Gm', 564, 775, 'Dry Fruits', '500 gm', 'https://media.dealshare.in/img/offer/1738062476537:E444060715_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Kaju Tukda - 200 Gm', 236, 330, 'Dry Fruits', '200 gm', 'https://media.dealshare.in/img/offer/1738051305361:9CB33D2E98_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Kaju Premium - 500 Gm', 549, 775, 'Dry Fruits', '500 gm', 'https://media.dealshare.in/img/offer/1738051305769:CE6C47B9E4_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Mixed Dryfruits - 500 Gm', 355, 500, 'Dry Fruits', '500 gm', 'https://media.dealshare.in/img/offer/1738062476343:66701EA316_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Kaju 400 Count - 200 Gm', 215, 320, 'Dry Fruits', '200 gm', 'https://media.dealshare.in/img/offer/1742210634691:43064F35EA_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Kismis Black - 100 Gm', 49, 70, 'Dry Fruits', '100 gm', 'https://media.dealshare.in/img/offer/1738734937491:539BFAA4E0_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Kaju Roasted - 100 Gm', 128, 202, 'Dry Fruits', '100 gm', 'https://media.dealshare.in/img/offer/1738051305674:A545FDA733_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Almond Roasted - 100 Gm', 119, 175, 'Dry Fruits', '100 gm', 'https://media.dealshare.in/img/offer/1738063364778:A59FA05612_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Tong Garden Salted Pumpkin Seeds - 28 Gm', 47, 50, 'Dry Fruits', '28 gm', 'https://media.dealshare.in/img/offer/A09DC10747_1.webp', true, 4.5);

