// @vitest-environment jsdom
/**
 * Backlog item 23 (2026-10-02): MapLocationPicker cleanup and stale search results.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useEffect } from 'react';
import MapLocationPicker from './MapLocationPicker';
import type { PlaceSuggestion, LocationData } from '../../services/placesService';

// --- Fake Google map: captures the idle listener so tests can fire it --------
const idleHandlers: Array<() => void> = [];
const listenerRemoved = vi.fn();
const resizeTriggers = vi.fn();
const fakeMap = {
  setCenter: vi.fn(),
  setZoom: vi.fn(),
  panTo: vi.fn(),
  getCenter: () => ({ lat: () => 22.6, lng: () => 88.4 }),
  addListener: (_event: string, handler: () => void) => {
    idleHandlers.push(handler);
    return { remove: listenerRemoved };
  },
};
vi.mock('@react-google-maps/api', () => ({
  GoogleMap: ({ onLoad, onUnmount }: { onLoad: (m: unknown) => void; onUnmount: () => void }) => {
    useEffect(() => {
      onLoad(fakeMap);
      return () => onUnmount();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <div data-testid="map" />;
  },
}));
vi.mock('../../context/GoogleMapsContext', () => ({ useGoogleMaps: () => ({ isLoaded: true, loadError: null }) }));

// --- Places service with promises the test resolves by hand ------------------
const pendingSearches = new Map<string, (r: PlaceSuggestion[]) => void>();
const searchPlaces = vi.fn((q: string) => new Promise<PlaceSuggestion[]>((resolve) => pendingSearches.set(q, resolve)));
const reverseGeocode = vi.fn(async (): Promise<LocationData | null> => null);
vi.mock('../../services/placesService', () => ({
  searchPlaces: (q: string) => searchPlaces(q),
  reverseGeocode: () => reverseGeocode(),
  getPlaceDetails: vi.fn(async () => null),
}));

const suggestion = (text: string): PlaceSuggestion => ({ placeId: text, description: text, mainText: text, secondaryText: 'Kolkata' });
const initial: LocationData = { address: '1 Park Street', city: 'Kolkata', state: 'WB', pincode: '700016', lat: 22.55, lng: 88.35 };

function renderPicker(embedded = false) {
  return render(<MapLocationPicker initialLocation={initial} onLocationConfirmed={vi.fn()} onBack={vi.fn()} embedded={embedded} />);
}
const type = (value: string) => fireEvent.change(screen.getByPlaceholderText(/Search for area/), { target: { value } });
const shown = () => ['park', 'park street'].filter((t) => screen.queryByText(t));

beforeEach(() => {
  vi.useFakeTimers();
  idleHandlers.length = 0;
  pendingSearches.clear();
  searchPlaces.mockClear();
  reverseGeocode.mockClear();
  listenerRemoved.mockClear();
  resizeTriggers.mockClear();
  (globalThis as unknown as { google: unknown }).google = { maps: { event: { trigger: resizeTriggers } } };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('MapLocationPicker search (stale responses)', () => {
  it('a slower earlier search cannot overwrite a newer one', async () => {
    renderPicker();
    fireEvent.click(screen.getByText('Search Location'));
    type('park');
    await act(() => vi.advanceTimersByTimeAsync(300));
    type('park street');
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(searchPlaces).toHaveBeenCalledTimes(2);

    await act(async () => pendingSearches.get('park street')!([suggestion('park street')]));
    await act(async () => pendingSearches.get('park')!([suggestion('park')])); // arrives last
    expect(shown()).toEqual(['park street']);
  });

  it('clearing the box is not undone by a late response', async () => {
    renderPicker();
    fireEvent.click(screen.getByText('Search Location'));
    type('park');
    await act(() => vi.advanceTimersByTimeAsync(300));
    type('');
    await act(async () => pendingSearches.get('park')!([suggestion('park')]));
    expect(shown()).toEqual([]);
  });
});

describe('MapLocationPicker cleanup on close', () => {
  it('a search typed just before closing never reaches Google', async () => {
    const { unmount } = renderPicker();
    fireEvent.click(screen.getByText('Search Location'));
    type('park');
    unmount(); // within the 300 ms debounce
    await vi.advanceTimersByTimeAsync(1000);
    expect(searchPlaces).not.toHaveBeenCalled();
  });

  it('a map move just before closing never reverse-geocodes, and the idle listener is removed', async () => {
    const { unmount } = renderPicker();
    expect(idleHandlers).toHaveLength(1);
    idleHandlers[0](); // map stopped moving
    unmount(); // within the 400 ms debounce
    await vi.advanceTimersByTimeAsync(1000);
    expect(reverseGeocode).not.toHaveBeenCalled();
    expect(listenerRemoved).toHaveBeenCalled();
  });

  it('embedded resize timers do not fire after close', async () => {
    const { unmount } = renderPicker(true);
    unmount(); // before the 100 ms / 500 ms resize timers
    await vi.advanceTimersByTimeAsync(1000);
    expect(resizeTriggers).not.toHaveBeenCalled();
  });

  it('still reverse-geocodes normally while open', async () => {
    renderPicker();
    idleHandlers[0]();
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(reverseGeocode).toHaveBeenCalledTimes(1);
  });
});
