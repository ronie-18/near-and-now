/**
 * Google Maps script loading (B3, perf/optimisation-2026-10-05 part 2).
 * Unchanged: one shared loader with the same options; consumers see its
 * isLoaded / loadError. New: nothing is loaded until a map component mounts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';

const loaderState = { isLoaded: false, loadError: undefined as Error | undefined };
const useJsApiLoader = vi.fn(() => loaderState);
vi.mock('@react-google-maps/api', () => ({ useJsApiLoader: (opts: unknown) => useJsApiLoader(opts) }));
vi.mock('../config/app-config', () => ({ default: { getApiKey: () => 'test-key' } }));

import { GoogleMapsProvider, useGoogleMaps } from './GoogleMapsContext';

const seen: Array<{ isLoaded: boolean; loadError: unknown }> = [];
function MapConsumer() {
  const state = useGoogleMaps();
  seen.push(state);
  return <div>{state.isLoaded ? 'map' : 'loading'}</div>;
}

beforeEach(() => {
  useJsApiLoader.mockClear();
  loaderState.isLoaded = false;
  loaderState.loadError = undefined;
  seen.length = 0;
});

describe('GoogleMapsProvider', () => {
  it('does not load the Maps script on pages without a map', () => {
    render(<GoogleMapsProvider><p>home page</p></GoogleMapsProvider>);
    expect(useJsApiLoader).not.toHaveBeenCalled();
  });

  it('loads it, with the same options, once a map component mounts', () => {
    render(<GoogleMapsProvider><MapConsumer /></GoogleMapsProvider>);
    expect(useJsApiLoader).toHaveBeenCalled();
    expect(useJsApiLoader.mock.calls.every(([opts]) => JSON.stringify(opts) === JSON.stringify({ googleMapsApiKey: 'test-key', id: 'google-maps-api' }))).toBe(true);
  });

  it('two maps share one loader, and both see it finish loading', () => {
    const { rerender, getAllByText } = render(<GoogleMapsProvider><MapConsumer /><MapConsumer /></GoogleMapsProvider>);
    const loaderInstances = new Set(useJsApiLoader.mock.results.map((r) => r.value));
    expect(loaderInstances.size).toBe(1);
    expect(getAllByText('loading')).toHaveLength(2);
    loaderState.isLoaded = true;
    act(() => rerender(<GoogleMapsProvider><MapConsumer /><MapConsumer /></GoogleMapsProvider>));
    expect(getAllByText('map')).toHaveLength(2);
  });

  it('passes a load error through', () => {
    loaderState.loadError = new Error('blocked');
    render(<GoogleMapsProvider><MapConsumer /></GoogleMapsProvider>);
    expect(seen.at(-1)).toEqual({ isLoaded: false, loadError: loaderState.loadError });
  });
});
