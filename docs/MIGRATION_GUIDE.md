# Migration Guide - New Database Schema

This guide explains the migration from the old schema to the new comprehensive database schema.

## Overview

The project has been restructured with:
- **New Database Schema**: 32 tables with comprehensive features
- **Separated Frontend/Backend**: Clear separation of concerns
- **Documentation Folder**: All docs and schema files organized

## Project Structure Changes

### Old Structure
```
near-and-now/
├── src/              # All frontend code
├── public/
├── *.md files        # Scattered documentation
└── package.json
```

### New Structure
```
near-and-now/
├── frontend/         # React application
│   ├── src/
│   ├── public/
│   └── package.json
├── backend/          # Express API server
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── types/
│   │   └── server.ts
│   └── package.json
├── docs/             # All documentation
│   ├── near_and_now_schema_tables
│   ├── near_and_now_schema_functions
│   └── *.md files
└── package.json      # Root workspace manager
```

## Database Schema Changes

### Key New Features

1. **Multi-Role User System**
   - `app_users` - Base table for all users
   - `customers` - Customer-specific data
   - `delivery_partners` - Delivery partner data
   - Shopkeepers use `stores` table

2. **Enhanced Admin System**
   - `admins` - Separate admin authentication
   - `admin_users` - Legacy admin table (can be deprecated)
   - RBAC with granular permissions
   - `admin_activity_logs` and `audit_logs`

3. **Master Product Catalog**
   - `master_products` - Admin-controlled catalog
   - `products` - Store-specific inventory (links to master_products)
   - Shopkeepers can only modify quantity, not prices

4. **Multi-Store Orders**
   - `customer_orders` - Main order
   - `store_orders` - Per-store sub-orders
   - `order_items` - Items per store order
   - Each store order has its own delivery partner

5. **Advanced Location System**
   - `customer_saved_addresses` - Multiple addresses per customer
   - Google Places API integration
   - Latitude/longitude for delivery radius calculations

6. **Flexible Coupon System**
   - `coupons` - Discount codes
   - `coupon_redemptions` - Usage tracking
   - First-order discount support

## Migration Steps

### 1. Database Migration

Run these SQL files in your Supabase SQL editor:

```sql
-- Step 1: Run table definitions
-- File: docs/near_and_now_schema_tables

-- Step 2: Run functions and triggers
-- File: docs/near_and_now_schema_functions
```

### 2. Environment Setup

Update your `.env` file to point to the new database:

```env
VITE_SUPABASE_URL=your_new_database_url
VITE_SUPABASE_ANON_KEY=your_new_anon_key
```

### 3. Install Dependencies

```bash
# Root level (installs both frontend and backend)
npm install

# Or individually
cd frontend && npm install
cd ../backend && npm install
```

### 4. Data Migration (if needed)

If you have existing data, you'll need to migrate:

#### Categories
```sql
-- Old: categories table
-- New: categories table (similar structure)
-- Migration: Should work with minimal changes
```

#### Products
```sql
-- Old: products table (store-specific)
-- New: master_products (admin catalog) + products (store inventory)

-- Create master products from unique products
INSERT INTO master_products (name, category, brand, base_price, discounted_price, unit, is_loose)
SELECT DISTINCT name, category, brand, price as base_price, price as discounted_price, 
       unit, false as is_loose
FROM old_products;

-- Create store inventory links
INSERT INTO products (store_id, master_product_id, quantity)
SELECT op.store_id, mp.id, op.stock_quantity
FROM old_products op
JOIN master_products mp ON mp.name = op.name;
```

#### Orders
```sql
-- Old: orders table (single store per order)
-- New: customer_orders + store_orders (multi-store support)

-- This requires custom migration based on your data
-- Contact support for assistance
```

### 5. Update Frontend Code

The frontend service layer needs to use the new schema:

#### Old API Calls
```typescript
// Old
const { data } = await supabase.from('products').select('*');
```

#### New API Calls
```typescript
// New - Use views for joined data
const { data } = await supabase.from('products_with_details').select('*');

// Or use backend API
const response = await fetch('/api/products/products');
const data = await response.json();
```

### 6. Key Code Changes

#### Product Fetching
```typescript
// Old
const products = await supabase.from('products').select('*');

// New
const products = await supabase.from('products_with_details').select('*');
// This view joins products + master_products + stores
```

#### Order Creation
```typescript
// Old - Single store order
const order = await supabase.from('orders').insert({
  customer_id,
  items: [...],
  total
});

// New - Multi-store order
const customerOrder = await supabase.from('customer_orders').insert({
  customer_id,
  delivery_address,
  delivery_latitude,
  delivery_longitude
});

// Create store orders for each store
for (const store of stores) {
  const storeOrder = await supabase.from('store_orders').insert({
    customer_order_id: customerOrder.id,
    store_id: store.id
  });
  
  // Add items for this store
  await supabase.from('order_items').insert(store.items);
}
```

#### Address Management
```typescript
// Old - Single address in customer table
const customer = await supabase.from('customers').select('address');

// New - Multiple saved addresses
const addresses = await supabase
  .from('customer_saved_addresses')
  .select('*')
  .eq('customer_id', customerId);
```

## Testing Checklist

- [ ] Database schema applied successfully
- [ ] Categories display correctly
- [ ] Products show with correct pricing
- [ ] Store inventory management works
- [ ] Multi-store cart functionality
- [ ] Order creation with multiple stores
- [ ] Address management (add/edit/delete)
- [ ] Coupon validation
- [ ] Admin panel access
- [ ] Admin permissions (RBAC)

## Rollback Plan

If you need to rollback:

1. Keep a backup of your old database
2. Switch `.env` back to old database URL
3. Revert to old code structure (use git)

```bash
git checkout <previous-commit>
```

## Support

For migration issues:
1. Check `docs/near_and_now_schema_tables` for table structure
2. Check `docs/near_and_now_schema_functions` for functions
3. Review `backend/src/services/database.service.ts` for examples

## Breaking Changes

### 1. Product Structure
- **Old**: Single `products` table with pricing
- **New**: `master_products` (admin) + `products` (store inventory)
- **Impact**: Shopkeepers can't set prices anymore

### 2. Order Structure
- **Old**: Single order per store
- **New**: Multi-store orders with `customer_orders` + `store_orders`
- **Impact**: Order tracking is more complex

### 3. Admin Authentication
- **Old**: `admin_users` table
- **New**: `admins` table with RBAC
- **Impact**: Admin login flow changed

### 4. Address System
- **Old**: Single address in `customers` table
- **New**: Multiple addresses in `customer_saved_addresses`
- **Impact**: Address selection required at checkout

## Performance Improvements

The new schema includes:
- 56+ optimized indexes
- 3 materialized views for common queries
- Haversine distance function for location queries
- Triggers for automatic timestamp updates
- Computed columns for order totals

## Next Steps

1. Run database migration
2. Update environment variables
3. Install dependencies
4. Test core functionality
5. Deploy to production

## Questions?

Refer to:
- `README.md` - Project overview
- `backend/README.md` - API documentation
- `frontend/README.md` - Frontend setup
