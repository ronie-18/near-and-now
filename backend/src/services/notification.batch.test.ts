/**
 * sendExpoPushBatch (2026-10-04): the admin broadcast moved server-side so it
 * gets Expo's 100-per-request chunking, real per-ticket counts (Expo answers
 * HTTP 200 even when every ticket is an error) and DeviceNotRegistered token
 * clearing. These pin the chunking, the counting and the clearing.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { supabaseAdmin } from '../config/database.js';
import { notificationService, EXPO_PUSH_CHUNK_SIZE, type BatchPushRecipient } from './notification.service.js';
import { installFakeSupabase, hasFilter } from '../test/fakeSupabase.js';

type ExpoMessage = { to: string };

/** Fake Expo: one ticket per message, error for tokens containing "dead", in order. */
function stubExpo(onRequest?: (messages: ExpoMessage[], requestIndex: number) => Response | undefined) {
  const requests: ExpoMessage[][] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string | URL, init?: RequestInit) => {
    const messages = JSON.parse(String(init?.body)) as ExpoMessage[];
    requests.push(messages);
    const custom = onRequest?.(messages, requests.length - 1);
    if (custom) return custom;
    const tickets = messages.map((m, i) =>
      m.to.includes('dead')
        ? { status: 'error', message: `"${m.to}" is not a registered push notification recipient`, details: { error: 'DeviceNotRegistered' } }
        : { status: 'ok', id: `ticket-${i}` }
    );
    return new Response(JSON.stringify({ data: tickets }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  return requests;
}

const recipient = (token: string, table: 'delivery_partners' | 'stores' | 'app_users', idValue: string): BatchPushRecipient => ({
  token,
  staleTokenTarget: { table, idColumn: table === 'delivery_partners' ? 'user_id' : 'id', idValue },
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('notificationService.sendExpoPushBatch', () => {
  it('returns zeros and makes no request for no recipients', async () => {
    const requests = stubExpo();
    const result = await notificationService.sendExpoPushBatch([], 'T', 'B');
    expect(result).toEqual({ sent: 0, failed: 0, errors: [] });
    expect(requests).toHaveLength(0);
  });

  it('chunks by EXPO_PUSH_CHUNK_SIZE and counts tickets, not HTTP status', async () => {
    installFakeSupabase(supabaseAdmin);
    const requests = stubExpo();
    const recipients = Array.from({ length: 250 }, (_, i) => recipient(`ExponentPushToken[${i === 7 || i === 199 ? 'dead' : 'ok'}-${i}]`, 'app_users', `u${i}`));
    const result = await notificationService.sendExpoPushBatch(recipients, 'Title', 'Body', { k: 1 });
    expect(requests.map((r) => r.length)).toEqual([EXPO_PUSH_CHUNK_SIZE, EXPO_PUSH_CHUNK_SIZE, 50]);
    expect(result.sent).toBe(248);
    expect(result.failed).toBe(2);
    expect(result.errors).toEqual(['DeviceNotRegistered']);
  });

  it('clears DeviceNotRegistered tokens with one UPDATE per source table', async () => {
    const fake = installFakeSupabase(supabaseAdmin);
    stubExpo();
    const result = await notificationService.sendExpoPushBatch(
      [
        recipient('ExponentPushToken[ok-1]', 'delivery_partners', 'r1'),
        recipient('ExponentPushToken[dead-1]', 'delivery_partners', 'r2'),
        recipient('ExponentPushToken[dead-2]', 'delivery_partners', 'r3'),
        recipient('ExponentPushToken[dead-3]', 'stores', 's1'),
        { token: 'ExponentPushToken[dead-4]' }, // no stale target: counted, nothing to clear
      ],
      'T',
      'B'
    );
    expect(result).toEqual({ sent: 1, failed: 4, errors: ['DeviceNotRegistered'] });

    const riderUpdates = fake.on('delivery_partners', 'update');
    expect(riderUpdates).toHaveLength(1);
    expect(riderUpdates[0].payload).toEqual({ expo_push_token: null });
    expect(hasFilter(riderUpdates[0], 'in', 'user_id', ['r2', 'r3'])).toBe(true);

    const storeUpdates = fake.on('stores', 'update');
    expect(storeUpdates).toHaveLength(1);
    expect(hasFilter(storeUpdates[0], 'in', 'id', ['s1'])).toBe(true);
    expect(fake.on('app_users', 'update')).toHaveLength(0);
  });

  it('stops at a transport failure and counts every unsent message as failed', async () => {
    installFakeSupabase(supabaseAdmin);
    const requests = stubExpo((_messages, i) =>
      i === 1 ? new Response('<html>Bad Gateway</html>', { status: 502 }) : undefined
    );
    const recipients = Array.from({ length: 230 }, (_, i) => recipient(`ExponentPushToken[ok-${i}]`, 'app_users', `u${i}`));
    const result = await notificationService.sendExpoPushBatch(recipients, 'T', 'B');
    // First chunk delivered, second chunk failed, third never attempted.
    expect(requests).toHaveLength(2);
    expect(result.sent).toBe(100);
    expect(result.failed).toBe(130);
    expect(result.errors).toHaveLength(1);
  });

  it('treats a request-level `errors` body as a failed chunk', async () => {
    installFakeSupabase(supabaseAdmin);
    stubExpo(() => new Response(JSON.stringify({ errors: [{ code: 'PUSH_TOO_MANY_EXPERIENCE_IDS', message: 'Too many experiences' }] }), { status: 200 }));
    const result = await notificationService.sendExpoPushBatch([recipient('ExponentPushToken[ok]', 'stores', 's1')], 'T', 'B');
    expect(result).toEqual({ sent: 0, failed: 1, errors: ['Too many experiences'] });
  });
});

describe('notificationService.sendExpoPushBatchToDrivers', () => {
  it('delegates to the chunked batch and clears stale rider tokens', async () => {
    const fake = installFakeSupabase(supabaseAdmin);
    const requests = stubExpo();
    const partners = Array.from({ length: 120 }, (_, i) => ({ user_id: `r${i}`, expo_push_token: `ExponentPushToken[${i === 3 ? 'dead' : 'ok'}-${i}]` }));
    await expect(notificationService.sendExpoPushBatchToDrivers(partners, 'T', 'B', { orderId: 'o1' })).resolves.toBeUndefined();
    expect(requests.map((r) => r.length)).toEqual([100, 20]);
    const updates = fake.on('delivery_partners', 'update');
    expect(updates).toHaveLength(1);
    expect(hasFilter(updates[0], 'in', 'user_id', ['r3'])).toBe(true);
  });
});
