# Near and Now - E-Commerce Platform

Multi-vendor quick commerce platform with centralized admin management, featuring store-owned inventory, real-time delivery, and support for loose products.

## Project Structure

```
near-and-now/
├── frontend/          # React frontend application
├── backend/           # Express.js API server
├── docs/              # Documentation and schema files
│   ├── near_and_now_schema_tables      # Database table definitions
│   └── near_and_now_schema_functions   # Database functions & triggers
└── README.md
```

## Database Schema

The platform uses a comprehensive PostgreSQL schema with 32 tables, including:

- **User Management**: Multi-role system (customers, shopkeepers, delivery partners)
- **Admin Panel**: RBAC with super_admin and custom permissions
- **Product Catalog**: Master products with store-specific inventory
- **Orders**: Multi-store orders with individual delivery partners
- **Payments**: Customer payments and store payouts
- **Location**: Google Places integration for accurate delivery
- **Coupons**: Flexible discount system with first-order support

See `docs/near_and_now_schema_tables` and `docs/near_and_now_schema_functions` for complete schema details.

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database (Supabase recommended)
- npm or yarn

### Setup

1. **Clone and install dependencies**:
```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

2. **Configure environment variables**:
```bash
# Copy .env.example to .env in both frontend and backend
cp .env.example .env
```

Edit `.env` files with your Supabase credentials:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

3. **Initialize database**:
Run the SQL files in your Supabase SQL editor:
```sql
-- First run:
docs/near_and_now_schema_tables

-- Then run:
docs/near_and_now_schema_functions
```

4. **Start development servers**:

Backend:
```bash
cd backend
npm run dev
```

Frontend (in new terminal):
```bash
cd frontend
npm run dev
```

## Features

### Customer Features
- Browse products by category
- Location-based store discovery (1-5km radius)
- Multi-store shopping cart
- Multiple saved addresses with Google Places integration
- Order tracking with real-time status updates
- Coupon system with first-order discounts

### Shopkeeper Features
- Store management
- Inventory control (quantity only, prices set by admin)
- Order acceptance and preparation
- Real-time order notifications

### Admin Features
- Centralized product catalog management
- Price control (MRP and discounted price)
- Category management
- Customer management
- Order monitoring
- Analytics and reporting
- Multi-admin support with RBAC

### Delivery Partner Features
- Real-time order assignments
- GPS tracking
- Multi-store pickup support
- Delivery status updates

## Technology Stack

### Frontend
- React 18 with TypeScript
- React Router for navigation
- Tailwind CSS for styling
- Supabase client for real-time data
- Lucide React for icons

### Backend
- Node.js with Express
- TypeScript
- Supabase for database
- JWT authentication
- Helmet for security

### Database
- PostgreSQL (via Supabase)
- PostGIS for location queries
- Row Level Security (RLS)
- Real-time subscriptions

## Key Concepts

### Master Products vs Store Inventory
- **Master Products**: Admin-controlled catalog with pricing
- **Store Inventory**: Shopkeepers select from master products and manage quantity only

### Loose Products
Products can be sold by weight/volume (e.g., 0.5 kg rice) or as pre-packaged items (e.g., 1L milk bottle).

### Multi-Store Orders
A single customer order can contain items from multiple stores, each with its own:
- Store order status
- Delivery partner
- Delivery timeline

### Location System
Uses Google Places API for:
- Accurate address geocoding
- Pin-based location selection
- Delivery radius calculation (Haversine formula)

## API Documentation

See `backend/README.md` for detailed API endpoint documentation.

## Contributing

1. Follow the existing code structure
2. Use TypeScript for type safety
3. Follow the database schema strictly
4. Test all changes before committing

## License

See LICENSE file for details.

## Support

For issues and questions, please refer to the documentation in the `docs/` folder.
