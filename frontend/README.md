# Near and Now - Frontend

React-based frontend application for the Near and Now e-commerce platform.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file with Supabase credentials (copy from root `.env`)

3. Run development server:
```bash
npm run dev
```

4. Build for production:
```bash
npm run build
```

## Project Structure

```
src/
├── components/       # Reusable React components
│   ├── auth/        # Authentication components
│   ├── cart/        # Shopping cart components
│   ├── layout/      # Layout components (Header, Footer)
│   ├── location/    # Location picker components
│   ├── products/    # Product display components
│   └── ui/          # UI components (Button, etc.)
├── context/         # React context providers
├── pages/           # Page components
│   ├── admin/       # Admin panel pages
│   └── policies/    # Policy pages
├── routes/          # Route definitions
├── services/        # API and database services
├── types/           # TypeScript type definitions
└── utils/           # Utility functions
```

## Features

- Multi-vendor product browsing
- Location-based store discovery
- Shopping cart with multi-store support
- Order management
- Admin panel for product/category management
- Customer address management
