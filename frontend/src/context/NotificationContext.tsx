import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';

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
// eslint-disable-next-line react-refresh/only-export-components -- context module also exports its hook/context; only affects dev fast refresh.
export const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// Notification provider props
interface NotificationProviderProps {
  children: ReactNode;
}

// Notification provider component
export function NotificationProvider({ children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Remove notification
  const removeNotification = useCallback((id: string) => {
    setNotifications(prevNotifications =>
      prevNotifications.filter(notification => notification.id !== id)
    );
  }, []);

  // Show notification. useCallback: several pages list showNotification in effect deps
  // (CategoryPage, AddressesPage…). With a new identity per render, every toast add/remove
  // re-ran those effects and refetched the page.
  const showNotification = useCallback((
    message: string,
    type: NotificationType = 'info',
    duration = 3000
  ) => {
    const id = Math.random().toString(36).substring(2, 9);
    const notification: Notification = {
      id,
      message,
      type,
      duration
    };

    setNotifications(prevNotifications => [...prevNotifications, notification]);

    // Scheduled once here, at creation, instead of via a useEffect keyed on
    // the whole `notifications` array — that previously re-derived a fresh
    // timer for every *currently visible* toast on every add/remove, so a
    // burst of notifications kept resetting every earlier toast's countdown
    // back to its full duration instead of letting it expire on schedule.
    setTimeout(() => {
      removeNotification(id);
    }, duration);
  }, [removeNotification]);

  // Context value: consumers only re-render when the toast list itself changes.
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
// eslint-disable-next-line react-refresh/only-export-components -- context module also exports its hook/context; only affects dev fast refresh.
export function useNotification() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}
