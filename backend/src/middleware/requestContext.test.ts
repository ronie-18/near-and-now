/**
 * requestContext log line + request metrics (monitoring, 2026-10-05).
 * The existing fields must stay as they were; dbCalls/dbMs are added.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { requestContext } from './requestContext.js';
import { instrumentedFetch, recordRiderRequest, resetRiderRateWindows, RIDER_RATE_ALERT_PER_MINUTE } from '../utils/requestMetrics.js';
import { runInBackground } from '../utils/background.js';

function fakeReqRes(path = '/api/x') {
  const res = Object.assign(new EventEmitter(), {
    statusCode: 200,
    headers: {} as Record<string, string>,
    setHeader(k: string, v: string) { this.headers[k] = v; },
  });
  const req = { headers: {}, method: 'GET', originalUrl: path, baseUrl: '', route: { path } } as unknown as Request;
  return { req, res: res as unknown as Response & EventEmitter };
}

let logs: string[] = [];
beforeEach(() => {
  logs = [];
  for (const m of ['log', 'warn', 'error'] as const) vi.spyOn(console, m).mockImplementation((line: unknown) => { logs.push(String(line)); });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => { await new Promise((r) => setTimeout(r, 5)); return new Response('[]'); });
  resetRiderRateWindows();
});
afterEach(() => vi.restoreAllMocks());

const lastJson = () => JSON.parse(logs.filter((l) => l.startsWith('{')).at(-1)!);

describe('requestContext log line', () => {
  it('keeps every existing field and adds dbCalls/dbMs', async () => {
    const { req, res } = fakeReqRes();
    await new Promise<void>((done) => requestContext(req, res, async () => {
      await instrumentedFetch('https://db/1');
      await Promise.all([instrumentedFetch('https://db/2'), instrumentedFetch('https://db/3')]);
      done();
    }));
    res.emit('finish');
    const line = lastJson();
    expect(Object.keys(line)).toEqual(['level', 'requestId', 'method', 'route', 'url', 'status', 'durationMs', 'dbCalls', 'dbMs']);
    expect(line).toMatchObject({ level: 'info', method: 'GET', route: '/api/x', url: '/api/x', status: 200, dbCalls: 3 });
    expect(line.dbMs).toBeGreaterThanOrEqual(10);
    expect((res as unknown as { headers: Record<string, string> }).headers['X-Request-Id']).toBe(line.requestId);
  });

  it('counts each overlapping request separately', async () => {
    const a = fakeReqRes('/a');
    const b = fakeReqRes('/b');
    await Promise.all([
      new Promise<void>((done) => requestContext(a.req, a.res, async () => { await instrumentedFetch('x'); await instrumentedFetch('x'); done(); })),
      new Promise<void>((done) => requestContext(b.req, b.res, async () => { await instrumentedFetch('x'); done(); })),
    ]);
    a.res.emit('finish');
    expect(lastJson()).toMatchObject({ route: '/a', dbCalls: 2 });
    b.res.emit('finish');
    expect(lastJson()).toMatchObject({ route: '/b', dbCalls: 1 });
  });

  it('does not count background work started by the request', async () => {
    const { req, res } = fakeReqRes();
    let backgroundDone!: Promise<void>;
    await new Promise<void>((done) => requestContext(req, res, async () => {
      await instrumentedFetch('x');
      backgroundDone = new Promise<void>((r) => runInBackground('test', async () => { await instrumentedFetch('bg'); await instrumentedFetch('bg'); r(); }));
      done();
    }));
    await backgroundDone;
    res.emit('finish');
    expect(lastJson()).toMatchObject({ dbCalls: 1 });
  });
});

describe('rider request-rate alert', () => {
  it('warns once when a rider goes over the per-minute threshold, then stays quiet for 5 minutes', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < RIDER_RATE_ALERT_PER_MINUTE; i++) recordRiderRequest('r1', t0 + i);
    expect(logs.filter((l) => l.includes('rider_request_rate'))).toHaveLength(0);
    for (let i = 0; i < 200; i++) recordRiderRequest('r1', t0 + 100 + i);
    const alerts = logs.filter((l) => l.includes('rider_request_rate'));
    expect(alerts).toHaveLength(1);
    expect(JSON.parse(alerts[0])).toMatchObject({ alert: 'rider_request_rate', riderId: 'r1', requestsLastMinute: RIDER_RATE_ALERT_PER_MINUTE + 1 });
    // Next minute, still looping, but inside the cooldown: no new alert.
    for (let i = 0; i < 100; i++) recordRiderRequest('r1', t0 + 61_000 + i);
    expect(logs.filter((l) => l.includes('rider_request_rate'))).toHaveLength(1);
    // After the cooldown: alerts again.
    for (let i = 0; i < 100; i++) recordRiderRequest('r1', t0 + 5 * 60_000 + 1_000 + i);
    expect(logs.filter((l) => l.includes('rider_request_rate'))).toHaveLength(2);
  });

  it('a normal rider never triggers it', () => {
    for (let i = 0; i < 25; i++) recordRiderRequest('r2', 2_000_000 + i * 2_000);
    expect(logs.filter((l) => l.includes('rider_request_rate'))).toHaveLength(0);
  });
});
