// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DriverApp from './DriverApp';

// Minimal backend for the dashboard: an active rider, offline, no offers.
function mockBackend(statusResponse: { ok: boolean; status: number; body: unknown } | 'network-error') {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method || 'GET';
    calls.push({ url, method, body: init?.body as string | undefined });
    if (url.endsWith('/delivery-partner/status')) {
      if (statusResponse === 'network-error') throw new TypeError('Failed to fetch');
      return { ok: statusResponse.ok, status: statusResponse.status, json: async () => statusResponse.body };
    }
    if (url.endsWith('/delivery-partner/profile')) {
      return { ok: true, status: 200, json: async () => ({ success: true, profile: { name: 'Rider', status: 'active', is_online: false } }) };
    }
    return { ok: true, status: 200, json: async () => ({ success: true, orders: [], offers: [], stats: {} }) };
  }));
  return calls;
}

describe('DriverApp go-online toggle (backlog item 24)', () => {
  beforeEach(() => {
    localStorage.setItem('dp_token', 'test-token');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('flips back and explains why when the server refuses', async () => {
    mockBackend({ ok: false, status: 403, body: { error: 'Your account is not yet approved by admin.' } });
    render(<DriverApp />);
    fireEvent.click(await screen.findByRole('button', { name: /Go Online/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not go online: Your account is not yet approved by admin.');
    expect(screen.getByRole('button', { name: /Go Online/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Go Offline/ })).not.toBeInTheDocument();
  });

  it('flips back on a network error', async () => {
    mockBackend('network-error');
    render(<DriverApp />);
    fireEvent.click(await screen.findByRole('button', { name: /Go Online/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not go online'));
    expect(screen.getByRole('button', { name: /Go Online/ })).toBeInTheDocument();
  });

  it('stays online when the server accepts, and a double click sends one request', async () => {
    const calls = mockBackend({ ok: true, status: 200, body: { success: true } });
    render(<DriverApp />);
    const button = await screen.findByRole('button', { name: /Go Online/ });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(await screen.findByRole('button', { name: /Go Offline/ })).toBeInTheDocument();
    expect(calls.filter((c) => c.url.endsWith('/delivery-partner/status'))).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
