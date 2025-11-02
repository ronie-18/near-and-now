-- Insert Dals & Pulses products into Staples category
-- Total products: 45
-- Generated automatically
-- Run this script in Supabase SQL Editor
-- NOTE: This assumes 'Staples' category already exists in the database

-- STEP 1: Ensure products table auto-generates IDs
ALTER TABLE products ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

-- STEP 2: Insert all products into existing 'Staples' category

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Super Saver Moong Dal - 1 Kg', 110, 175, 'Staples', '1 kg', 'https://media.dealshare.in/img/offer/1751011292218:F4B71649D4_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Masoor Malka - 1 Kg', 99, 145, 'Staples', '1 kg', 'https://images.dealshare.in/1753346350479:061D5B1C47_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Soya Wadi - 1 Kg', 90, 225, 'Staples', '1 kg', 'https://images.dealshare.in/1753873107805E1813A543C_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Moong Dal Dhuli - 1 Kg', 135, 200, 'Staples', '1 kg', 'https://images.dealshare.in/1753346350083:22E083213C_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Matar Dal - 1 Kg', 68, 100, 'Staples', '1 kg', 'https://images.dealshare.in/1753346352082:DB131CBFCC_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Chana Dal - 1 Kg', 115, 170, 'Staples', '1 kg', 'https://images.dealshare.in/1753346349974:22C7873ABA_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Mix Dal - 1 Kg', 156, 190, 'Staples', '1 kg', 'https://images.dealshare.in/1753346351756:65583BE4E8_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Groundnut - 500 Gm', 77, 125, 'Staples', '500 gm', 'https://media.dealshare.in/img/offer/1738734937580:758FEE5984_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Moong Dal Dhuli - 500 Gm', 75, 105, 'Staples', '500 gm', 'https://media.dealshare.in/img/offer/1734774925555:679AAA39E5_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Green Moong Whole - 500 Gm', 78, 100, 'Staples', '500 gm', 'https://media.dealshare.in/img/offer/1734768067226:51D70F87EC_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Kabuli Chana Regular - 500 Gm', 75, 115, 'Staples', '500 gm', 'https://media.dealshare.in/img/offer/1734772127769:D6C231FA06_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Masoor Malka - 1 Kg x 2', 198, 290, 'Staples', '2 x 1 kg', 'https://media.dealshare.in/img/offer/1753346168145:061D5B1C47_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Urad Dal White - 500 Gm', 83, 115, 'Staples', '500 gm', 'https://media.dealshare.in/img/offer/1734845912535:452CCB3360_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Rajma Chitra - 500 Gm', 87, 120, 'Staples', '500 gm', 'https://media.dealshare.in/img/offer/1734776211934:C6006E974C_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Masoor Dal Small - 500 Gm', 68, 90, 'Staples', '500 gm', 'https://media.dealshare.in/img/offer/074E391095_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Moong Dal Sona - 500 Gm', 105, 140, 'Staples', '500 gm', 'https://media.dealshare.in/img/offer/E050034C33_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Super Saver Chana Dal - 1 Kg', 82, 150, 'Staples', '1 kg', 'https://images.dealshare.in/1753789419786:Z44CBCC53A_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti White Peas/Vatana - 500 Gm', 43, 60, 'Staples', '500 gm', 'https://media.dealshare.in/img/offer/1734845912480:3E72FBB533_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Urad Dal White - 1 Kg', 159, 220, 'Staples', '1 kg', 'https://media.dealshare.in/img/offer/1734845912651:7891ADCC88_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Roasted Chana - 200 Gm', 31, 50, 'Staples', '200 gm', 'https://media.dealshare.in/img/offer/1734776211363:63BA874374_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti White Peas/Vatana - 1 Kg', 66, 110, 'Staples', '1 kg', 'https://media.dealshare.in/img/offer/1734845912533:330EE353D8_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Mix Dal - 500 Gm', 85, 100, 'Staples', '500 gm', 'https://media.dealshare.in/img/offer/1734774925349:9BE237F157_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Super Saver Kala Chana - 1 Kg', 84, 140, 'Staples', '1 kg', 'https://images.dealshare.in/1753789419712:H3B3E923C1_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Rajma Kashmiri - 500 Gm', 87, 145, 'Staples', '500 gm', 'https://media.dealshare.in/img/offer/1734776211531:313AC9913E_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Urad Chilka Black - 500 Gm', 80, 100, 'Staples', '500 gm', 'https://media.dealshare.in/img/offer/1734845912754:BEDEF6D72B_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Green Moong Whole - 1 Kg', 151, 190, 'Staples', '1 kg', 'https://media.dealshare.in/img/offer/1734768067226:080D45D038_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Toor Dal Economy - 1 Kg', 155, 275, 'Staples', '1 kg', 'https://media.dealshare.in/img/offer/1734845912512:7F7316E85D_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Masoor Black Whole - 500 Gm', 60, 70, 'Staples', '500 gm', 'https://media.dealshare.in/img/offer/1734774925296:4E05CF15C6_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Super Saver Matar Dal Economy - 1 Kg', 58, 100, 'Staples', '1 kg', 'https://images.dealshare.in/1753789419712:B50CE884A5_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Super Saver White Peas/vatana - 1 Kg', 57, 100, 'Staples', '1 kg', 'https://images.dealshare.in/1753789419793:FC053C9848_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Masoor Malka - 500 Gm', 62, 75, 'Staples', '500 gm', 'https://media.dealshare.in/img/offer/1734774925631:D3ABCA0C17_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Moth - 500 Gm', 69, 80, 'Staples', '500 gm', 'https://media.dealshare.in/img/offer/1734776211259:036C71A0D8_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Urad Whole Black - 500 Gm', 83, 115, 'Staples', '500 gm', 'https://media.dealshare.in/img/offer/1734845912480:2FCCA36B4A_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Toor Dal Economy - 500 Gm', 82, 140, 'Staples', '500 gm', 'https://media.dealshare.in/img/offer/8E3F58CC62_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Matar Dal - 500 Gm', 41, 50, 'Staples', '500 gm', 'https://media.dealshare.in/img/offer/1734774925646:C637DBAD3D_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Makai Seed - 200 Gm x 2', 67, 120, 'Staples', '2 x 200 gm', 'https://media.dealshare.in/img/offer/1753346170457:E24B376A83_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Chana Dal - 1 Kg x 2', 229, 340, 'Staples', '2 x 1 kg', 'https://media.dealshare.in/img/offer/1753346167545:22C7873ABA_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Urad Dal Bari - 200 Gm', 64, 90, 'Staples', '200 gm', 'https://media.dealshare.in/img/offer/2534DF2D1B_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Kala Chana - 1 Kg', 101, 160, 'Staples', '1 kg', 'https://media.dealshare.in/img/offer/1734757173668:7703DE8632_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Groundnut - 500 Gm + Sampoorti Sabudana - 500 Gm', 120, 195, 'Staples', 'Combo of 2', 'https://media.dealshare.in/img/offer/1743159264947:Combo_kol18156.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Masoor Dal Bari - 200 Gm', 63, 90, 'Staples', '200 gm', 'https://media.dealshare.in/img/offer/894AE46F9C_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Rajma Jammu Red - 500 Gm', 75, 100, 'Staples', '500 gm', 'https://media.dealshare.in/img/offer/1734776302654:4C6B1CC3ED_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Moong Dal Chilka - 500 Gm', 82, 100, 'Staples', '500 gm', 'https://media.dealshare.in/img/offer/1734774925834:D50F970354_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sampoorti Matar Dal - 1 Kg x 2', 135, 200, 'Staples', '2 x 1 kg', 'https://media.dealshare.in/img/offer/1753346170351:DB131CBFCC_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Super Saver Toor Dal  - 1 Kg', 129, 250, 'Staples', '1 kg', 'https://media.dealshare.in/img/offer/1751011292114:E74C229A5E_1.png', true, 4.5);

