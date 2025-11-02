-- Insert Detergents & Fabric Care products into Detergents category
-- Total products: 96
-- Generated automatically
-- Run this script in Supabase SQL Editor

-- STEP 1: Create Detergents category if it doesn't exist
INSERT INTO categories (name, description, display_order)
VALUES ('Detergents', 'Powerful detergents and fabric care products for clean, fresh clothes', 5)
ON CONFLICT (name) DO NOTHING;

-- STEP 2: Ensure products table auto-generates IDs
ALTER TABLE products ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

-- STEP 3: Insert all products
INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Chemko Detergent Powder Jasmine & Rose - 3 Kg', 99, 210, 'Detergents', '3 kg', 'https://images.dealshare.in/1753932726440:9AF0A5A868_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Safed Smartzymes Detergent Powder (4 + 1 Kg) - 5 Kg', 290, 320, 'Detergents', '5 kg', 'https://images.dealshare.in/17539683350172C412AEE08_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sunlight Matic Liquid Detergent - 2 Ltr', 220, 300, 'Detergents', '2 ltr', 'https://images.dealshare.in/1750524406725:C0AD9AA010_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Comfort After Wash Morning Fresh Fabric Conditioner - 860 Ml', 221, 235, 'Detergents', '860 ml', 'https://media.dealshare.in/img/offer/20843A7378_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Godrej Fab Liquid Detergent Refill Pouch For Machine - 4 Ltr', 370, 400, 'Detergents', '4 ltr', 'https://media.dealshare.in/img/offer/74D50CE2E4_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Chemko Lemon Detergent Powder - 3 Kg', 99, 210, 'Detergents', '3 kg', 'https://images.dealshare.in/1753932728255:B5366B5C87_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Tide Jasmine & Rose Detergent Powder - 4 Kg + 1 Kg FREE', 445, 659, 'Detergents', '5 kg', 'https://media.dealshare.in/img/offer/1751011292104:E9A2FE7E19_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sunlight Detergent Powder - 3 Kg', 245, 280, 'Detergents', '3 kg', 'https://images.dealshare.in/1750524406519:480C6A8AF1_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Chemko Active Liquid Detergent - 2 Ltr (Buy 1 Get 2 Free)', 399, 1197, 'Detergents', '3 x 2 ltr', 'https://media.dealshare.in/img/offer/1753932475262:CB96DD0564_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Advise Detergent Powder - 5 Kg', 140, 350, 'Detergents', '5 kg', 'https://media.dealshare.in/img/offer/51A1762A51_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Surf Excel Easy Wash Detergent Powder - 3 Kg', 325, 390, 'Detergents', '3 kg', 'https://media.dealshare.in/img/offer/1744026170494:5DCDFA1259_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Chemko Lemon Detergent Powder - 6 Kg', 192, 400, 'Detergents', '6 kg', 'https://images.dealshare.in/1753932725884:0A6D7FCAF6_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Wheel Active 2 in1 Detergent Powder - 1 Kg', 67, 73, 'Detergents', '1 kg', 'https://media.dealshare.in/img/offer/1742744263187:036FF1849D_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Wheel Active 2 in1 Detergent Powder - 2 Kg', 128, 138, 'Detergents', '2 kg', 'https://media.dealshare.in/img/offer/99AEA039B8_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Safed Detergent Powder - 2 Kg', 120, 160, 'Detergents', '2 kg', 'https://images.dealshare.in/1750482207295:41F2FE80D3_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Tide Plus Lemon & Mint Detergent Powder (4 Kg + 1 Kg Free) - 5 Kg', 445, 659, 'Detergents', '5 kg', 'https://media.dealshare.in/img/offer/1751011291318:AAEEBCAB73_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Surf Excel Detergent Bar - 200 Gm (pack Of 4)', 119, 128, 'Detergents', '800 gm', 'https://media.dealshare.in/img/offer/1742374265690:6C4795325D_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sunlight Detergent Powder - 500 Gm', 45, 50, 'Detergents', '500 gm', 'https://media.dealshare.in/img/offer/1745397204648:375E0DFA1E_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Chemko Active Liquid Detergent - 2 Ltr', 133, 399, 'Detergents', '2 ltr', 'https://images.dealshare.in/1753932728864:CB96DD0564_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sunlight Detergent Powder - 500 Gm x 6', 276, 300, 'Detergents', '6 x 500 gm', 'https://media.dealshare.in/img/offer/1752742459732:375E0DFA1E_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Rin Advanced Bar (250 Gm  x 4) - 1 Kg', 93, 100, 'Detergents', '1 kg', 'https://media.dealshare.in/img/offer/1729501812644:79C6B4D80A_DEAL.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Tide Naturals Detergent Powder (Lemon & Chandan) - 1 Kg', 80, 85, 'Detergents', '1 kg', 'https://media.dealshare.in/img/offer/899CD75085_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Surf Excel Easy Wash Powder - 500 Gm', 68, 70, 'Detergents', '500 gm', 'https://media.dealshare.in/img/offer/1744202167111:29DCCCBFCF_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Rin Ala Fabric Whitener - 500 Ml', 85, 89, 'Detergents', '500 ml', 'https://media.dealshare.in/img/offer/1723609276723:2524D17344_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Surf Excel Matic Top Load Detergent Powder - 6 Kg', 1050, 1375, 'Detergents', '6 kg', 'https://media.dealshare.in/img/offer/292CF8DE50_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Rin Detergent Powder (Pouch) - 1 Kg', 94, 100, 'Detergents', '1 kg', 'https://media.dealshare.in/img/offer/2002B35ABA_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Godrej Genteel Liquid Detergent Pouch - 2 Kg', 269, 320, 'Detergents', '2 kg', 'https://media.dealshare.in/img/offer/1724481267372:8360FB9C83_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Tide Plus Detergent Washing Powder Extra Power Jasmine & Rose -1 Kg', 105, 110, 'Detergents', '1 kg', 'https://media.dealshare.in/img/offer/4F0C245086_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Safed Detergent Powder - 1 Kg', 65, 80, 'Detergents', '1 kg', 'https://images.dealshare.in/1752470961150:745D2EBE50_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Surf Excel Matic Front Load Detergent Powder - 6 Kg', 1136, 1475, 'Detergents', '6 kg', 'https://media.dealshare.in/img/offer/1751011291123:92A5186976_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Chemko Detergent Powder Jasmine & Rose - 1 Kg x 2 + Get Free Home First Frosty Bucket - 9 Ltr', 150, 300, 'Detergents', 'Combo of 2', 'https://media.dealshare.in/img/offer/1745476052330:C071D0F19E_COMBO_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Ariel Perfect Wash Detergent Powder - 1 Kg', 125, 130, 'Detergents', '1 kg', 'https://images.dealshare.in/offerImage/1723726238D47573AD79_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Surf Excel Easy Wash Powder - 500 Gm x 2', 134, 140, 'Detergents', '2 x 500 gm', 'https://media.dealshare.in/img/offer/1752491182131:29DCCCBFCF_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Surf Excel Matic Liquid Detergent Top Load Pouch - 2 Litres', 319, 319, 'Detergents', '2 ltr', 'https://media.dealshare.in/img/offer/5E0D15B89F_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Ariel Matic Top Load Detergent Powder - 4 Kg (Free Extra Detergent Powder - 2 Kg) - 6 Kg', 999, 1375, 'Detergents', '6 kg', 'https://media.dealshare.in/img/offer/B58B089F86_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Ariel Matic Top Load Liquid Detergent (Pouch) - 1 Ltr', 139, 149, 'Detergents', '1 ltr', 'https://media.dealshare.in/img/offer/9DE338D0AC_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Rin Liquid Detergent Pouch (Top Load) - 2 Ltr', 239, 300, 'Detergents', '2 ltr', 'https://media.dealshare.in/img/offer/1751274093881:794C60E7DD_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Chemko Lemon Detergent Powder - 1 Kg', 40, 75, 'Detergents', '1 kg', 'https://images.dealshare.in/1753932726457:9B352A80E2_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Yaare Detergent Powder - 1 Kg', 39, 68, 'Detergents', '1 kg', 'https://media.dealshare.in/img/offer/1745839226227:B848E20C14_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sunlight Detergent Powder - 500 Gm x 3', 141, 150, 'Detergents', '3 x 500 gm', 'https://media.dealshare.in/img/offer/1752810744720:375E0DFA1E_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Safed Detergent Powder - 1 Kg x 3', 190, 240, 'Detergents', '3 x 1 kg', 'https://media.dealshare.in/img/offer/1752470974278:745D2EBE50_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Chemko Detergent Powder Jasmine & Rose - 1 Kg x 3', 109, 225, 'Detergents', '3 x 1 kg', 'https://media.dealshare.in/img/offer/1753932475054:C071D0F19E_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Tide Plus Jasmine & Rose Detergent Powder - 2 Kg', 244, 270, 'Detergents', '2 kg', 'https://media.dealshare.in/img/offer/1C18BF137F_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Ariel Matic Front Load Liquid Detergent (Pouch) - 2 Ltr', 311, 379, 'Detergents', '2 ltr', 'https://media.dealshare.in/img/offer/21C191E642_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Ariel Matic Top Load Liquid Detergent (Pouch) - 2 Ltr', 298, 329, 'Detergents', '2 ltr', 'https://media.dealshare.in/img/offer/38FE741581_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Chemko Lemon Detergent Powder - 500 Gm x 3', 49, 120, 'Detergents', '3 x 500 gm', 'https://media.dealshare.in/img/offer/1753932475643:E4AE74AC91_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Chemko Detergent Powder-1 Kg x 2 + Get Free Home First Frosty Bucket - 9 Ltr', 150, 300, 'Detergents', 'Combo of 2', 'https://media.dealshare.in/img/offer/1745476052236:8EC17B8359_COMBO_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Tide Plus Lemon and Mint Detergent Powder - 1 Kg', 108, 110, 'Detergents', '1 kg', 'https://media.dealshare.in/img/offer/1729837194815:1B4DA93472_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Swazz Matic Top Load Detergent Powder - 1 Kg & Get Chemko Dishwash Gel - 140 Ml x 2 Free', 99, 340, 'Detergents', 'Combo of 2', 'https://media.dealshare.in/img/offer/14981748614730Combo_Ncr27428.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Ujala Supreme Fabric Whitener - 250 Ml', 83, 85, 'Detergents', '250 ml', 'https://media.dealshare.in/img/offer/FB4E8BCDEC_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Safed Detergent Powder - 500 Gm', 34, 40, 'Detergents', '500 gm', 'https://media.dealshare.in/img/offer/9B50558186_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Chemko Detergent Powder Jasmine & Rose - 1 Kg', 40, 75, 'Detergents', '1 kg', 'https://images.dealshare.in/1753932728651:C071D0F19E_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Safed Detergent Powder - 500 Gm x 3', 102, 120, 'Detergents', '3 x 500 gm', 'https://media.dealshare.in/img/offer/1752810743536:9B50558186_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Godrej Ezee Liquid Detergent - 1 Kg', 210, 225, 'Detergents', '1 kg', 'https://media.dealshare.in/img/offer/1742374266480:1306D4B5CC_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Surf Excel Detergent Bar - 88 Gm x 4', 38, 40, 'Detergents', '4 x 80 gm', 'https://media.dealshare.in/img/offer/1752758802300:021E561516_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Surf Excel Matic Front Load Detergent Powder - 2 Kg', 575, 600, 'Detergents', '2 kg', 'https://images.dealshare.in/1753706266816:E25CF7E984_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Swazz Matic Top Load Detergent Powder - 1 Kg & Get Free Thums Up Soft Drink - 750 Ml', 99, 340, 'Detergents', 'Combo of 2', 'https://media.dealshare.in/img/offer/1747489183352:Combo_kol18166.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Chemko Lemon Detergent Powder - 1 Kg x 3', 109, 225, 'Detergents', '3 x 1 kg', 'https://media.dealshare.in/img/offer/1753932472644:9B352A80E2_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Chemko Detergent Powder Jasmine & Rose - 1 Kg x 5', 176, 375, 'Detergents', '5 x 1 kg', 'https://media.dealshare.in/img/offer/1753932475054:C071D0F19E_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Swazz Premium Detergent Powder - 3 Kg', 235, 350, 'Detergents', '3 kg', 'https://media.dealshare.in/img/offer/1751347750614:C4727D1EAD_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Godrej Ezee Liquid Detergent - 500 Gm', 115, 120, 'Detergents', '500 gm', 'https://media.dealshare.in/img/offer/73ABFB7757_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Chemko Detergent Bar - 250 Gm x 4', 50, 60, 'Detergents', '4 x 250 gm', 'https://media.dealshare.in/img/offer/1753932473466:893E4AD389_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Surf Excel Easy Wash Powder - 500 Gm x 3', 201, 210, 'Detergents', '3 x 500 gm', 'https://media.dealshare.in/img/offer/1752810743645:29DCCCBFCF_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Advise Detergent Powder - 1 Kg x 4', 122, 280, 'Detergents', '4 x 1 kg', 'https://media.dealshare.in/img/offer/1752758803586:CF5255B88D_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Advise Detergent Powder - 1 Kg', 39, 70, 'Detergents', '1 kg', 'https://media.dealshare.in/img/offer/1746859276938:CF5255B88D_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Chemko Detergent Bar - 250 Gm', 13, 15, 'Detergents', '250 gm', 'https://images.dealshare.in/1753932727449:893E4AD389_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Swazz Premium Detergent Powder - 1 Kg', 79, 165, 'Detergents', '1 kg', 'https://media.dealshare.in/img/offer/1751347746672:01B5FAE628_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Revive Starch Liquid Stiffener - 200 Gm', 72, 81, 'Detergents', '200 gm', 'https://media.dealshare.in/img/offer/1727863414960:2050480BFC_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Ariel Matic Liquid Detergent Top Load (Pouch) - 3.2 Ltr', 599, 649, 'Detergents', '3.2 ltr', 'https://media.dealshare.in/img/offer/777051EED3_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Safed Detergent powder - 2Kg & FREE Detergent powder -500 gm', 160, 200, 'Detergents', 'Combo of 2', 'https://images.dealshare.in/offerImage/1707990892Combo_kol17936.webp?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Swazz Matic Top Load Detergent Powder - 1 Kg', 99, 300, 'Detergents', '1 kg', 'https://media.dealshare.in/img/offer/1744859811388:201D5A5B19_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Chemko Lemon Detergent Powder - 500 Gm', 24, 40, 'Detergents', '500 gm', 'https://images.dealshare.in/1753932729171:E4AE74AC91_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Surf Excel Detergent Bar - 250 Gm x 2', 73, 76, 'Detergents', '2 x 250 gm', 'https://media.dealshare.in/img/offer/1752917203229:987B79802E_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Advise Detergent Powder - 1 Kg (Buy 1 Get 1 Free)', 70, 140, 'Detergents', '2 x 1 kg', 'https://media.dealshare.in/img/offer/1751446753390:CF5255B88D_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Ariel Matic Front Load Detergent Powder - 2 Kg', 495, 660, 'Detergents', '2 kg', 'https://images.dealshare.in/offerImage/1714467418Kol25614_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Ariel Matic Front Load Liquid Detergent (Pouch) - 1 Ltr', 159, 169, 'Detergents', '1 ltr', 'https://media.dealshare.in/img/offer/0AEA77B4E2_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Chemko Detergent Bar (200 + 50) - 250 Gm x 5', 62, 75, 'Detergents', '5 x 250 gm', 'https://media.dealshare.in/img/offer/1753932473466:893E4AD389_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Ariel Matic Top Load Detergent Washing Powder - 2 Kg', 445, 595, 'Detergents', '2 kg', 'https://media.dealshare.in/img/offer/1751009427625:1FCB95832B_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Chemko Lemon Detergent Powder - 1 Kg x 5', 176, 375, 'Detergents', '5 x 1 kg', 'https://media.dealshare.in/img/offer/1753932472644:9B352A80E2_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Senu Fabric Whitener - 500 Ml', 49, 89, 'Detergents', '500 ml', 'https://media.dealshare.in/img/offer/14A26C2128_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Rin Detergent Powder (Pouch) - 1 Kg x 3', 270, 300, 'Detergents', '3 x 1 kg', 'https://media.dealshare.in/img/offer/1752810745039:2002B35ABA_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Swazz Premium Detergent Powder - 1 Kg & Get Matic Top Load Detergent Powder - 1 Kg Free', 165, 465, 'Detergents', 'Combo of 2', 'https://media.dealshare.in/img/offer/1749048836253:Combo_Ncr27427_.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Ariel Complete Detergent - 4 Kg', 699, 1450, 'Detergents', '4 kg', 'https://media.dealshare.in/img/offer/E2086DA36B_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sunlight Detergent Powder - 1 Kg x 3', 279, 300, 'Detergents', '3 x 1 kg', 'https://media.dealshare.in/img/offer/1752810744137:129F448469_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Surf Excel Detergent Bar - 80 Gm x 10', 96, 100, 'Detergents', '10 x 80 gm', 'https://media.dealshare.in/img/offer/1751896908398:021E561516_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Henko Matictop Load Liquid Detergent (Pouch) - 2 Ltr', 359, 430, 'Detergents', '2 ltr', 'https://media.dealshare.in/img/offer/710EEF76AD_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Henko Matic Lintelligent Front Load Powder - 2 Kg', 349, 595, 'Detergents', '2 kg', 'https://media.dealshare.in/img/offer/6AC5A046DB_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Swazz Premium Detergent Powder - 3 Kg & Get Free Chemko Dishwash Gel (lemon) - 2 Ltr', 235, 735, 'Detergents', 'Combo of 2', 'https://media.dealshare.in/img/offer/1747489183345:Combo_kol18165.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Tide Plus Detergent Washing Powder Extra Power Jasmine & Rose -1 Kg x 3', 305, 330, 'Detergents', '3 x 1 kg', 'https://media.dealshare.in/img/offer/1752810743241:4F0C245086_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Swazz Matic Top Load Detergent Powder - 1 Kg x 3', 270, 900, 'Detergents', '3 x 1 kg', 'https://media.dealshare.in/img/offer/1752810744249:201D5A5B19_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sunlight Detergent Powder - 1 Kg', 90, 100, 'Detergents', '1 kg', 'https://media.dealshare.in/img/offer/1742371274271:129F448469_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Tide Plus Lemon & Mint Detergent Powder - 2 Kg', 259, 270, 'Detergents', '2 kg', 'https://media.dealshare.in/img/offer/Deal50311.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('WIPRO Safewash Liquid Detergent - 1 Kg  (Buy 1 Get 1 FREE)', 312, 390, 'Detergents', '1 kg', 'https://images.dealshare.in/offerImage/1716533770Luc18364_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Swazz Matic Top Load Detergent Powder - 1 Kg', 99, 300, 'Detergents', '1 kg', 'https://media.dealshare.in/img/offer/1744278313112:201D5A5B19.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Tide Plus Lemon and Mint Detergent Powder - 1 Kg x 3', 323, 330, 'Detergents', '3 x 1 kg', 'https://media.dealshare.in/img/offer/1752810742989:1B4DA93472_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Tide Naturals Detergent Powder (Lemon & Chandan) - 1 Kg x 3', 240, 255, 'Detergents', '3 x 1 kg', 'https://media.dealshare.in/img/offer/1752810744924:899CD75085_1.png?tr=f-webp', true, 4.5);

