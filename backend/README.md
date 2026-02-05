# Near and Now - Backend API

Backend API server for the Near and Now e-commerce platform.

## Database Schema

The backend uses the new database schema defined in:
- `docs/near_and_now_schema_tables` - Table definitions
- `docs/near_and_now_schema_functions` - Functions, triggers, and views

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file from `.env.example` and configure your Supabase credentials

3. Run development server:
```bash
npm run dev
```

4. Build for production:
```bash
npm run build
npm start
```

## API Endpoints

### Products
- `GET /api/products/categories` - Get all categories
- `GET /api/products/master-products` - Get master products catalog
- `GET /api/products/products` - Get products with store details
- `GET /api/products/products/:id` - Get product by ID
- `GET /api/products/nearby-stores` - Get nearby stores

### Orders
- `POST /api/orders/create` - Create new order
- `GET /api/orders/customer/:customerId` - Get customer orders
- `GET /api/orders/:orderId` - Get order by ID
- `PATCH /api/orders/:orderId/status` - Update order status

### Customers
- `GET /api/customers/:customerId/addresses` - Get customer addresses
- `POST /api/customers/:customerId/addresses` - Create new address
- `PATCH /api/customers/addresses/:addressId` - Update address
- `DELETE /api/customers/addresses/:addressId` - Delete address

### Coupons
- `POST /api/coupons/validate` - Validate coupon code
- `GET /api/coupons` - Get active coupons

## Architecture

- **Controllers**: Handle HTTP requests and responses
- **Services**: Business logic and database operations
- **Routes**: API endpoint definitions
- **Types**: TypeScript type definitions matching database schema
- **Config**: Database and application configuration
