# Setup Instructions - Near and Now Platform

Complete setup guide for the restructured Near and Now e-commerce platform.

## Prerequisites

- Node.js 18 or higher
- npm or yarn
- PostgreSQL database (Supabase recommended)
- Git

## Quick Start

### 1. Clone and Install

```bash
# Navigate to project
cd near-and-now

# Install all dependencies (frontend + backend)
npm install
```

### 2. Database Setup

#### Option A: New Database (Recommended)

1. Create a new Supabase project at https://supabase.com
2. Go to SQL Editor
3. Run the schema files in order:

```sql
-- First: Create tables
-- Copy and paste contents from: docs/near_and_now_schema_tables

-- Second: Create functions and triggers
-- Copy and paste contents from: docs/near_and_now_schema_functions
```

#### Option B: Existing Database Migration

See `docs/MIGRATION_GUIDE.md` for detailed migration steps.

### 3. Environment Configuration

Create `.env` file in the root directory:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Backend Configuration (optional - uses VITE_ vars if not set)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
PORT=3000
```

The frontend and backend will automatically use these environment variables.

### 4. Start Development Servers

```bash
# Start both frontend and backend
npm run dev:all

# Or start individually:
npm run dev              # Frontend only (default)
npm run dev:backend      # Backend only
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

## Project Structure

```
near-and-now/
├── frontend/                    # React application
│   ├── src/
│   │   ├── components/         # Reusable components
│   │   ├── pages/              # Page components
│   │   ├── services/           # API services
│   │   ├── context/            # React contexts
│   │   └── types/              # TypeScript types
│   ├── public/                 # Static assets
│   └── package.json
│
├── backend/                     # Express API server
│   ├── src/
│   │   ├── config/             # Configuration
│   │   ├── controllers/        # Request handlers
│   │   ├── routes/             # API routes
│   │   ├── services/           # Business logic
│   │   ├── types/              # TypeScript types
│   │   └── server.ts           # Entry point
│   └── package.json
│
├── docs/                        # Documentation
│   ├── near_and_now_schema_tables      # DB tables
│   ├── near_and_now_schema_functions   # DB functions
│   ├── MIGRATION_GUIDE.md
│   └── *.md files
│
└── package.json                 # Root workspace config
```

## Database Schema Overview

### Core Tables

**Users & Authentication**
- `app_users` - Base user table (customers, shopkeepers, delivery partners)
- `customers` - Customer-specific data
- `delivery_partners` - Delivery partner data
- `admins` - Admin authentication with RBAC

**Products**
- `categories` - Product categories
- `master_products` - Admin-controlled product catalog
- `products` - Store-specific inventory (links to master_products)

**Stores**
- `stores` - Store information with location data

**Orders**
- `customer_orders` - Main customer orders
- `store_orders` - Per-store sub-orders
- `order_items` - Items in each store order

**Addresses**
- `customer_saved_addresses` - Multiple addresses per customer with Google Places data

**Coupons**
- `coupons` - Discount codes
- `coupon_redemptions` - Usage tracking

### Key Views

- `products_with_details` - Products joined with master_products and stores
- `order_summary` - Order overview with counts
- `store_order_details` - Detailed store order information

## API Endpoints

### Products
```
GET  /api/products/categories
GET  /api/products/master-products
GET  /api/products/products
GET  /api/products/products/:id
GET  /api/products/nearby-stores
```

### Orders
```
POST  /api/orders/create
GET   /api/orders/customer/:customerId
GET   /api/orders/:orderId
PATCH /api/orders/:orderId/status
```

### Customers
```
GET    /api/customers/:customerId/addresses
POST   /api/customers/:customerId/addresses
PATCH  /api/customers/addresses/:addressId
DELETE /api/customers/addresses/:addressId
```

### Coupons
```
POST /api/coupons/validate
GET  /api/coupons
```

## Development Workflow

### Frontend Development

```bash
cd frontend
npm run dev      # Start dev server
npm run build    # Build for production
npm run test     # Run tests
npm run lint     # Lint code
```

### Backend Development

```bash
cd backend
npm run dev      # Start dev server with hot reload
npm run build    # Compile TypeScript
npm start        # Run production build
npm run test     # Run tests
```

## Testing

### Frontend Tests
```bash
cd frontend
npm run test
```

### Backend Tests
```bash
cd backend
npm run test
```

### Run All Tests
```bash
npm run test
```

## Building for Production

```bash
# Build both frontend and backend
npm run build

# Or build individually
npm run build:frontend
npm run build:backend
```

## Deployment

### Frontend (Netlify/Vercel)
```bash
cd frontend
npm run build
# Deploy the 'dist' folder
```

### Backend (Heroku/Railway/Render)
```bash
cd backend
npm run build
# Deploy with start command: npm start
```

## Common Issues

### TypeScript Errors in Backend

The lint errors about missing Express modules are expected until you run:
```bash
cd backend
npm install
```

### Database Connection Issues

1. Verify Supabase URL and anon key in `.env`
2. Check if database schema is applied
3. Ensure RLS policies are configured

### Port Already in Use

Change the port in `.env`:
```env
PORT=3001
```

## Key Features

### Admin Panel
- Login at `/admin/login`
- Default credentials (if using sample data):
  - Email: superadmin@platform.com
  - Password: (set during admin creation)

### Customer Features
- Browse products by category
- Location-based store discovery
- Multi-store shopping cart
- Multiple saved addresses
- Order tracking

### Shopkeeper Features
- Manage store inventory
- Accept/reject orders
- Update order status

## Next Steps

1. ✅ Database schema applied
2. ✅ Environment variables configured
3. ✅ Dependencies installed
4. ✅ Development servers running
5. 📝 Create admin user
6. 📝 Add categories and products
7. 📝 Configure Google Places API (optional)
8. 📝 Set up payment gateway (optional)

## Support

- Check `README.md` for project overview
- See `docs/MIGRATION_GUIDE.md` for migration help
- Review schema files in `docs/` folder
- Backend API docs in `backend/README.md`
- Frontend docs in `frontend/README.md`

## License

See LICENSE file for details.
