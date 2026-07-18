import { useState, useRef, useEffect, useCallback } from 'react';
import { Bell, Search, Menu, User, Settings, HelpCircle, LogOut, ChevronRight, Package, ShoppingBag, AlertTriangle, CheckCheck, FileText, ShieldCheck, Truck } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { secureAdminLogout, getCurrentAdmin } from '../../../services/secureAdminAuth';
import { getAdminClient } from '../../../services/supabase';

interface AdminHeaderProps {
  toggleSidebar: () => void;
  isSidebarOpen: boolean;
}

const routeTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/products': 'Products',
  '/products/add': 'Add Product',
  '/categories': 'Categories',
  '/categories/add': 'Add Category',
  '/orders': 'Orders',
  '/customers': 'Customers',
  '/reports': 'Reports',
  '/delivery': 'Delivery',
  '/offers': 'Offers',
  '/admins': 'Admin Users',
  '/admins/create': 'Create Admin',
  '/settings': 'Settings',
  '/profile': 'My Profile',
  '/help': 'Help & Support',
  '/notifications': 'Notifications',
  '/stores': 'Stores',
};

const getBreadcrumbs = (pathname: string) => {
  const crumbs: { label: string; path: string }[] = [{ label: 'Admin', path: '/' }];

  if (pathname === '/') return crumbs;

  const segments = pathname.replace('/', '').split('/');
  let currentPath = '';

  segments.forEach((seg) => {
    currentPath += `/${seg}`;
    const label = routeTitles[currentPath];
    if (label && label !== 'Dashboard') {
      crumbs.push({ label, path: currentPath });
    } else if (!label) {
      crumbs.push({ label: seg.charAt(0).toUpperCase() + seg.slice(1), path: currentPath });
    }
  });

  return crumbs;
};

interface DbNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

function notifStyle(type: string): { iconBg: string; Icon: React.ElementType } {
  switch (type) {
    case 'new_order': return { iconBg: 'bg-blue-100 text-blue-600', Icon: ShoppingBag };
    case 'new_user': return { iconBg: 'bg-emerald-100 text-emerald-600', Icon: User };
    case 'low_stock': return { iconBg: 'bg-amber-100 text-amber-600', Icon: AlertTriangle };
    case 'document_uploaded': return { iconBg: 'bg-indigo-100 text-indigo-600', Icon: FileText };
    case 'document_removed': return { iconBg: 'bg-gray-100 text-gray-600', Icon: FileText };
    case 'verification_submitted': return { iconBg: 'bg-teal-100 text-teal-600', Icon: ShieldCheck };
    case 'rider_document_uploaded': return { iconBg: 'bg-indigo-100 text-indigo-600', Icon: Truck };
    case 'rider_document_removed': return { iconBg: 'bg-gray-100 text-gray-600', Icon: Truck };
    case 'rider_verification_submitted': return { iconBg: 'bg-teal-100 text-teal-600', Icon: Truck };
    default: return { iconBg: 'bg-violet-100 text-violet-600', Icon: Package };
  }
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const AdminHeader = ({ toggleSidebar }: AdminHeaderProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [currentAdmin, setCurrentAdmin] = useState<any>(null);
  const [notifications, setNotifications] = useState<DbNotification[]>([]);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const admin = getCurrentAdmin();
    setCurrentAdmin(admin);
  }, []);

  const fetchNotifications = useCallback(async () => {
    const { data } = await getAdminClient()
      .from('admin_notifications')
      .select('id, type, title, message, is_read, created_at')
      .order('created_at', { ascending: false })
      .limit(8);
    if (data) setNotifications(data);
  }, []);

  useEffect(() => {
    fetchNotifications();

    // Polled, not Realtime: admin_notifications' RLS policy (is_admin_authenticated())
    // reads PostgREST's request.headers GUC, which Realtime's postgres_changes feed
    // never populates (it's a WAL broadcast, not an HTTP request) — so a
    // postgres_changes subscription here would silently never receive events.
    const intervalId = setInterval(fetchNotifications, 15_000);
    return () => clearInterval(intervalId);
  }, [fetchNotifications]);

  const markAllRead = async () => {
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;
    await getAdminClient().from('admin_notifications').update({ is_read: true }).in('id', unreadIds);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const handleLogout = async () => {
    try {
      await secureAdminLogout();
      sessionStorage.removeItem('adminToken');
      sessionStorage.removeItem('adminTokenExpiry');
      navigate('/login');
    } catch {
      sessionStorage.clear();
      navigate('/login');
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const pageTitle = routeTitles[location.pathname] || 'Admin';
  const breadcrumbs = getBreadcrumbs(location.pathname);
  const adminInitials = currentAdmin?.full_name
    ? currentAdmin.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'AD';

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <header className="bg-white border-b border-gray-200 z-30 flex-shrink-0">
      <div className="flex items-center h-16 px-4 gap-3">
        {/* Sidebar Toggle */}
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors flex-shrink-0"
          aria-label="Toggle sidebar"
        >
          <Menu size={20} />
        </button>

        {/* Breadcrumbs / Page Title */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {breadcrumbs.length > 1 ? (
            <nav className="flex items-center gap-1 text-sm min-w-0">
              {breadcrumbs.map((crumb, idx) => (
                <span key={crumb.path} className="flex items-center gap-1 min-w-0">
                  {idx > 0 && <ChevronRight size={13} className="text-gray-400 flex-shrink-0" />}
                  {idx === breadcrumbs.length - 1 ? (
                    <span className="font-semibold text-gray-800 truncate">{crumb.label}</span>
                  ) : (
                    <Link to={crumb.path} className="text-gray-500 hover:text-gray-700 transition-colors truncate">
                      {crumb.label}
                    </Link>
                  )}
                </span>
              ))}
            </nav>
          ) : (
            <h1 className="text-base font-bold text-gray-800 truncate">{pageTitle}</h1>
          )}
        </div>

        {/* Search - Desktop */}
        <div className="hidden lg:block">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              className="pl-9 pr-4 py-2 text-sm w-56 rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all placeholder-gray-400"
            />
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Notifications */}
          <div className="relative" ref={notificationRef}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              aria-label="Notifications"
            >
              <Bell size={19} />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden z-50">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <h3 className="text-sm font-bold text-gray-800">Notifications</h3>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <>
                        <span className="text-xs font-semibold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                          {unreadCount} new
                        </span>
                        <button
                          onClick={markAllRead}
                          className="text-gray-400 hover:text-emerald-600 transition-colors"
                          title="Mark all read"
                        >
                          <CheckCheck size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                      <Bell size={24} className="mb-2 opacity-30" />
                      <p className="text-xs">No notifications yet</p>
                    </div>
                  ) : (
                    notifications.map(notif => {
                      const { iconBg, Icon } = notifStyle(notif.type);
                      return (
                        <div key={notif.id} className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer ${!notif.is_read ? 'bg-blue-50/40' : ''}`}>
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${iconBg}`}>
                            <Icon size={14} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm leading-tight ${!notif.is_read ? 'font-semibold text-gray-800' : 'font-medium text-gray-700'}`}>
                              {notif.title}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5 truncate">{notif.message}</p>
                            <p className="text-[10px] text-gray-400 mt-1">{timeAgo(notif.created_at)}</p>
                          </div>
                          {!notif.is_read && <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2" />}
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
                  <Link
                    to="/notifications"
                    onClick={() => setShowNotifications(false)}
                    className="text-xs text-emerald-600 font-semibold hover:text-emerald-700 flex items-center justify-center gap-1"
                  >
                    View all notifications
                    <ChevronRight size={12} />
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* User Menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 pl-1 pr-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">{adminInitials}</span>
              </div>
              <div className="hidden md:block text-left">
                <p className="text-sm font-semibold text-gray-800 leading-tight max-w-[120px] truncate">
                  {currentAdmin?.full_name || 'Admin'}
                </p>
                <p className="text-[10px] text-gray-500 leading-tight capitalize">
                  {currentAdmin?.role?.replace('_', ' ') || 'Administrator'}
                </p>
              </div>
            </button>

            {showUserMenu && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <p className="text-sm font-bold text-gray-800 truncate">{currentAdmin?.full_name || 'Admin User'}</p>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{currentAdmin?.email || ''}</p>
                  <span className="inline-block mt-1.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full capitalize">
                    {currentAdmin?.role?.replace('_', ' ') || 'admin'}
                  </span>
                </div>
                <div className="py-1">
                  <Link
                    to="/profile"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <User size={15} className="text-gray-400" />
                    My Profile
                  </Link>
                  <Link
                    to="/settings"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Settings size={15} className="text-gray-400" />
                    Settings
                  </Link>
                  <Link
                    to="/help"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <HelpCircle size={15} className="text-gray-400" />
                    Help & Support
                  </Link>
                </div>
                <div className="border-t border-gray-100 py-1">
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <LogOut size={15} />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default AdminHeader;
