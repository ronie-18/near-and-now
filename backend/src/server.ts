import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { MulterError } from 'multer';
import { requestContext } from './middleware/requestContext.js';
import { AppError, errorReason, inferStatus } from './utils/httpError.js';

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
import adminStoreProductsRoutes from './routes/adminStoreProducts.routes.js';
import adminProductSubmissionsRoutes from './routes/adminProductSubmissions.routes.js';
import adminActivityLogRoutes from './routes/adminActivityLog.routes.js';
import adminSupportMessagesRoutes from './routes/adminSupportMessages.routes.js';
import adminRiderPayoutsRoutes from './routes/adminRiderPayouts.routes.js';
import adminSecurityLogRoutes from './routes/adminSecurityLog.routes.js';
import walletRoutes from './routes/wallet.routes.js';
import reviewsRoutes from './routes/reviews.routes.js';
import adminReviewsRoutes from './routes/adminReviews.routes.js';
import wishlistRoutes from './routes/wishlist.routes.js';
import gstinRoutes from './routes/gstin.routes.js';
import { sweepStuckOrders } from './controllers/shopkeeper.controller.js';

// Load .env from backend and project root
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Backstop only — the real fix for known unguarded async paths (e.g. the
// six auth middleware functions that had no try/catch, found 2026-08-26) is
// fixing them directly, not relying on this. But Node's default behavior on
// an unhandled promise rejection is to crash the whole process (fatal since
// Node 15), taking down every other in-flight request along with whatever
// future code path someone forgets to wrap in try/catch. Logging instead of
// crashing here means one overlooked gap degrades to a single failed
// request instead of an outage for every concurrent user. Does not apply
// under Vercel's serverless runtime (each invocation is its own process
// anyway, and `!process.env.VERCEL` already gates the long-running
// `app.listen` below the same way).
if (!process.env.VERCEL) {
  process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled promise rejection:', reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught exception:', err);
  });
}

const app = express();
const PORT = process.env.PORT || 3000;

// Behind an AWS ALB / App Runner / CloudFront the client IP and protocol arrive in
// X-Forwarded-* headers. Without this, rate limiting keys on the load balancer's IP.
app.set('trust proxy', 1);
app.disable('x-powered-by');

class CorsError extends AppError {
  constructor(message: string) {
    super(message, 403, { code: 'CORS_ORIGIN_REJECTED', expose: true });
  }
}

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
          callback(new CorsError(`Requests from ${origin} are not allowed by this API's CORS policy (server.ts ALLOWED_ORIGINS).`));
        }
        return;
      }
      // No allowlist configured.
      if (isProd) {
        // Fail closed in production: operators MUST set ALLOWED_ORIGINS.
        console.error(`[CORS] Rejected origin "${origin}" — set ALLOWED_ORIGINS env var in production`);
        callback(new CorsError('This API has no ALLOWED_ORIGINS configured for production, so browser requests are rejected (server.ts).'));
      } else {
        // Development: allow all origins for convenience.
        callback(null, true);
      }
    },
    credentials: true,
    exposedHeaders: ['X-Request-Id']
  })
);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// gzip compression: product/catalogue JSON shrinks 5-10x on the wire.
app.use(compression({ threshold: 1024 }));

// Request id + per-request latency log line (JSON, for CloudWatch Logs Insights).
app.use(requestContext);

// Capture raw body for the Razorpay webhook route BEFORE express.json() parses it.
// verifyWebhook() needs the exact bytes that Razorpay signed; JSON.stringify of an
// already-parsed object produces different bytes and always fails HMAC verification.
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));

// Explicit cap instead of Express's implicit default — an oversized JSON body
// (e.g. against /api/places/* or checkout, both public/low-friction routes)
// would otherwise be parsed in full before any of our own validation runs.
// 1mb is generous for every real payload this API accepts (largest is a
// checkout cart with many line items — a few KB); document/image uploads go
// through multer as multipart, not JSON, so they're unaffected by this.
app.use(express.json({ limit: '1mb' }));

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
app.use('/api/admin', adminStoreProductsRoutes);
app.use('/api/admin', adminProductSubmissionsRoutes);
app.use('/api/admin', adminActivityLogRoutes);
app.use('/api/admin', adminSupportMessagesRoutes);
app.use('/api/admin', adminRiderPayoutsRoutes);
app.use('/api/admin', adminSecurityLogRoutes);
app.use('/api/admin', adminReviewsRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/reviews', reviewsRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/gstin', gstinRoutes);

const healthHandler = (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptimeSeconds: Math.round(process.uptime()) });
};
app.get('/health', healthHandler);
// Same probe under /api so the admin SPA can reach it through the Vite dev
// proxy (which only forwards /api) and a same-origin deployment (where /health
// would be answered by index.html, a false positive).
app.get('/api/health', healthHandler);

// 404 as JSON (Express's default is an HTML "Cannot GET /x" page that the SPA cannot parse).
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `No API route matches ${req.method} ${req.originalUrl.split('?')[0]}`,
    where: 'server.notFound',
    requestId: req.requestId
  });
});

// Multer (e.g. the verification-document upload route) reports violations like
// an oversized file by calling next(err) directly, before any route handler's
// own try/catch runs — without this, Express's default handler would return a
// non-JSON error body that client-side error parsing can't surface a useful
// message from.
//
// Every body has the same shape as controller errors (see utils/httpError.ts):
// { success:false, error, where:'server.errorHandler', requestId, detail? } so the
// client can show a sentence that points at the failing route and the log line.
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);
  const requestId = req.requestId;
  const bodyParserType = (err as { type?: string })?.type;
  let status = inferStatus(err);
  let message: string;

  if (err instanceof MulterError) {
    status = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File exceeds the maximum allowed size' : err.message;
  } else if (err instanceof AppError) {
    message = err.message;
  } else if (bodyParserType === 'entity.parse.failed') {
    status = 400;
    message = `The request body sent to ${req.method} ${req.path} is not valid JSON.`;
  } else if (bodyParserType === 'entity.too.large') {
    // express.json({ limit }) throws this (via body-parser) when a request body
    // exceeds the cap set above — a client/attacker error, not a server bug.
    status = 413;
    message = `The request body sent to ${req.method} ${req.path} is larger than this route allows.`;
  } else if (status >= 500) {
    message = `The server hit an unexpected error while handling ${req.method} ${req.path}.`;
  } else {
    message = errorReason(err) || `Request to ${req.method} ${req.path} failed.`;
  }

  const reason = errorReason(err);
  console.error(`[${requestId ?? '-'}] server.errorHandler ${req.method} ${req.originalUrl} → ${status}: ${reason}`, err instanceof Error ? err.stack : err);
  res.status(status).json({
    success: false,
    error: message,
    where: 'server.errorHandler',
    requestId,
    ...(status < 500 || !isProd ? { detail: reason } : {})
  });
});

// For local dev: listen so phone/device can reach API (Vercel uses api/index.ts, no listen)
if (!process.env.VERCEL) {
  const port = Number(PORT) || 3000;
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port} (and http://localhost:${port})`);
  });
  // ALB/App Runner idle timeout is 60 s by default; keep ours slightly longer so the LB closes first.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  // Order-flow sweep (shopkeeper.controller.ts sweepStuckOrders): stores that
  // never answered an allocation, and items orphaned between stores by a
  // crash mid-reallocation. The tracking-endpoint watchdogs only run while a
  // customer has the tracking screen open; this runs regardless. Safe across
  // several instances (status-guarded writes + a locked database function).
  const ORDER_SWEEP_INTERVAL_MS = 60_000;
  const orderSweep = setInterval(() => {
    sweepStuckOrders().catch((err) => console.error('[sweepStuckOrders] failed:', err));
  }, ORDER_SWEEP_INTERVAL_MS);
  orderSweep.unref();

  // Graceful shutdown so in-flight requests finish during ECS/App Runner deploys.
  const shutdown = (signal: string) => {
    console.log(`[process] ${signal} received, closing HTTP server`);
    clearInterval(orderSweep);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

export default app;
