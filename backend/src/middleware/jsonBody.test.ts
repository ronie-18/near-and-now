/**
 * Per-route JSON body caps (middleware/jsonBody.ts).
 *
 * Drives a real Express app over HTTP because the behaviour under test is the
 * interplay of two body-parser instances: the scoped 4mb parser must claim the
 * product-submission routes and the global 1mb parser must not re-read (and
 * reject) a body the scoped one already parsed.
 */
import { describe, it, expect, afterAll } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  JSON_BODY_LIMIT,
  PRODUCT_SUBMISSION_JSON_BODY_LIMIT,
  PRODUCT_SUBMISSION_JSON_PATHS,
  mountJsonBodyParsers,
} from './jsonBody.js';

const app = express();
mountJsonBodyParsers(app);
app.all('*', (req: Request, res: Response) => {
  const imageUrl = (req.body as { image_url?: unknown } | undefined)?.image_url;
  res.json({ parsed: typeof req.body === 'object' && req.body !== null, imageLength: typeof imageUrl === 'string' ? imageUrl.length : null });
});
// Mirrors the part of server.ts's error handler that matters here.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const e = err as { status?: number; type?: string };
  res.status(e.status ?? 500).json({ type: e.type ?? null });
});

const server = app.listen(0);
const port = (server.address() as AddressInfo).port;
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

function send(method: string, path: string, body: string): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path, method, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode!, json: JSON.parse(data) }));
      },
    );
    // body-parser may answer 413 before the whole body is read; the socket
    // reset that follows is expected, not a test failure.
    req.on('error', (e: NodeJS.ErrnoException) => (e.code === 'ECONNRESET' || e.code === 'EPIPE' ? undefined : reject(e)));
    req.end(body);
  });
}

/** A JSON submission whose base64 image_url pads it to roughly `mb` megabytes. */
function submission(mb: number): string {
  const image = 'data:image/jpeg;base64,' + 'A'.repeat(Math.round(mb * 1024 * 1024));
  return JSON.stringify({ name: 'Basmati rice', category: 'Grocery', image_url: image, base_price: 120, discounted_price: 110, unit: '1kg' });
}

describe('mountJsonBodyParsers', () => {
  it('documents the two limits it enforces', () => {
    expect(JSON_BODY_LIMIT).toBe('1mb');
    expect(PRODUCT_SUBMISSION_JSON_BODY_LIMIT).toBe('4mb');
    expect(PRODUCT_SUBMISSION_JSON_PATHS).toEqual(['/shopkeeper/product-submissions', '/api/admin/product-submissions']);
  });

  it('accepts a multi-megabyte photo on the shopkeeper submission route', async () => {
    const body = submission(2.5);
    const { status, json } = await send('POST', '/shopkeeper/product-submissions', body);
    expect(status).toBe(200);
    expect(json.parsed).toBe(true);
    expect(json.imageLength).toBe(JSON.parse(body).image_url.length);
  });

  it('accepts the same photo when an admin corrects a pending submission', async () => {
    const { status, json } = await send('PATCH', '/api/admin/product-submissions/0f6b2c1e-1', submission(2.5));
    expect(status).toBe(200);
    expect(json.parsed).toBe(true);
  });

  it('still rejects that body on every other route with entity.too.large', async () => {
    for (const path of ['/api/orders', '/api/places/autocomplete', '/shopkeeper/product-submissionsx', '/shopkeeper/orders']) {
      const { status, json } = await send('POST', path, submission(2.5));
      expect(status, path).toBe(413);
      expect(json.type, path).toBe('entity.too.large');
    }
  });

  it('keeps the 1mb cap in force for ordinary payloads elsewhere', async () => {
    const { status, json } = await send('POST', '/api/orders', JSON.stringify({ items: [{ id: 1, qty: 2 }] }));
    expect(status).toBe(200);
    expect(json.parsed).toBe(true);
  });

  it('rejects a photo above the 4mb cap on the submission route too', async () => {
    const { status, json } = await send('POST', '/shopkeeper/product-submissions', submission(4.5));
    expect(status).toBe(413);
    expect(json.type).toBe('entity.too.large');
  });
});
