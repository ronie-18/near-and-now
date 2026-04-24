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
import deliveryPartnerRoutes from './routes/deliveryPartner.routes.js';
import trackingRoutes from './routes/tracking.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import invoiceRoutes from './routes/invoice.routes.js';

// Load .env from backend and project root
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const PORT = process.env.PORT || 3000;

// CORS: reflect any browser Origin (works with credentials). Same idea as a permissive Railway setup.
// Optional: set ALLOWED_ORIGINS=comma,separated,origins to restrict; leave unset for allow-all via reflection.
const allowlist = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// Apply CORS before Helmet so preflight (OPTIONS) always gets Access-Control-* headers.
app.use(
  cors({
    origin: (origin, callback) => {
      if (allowlist.length === 0) {
        callback(null, true);
        return;
      }
      if (!origin || allowlist.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true
  })
);
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
app.use('/delivery-partner', deliveryPartnerRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/invoices', invoiceRoutes);

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
