-- Insert Chocolates & Candies products into chocolates-and-candies category
-- Total products: 95
-- Generated automatically
-- Run this script in Supabase SQL Editor

-- STEP 1: Create chocolates-and-candies category if it doesn't exist
INSERT INTO categories (name, description, display_order)
VALUES ('chocolates-and-candies', 'Indulge in delicious chocolates, candies, and sweet treats', 3)
ON CONFLICT (name) DO NOTHING;

-- STEP 2: Ensure products table auto-generates IDs
ALTER TABLE products ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

-- STEP 3: Insert all products
INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Alpenlieble Gold Caramel Toffee - 132 Gm x 2', 50, 100, 'chocolates-and-candies', '2 x 132 gm', 'https://media.dealshare.in/img/offer/1752575725394:A87BB1EF36_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Cadbury Celebrations Assorted Chocolate Gift Pack - 102.6 Gm', 109, 110, 'chocolates-and-candies', '102.6 gm', 'https://images.dealshare.in/175379557812274F9D0F9A8_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Priyagold Eclairs - 225 Gm', 37, 50, 'chocolates-and-candies', '225 gm', 'https://media.dealshare.in/img/offer/1741596845862:3F765A690F_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Cadbury Celebrations Gift Pack Assorted Chocolates - 54.2 Gm', 47, 50, 'chocolates-and-candies', '51.2 gm', 'https://media.dealshare.in/img/offer/1729007908884:1F930BD81A_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Amul Choco Minis Chocolate Box - 250 Gm', 133, 140, 'chocolates-and-candies', '250 gm', 'https://media.dealshare.in/img/offer/A05B7BF518_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Candyman Choco Double Eclairs - 262.5 Gm', 50, 100, 'chocolates-and-candies', '262.5 gm', 'https://media.dealshare.in/img/offer/1723181188135:F437EF5927_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Parle Melody Chocolaty - 175.95 Gm', 46, 50, 'chocolates-and-candies', '175.95 gm', 'https://media.dealshare.in/img/offer/C9DDD0717C_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Priyagold Toffito Milk Caramel Toffee (50 Pieces Pouch) - 200 Gm', 37, 50, 'chocolates-and-candies', '200 gm', 'https://images.dealshare.in/1753854495599:2D07ADBF14_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Parle Kismi Assorted - 245.5 Gm', 47, 50, 'chocolates-and-candies', '245.5 gm', 'https://media.dealshare.in/img/offer/C05832E0FD_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Priyagold Shokk Kachcha Aam With Masala Candy (50 Pieces Pouch) - 200 Gm', 37, 50, 'chocolates-and-candies', '200 gm', 'https://images.dealshare.in/1753853813100:A930F5431B_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Cadbury Dairy Milk Chocolate - 46 Gm', 56, 60, 'chocolates-and-candies', '46 gm', 'https://media.dealshare.in/img/offer/Deal59351.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Cadbury Dairy Milk Home Treats Chocolate - 119 Gm', 148, 149, 'chocolates-and-candies', '119 gm', 'https://media.dealshare.in/img/offer/1747916073331:66B4199885_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Cadbury Dairy Milk Fruit & Nut Chocolate Bar - 36 Gm', 52, 55, 'chocolates-and-candies', '36 gm', 'https://media.dealshare.in/img/offer/48A06CCEFC_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Yogabar Energy Bar Chocolate Chunk Nut - 35 Gm', 25, 50, 'chocolates-and-candies', '35 gm', 'https://media.dealshare.in/img/offer/15B61F01DD_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Candzey Chulbuli Imli - 126 Gm', 30, 60, 'chocolates-and-candies', '126 gm', 'https://media.dealshare.in/img/offer/260605452D_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Alpenliebe Juzt Jelly Strawberry Soft Candy (pouch) - 140 Gm', 47, 50, 'chocolates-and-candies', '140 gm', 'https://media.dealshare.in/img/offer/1752733449086:141644EB05_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Alpenlieble Gold Caramel Toffee - 132 Gm', 47, 50, 'chocolates-and-candies', '132 gm', 'https://media.dealshare.in/img/offer/A87BB1EF36_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Cadbury Dairy Milk Crispello Chocolate - 35 Gm', 42, 45, 'chocolates-and-candies', '35 gm', 'https://media.dealshare.in/img/offer/2970DDF73C_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Parle Melody Chocolate - 391 Gm', 96, 100, 'chocolates-and-candies', '391 gm', 'https://media.dealshare.in/img/offer/1751625184382:2606C4E1C5_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Cadbury Dairy Milk Chocolate - 18 Gm x 2', 38, 40, 'chocolates-and-candies', '2 x 18 gm', 'https://media.dealshare.in/img/offer/1752575722958:77A5F3EC0A_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Cadbury Dairy Milk Crackle Chocolate Bar - 36 Gm', 51, 55, 'chocolates-and-candies', '36 gm', 'https://media.dealshare.in/img/offer/1752683454373:44B8CEB8C0_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Chupa Chups Sour Bites Mixed Fruit Flavour Soft & Chewy Toffee - 61.6 Gm', 33, 35, 'chocolates-and-candies', '61.6 gm', 'https://media.dealshare.in/img/offer/0BACDB11FE_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Candzey  Masala Candy - 145 Gm', 30, 60, 'chocolates-and-candies', '145 gm', 'https://media.dealshare.in/img/offer/E6E04149F1_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Alpenliebe Eclairs Plus Caramel Choco Chewy Toffee (125 Pieces) - 425 Gm', 128, 150, 'chocolates-and-candies', '425 gm', 'https://media.dealshare.in/img/offer/2689CBDF67_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Candyman Toffichoo Strawberry Toffee - 350 Gm', 66, 100, 'chocolates-and-candies', '350 gm', 'https://media.dealshare.in/img/offer/3C599D640E_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Alpenliebe Juzt Jelly Heart (Pouch) - 94.6 Gm', 42, 50, 'chocolates-and-candies', '94.6 gm', 'https://media.dealshare.in/img/offer/CEA524B9E0_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Yogabar Energy Bar Chocolate Chunk Nut - 35 Gm (Buy 1 Get 1 Free)', 50, 100, 'chocolates-and-candies', '2 x 35 gm', 'https://media.dealshare.in/img/offer/1751287103046:15B61F01DD_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Galaxy Milk Chocolate With Fruit & Nut - 52 Gm', 90, 110, 'chocolates-and-candies', '52 gm', 'https://media.dealshare.in/img/offer/55C61A1F52_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Snickers Almond Filled Chocolate Bar - 45 Gm', 56, 70, 'chocolates-and-candies', '45 gm', 'https://media.dealshare.in/img/offer/799D52914D_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Chupa Chups Sour Belt Mixed Fruit Flavour Soft & Chewy Toffee (8 Piece) - 57.6 Gm', 28, 30, 'chocolates-and-candies', '57.6 gm', 'https://images.dealshare.in/1753176725962:74C5ED9C5B_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Alpenliebe Pop Assorted Lollipop Pack (Orange, Strawberry & Caramel Flavour) - 64 Gm', 47, 50, 'chocolates-and-candies', '64 gm', 'https://media.dealshare.in/img/offer/693258CCFC_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Happydent Wave Xylitol Sugarfree Mint Flavour Chewing Gum Pocket Bottle - 28.9 Gm', 44, 50, 'chocolates-and-candies', '28.9 gm', 'https://media.dealshare.in/img/offer/BA1B5DEA5F_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Alpenliebe Juzt Jelly Soft Candy Fruity Bears (Pouch) - 67.5 Gm', 33, 35, 'chocolates-and-candies', '67.5 gm', 'https://media.dealshare.in/img/offer/1ABAA241EC_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Yogabar 20G Protein Bar Powerup (Coffee Crush) - 70 Gm', 95, 140, 'chocolates-and-candies', '70 gm', 'https://images.dealshare.in/1753254310162:SFC1A63310_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Chupa Chups Rockat (Pouch) - 93 Gm', 42, 50, 'chocolates-and-candies', '93 gm', 'https://media.dealshare.in/img/offer/1751873206310:LFC8790456_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Cadbury Dairy Milk Chocolate - 18 Gm', 20, 20, 'chocolates-and-candies', '18 gm', 'https://media.dealshare.in/img/offer/77A5F3EC0A_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Ritebite Sports Bar - 40 Gm', 41, 45, 'chocolates-and-candies', '40 gm', 'https://media.dealshare.in/img/offer/1751873203687:1FE2646363_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Max Protein Daily Choco Almond - 50 Gm', 73, 80, 'chocolates-and-candies', '50 gm', 'https://media.dealshare.in/img/offer/1751873205688:C1C9E34321_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Galaxy Smooth Milk Chocolate Bar - 30 Gm', 41, 50, 'chocolates-and-candies', '1 Variant', 'https://media.dealshare.in/img/offer/EE0A9D96A9_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Snickers Butterscotch Chocolate Bar - 40 Gm', 56, 70, 'chocolates-and-candies', '40 gm', 'https://media.dealshare.in/img/offer/1DDEF4E1BB_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Yogabar 10 Gm Protein Bar - Coffee Rush - 50 Gm (Buy 1 Get 1 Free)', 100, 200, 'chocolates-and-candies', '2 x 50 gm', 'https://media.dealshare.in/img/offer/1751449390219:EB9FF802CD_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Alpenliebe Gold Caramel Candy Stick - 36 Gm', 20, 20, 'chocolates-and-candies', '36 gm', 'https://media.dealshare.in/img/offer/8C8C48EDAE_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Snickers Peanut Brownie Filled Bar - 45 Gm', 64, 70, 'chocolates-and-candies', '45 gm', 'https://media.dealshare.in/img/offer/235E649479_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Alpenliebe Grande Eclairs 25 Pieces (pouch) - 120 Gm', 47, 50, 'chocolates-and-candies', '120 gm', 'https://images.dealshare.in/1753098434949:Y13ECA1716_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Boomer Chewing Gum Strawberry - 18.6 Gm', 9, 10, 'chocolates-and-candies', '18.6 gm', 'https://media.dealshare.in/img/offer/DCDE2BC399_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Snickers Peanut Filled Chocolate Bar - 20 Gm', 18, 20, 'chocolates-and-candies', '20 gm', 'https://media.dealshare.in/img/offer/9E8DAF5D62_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Fruittella Orange Flavour Chewy Toffee Stick - 45 Gm', 28, 35, 'chocolates-and-candies', '45 gm', 'https://media.dealshare.in/img/offer/DCB4BD0572_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Candzey Jub Jubs - 80 Gm', 25, 50, 'chocolates-and-candies', '80 gm', 'https://media.dealshare.in/img/offer/A6F33B622C_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Skittles Original Fruit Flavoured Candies - 27.3 Gm', 46, 50, 'chocolates-and-candies', '27.3 gm', 'https://media.dealshare.in/img/offer/CB5BE476A6_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Retro Rush Chilli Guava Flavour Candy - 90 Gm', 18, 38, 'chocolates-and-candies', '90 gm', 'https://media.dealshare.in/img/offer/5C1082B32D_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Chupa Chups Gum Filled Lollipop (Cherry) - 88 Gm', 47, 50, 'chocolates-and-candies', '88 gm', 'https://media.dealshare.in/img/offer/1752733447789:A92EF724CF_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Retro Rush Lemon Flavour Candy - 90 Gm', 18, 38, 'chocolates-and-candies', '90 gm', 'https://media.dealshare.in/img/offer/DE847AD5C5_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Chupa Chups Sour Tubes Assorted Fruits Flavour, Soft & Chewy Toffee Pouch - 61.6 Gm', 32, 35, 'chocolates-and-candies', '61.6 gm', 'https://media.dealshare.in/img/offer/1752733448184:J08E1C0A59_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Max Protein Daily Choco Classic - 50 Gm', 73, 80, 'chocolates-and-candies', '50 gm', 'https://media.dealshare.in/img/offer/1751873204702:AEEFB5BE9E_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Max Protein Daily Fruit & Nut - 50 Gm', 73, 80, 'chocolates-and-candies', '50 gm', 'https://media.dealshare.in/img/offer/1751873204992:B3F79421D4_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Alpenliebe Juzt Jelly Guava Candy - 140 Gm', 44, 50, 'chocolates-and-candies', '140 gm', 'https://media.dealshare.in/img/offer/846DCB6232_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Double Mint Peppermint Chewy Mint Tube - 27.3 Gm', 45, 50, 'chocolates-and-candies', '27.3 gm', 'https://media.dealshare.in/img/offer/3D0610EDE7_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Chupa Chups Sour Bites - 61.6 Gm + Alpenliebe Pop - 64 Gm', 76, 85, 'chocolates-and-candies', 'Combo of 2', 'https://media.dealshare.in/img/offer/37191749727092Combo_Ncr27439.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Center Fruit Fruits Flavour Bubble Gum Stick - 23.6 Gm', 15, 15, 'chocolates-and-candies', '23.6 gm', 'https://media.dealshare.in/img/offer/9006F16AC2_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Fruittella Strawberry Flavour Chewy Toffee Stick - 45 Gm', 28, 35, 'chocolates-and-candies', '45 gm', 'https://media.dealshare.in/img/offer/5612E84E51_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Ritebite Choco Delite - 40 Gm', 41, 45, 'chocolates-and-candies', '40 gm', 'https://media.dealshare.in/img/offer/1751873204101:1086EFF914_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Wrigley''s Orbit Mix Fruit Flavour (chewing Gum) - 19.8 Gm', 45, 50, 'chocolates-and-candies', '19.8 gm', 'https://media.dealshare.in/img/offer/8AA8E584DC_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Happydent White Xylitol Sugarfree (Spearmint) Chewing Gum (Bottle) - 16.5 Gm x 2', 89, 100, 'chocolates-and-candies', '2 x 24.2 gm', 'https://media.dealshare.in/img/offer/1752661713475:ECF87C79D0_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Candyman Tadka Lollipop - 88 Gm', 48, 50, 'chocolates-and-candies', '88 gm', 'https://media.dealshare.in/img/offer/5A646C044C_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Yogabar 20G Protein Bar Powerup (Choco Peanut Butter) - 70 Gm', 95, 140, 'chocolates-and-candies', '70 gm', 'https://images.dealshare.in/1753254308982:L241AF5DEF_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Candzey Jub Jubs - 80 Gm (Buy 1 Get 1 Free)', 50, 100, 'chocolates-and-candies', '2 x 80 gm', 'https://media.dealshare.in/img/offer/1751440713278:A6F33B622C_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Skittles Wild Berry Flavoured Candies - 27.3 Gm', 46, 50, 'chocolates-and-candies', '27.3 gm', 'https://media.dealshare.in/img/offer/F26D88384E_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Mentos Mint Flavour Chewy Candy Stick - 36.4 Gm', 20, 20, 'chocolates-and-candies', '36.4 gm', 'https://media.dealshare.in/img/offer/1738242855402:1B831BB108_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Wrigleys Orbit Chewing Gum (Spearmint, Sugarfree) - 22 Gm', 45, 50, 'chocolates-and-candies', '19.8 gm', 'https://images.dealshare.in/1754547194767:6BAAA2AE2C_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Center Fruit Tennis Ball Shape Pineapple Flavour Liquid Filled Chewing Gum (16 Pieces) - 67.2 Gm', 44, 50, 'chocolates-and-candies', '67.2 gm', 'https://images.dealshare.in/1754549230840M7A7934114_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Happydent White Xylitol Sugarfree (Spearmint) Chewing Gum (Bottle) - 16.5 Gm', 47, 50, 'chocolates-and-candies', '24.2 gm', 'https://media.dealshare.in/img/offer/1744287706188:ECF87C79D0_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Happydent Wave Xylitol Sugarfree Mint Flavour Chewing Gum Pocket Bottle - 28.9 Gm x 2', 85, 100, 'chocolates-and-candies', '2 x 28.9 gm', 'https://media.dealshare.in/img/offer/1752661710393:BA1B5DEA5F_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Max Protein Daily Choco Berry - 50 Gm', 73, 80, 'chocolates-and-candies', '50 gm', 'https://media.dealshare.in/img/offer/1751873204791:A9F8F75C31_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Retro Rush Lemon Flavour Candy - 90 Gm (Buy 1 Get 1 Free)', 38, 76, 'chocolates-and-candies', '2 x 90 gm', 'https://media.dealshare.in/img/offer/1751449387505:DE847AD5C5_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Yogabar Protein Minis - Choco Peanut Butter (pouch) 20 Gm (pack Of 7) - 140 Gm', 101, 199, 'chocolates-and-candies', '140 gm', 'https://images.dealshare.in/1753254309566:R33F3AFE5A_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Yogabar 10 Gm Protein Bar - Blueberry Blast - 50 Gm (Buy 1 Get 1 Free)', 100, 200, 'chocolates-and-candies', '2 x 50 gm', 'https://media.dealshare.in/img/offer/1751422030678:56E4969AF2_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Wrigley''s Doublemint Lemon Chewy Mints - 27.3 Gm', 45, 50, 'chocolates-and-candies', '27.3 gm', 'https://media.dealshare.in/img/offer/BDD5525D4D_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Alpenliebe Gold Caramel Candy Stick - 36 Gm x 2', 36, 40, 'chocolates-and-candies', '2 x 36 gm', 'https://media.dealshare.in/img/offer/1752575722074:8C8C48EDAE_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Fruittella Orange Flavour Chewy Toffee Stick - 45 Gm x 3', 85, 105, 'chocolates-and-candies', '3 x 45 gm', 'https://media.dealshare.in/img/offer/1751274093231:DCB4BD0572_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Fruittella Strawberry Flavour Chewy Toffee Stick - 45 Gm x 3', 85, 105, 'chocolates-and-candies', '3 x 45 gm', 'https://media.dealshare.in/img/offer/1751274094076:5612E84E51_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Alpenliebe Juzt Jelly (Guava - 148 Gm + Heart Pouch - 94.6 Gm)', 85, 100, 'chocolates-and-candies', 'Combo of 2', 'https://images.dealshare.in/1753965769692Combo_kol18188.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Alpenliebe Juzt Jelly Soft Candy Fruity Bears (Pouch) - 67.5 Gm x 2', 62, 70, 'chocolates-and-candies', '2 x 67.5 gm', 'https://media.dealshare.in/img/offer/1752491179267:1ABAA241EC_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Parle Bigger Mango Bite - 214.5 Gm', 45, 60, 'chocolates-and-candies', '214.5 gm', 'https://media.dealshare.in/img/offer/1739275190737:215C81F77A_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Yogabar Energy Bar - Nuts & Seeds Crunch - 38 Gm', 25, 50, 'chocolates-and-candies', '35 gm', 'https://media.dealshare.in/img/offer/F2F2FDC948_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Parle Bigger Orange Bite - 214.5 Gm', 45, 60, 'chocolates-and-candies', '214.5 gm', 'https://media.dealshare.in/img/offer/1728639590019:AE421BA8D2_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Yogabar Breakfast Bar - Blueberry Pie - 45 Gm', 30, 60, 'chocolates-and-candies', '45 gm', 'https://media.dealshare.in/img/offer/D3B80BD221_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Yogabar 10 Gm Protein Bar - Blueberry Blast - 50 Gm', 47, 100, 'chocolates-and-candies', '50 gm', 'https://media.dealshare.in/img/offer/56E4969AF2_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Cadbury Dairy Milk Roast Almond Chocolate Bar - 36 Gm', 52, 55, 'chocolates-and-candies', '36 gm', 'https://media.dealshare.in/img/offer/1752741556090:B927CFA052_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Yogabar 10 Gm Protein Bar - Coffee Rush - 50 Gm', 35, 100, 'chocolates-and-candies', '50 gm', 'https://media.dealshare.in/img/offer/EB9FF802CD_1.webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Cadbury Gems Surprise Ball - 15.8 Gm', 48, 50, 'chocolates-and-candies', '15.8 gm', 'https://media.dealshare.in/img/offer/1752741554925:1C56D665F4_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Nova Nova Double Choco Chip Waffle Chips With Chocolate Drizzle - 65 Gm', 71, 99, 'chocolates-and-candies', '65 gm', 'https://media.dealshare.in/img/offer/1738669631970:9FACEF022D_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Nova Nova Classic Chocolate Drizzle Waffle Chips - 65 Gm', 71, 99, 'chocolates-and-candies', '65 gm', 'https://images.dealshare.in/1753442756671:E5977AF70A_1.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Fruittella Chewy Toffee Stick (Orange & Strawberry) - 45 Gm Each', 65, 70, 'chocolates-and-candies', 'Combo of 2', 'https://media.dealshare.in/img/offer/16201749726736Combo_Ncr27438.png?tr=f-webp', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Cadbury Fuse Chocolate Bar - 43 Gm', 50, 50, 'chocolates-and-candies', '43 gm', 'https://media.dealshare.in/img/offer/CF1361CBF0_1.png', true, 4.5);

INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('Cadbury 5 Star Chocolate Bar Home Treats - 144 Gm', 117, 120, 'chocolates-and-candies', '133.5 gm', 'https://media.dealshare.in/img/offer/1746179441174:24EBBBF9DF_1.png', true, 4.5);

