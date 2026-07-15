import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useNotification, type NotificationType } from '../context/NotificationContext';

const STYLES: Record<NotificationType, { className: string; icon: React.ComponentType<{ className?: string }> }> = {
  success: { className: 'from-emerald-500 to-teal-500', icon: CheckCircle },
  error: { className: 'from-red-500 to-rose-500', icon: XCircle },
  warning: { className: 'from-amber-500 to-orange-500', icon: AlertTriangle },
  info: { className: 'from-sky-500 to-blue-500', icon: Info },
};

// Renders whatever NotificationProvider's showNotification() calls produce.
// The context previously had no visual consumer anywhere — calling
// showNotification() updated state but nothing ever displayed it.
export function NotificationToasts() {
  const { notifications, removeNotification } = useNotification();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] space-y-2 w-full max-w-sm">
      {notifications.map((n) => {
        const { className, icon: Icon } = STYLES[n.type];
        return (
          <div
            key={n.id}
            className={`bg-gradient-to-r ${className} text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3`}
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            <span className="flex-1 text-sm font-medium">{n.message}</span>
            <button onClick={() => removeNotification(n.id)} className="p-1 hover:bg-white/20 rounded-lg flex-shrink-0">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
