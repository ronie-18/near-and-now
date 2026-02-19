# Quick Integration Steps for Mobile Apps

## 🚀 Quick Start (5 Minutes)

### Step 1: Clone the Apps

```bash
cd /Users/tiasmondal166/projects/near-and-now

# Replace <CUSTOMER_APP_URL> and <SHOPKEEPER_APP_URL> with your GitHub URLs
git clone <CUSTOMER_APP_GITHUB_URL> customer-app
git clone <SHOPKEEPER_APP_GITHUB_URL> shopkeeper-app
```

### Step 2: Install Dependencies

```bash
# From root directory - installs dependencies for all workspaces
npm install
```

### Step 3: Configure Environment Variables

```bash
# Customer App
cd customer-app
cp .env.example .env  # If .env.example exists, or create .env manually
# Edit .env with your API URL and Supabase credentials

# Shopkeeper App
cd ../shopkeeper-app
cp .env.example .env  # If .env.example exists, or create .env manually
# Edit .env with your API URL and Supabase credentials
```

### Step 4: Verify Integration

```bash
# From root directory
npm run dev:customer    # Should start customer app
npm run dev:shopkeeper  # Should start shopkeeper app
```

## 📋 Checklist

- [ ] Apps cloned into `customer-app/` and `shopkeeper-app/`
- [ ] Root `package.json` updated with workspaces
- [ ] `.gitignore` updated to exclude mobile app files
- [ ] Environment variables configured for each app
- [ ] Dependencies installed (`npm install` from root)
- [ ] Apps can start successfully

## 🔧 Common Issues

### "Workspace not found"
Run `npm install` from the root directory.

### "Command not found"
Make sure each app has a `package.json` with the required scripts.

### "Environment variables not loading"
Check that each app has its own `.env` file in its directory.

## 📚 Next Steps

See [MOBILE_APPS_INTEGRATION.md](./MOBILE_APPS_INTEGRATION.md) for detailed documentation.
