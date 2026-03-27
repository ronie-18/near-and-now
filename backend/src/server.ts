import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import productsRoutes from './routes/products.routes.js';
import ordersRoutes from './routes/orders.routes.js';
import customersRoutes from './routes/customers.routes.js';
import couponsRoutes from './routes/coupons.routes.js';
import authRoutes from './routes/auth.routes.js';
import storeOwnerRoutes from './routes/storeOwner.routes.js';
import placesRoutes from './routes/places.routes.js';
import deliveryRoutes from './routes/delivery.routes.js';
import trackingRoutes from './routes/tracking.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';
import paymentRoutes from './routes/payment.routes.js';

// Load .env from backend and project root
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const PORT = process.env.PORT || 3000;

// Local Vite dev calling production API (VITE_API_URL=https://nearandnow.in) needs these origins.
// Production domains still come from ALLOWED_ORIGINS (e.g. on Vercel).
const LOCAL_DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const fromEnv = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const ALLOWED_ORIGINS = [...new Set([...LOCAL_DEV_ORIGINS, ...fromEnv])];

// Apply CORS before Helmet so preflight (OPTIONS) always gets Access-Control-* headers.
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true
}));
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/store-owner', storeOwnerRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/coupons', couponsRoutes);
app.use('/api/places', placesRoutes);
app.use('/api/delivery', deliveryRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/payment', paymentRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// For local dev: listen so phone/device can reach API (Vercel uses api/index.ts, no listen)
if (!process.env.VERCEL) {
  const port = Number(PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port} (and http://localhost:${port})`);
  });
}

export default app;
