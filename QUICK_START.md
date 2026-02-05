# Quick Start Guide

## ✅ Setup Complete!

Your project has been successfully restructured and is ready to use.

## Running the Application

### Start Both Frontend and Backend
```bash
npm run dev:all
```

### Start Frontend Only
```bash
npm run dev
# or
npm run dev --workspace=frontend
```
Frontend will be available at: http://localhost:5173

### Start Backend Only
```bash
npm run dev:backend
# or
npm run dev --workspace=backend
```
Backend API will be available at: http://localhost:3000

## Project Structure

```
near-and-now/
├── frontend/          # React application (port 5173)
├── backend/           # Express API (port 3000)
└── docs/              # Documentation
```

## Environment Variables

The `.env` file has been copied to both `frontend/.env` and `backend/.env`.

Both workspaces use the same Supabase credentials:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Database Setup

If you haven't applied the database schema yet:

1. Go to your Supabase SQL Editor
2. Run `docs/near_and_now_schema_tables`
3. Run `docs/near_and_now_schema_functions`

## API Endpoints

The backend provides these endpoints:

### Products
- `GET /api/products/categories` - Get all categories
- `GET /api/products/master-products` - Get master products
- `GET /api/products/products` - Get products with store details
- `GET /api/products/nearby-stores` - Get stores within radius

### Orders
- `POST /api/orders/create` - Create new order
- `GET /api/orders/customer/:customerId` - Get customer orders

### Customers
- `GET /api/customers/:customerId/addresses` - Get saved addresses
- `POST /api/customers/:customerId/addresses` - Add new address

### Coupons
- `POST /api/coupons/validate` - Validate coupon code

## Testing the Backend

Test if the backend is running:
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{"status":"ok","timestamp":"2026-02-05T..."}
```

## Next Steps

1. ✅ Backend is running
2. ✅ Environment variables configured
3. 📝 Apply database schema (if not done)
4. 📝 Start frontend development server
5. 📝 Test the application

## Common Commands

```bash
# Install dependencies
npm install

# Run tests
npm run test

# Build for production
npm run build

# Lint code
npm run lint
```

## Troubleshooting

### Backend won't start
- Check if `.env` file exists in `backend/` folder
- Verify Supabase credentials are correct
- Ensure port 3000 is not in use

### Frontend won't start
- Check if `.env` file exists in `frontend/` folder
- Ensure port 5173 is not in use
- Run `npm install` in frontend folder

### Database errors
- Verify schema is applied in Supabase
- Check Supabase URL and anon key
- Ensure RLS policies are configured

## Documentation

- `README.md` - Project overview
- `docs/SETUP_INSTRUCTIONS.md` - Detailed setup
- `docs/MIGRATION_GUIDE.md` - Migration from old schema
- `docs/RESTRUCTURING_SUMMARY.md` - What changed
- `backend/README.md` - API documentation
- `frontend/README.md` - Frontend structure

## Support

For detailed information, see the documentation in the `docs/` folder.
