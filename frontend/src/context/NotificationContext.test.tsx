import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { NotificationProvider, useNotification } from './NotificationContext';

describe('NotificationContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('expires an earlier toast on its own schedule, unaffected by a later toast being added', () => {
    const { result } = renderHook(() => useNotification(), {
      wrapper: NotificationProvider,
    });

    act(() => {
      result.current.showNotification('A', 'info', 3000);
    });
    expect(result.current.notifications.map((n) => n.message)).toEqual(['A']);

    // A burst: a second toast arrives before the first has expired. Under
    // the old bug, this reset A's countdown back to a full 3000ms.
    act(() => {
      vi.advanceTimersByTime(1000);
      result.current.showNotification('B', 'info', 3000);
    });
    expect(result.current.notifications.map((n) => n.message)).toEqual(['A', 'B']);

    // Total elapsed for A is now 3000ms (1000 + 2000) -- it must be gone,
    // even though B (only 2000ms elapsed) hasn't expired yet.
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.notifications.map((n) => n.message)).toEqual(['B']);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.notifications).toEqual([]);
  });
});
