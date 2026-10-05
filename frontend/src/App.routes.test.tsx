/**
 * The legacy /driver and /shopkeeper pages load on demand (B4, 2026-10-05)
 * and still render at their routes; customer routes are unaffected.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// App's imports create the real Supabase client at load time. A fresh
// checkout has no .env, so give it placeholder settings; these tests render
// only mocked pages and make no requests.
vi.hoisted(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost:54321');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');
});

vi.mock('./pages/DriverApp', () => ({ default: () => <h1>driver app</h1> }));
vi.mock('./pages/ShopkeeperApp', () => ({ default: () => <h1>shopkeeper app</h1> }));
vi.mock('./components/layout/Layout', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('./pages/AboutPage', () => ({ default: () => <h1>about page</h1> }));
vi.mock('./context/NotificationContext', () => ({
  useNotification: () => ({ notifications: [], removeNotification: () => {} }),
  NotificationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { AppContent } from './App';

const at = (path: string) => render(<MemoryRouter initialEntries={[path]}><AppContent /></MemoryRouter>);

describe('standalone legacy pages', () => {
  it('/driver shows a loading state, then the driver page', async () => {
    at('/driver');
    expect(await screen.findByText('driver app')).toBeTruthy();
  });
  it('/shopkeeper renders the shopkeeper page', async () => {
    at('/shopkeeper');
    expect(await screen.findByText('shopkeeper app')).toBeTruthy();
  });
  it('a customer route renders without any loading fallback', () => {
    at('/about');
    expect(screen.getByText('about page')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });
});
