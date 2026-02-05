import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

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

// Create context
const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// Notification provider props
interface NotificationProviderProps {
  children: ReactNode;
}

// Notification provider component
export function NotificationProvider({ children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // Remove notification after duration
  useEffect(() => {
    if (notifications.length > 0) {
      const timers = notifications.map(notification => {
        const duration = notification.duration || 3000;
        return setTimeout(() => {
          removeNotification(notification.id);
        }, duration);
      });

      // Cleanup timers
      return () => {
        timers.forEach(timer => clearTimeout(timer));
      };
    }
  }, [notifications]);

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
