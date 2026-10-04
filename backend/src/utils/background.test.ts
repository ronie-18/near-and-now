import { describe, it, expect, vi, afterEach } from 'vitest';

const waitUntil = vi.fn();
vi.mock('@vercel/functions', () => ({ waitUntil: (p: Promise<unknown>) => waitUntil(p) }));

const { runInBackground } = await import('./background.js');

afterEach(() => vi.restoreAllMocks());

describe('runInBackground', () => {
  it('hands the work to waitUntil so Vercel keeps the function alive until it settles', async () => {
    waitUntil.mockClear();
    let done = false;
    runInBackground('job', async () => { done = true; });
    expect(waitUntil).toHaveBeenCalledTimes(1);
    await waitUntil.mock.calls[0][0];
    expect(done).toBe(true);
  });

  it('never throws to the caller and logs a failing job', async () => {
    waitUntil.mockClear();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => runInBackground('boom', async () => { throw new Error('nope'); })).not.toThrow();
    await waitUntil.mock.calls[0][0]; // the handed-over promise resolves (error swallowed)
    expect(log).toHaveBeenCalledWith('[background] boom failed:', expect.any(Error));
  });

  it('a synchronous throw inside the job is caught the same way', async () => {
    waitUntil.mockClear();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    runInBackground('sync', () => { throw new Error('sync'); });
    await waitUntil.mock.calls[0][0];
    expect(log).toHaveBeenCalled();
  });

  it('still runs the job when waitUntil itself throws (no request context)', async () => {
    waitUntil.mockImplementationOnce(() => { throw new Error('no context'); });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let ran = false;
    runInBackground('timer', async () => { ran = true; });
    await new Promise((r) => setTimeout(r, 0));
    expect(ran).toBe(true);
  });
});
