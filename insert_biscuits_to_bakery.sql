-- Insert Biscuits & Cookies products into bakery category
-- Total products: 84
-- Generated automatically
-- Run this script in Supabase SQL Editor

-- STEP 1: Create bakery category if it doesn't exist
INSERT INTO categories (name, description, display_order)
VALUES ('bakery', 'Fresh baked goods, biscuits, cookies and delicious treats', 1)
ON CONFLICT (name) DO NOTHING;

-- STEP 2: Fix the products table to auto-generate IDs
ALTER TABLE products ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

-- STEP 3: Insert all products
INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sunfeast Dark Fantasy Choco Fills - 230 Gm', 99, 170, 'bakery', '230 gm', 'https://media.dealshare.in/img/offer/1751205837362:6954E4D84B_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Cremica Digestive Biscuits (Super Value Pack) - 852.5 Gm', 99, 240, 'bakery', '852.5 gm', 'https://media.dealshare.in/img/offer/1737620300922:9A6350EDF0_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sunfeast Marie Light Biscuit - 956 Gm (Flavour: Common)', 119, 170, 'bakery', '956 gm', 'https://media.dealshare.in/img/offer/1731304455950:D6383A13E3_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sunfeast Dark Fantasy Choco Fills - 230 Gm (Buy 1 Get 1 Free)', 170, 340, 'bakery', '2 x 230 gm', 'https://media.dealshare.in/img/offer/1753877283773:6954E4D84B_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sobisco Desire Kaju Biscuits Rich In Cashew Good In Taste - 200 Gm x 3', 60, 90, 'bakery', '3 x 200 gm', 'https://media.dealshare.in/img/offer/1752810743420:8BC5A12AB9_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Britannia Nutri Choice Thin Arrow Root - 300 Gm x 2', 76, 90, 'bakery', '2 x 300 gm', 'https://media.dealshare.in/img/offer/1752491179438:1DAC518BB0_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sunfeast Marie Light Biscuits - 225 Gm (Buy 2 Get 1 Free)', 60, 90, 'bakery', '3 x 225 gm', 'https://media.dealshare.in/img/offer/1751891071497:AE834D6582_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Britannia Nutri Choice Thin Arrow Root - 300 Gm', 39, 45, 'bakery', '300 gm', 'https://images.dealshare.in/1752491036855:1DAC518BB0_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sobisco Nutro Thin Arrowroot Nutritious Biscuit - 235 Gm', 21, 30, 'bakery', '235 gm', 'https://media.dealshare.in/img/offer/1743833707986:322BB5B4DB_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Parle G Gold Biscuit - 1 Kg', 135, 160, 'bakery', '1 kg', 'https://media.dealshare.in/img/offer/1751011291526:C8C1B49B71_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Parle 20-20 Gold Cashew - 1 Kg', 160, 320, 'bakery', '1 kg', 'https://media.dealshare.in/img/offer/1743131642074:495E2D18E8_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sobisco Desire Marie Biscuit More Light And Crispy - 300 Gm x 3', 80, 120, 'bakery', '3 x 300 gm', 'https://media.dealshare.in/img/offer/1752810746240:D8E962C70F_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sobisco Prime Time Elaichi Flavour Biscuits - 378 Gm', 35, 50, 'bakery', '378 gm', 'https://images.dealshare.in/175377964223208BD62E153_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Cremica Coconut - 900 Gm', 120, 240, 'bakery', '900 gm', 'https://media.dealshare.in/img/offer/6AF1600575_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sobisco Desire Kaju Biscuits Rich In Cashew Good In Taste - 200 Gm', 20, 30, 'bakery', '200 gm', 'https://media.dealshare.in/img/offer/8BC5A12AB9_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Cremica Jeera Lite Biscuits Super Value Pack - 486 Gm', 70, 140, 'bakery', '486 gm', 'https://media.dealshare.in/img/offer/8FACD8D83D_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sobisco Desire Milk 100% Atta Biscuits No Maida No Cholesterol - 220 Gm', 21, 30, 'bakery', '220 gm', 'https://media.dealshare.in/img/offer/2DD4A6FE4A_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sobisco Hum Tum Krackers Biscuits - 65 Gm x 3', 23, 30, 'bakery', '3 x 65 gm', 'https://media.dealshare.in/img/offer/1752810745231:6820B14BEB_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sunfeast Marie Light Biscuits - 225 Gm', 20, 30, 'bakery', '225 gm', 'https://media.dealshare.in/img/offer/AE834D6582_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sunfeast Dark Fantasy Yumfills Cake - 242 Gm', 95, 180, 'bakery', '242 gm', 'https://media.dealshare.in/img/offer/1741771133299:72B55F1ECC_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sobisco Desire Marie Biscuit - More Light And Crispy - 300 Gm', 28, 40, 'bakery', '300 gm', 'https://media.dealshare.in/img/offer/D8E962C70F_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Cremica Marie Classic Biscuit - 500 Gm', 55, 110, 'bakery', '500 gm', 'https://media.dealshare.in/img/offer/7433B81A80_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sunfeast Dark Fantasy Yumfills Cake - 242 Gm (Buy 1 Get 1 Free)', 180, 360, 'bakery', '2 x 242 gm', 'https://media.dealshare.in/img/offer/1751435040188:72B55F1ECC_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Parle Nutricrunch Digestive Cookies - 1 Kg', 284, 290, 'bakery', '1 kg', 'https://media.dealshare.in/img/offer/1742014874678:4680D263D2_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('PriyaGold Marie Lite Biscuits - 300 Gm', 35, 65, 'bakery', '300 gm', 'https://images.dealshare.in/offerImage/1717653034Kol23773_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sobisco Prime Time Elaichi Flavour Biscuits - 378 Gm x 3', 111, 150, 'bakery', '3 x 378 gm', 'https://media.dealshare.in/img/offer/1753708831452:08BD62E153_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Priyagold Cheese Cracker Biscuit - 320 Gm', 58, 110, 'bakery', '320 gm', 'https://media.dealshare.in/img/offer/6D0C1E6300_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Unibic Choco Kiss Cookies Bis - 250 Gm', 85, 170, 'bakery', '250 gm', 'https://media.dealshare.in/img/offer/1752568896962:82FE70F77A_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Unibic Cookies - Danish Coconut Cookies - 270 Gm', 82, 165, 'bakery', '270 gm', 'https://media.dealshare.in/img/offer/1745839225931:8000D7F8C6_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sunfeast Dark Fantasy Choco Cream Biscuit - 237 Gm', 55, 100, 'bakery', '237 gm', 'https://media.dealshare.in/img/offer/1739275190217:5CDEE00BDA_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Britannia Treat Jim Jam Cream Biscuits - 138 Gm', 36, 40, 'bakery', '138 gm', 'https://media.dealshare.in/img/offer/A70B1945F3_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Parle Marie - 800 Gm', 116, 230, 'bakery', '800 gm', 'https://images.dealshare.in/offerImage/1717469911Deal56073_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Parle Fab Bourbon Chocolate Biscuits - 450 Gm', 80, 160, 'bakery', '450 gm', 'https://media.dealshare.in/img/offer/D998F68712_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Priyagold Snacks Zigzag Biscut - 180 Gm (Buy 1 Get 1 Free)', 50, 100, 'bakery', '2 x 180 gm', 'https://media.dealshare.in/img/offer/1751449388916:D72A18A5BE_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Britannia Nice Time Biscuits - 136.5 Gm x 2', 44, 50, 'bakery', '2 x 136.5 gm', 'https://media.dealshare.in/img/offer/1752575722362:9D639C305E_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('PriyaGold Marie Lite Biscuits - 300 Gm (Buy 1 Get 1 Free)', 65, 130, 'bakery', '2 x 300 gm', 'https://media.dealshare.in/img/offer/1751287736058:081AC70D3D_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sobisco Desire Milk 100% Atta Biscuits No Maida No Cholesterol - 220 Gm x 3', 67, 90, 'bakery', '3 x 220 gm', 'https://media.dealshare.in/img/offer/1752810743121:2DD4A6FE4A_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Unibic Fruit & Nut Biscuits - 450 Gm', 100, 200, 'bakery', '450 gm', 'https://media.dealshare.in/img/offer/BD9B93FC4F_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Britannia Bourbon Original Biscuits - 50 Gm x 5', 47, 50, 'bakery', '5 x 50 gm', 'https://media.dealshare.in/img/offer/1752747024471:5415F7A894_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Karachi Fruit & Nut Cookies - 400 Gm', 120, 240, 'bakery', '400 gm', 'https://media.dealshare.in/img/offer/1752568896963:1EE8E13A59_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Parle Happy Happy Choco Chip Cookies - 396 Gm', 75, 150, 'bakery', '396 gm', 'https://media.dealshare.in/img/offer/1751625184372:806C00505F_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Priyagold Club Creme Chocolate - 350 Gm', 55, 110, 'bakery', '350 gm', 'https://media.dealshare.in/img/offer/7EACCE855F_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Parle Rusk - 1 Kg', 198, 240, 'bakery', '1 kg', 'https://media.dealshare.in/img/offer/D951B3112B_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Priyagold Snacks Zigzag Biscut - 180 Gm', 31, 50, 'bakery', '180 gm', 'https://media.dealshare.in/img/offer/D72A18A5BE_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Britannia Marie Gold Biscuits - 250 Gm', 38, 40, 'bakery', '250 gm', 'https://media.dealshare.in/img/offer/Deal58839.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Priyagold CNC Biscuits - 150 Gm + Get 30 Gm FREE', 31, 50, 'bakery', '180 gm', 'https://media.dealshare.in/img/offer/961DD5FA9D_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Cremica Coconut Cookies - 85.71 Gm x 2', 20, 40, 'bakery', '2 x 85.71 gm', 'https://media.dealshare.in/img/offer/1752491183154:2166C23DA8_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Britannia Nutri Choice Sugar Free Cracker - 60 Gm x 3', 28, 30, 'bakery', '3 x 60 gm', 'https://media.dealshare.in/img/offer/1752810280024:3D6BFAD232_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Cremica Marie Classic Biscuit - 500 Gm (Buy 1 Get 1 Free)', 110, 220, 'bakery', '2 x 500 gm', 'https://media.dealshare.in/img/offer/1751435040066:7433B81A80_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Parle Hide & Seek 4 Fun Flavours Choco Chip Creme Sandwiches Biscuits - 400 Gm', 88, 180, 'bakery', '400 gm', 'https://media.dealshare.in/img/offer/1752051763347:15B2E34E04_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Priyagold Krack N Cheers Cnc Biscuits - 350 Gm', 55, 110, 'bakery', '350 gm', 'https://media.dealshare.in/img/offer/1738906531832:0A10AA7F2D_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Khao Piyo Eliachi Rusk (toast) - 70 Gm', 15, 20, 'bakery', '70 gm', 'https://media.dealshare.in/img/offer/03081C89B9_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sobisco Nutro Thin Arrowroot Nutritious Biscuit - 235 Gm x 3', 67, 90, 'bakery', '3 x 235 gm', 'https://media.dealshare.in/img/offer/1752810906932:322BB5B4DB_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Unibic Choco Chips Cookis Bis - 450 Gm', 103, 200, 'bakery', '450 gm', 'https://media.dealshare.in/img/offer/39F5D37552_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sunfeast Dark Fantasy Choco Cream Biscuit - 237 Gm (Buy 1 Get 1 Free)', 100, 200, 'bakery', '2 x 237 gm', 'https://media.dealshare.in/img/offer/1751422028481:5CDEE00BDA_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Karachi Ajwain Cookies - 400 Gm', 120, 240, 'bakery', '400 gm', 'https://media.dealshare.in/img/offer/1752051762832:CA92E22311_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Parle 20-20 Gold Cashew - 1 Kg (Buy 1 Get 1 Free)', 320, 640, 'bakery', '2 x 1 kg', 'https://media.dealshare.in/img/offer/1751422027661:495E2D18E8_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Hide & Seek Milano Centre Filled Choco Cookies - 250 Gm', 85, 170, 'bakery', '250 gm', 'https://media.dealshare.in/img/offer/1751526269623:2AE11E6DA6_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Karachi Butter Cashew Cookies - 400 Gm', 120, 240, 'bakery', '400 gm', 'https://media.dealshare.in/img/offer/1752051763333:9B50E222CA_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Cremica Coconut Cookies - 85.71 Gm x 3', 30, 60, 'bakery', '3 x 85.71 gm', 'https://media.dealshare.in/img/offer/1752810282020:2166C23DA8_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Cremica Party Cracker - 400 Gm', 45, 110, 'bakery', '400 gm', 'https://media.dealshare.in/img/offer/1F0B57A839_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Cremica Bourbon Cream - 111.4 Gm', 22, 35, 'bakery', '111.4 gm', 'https://media.dealshare.in/img/offer/7140640D2E_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Sunfeast Mom''s Magic Cashew Almond - 896 Gm', 141, 290, 'bakery', '896 gm', 'https://media.dealshare.in/img/offer/1752821521165:FE7A81A512_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Cremica Jeera Lite Biscuits Super Value Pack - 486 Gm x 2', 140, 280, 'bakery', '2 x 486 gm', 'https://media.dealshare.in/img/offer/1752917201943:8FACD8D83D_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Horlicks Biscuit - 300 Gm', 43, 45, 'bakery', '300 gm', 'https://images.dealshare.in/1752491037468:06D0C275D8_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Unibic Choco Kiss Cookies Bis - 250G (Buy 1 Get 1 Free)', 170, 340, 'bakery', '2 x 250 gm', 'https://media.dealshare.in/img/offer/1752568896962:82FE70F77A_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Unibic Choco Ripple Cookies - 45 Gm x 3', 26, 30, 'bakery', '3 x 45 gm', 'https://media.dealshare.in/img/offer/1752810744831:784DD1963B_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Parle Platina Hide & Seek Black Bourbon Vanila- 300 Gm', 75, 150, 'bakery', '300 gm', 'https://media.dealshare.in/img/offer/1751625184670:322176A1F4_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Parle Magix Kream Round Chocolate Biscuit - 183.6 gm', 30, 60, 'bakery', '183.6 gm', 'https://images.dealshare.in/17536943048873128068206_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Parle Milk Shakti Biscuits - 350 Gm', 50, 100, 'bakery', '350 gm', 'https://media.dealshare.in/img/offer/BC33866C37_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Raja Golden Marie Biscuit - 280 Gm', 39, 40, 'bakery', '280 gm', 'https://media.dealshare.in/img/offer/Kol22948.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Parle Platina Hide & Seek Black Bourbon Choco - 300 Gm', 75, 150, 'bakery', '300 gm', 'https://media.dealshare.in/img/offer/1751625185267:EECD55C726_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Karachi Jeera Cookies - 400 Gm', 120, 240, 'bakery', '400 gm', 'https://media.dealshare.in/img/offer/1752051763547:971C914DD3_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Horlicks Biscuit - 300 Gm x 2', 86, 90, 'bakery', '2 x 300 gm', 'https://media.dealshare.in/img/offer/1752491181146:06D0C275D8_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Cremica Party Cracker - 400 Gm x 2', 89, 220, 'bakery', '2 x 400 gm', 'https://media.dealshare.in/img/offer/1752491179945:1F0B57A839_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Parle Magix Kream Round Orange Biscuit - 183.6 Gm', 55, 60, 'bakery', '183.6 gm', 'https://media.dealshare.in/img/offer/6128C3C804_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Britannia Marie Gold Biscuits (Combo Pack 4 + 1) - 585 Gm', 98, 100, 'bakery', '585 gm', 'https://media.dealshare.in/img/offer/1DD60B2D71_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Cremica Coconut - 900 Gm (Buy 1 Get 1 Free)', 240, 480, 'bakery', '2 x 900 gm', 'https://media.dealshare.in/img/offer/1751435040287:6AF1600575_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Parle Milano Centre Filled Choco Cookies - 250 Gm', 84, 170, 'bakery', '250 gm', 'https://images.dealshare.in/175283220749129E2B54029_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Unibic Fruit & Nut Biscuits - 450 Gm (Buy 1 Get 1 Free)', 200, 400, 'bakery', '2 x 450 gm', 'https://media.dealshare.in/img/offer/1751446751766:BD9B93FC4F_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Parle Monaco Biscuit - 696 Gm', 135, 150, 'bakery', '696 gm', 'https://media.dealshare.in/img/offer/1751010092831:56D59C0F26_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Parle Krackjack Biscuits - 705 Gm', 119, 150, 'bakery', '705 gm', 'https://media.dealshare.in/img/offer/1751009431009:31BB218583_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Britannia Good Day Cashew Cookies - 600 Gm', 139, 150, 'bakery', '565 gm', 'https://media.dealshare.in/img/offer/1751011291404:A5CE9C9354_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Nova Nova Waffle Cookies Dark Chocolate - 65 Gm (Pack Of 6)', 96, 120, 'bakery', '65 gm', 'https://images.dealshare.in/1753442755677:8319EECCA4_1.png?tr=f-webp', true, 4.5);
