-- Insert Breakfast Cereals products into breakfast-cereals category
-- Total products: 31
-- Generated automatically
-- Run this script in Supabase SQL Editor

-- STEP 1: Create breakfast-cereals category if it doesn't exist
INSERT INTO categories (name, description, display_order)
VALUES ('breakfast-cereals', 'Start your day right with healthy breakfast cereals, oats, and muesli', 2)
ON CONFLICT (name) DO NOTHING;

-- STEP 2: Ensure products table auto-generates IDs
ALTER TABLE products ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

-- STEP 3: Insert all products
INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Oats Pouch - 900 Gm', 105, 210, 'breakfast-cereals', '900 gm', 'https://images.dealshare.in/1753346349359:4A7761BC50_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Quaker Oats Pouch - 1 Kg', 175, 210, 'breakfast-cereals', '1 kg', 'https://images.dealshare.in/1753853813413:C8097C68F5_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Kellogg''s Chocos - 250 Gm', 145, 153, 'breakfast-cereals', '250 gm', 'https://media.dealshare.in/img/offer/7F41488A37_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Quaker Oats - 400 Gm', 83, 86, 'breakfast-cereals', '400 gm', 'https://media.dealshare.in/img/offer/ECFE6AEB93_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Oats Pouch - 900 Gm (Buy 1 Get 1 Free)', 210, 420, 'breakfast-cereals', '2 x 900 gm', 'https://media.dealshare.in/img/offer/1753346166954:4A7761BC50_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Yogabar Muesli - Super No Added Sugar - 400 Gm', 195, 390, 'breakfast-cereals', '400 gm', 'https://media.dealshare.in/img/offer/77014325FE_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Yogabar Muesli - Dark Chocolate Cranberry - 400 Gm', 195, 390, 'breakfast-cereals', '400 gm', 'https://media.dealshare.in/img/offer/DCFF619D01_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Yogabar Millet Muesli - 500 Gm', 164, 320, 'breakfast-cereals', '500 gm', 'https://images.dealshare.in/1753254309461:MAFA0991DD_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Saffola Classic Masala Oats - 38 Gm', 16, 18, 'breakfast-cereals', '38 gm', 'https://media.dealshare.in/img/offer/4E4B44B591_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Bagrry''s Crunchy Muesli, Fruit And Nut With Cranberries - 750 Gm', 364, 540, 'breakfast-cereals', '750 gm', 'https://media.dealshare.in/img/offer/1752571507578:39D82B308F_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Yogabar Muesli - Fruits Nuts And Seeds - 400 Gm', 195, 390, 'breakfast-cereals', '400 gm', 'https://media.dealshare.in/img/offer/BA7DD31F77_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Kellogg''s Corn Flakes - 250 Gm', 119, 125, 'breakfast-cereals', '250 gm', 'https://media.dealshare.in/img/offer/7818FC6196_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Bagrry''s Choco + (Pouch) - 325 Gm', 124, 199, 'breakfast-cereals', '325 gm', 'https://media.dealshare.in/img/offer/1752571507665:657D6D4CDD_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Saffola Masala Oats Peppy Tomato - 38 Gm', 16, 18, 'breakfast-cereals', '38 gm', 'https://media.dealshare.in/img/offer/CE67DAF589_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Yogabar Instant Oats - 900 Gm', 152, 195, 'breakfast-cereals', '900 gm', 'https://media.dealshare.in/img/offer/7D03AD081F_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Kellogg''s Variety (Pack Of 7) - 140 Gm', 63, 70, 'breakfast-cereals', '140 gm', 'https://media.dealshare.in/img/offer/02AEE648AC_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Soulfull Millet Muesli Fruit & Nut - 700 Gm', 349, 549, 'breakfast-cereals', '700 gm', 'https://media.dealshare.in/img/offer/B24C74879A_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Saffola Masala Oats Veggie Twist - 38 Gm', 16, 18, 'breakfast-cereals', '38 gm', 'https://media.dealshare.in/img/offer/C15DA60E65_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Yogabar Muesli - Dark Chocolate Cranberry - 40 Gm', 20, 40, 'breakfast-cereals', '40 gm', 'https://media.dealshare.in/img/offer/A78269FB96_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Yogabar Muesli - Fruits Nuts And Seeds - 40 Gm', 20, 40, 'breakfast-cereals', '40 gm', 'https://media.dealshare.in/img/offer/A2873CBB6E_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Tata Soulfull Masala Oats+ Mast Masala - 38 Gm', 18, 18, 'breakfast-cereals', '38 gm', 'https://media.dealshare.in/img/offer/14F4C2F6A1_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Kellogg''s Corn Flakes Original - 53 Gm x 2', 38, 40, 'breakfast-cereals', '2 x 53 gm', 'https://media.dealshare.in/img/offer/1752575724364:6577ECFD30_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Kellogg''s Chocos Fills - 250 Gm', 194, 205, 'breakfast-cereals', '250 gm', 'https://media.dealshare.in/img/offer/4ED727E07E_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Tata Soulfull Masala Oats+ Desi Veggie - 38 Gm', 18, 18, 'breakfast-cereals', '38 gm', 'https://images.dealshare.in/1753176726255:75CA3C308F_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Bagrry''s Fruit N Nut Cranberry Single Serve (Pouch) - 40 Gm', 24, 50, 'breakfast-cereals', '40 gm', 'https://media.dealshare.in/img/offer/1752571508473:F7DCD448A5_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Soulfull Ragi Bites Assorted Combo Pack 17 Gm (Pack Of 6) - 102 Gm', 54, 60, 'breakfast-cereals', '108 gm', 'https://media.dealshare.in/img/offer/1751873203895:02C87388E0_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Saffola Masala Oats Classic Masala - 500 Gm', 209, 220, 'breakfast-cereals', '500 gm', 'https://media.dealshare.in/img/offer/4D1A3A107B_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Yogabar Muesli - Fruits Nuts And Seeds - 40 Gm (Buy 1 Get 1 Free)', 40, 80, 'breakfast-cereals', '2 x 40 gm', 'https://media.dealshare.in/img/offer/1751439616383:A2873CBB6E_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Kellogg''s All Bran Wheat Flakes (Chocolate) - 440 Gm', 293, 299, 'breakfast-cereals', '440 gm', 'https://media.dealshare.in/img/offer/5ECE1DE51A_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Yogabar Muesli - Dark Chocolate Cranberry - 400 Gm (Buy 1 Get 1 Free)', 390, 780, 'breakfast-cereals', '2 x 400 gm', 'https://media.dealshare.in/img/offer/1751449387529:DCFF619D01_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Soulfull Fruit & Nut Millet Muesli - 700 Gm', 349, 549, 'breakfast-cereals', '700 gm', 'https://media.dealshare.in/img/offer/B7B710CD38_1.webp', true, 4.5);

