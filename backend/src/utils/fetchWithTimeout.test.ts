/**
 * Backlog item 19: every outbound HTTP call has a deadline. The helper is tested
 * against a real local HTTP server (so real undici abort behaviour is exercised,
 * including a server that sends headers and then stalls the body); each caller is
 * then tested with a fetch that hangs until aborted, with the deadlines shortened.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Request } from 'express';

vi.hoisted(() => {
  process.env.GOOGLE_MAPS_API_KEY = 'test-google-key';
  process.env.RAZORPAY_KEY_ID = 'rzp_test_timeout';
  process.env.RAZORPAY_KEY_SECRET = 'secret';
});

import { fetchJsonWithTimeout, UpstreamTimeoutError, UPSTREAM_TIMEOUTS_MS } from './fetchWithTimeout.js';
import { inferStatus } from './httpError.js';
import { forwardGeocode, reverseGeocode } from '../services/geocoding.service.js';
import { fetchRoadRoute } from '../services/directions.service.js';
import { notificationService } from '../services/notification.service.js';
import { paymentService } from '../services/payment.service.js';
import { autocomplete } from '../controllers/places.controller.js';
import { mockRes } from '../test/fakeSupabase.js';

// ---------------------------------------------------------------------------
// The helper, against a real server
// ---------------------------------------------------------------------------
describe('fetchJsonWithTimeout (real HTTP)', () => {
  let server: http.Server;
  let base: string;
  const open: http.ServerResponse[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/fast') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
      } else if (req.url === '/not-json') {
        res.end('<html>Bad Gateway</html>');
      } else if (req.url === '/stall-body') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.write('{"partial":');
        open.push(res); // never finished
      } else {
        open.push(res); // /hang: never answers at all
      }
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    open.forEach((r) => r.destroy());
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  });

  it('returns the parsed body and the response for a fast server', async () => {
    const { response, json } = await fetchJsonWithTimeout('Test', `${base}/fast`, {}, 1000);
    expect(response.ok).toBe(true);
    expect(json).toEqual({ ok: true });
  });

  it('gives up on a server that never answers, with a readable 504 error', async () => {
    const started = Date.now();
    const err = await fetchJsonWithTimeout('Test API', `${base}/hang`, {}, 150).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamTimeoutError);
    expect(err.message).toBe('Test API did not respond within 0.15 s');
    expect(inferStatus(err)).toBe(504);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('also gives up when headers arrive but the body stalls', async () => {
    const err = await fetchJsonWithTimeout('Test API', `${base}/stall-body`, {}, 150).catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamTimeoutError);
  });

  it('keeps the old semantics for a non-JSON body (throws, but not as a timeout)', async () => {
    const err = await fetchJsonWithTimeout('Test API', `${base}/not-json`, {}, 1000).catch((e) => e);
    expect(err).toBeInstanceOf(SyntaxError);
  });

  it('passes a connection failure through unchanged (not reported as a timeout)', async () => {
    const err = await fetchJsonWithTimeout('Test API', 'http://127.0.0.1:1/', {}, 1000).catch((e) => e);
    expect(err).not.toBeInstanceOf(UpstreamTimeoutError);
    expect(err).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// Every caller, with an upstream that hangs until aborted
// ---------------------------------------------------------------------------
describe('callers give up on a hung upstream', () => {
  const saved = { ...UPSTREAM_TIMEOUTS_MS };
  const urls: string[] = [];

  beforeEach(() => {
    UPSTREAM_TIMEOUTS_MS.google = 100;
    UPSTREAM_TIMEOUTS_MS.expoPush = 100;
    UPSTREAM_TIMEOUTS_MS.razorpay = 100;
    urls.length = 0;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn((url: string | URL, init?: RequestInit) => {
      urls.push(String(url));
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      });
    }));
  });
  afterEach(() => {
    Object.assign(UPSTREAM_TIMEOUTS_MS, saved);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('every fetch is given an abort signal', async () => {
    await forwardGeocode('Park Street, Kolkata');
    const call = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('geocoding returns null instead of hanging', async () => {
    await expect(forwardGeocode('Park Street, Kolkata')).resolves.toBeNull();
    await expect(reverseGeocode(22.55, 88.35)).resolves.toBeNull();
    expect(urls.every((u) => u.includes('maps.googleapis.com'))).toBe(true);
  });

  it('road routing tries Directions then Roads, each bounded, and returns [] instead of hanging', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const started = Date.now();
    await expect(fetchRoadRoute({ lat: 22.55, lng: 88.35 }, { lat: 22.57, lng: 88.37 })).resolves.toEqual([]);
    expect(urls.some((u) => u.includes('/directions/'))).toBe(true);
    expect(urls.some((u) => u.includes('roads.googleapis.com'))).toBe(true);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('places autocomplete answers 504 with a readable message', async () => {
    const res = mockRes();
    await autocomplete({ query: { input: 'park' } } as unknown as Request, res as never);
    expect(res.statusCode).toBe(504);
    expect(res.body).toMatchObject({ status: 'ERROR', error_message: 'Google Maps did not respond within 0.1 s' });
  });

  it('Expo push gives up quietly (background send, never throws)', async () => {
    await expect(
      notificationService.sendExpoPush('ExponentPushToken[abc]', 'Title', 'Body')
    ).resolves.toBeUndefined();
    expect(urls[0]).toContain('exp.host');
  });

  it('Razorpay calls reject with a 504-mapped timeout error', async () => {
    const err = await paymentService.getPaymentDetails('pay_123').catch((e) => e);
    expect(err).toBeInstanceOf(UpstreamTimeoutError);
    expect(err.message).toBe('Razorpay did not respond within 0.1 s');
    expect(inferStatus(err)).toBe(504);
    expect(urls[0]).toContain('api.razorpay.com');
  });
});
