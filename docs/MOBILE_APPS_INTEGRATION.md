# Mobile Apps Integration Guide

This guide explains how to integrate the Customer App and Shopkeeper App into the `near-and-now` monorepo structure.

## 📁 Current Project Structure

```
near-and-now/
├── frontend/          # Web frontend (React)
├── backend/          # Backend API (Express/Node.js)
├── docs/             # Documentation
├── supabase/         # Database migrations
└── package.json       # Root package.json (npm workspaces)
```

## 🎯 Target Structure

```
near-and-now/
├── frontend/          # Web frontend (React)
├── backend/           # Backend API (Express/Node.js)
├── customer-app/      # Customer mobile app (React Native/Flutter)
├── shopkeeper-app/    # Shopkeeper mobile app (React Native/Flutter)
├── delivery-app/      # Delivery app (to be added later)
├── docs/              # Documentation
├── supabase/         # Database migrations
└── package.json       # Root package.json (npm workspaces)
```

## 🔧 Integration Steps

### Step 1: Clone the Apps from GitHub

You have two options:

#### Option A: Clone as Subdirectories (Recommended)

```bash
cd /Users/tiasmondal166/projects/near-and-now

# Clone customer app
git clone <CUSTOMER_APP_GITHUB_URL> customer-app

# Clone shopkeeper app
git clone <SHOPKEEPER_APP_GITHUB_URL> shopkeeper-app
```

#### Option B: Use Git Submodules (If you want to keep separate repos)

```bash
cd /Users/tiasmondal166/projects/near-and-now

# Add as submodules
git submodule add <CUSTOMER_APP_GITHUB_URL> customer-app
git submodule add <SHOPKEEPER_APP_GITHUB_URL> shopkeeper-app

# Initialize submodules
git submodule update --init --recursive
```

### Step 2: Update Root package.json

Add the new apps to the workspaces array:

```json
{
  "workspaces": [
    "frontend",
    "backend",
    "customer-app",
    "shopkeeper-app"
  ]
}
```

### Step 3: Configure Each App

Each mobile app should have its own `package.json` in its directory. Ensure they follow this structure:

#### customer-app/package.json (Example for React Native)

```json
{
  "name": "customer-app",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web"
  },
  "dependencies": {
    "expo": "~49.0.0",
    "react": "18.2.0",
    "react-native": "0.72.0"
  }
}
```

#### shopkeeper-app/package.json (Example for React Native)

```json
{
  "name": "shopkeeper-app",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web"
  },
  "dependencies": {
    "expo": "~49.0.0",
    "react": "18.2.0",
    "react-native": "0.72.0"
  }
}
```

### Step 4: Update Root Scripts

Add convenient scripts to the root `package.json`:

```json
{
  "scripts": {
    "dev": "npm run dev --workspace=frontend",
    "dev:backend": "npm run dev --workspace=backend",
    "dev:customer": "npm run start --workspace=customer-app",
    "dev:shopkeeper": "npm run start --workspace=shopkeeper-app",
    "dev:all": "concurrently \"npm run dev:backend\" \"npm run dev\"",
    "build": "npm run build --workspaces",
    "build:frontend": "npm run build --workspace=frontend",
    "build:backend": "npm run build --workspace=backend",
    "build:customer": "npm run build --workspace=customer-app",
    "build:shopkeeper": "npm run build --workspace=shopkeeper-app"
  }
}
```

### Step 5: Shared Configuration

Create a shared configuration directory for common settings:

```
near-and-now/
├── shared/
│   ├── config/
│   │   ├── api.ts          # API endpoints
│   │   ├── constants.ts    # Shared constants
│   │   └── env.ts          # Environment variables
│   └── types/
│       └── index.ts        # Shared TypeScript types
```

### Step 6: Environment Variables

Each app should have its own `.env` file:

```
near-and-now/
├── .env                    # Root env (if needed)
├── frontend/.env
├── backend/.env
├── customer-app/.env
└── shopkeeper-app/.env
```

Create `.env.example` files for each app:

#### customer-app/.env.example

```env
# API Configuration
API_BASE_URL=http://localhost:3000/api
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# App Configuration
APP_NAME=Near & Now Customer
APP_VERSION=1.0.0
```

#### shopkeeper-app/.env.example

```env
# API Configuration
API_BASE_URL=http://localhost:3000/api
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# App Configuration
APP_NAME=Near & Now Shopkeeper
APP_VERSION=1.0.0
```

### Step 7: Update .gitignore

Add mobile app specific ignores:

```gitignore
# Mobile Apps
customer-app/node_modules/
customer-app/.expo/
customer-app/dist/
customer-app/build/
customer-app/.env

shopkeeper-app/node_modules/
shopkeeper-app/.expo/
shopkeeper-app/dist/
shopkeeper-app/build/
shopkeeper-app/.env

# React Native
*.jks
*.p8
*.p12
*.key
*.mobileprovision
*.orig.*
web-build/

# Metro
.metro-health-check*
```

## 🔗 API Integration

### Backend API Endpoints

Both apps will use the same backend API. Ensure your backend has these endpoints:

#### Customer App Endpoints
- `POST /api/auth/login` - Customer login
- `GET /api/products` - Browse products
- `POST /api/orders` - Place order
- `GET /api/orders/:id` - Get order details
- `GET /api/orders/:id/track` - Track order
- `GET /api/coupons/active` - Get active coupons

#### Shopkeeper App Endpoints
- `POST /api/auth/login` - Shopkeeper login
- `GET /api/stores/:id/orders` - Get store orders
- `PUT /api/stores/:id/orders/:orderId/accept` - Accept order
- `PUT /api/stores/:id/orders/:orderId/status` - Update order status
- `GET /api/stores/:id/inventory` - Get inventory
- `PUT /api/stores/:id/inventory/:productId` - Update inventory

### Shared API Client

Create a shared API client that both apps can use:

#### shared/config/api.ts

```typescript
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

export const apiClient = {
  get: async (endpoint: string) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`);
    return response.json();
  },
  post: async (endpoint: string, data: any) => {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },
  // ... other methods
};
```

## 📱 App-Specific Setup

### Customer App Setup

1. **Install dependencies:**
   ```bash
   cd customer-app
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

3. **Start development:**
   ```bash
   npm run start
   # or
   npm run android
   # or
   npm run ios
   ```

### Shopkeeper App Setup

1. **Install dependencies:**
   ```bash
   cd shopkeeper-app
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

3. **Start development:**
   ```bash
   npm run start
   # or
   npm run android
   # or
   npm run ios
   ```

## 🚀 Development Workflow

### Running All Services

```bash
# Install all dependencies
npm install

# Run backend
npm run dev:backend

# Run web frontend (in another terminal)
npm run dev

# Run customer app (in another terminal)
npm run dev:customer

# Run shopkeeper app (in another terminal)
npm run dev:shopkeeper
```

### Using Concurrently (Optional)

Install `concurrently` if not already installed:

```bash
npm install --save-dev concurrently
```

Then add to root `package.json`:

```json
{
  "scripts": {
    "dev:all": "concurrently \"npm run dev:backend\" \"npm run dev\" \"npm run dev:customer\" \"npm run dev:shopkeeper\""
  }
}
```

## 📝 Best Practices

1. **Shared Types**: Keep shared TypeScript types in `shared/types/`
2. **API Client**: Use a shared API client library
3. **Environment Variables**: Keep app-specific env vars in each app's `.env`
4. **Code Sharing**: Use npm workspaces or a shared package for common utilities
5. **Version Control**: Each app can have its own git history or be part of the monorepo

## 🔄 Future: Delivery App Integration

When you're ready to add the delivery app:

1. Clone it into `delivery-app/`
2. Add it to workspaces in root `package.json`
3. Add scripts for running it
4. Configure its `.env` file
5. Update `.gitignore`

## 📚 Additional Resources

- [npm workspaces documentation](https://docs.npmjs.com/cli/v7/using-npm/workspaces)
- [React Native documentation](https://reactnative.dev/docs/getting-started)
- [Expo documentation](https://docs.expo.dev/)

## ❓ Troubleshooting

### Issue: Workspace not found
**Solution**: Run `npm install` from the root directory to set up workspaces.

### Issue: Dependencies conflicts
**Solution**: Use `npm install --workspace=<app-name>` to install dependencies for a specific app.

### Issue: Environment variables not loading
**Solution**: Ensure each app has its own `.env` file and the app is configured to read from it.

### Issue: API connection errors
**Solution**: Verify `API_BASE_URL` in each app's `.env` matches your backend URL.
