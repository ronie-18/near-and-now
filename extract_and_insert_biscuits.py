#!/usr/bin/env python3
import re
import xml.etree.ElementTree as ET
import html

# Parse the XML file
tree = ET.parse('temp_excel/xl/worksheets/sheet1.xml')
root = tree.getroot()

# Define namespace
ns = {'ss': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

# Get all rows
rows = root.findall('.//ss:row', ns)

products = []

# Skip header row (row 1), process rows 2 onwards
for row in rows[1:]:
    cells = row.findall('.//ss:c', ns)
    
    # Extract data from cells
    product_data = {}
    for cell in cells:
        cell_ref = cell.get('r')
        text_elem = cell.find('.//ss:t', ns)
        
        if text_elem is not None and text_elem.text:
            # Column I is title (name)
            if cell_ref.startswith('I'):
                product_data['name'] = text_elem.text.strip()
            # Column F is price
            elif cell_ref.startswith('F'):
                product_data['price'] = text_elem.text.strip()
            # Column E is original price
            elif cell_ref.startswith('E'):
                product_data['original_price'] = text_elem.text.strip()
            # Column G is size
            elif cell_ref.startswith('G'):
                product_data['size'] = text_elem.text.strip()
            # Column J is image URL
            elif cell_ref.startswith('J'):
                product_data['image_url'] = text_elem.text.strip()
    
    if product_data.get('name') and product_data.get('price'):
        products.append(product_data)

print(f"Total products extracted: {len(products)}")
print("=" * 80)

# Generate SQL INSERT statements
sql_statements = []

for product in products:
    name = product.get('name', '').replace("'", "''").replace('&amp;', '&').replace('&apos;', "'")
    price = product.get('price', '0')
    original_price = product.get('original_price', price)
    size = product.get('size', '').replace("'", "''")
    image_url = product.get('image_url', '').replace("'", "''")
    
    # Clean up HTML entities
    name = html.unescape(name)
    size = html.unescape(size)
    
    sql = f"""INSERT INTO products (name, price, original_price, category, size, image_url, in_stock, rating)
VALUES ('{name}', {price}, {original_price}, 'bakery', '{size}', '{image_url}', true, 4.5);"""
    
    sql_statements.append(sql)

# Write to SQL file
with open('insert_biscuits_to_bakery.sql', 'w') as f:
    f.write("-- Insert Biscuits & Cookies products into bakery category\\n")
    f.write(f"-- Total products: {len(products)}\\n")
    f.write("-- Generated automatically\\n\\n")
    
    for sql in sql_statements:
        f.write(sql + '\\n')

print(f"\\n✅ SQL file generated: insert_biscuits_to_bakery.sql")
print(f"✅ Total SQL statements: {len(sql_statements)}")
print("\\nFirst 3 products:")
for i, product in enumerate(products[:3]):
    print(f"\\n  Product {i+1}:")
    print(f"    Name: {html.unescape(product.get('name', ''))}")
    print(f"    Price: ₹{product.get('price')}")
    print(f"    Original: ₹{product.get('original_price')}")
    print(f"    Size: {product.get('size')}")

