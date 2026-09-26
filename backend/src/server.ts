import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
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
import shopkeeperRoutes from './routes/shopkeeper.routes.js';
import pushTokenRoutes from './routes/pushToken.routes.js';
import { requestContext } from './middleware/requestContext.js';
import { AppError, errorReason, inferStatus } from './utils/httpError.js';

// Load .env from backend and project root
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Behind an AWS ALB / App Runner / CloudFront the client IP and protocol arrive in
// X-Forwarded-* headers. Without this, rate limiting keys on the load balancer's IP.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// CORS: optional allowlist via ALLOWED_ORIGINS=comma,separated,origins. Production fails closed.
const allowlist = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

class CorsError extends AppError {
  constructor(message: string) {
    super(message, 403, { code: 'CORS_ORIGIN_REJECTED', expose: true });
  }
}

// Apply CORS before Helmet so preflight (OPTIONS) always gets Access-Control-* headers.
app.use(
  cors({
    origin: (origin, callback) => {
      // Non-browser requests (server-to-server, curl, health checks) have no Origin header — always allow.
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowlist.length > 0) {
        if (allowlist.includes(origin)) callback(null, true);
        else callback(new CorsError(`Requests from ${origin} are not allowed by this API's CORS policy (server.ts ALLOWED_ORIGINS).`));
        return;
      }
      if (isProd) {
        // Fail closed in production: operators MUST set ALLOWED_ORIGINS.
        console.error(`[CORS] Rejected origin "${origin}" — set ALLOWED_ORIGINS env var in production`);
        callback(new CorsError('This API has no ALLOWED_ORIGINS configured for production, so browser requests are rejected (server.ts).'));
      } else {
        callback(null, true); // Development: allow all origins for convenience.
      }
    },
    credentials: true,
    exposedHeaders: ['X-Request-Id']
  })
);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// gzip/brotli-compatible compression: product/catalogue JSON shrinks 5-10x on the wire.
app.use(compression({ threshold: 1024 }));

// Request id + per-request latency log line (JSON, for CloudWatch Logs Insights).
app.use(requestContext);

// Capture raw body for the Razorpay webhook route BEFORE express.json() parses it.
// verifyWebhook() needs the exact bytes that Razorpay signed; JSON.stringify of an
// already-parsed object produces different bytes and always fails HMAC verification.
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));

// Base64 profile images can exceed Express's default 100 KB body limit → HTML 413 page.
app.use('/delivery-partner/profile-image', express.json({ limit: '5mb' }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptimeSeconds: Math.round(process.uptime()) });
});

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

// 404 as JSON (Express's default is an HTML "Cannot GET /x" page that the SPA cannot parse).
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: `No API route matches ${req.method} ${req.originalUrl.split('?')[0]}`,
    where: 'server.notFound',
    requestId: req.requestId
  });
});

// Global error handler: JSON body with location + request id for CORS rejections,
// malformed JSON bodies, oversized payloads, and anything a handler forgot to catch.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const bodyParserType = (err as { type?: string })?.type;
  let status = inferStatus(err);
  let message: string;

  if (err instanceof AppError) {
    message = err.message;
  } else if (bodyParserType === 'entity.parse.failed') {
    status = 400;
    message = `The request body sent to ${req.method} ${req.path} is not valid JSON.`;
  } else if (bodyParserType === 'entity.too.large') {
    status = 413;
    message = `The request body sent to ${req.method} ${req.path} is larger than this route allows.`;
  } else if (status >= 500) {
    message = `The server hit an unexpected error while handling ${req.method} ${req.path}.`;
  } else {
    message = errorReason(err) || `Request to ${req.method} ${req.path} failed.`;
  }

  const reason = errorReason(err);
  console.error(`[${req.requestId ?? '-'}] server.errorHandler ${req.method} ${req.originalUrl} → ${status}: ${reason}`, err instanceof Error ? err.stack : err);

  if (res.headersSent) return;
  res.status(status).json({
    error: message,
    where: 'server.errorHandler',
    requestId: req.requestId,
    ...(status < 500 || !isProd ? { detail: reason } : {})
  });
});

// Surface async failures that escaped every try/catch instead of silently dropping them.
process.on('unhandledRejection', (reason) => {
  console.error('[process] Unhandled promise rejection:', reason instanceof Error ? reason.stack : reason);
});

// For local dev / AWS: listen so phone/device can reach API (Vercel uses api/index.ts, no listen)
if (!process.env.VERCEL) {
  const port = Number(PORT) || 3000;
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port} (and http://localhost:${port})`);
  });
  // ALB/App Runner idle timeout is 60 s by default; keep ours slightly longer so the LB closes first.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  // Graceful shutdown so in-flight requests finish during ECS/App Runner deploys.
  const shutdown = (signal: string) => {
    console.log(`[process] ${signal} received, closing HTTP server`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

export default app;
