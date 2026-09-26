import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';

// Define notification types
export type NotificationType = 'success' | 'error' | 'info' | 'warning';

// Define notification interface
export interface Notification {
  id: string;
  message: string;
  type: NotificationType;
  duration?: number;
}

// Define notification context interface
interface NotificationContextType {
  notifications: Notification[];
  showNotification: (message: string, type?: NotificationType, duration?: number) => void;
  removeNotification: (id: string) => void;
}

// Create context (exported for testing)
export const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// Notification provider props
interface NotificationProviderProps {
  children: ReactNode;
}

/** Errors stay a little longer so the "where" tag can actually be read. */
const DEFAULT_DURATION_MS: Record<NotificationType, number> = {
  success: 3000,
  info: 3000,
  warning: 5000,
  error: 7000
};

// Notification provider component
export function NotificationProvider({ children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const removeNotification = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setNotifications((prev) => prev.filter((notification) => notification.id !== id));
  }, []);

  // Each toast owns its own timer. (Previously one effect re-armed every timer whenever
  // the list changed, so an older toast's countdown restarted each time a new one appeared.)
  const showNotification = useCallback(
    (message: string, type: NotificationType = 'info', duration?: number) => {
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const ttl = duration ?? DEFAULT_DURATION_MS[type];
      setNotifications((prev) => {
        // Collapse exact duplicates that are already on screen.
        if (prev.some((n) => n.message === message && n.type === type)) return prev;
        return [...prev, { id, message, type, duration: ttl }];
      });
      timers.current.set(
        id,
        setTimeout(() => removeNotification(id), ttl)
      );
    },
    [removeNotification]
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  // Stable context value: consumers only re-render when the list itself changes.
  const value = useMemo(
    () => ({ notifications, showNotification, removeNotification }),
    [notifications, showNotification, removeNotification]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

// Custom hook to use notification context
export function useNotification() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}
