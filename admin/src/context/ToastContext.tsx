import { createContext, useContext, useState, ReactNode } from 'react';

/**
 * Short-lived on-screen messages ("Coupon saved", "Failed to load…").
 *
 * Renamed 2026-10-02 from NotificationContext / useNotification /
 * showNotification: the admin panel also has a real, persisted notifications
 * system (the `admin_notifications` table, NotificationsPage, the header
 * bell), and the two shared a name while having nothing to do with each
 * other. "Notification" in the admin panel now means only that system.
 */

// Toast (transient on-screen message) types
export type ToastType = 'success' | 'error' | 'info' | 'warning';

// A single toast
export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

// Toast context interface
interface ToastContextType {
  toasts: Toast[];
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
}

// Create context (exported for testing)
export const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Toast provider props
interface ToastProviderProps {
  children: ReactNode;
}

// Toast provider component
export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Show a toast
  const showToast = (
    message: string,
    type: ToastType = 'info',
    duration = 3000
  ) => {
    const id = Math.random().toString(36).substring(2, 9);
    const toast: Toast = {
      id,
      message,
      type,
      duration
    };

    setToasts(prev => [...prev, toast]);

    // Scheduled once here, at creation, instead of via a useEffect keyed on
    // the whole `toasts` array — that previously re-derived a fresh
    // timer for every *currently visible* toast on every add/remove, so a
    // burst of toasts (e.g. approving two stores back-to-back) kept
    // resetting every earlier toast's countdown back to its full duration
    // instead of letting it expire on schedule. Same bug already fixed in
    // the website's own NotificationContext.tsx (frontend/, 2026-07-27) — this is its
    // separate admin-panel twin, missed at the time.
    setTimeout(() => {
      removeToast(id);
    }, duration);
  };

  // Remove a toast
  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Context value
  const value = {
    toasts,
    showToast,
    removeToast
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
    </ToastContext.Provider>
  );
}

// Hook for showing toasts
export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
