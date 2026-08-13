import { createContext, useContext, useState, ReactNode } from 'react';

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

// Notification provider component
export function NotificationProvider({ children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Show notification
  const showNotification = (
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
    // burst of notifications (e.g. approving two stores back-to-back) kept
    // resetting every earlier toast's countdown back to its full duration
    // instead of letting it expire on schedule. Same bug already fixed in
    // the website's own NotificationContext.tsx (2026-07-27) — this is its
    // separate admin-panel twin, missed at the time.
    setTimeout(() => {
      removeNotification(id);
    }, duration);
  };

  // Remove notification
  const removeNotification = (id: string) => {
    setNotifications(prevNotifications => 
      prevNotifications.filter(notification => notification.id !== id)
    );
  };

  // Context value
  const value = {
    notifications,
    showNotification,
    removeNotification
  };

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
