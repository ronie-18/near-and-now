import { ReactNode } from 'react';
import Header from './Header';
import Footer from './Footer';
import { Notification } from '../../context/NotificationContext';

interface LayoutProps {
  children: ReactNode;
  notifications?: Notification[];
  removeNotification?: (id: string) => void;
}

const Layout = ({ children, notifications = [], removeNotification }: LayoutProps) => {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      
      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="fixed top-4 right-4 z-50 space-y-2">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={`px-4 py-3 rounded-md shadow-md flex items-center justify-between max-w-md transition-all ${
                notification.type === 'success' ? 'bg-green-500 text-white' :
                notification.type === 'error' ? 'bg-red-500 text-white' :
                notification.type === 'warning' ? 'bg-yellow-500 text-white' :
                'bg-blue-500 text-white'
              }`}
            >
              <p>{notification.message}</p>
              {removeNotification && (
                <button
                  onClick={() => removeNotification(notification.id)}
                  className="ml-4 text-white hover:text-gray-200 focus:outline-none"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      
      <main className="flex-grow">
        {children}
      </main>
      
      <Footer />
    </div>
  );
};

export default Layout;
