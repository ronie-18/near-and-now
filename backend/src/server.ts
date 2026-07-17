import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { MulterError } from 'multer';

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
import shopkeeperRoutes from './routes/shopkeeper.routes.js';
import pushTokenRoutes from './routes/pushToken.routes.js';
import adminRoutes from './routes/admin.routes.js';
import adminStoresRoutes from './routes/adminStores.routes.js';

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
const isProd = process.env.NODE_ENV === 'production';

app.use(
  cors({
    origin: (origin, callback) => {
      // Non-browser requests (server-to-server, curl) have no Origin header — always allow.
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowlist.length > 0) {
        if (allowlist.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS: origin ${origin} not allowed`));
        }
        return;
      }
      // No allowlist configured.
      if (isProd) {
        // Fail closed in production: operators MUST set ALLOWED_ORIGINS.
        console.error(`[CORS] Rejected origin "${origin}" — set ALLOWED_ORIGINS env var in production`);
        callback(new Error(`CORS: ALLOWED_ORIGINS not configured for production`));
      } else {
        // Development: allow all origins for convenience.
        callback(null, true);
      }
    },
    credentials: true
  })
);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// Capture raw body for the Razorpay webhook route BEFORE express.json() parses it.
// verifyWebhook() needs the exact bytes that Razorpay signed; JSON.stringify of an
// already-parsed object produces different bytes and always fails HMAC verification.
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));

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
app.use('/shopkeeper', shopkeeperRoutes);
app.use('/api/push-token', pushTokenRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', adminStoresRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Multer (e.g. the verification-document upload route) reports violations like
// an oversized file by calling next(err) directly, before any route handler's
// own try/catch runs — without this, Express's default handler would return a
// non-JSON error body that client-side error parsing can't surface a useful
// message from.
app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  if (err instanceof MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? 'File exceeds the maximum allowed size' : err.message;
    return res.status(400).json({ success: false, error: message });
  }
  console.error('❌ Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// For local dev: listen so phone/device can reach API (Vercel uses api/index.ts, no listen)
if (!process.env.VERCEL) {
  const port = Number(PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port} (and http://localhost:${port})`);
  });
}

export default app;
