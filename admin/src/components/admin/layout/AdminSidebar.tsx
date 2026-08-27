import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingBag,
  Users,
  ClipboardList,
  Settings,
  BarChart3,
  Tag,
  Truck,
  LogOut,
  ChevronDown,
  Layers,
  Shield,
  Bell,
  HelpCircle,
  User,
  Package,
  Plus,
  X,
  Store,
  FileText,
  History,
  MessageCircle,
  Wallet,
  ShieldAlert,
  Star
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { secureAdminLogout, getCurrentAdmin } from '../../../services/secureAdminAuth';
import { clearAdminSession } from '../../../services/adminSession';

interface AdminSidebarProps {
  isOpen: boolean;
  onClose?: () => void;
}

interface SubItem {
  title: string;
  path: string;
  icon?: React.ReactNode;
}

interface NavItem {
  title: string;
  path: string;
  icon: React.ReactNode;
  badge?: number;
  submenu?: SubItem[];
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const AdminSidebar = ({ isOpen, onClose }: AdminSidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});
  const [currentAdmin, setCurrentAdmin] = useState<any>(null);

  useEffect(() => {
    const admin = getCurrentAdmin();
    setCurrentAdmin(admin);
  }, []);

  // Auto-expand menu if a child route is active
  useEffect(() => {
    navSections.forEach(section => {
      section.items.forEach(item => {
        if (item.submenu) {
          const isChildActive = item.submenu.some(sub => isActive(sub.path));
          if (isChildActive) {
            setExpandedMenus(prev => ({ ...prev, [item.title]: true }));
          }
        }
      });
    });
  }, [location.pathname]);

  const handleLogout = async () => {
    try {
      await secureAdminLogout();
      navigate('/login');
    } catch {
      clearAdminSession();
      navigate('/login');
    }
  };

  const toggleSubmenu = (title: string) => {
    setExpandedMenus(prev => ({ ...prev, [title]: !prev[title] }));
  };

  const isActive = (path: string) => {
    if (path === '/') {
      // Dashboard (AdminDashboardPage) is mounted at '/' inside AdminRoutes.tsx
      // — this app has no '/admin' path anywhere in its own routing (that
      // would only make sense if this SPA were nested under a shared
      // basename it isn't). The old check meant Dashboard could never show
      // as active.
      return location.pathname === '/';
    }
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  const isParentActive = (item: NavItem) => {
    if (isActive(item.path)) return true;
    if (item.submenu) return item.submenu.some(sub => isActive(sub.path));
    return false;
  };

  const navSections: NavSection[] = [
    {
      label: 'Main',
      items: [
        {
          title: 'Dashboard',
          path: '/',
          icon: <LayoutDashboard size={18} />
        },
        {
          title: 'Notifications',
          path: '/notifications',
          icon: <Bell size={18} />
        }
      ]
    },
    {
      label: 'Catalog',
      items: [
        {
          title: 'Products',
          path: '/products',
          icon: <ShoppingBag size={18} />,
          submenu: [
            { title: 'All Products', path: '/products', icon: <Package size={14} /> },
            { title: 'Add Product', path: '/products/add', icon: <Plus size={14} /> },
            { title: 'Categories', path: '/categories', icon: <Layers size={14} /> },
            { title: 'Store Inventory', path: '/stores/products', icon: <Store size={14} /> },
            { title: 'Product Submissions', path: '/products/submissions', icon: <FileText size={14} /> },
            { title: 'Reviews', path: '/products/reviews', icon: <Star size={14} /> }
          ]
        }
      ]
    },
    {
      label: 'Sales',
      items: [
        {
          title: 'Orders',
          path: '/orders',
          icon: <ClipboardList size={18} />
        },
        {
          title: 'Customers',
          path: '/customers',
          icon: <Users size={18} />
        }
      ]
    },
    {
      label: 'Marketing',
      items: [
        {
          title: 'Reports',
          path: '/reports',
          icon: <BarChart3 size={18} />
        },
        {
          title: 'Offers',
          path: '/offers',
          icon: <Tag size={18} />
        }
      ]
    },
    {
      label: 'Operations',
      items: [
        {
          title: 'Delivery',
          path: '/delivery',
          icon: <Truck size={18} />
        },
        {
          title: 'Rider Profile Change Requests',
          path: '/delivery/profile-change-requests',
          icon: <FileText size={18} />
        },
        {
          title: 'Stores',
          path: '/stores',
          icon: <Store size={18} />
        },
        {
          title: 'Store Profile Change Requests',
          path: '/stores/profile-change-requests',
          icon: <FileText size={18} />
        }
      ]
    },
    {
      label: 'System',
      items: [
        {
          title: 'Activity Log',
          path: '/activity-log',
          icon: <History size={18} />
        },
        {
          title: 'Security Log',
          path: '/security-log',
          icon: <ShieldAlert size={18} />
        },
        {
          title: 'Support Messages',
          path: '/support-messages',
          icon: <MessageCircle size={18} />
        },
        {
          title: 'Rider Payouts',
          path: '/rider-payouts',
          icon: <Wallet size={18} />
        },
        {
          title: 'Admin Users',
          path: '/admins',
          icon: <Shield size={18} />
        },
        {
          title: 'Settings',
          path: '/settings',
          icon: <Settings size={18} />
        },
        {
          title: 'Help',
          path: '/help',
          icon: <HelpCircle size={18} />
        }
      ]
    }
  ];

  const adminInitials = currentAdmin?.full_name
    ? currentAdmin.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'AD';

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && onClose && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          bg-gray-900 fixed inset-y-0 left-0 z-50 flex flex-col
          transition-all duration-300 ease-in-out
          ${isOpen ? 'w-64 translate-x-0' : 'w-0 md:w-20 -translate-x-full md:translate-x-0'}
          overflow-hidden
        `}
      >
        {/* Logo */}
        <div className={`flex items-center h-16 border-b border-white/10 flex-shrink-0 ${isOpen ? 'px-5 justify-between' : 'px-0 justify-center'}`}>
          {isOpen ? (
            <>
              <Link to="/" className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center flex-shrink-0">
                  <img src="/Logo.png" alt="" className="w-5 h-5 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </div>
                <div className="min-w-0">
                  <p className="text-white font-bold text-sm leading-tight truncate">Near & Now</p>
                  <p className="text-gray-400 text-xs leading-tight">Admin Panel</p>
                </div>
              </Link>
              {onClose && (
                <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors md:hidden">
                  <X size={18} />
                </button>
              )}
            </>
          ) : (
            <Link to="/" className="w-9 h-9 bg-emerald-500 rounded-lg flex items-center justify-center">
              <img src="/Logo.png" alt="" className="w-5 h-5 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </Link>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 scrollbar-thin scrollbar-thumb-white/10">
          {navSections.map((section) => (
            <div key={section.label} className="mb-1">
              {/* Section Label */}
              {isOpen && (
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest px-5 py-2">
                  {section.label}
                </p>
              )}
              {!isOpen && <div className="h-2" />}

              {section.items.map((item) => (
                <div key={item.title}>
                  {item.submenu ? (
                    <>
                      <button
                        onClick={() => toggleSubmenu(item.title)}
                        className={`
                          w-full flex items-center transition-all duration-150 group relative
                          ${isOpen ? 'px-4 py-2.5 mx-1' : 'px-0 py-2.5 justify-center mx-0'}
                          rounded-xl
                          ${isParentActive(item)
                            ? 'text-white bg-white/10'
                            : 'text-gray-400 hover:text-white hover:bg-white/5'}
                        `}
                        style={isOpen ? { width: 'calc(100% - 8px)' } : {}}
                      >
                        {/* Active left bar */}
                        {isParentActive(item) && isOpen && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-emerald-500 rounded-r-full" />
                        )}
                        <span className={`flex-shrink-0 ${isParentActive(item) ? 'text-emerald-400' : ''}`}>
                          {item.icon}
                        </span>
                        {isOpen && (
                          <>
                            <span className="ml-3 text-sm font-medium flex-1 text-left">{item.title}</span>
                            <span className={`transition-transform duration-200 ${expandedMenus[item.title] ? 'rotate-180' : ''}`}>
                              <ChevronDown size={14} className="text-gray-500" />
                            </span>
                          </>
                        )}
                        {/* Tooltip on collapsed */}
                        {!isOpen && (
                          <span className="absolute left-full ml-3 px-2 py-1 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 shadow-xl">
                            {item.title}
                          </span>
                        )}
                      </button>

                      {/* Submenu */}
                      {isOpen && expandedMenus[item.title] && (
                        <div className="ml-4 mr-1 mt-0.5 mb-1 border-l border-white/10 pl-3">
                          {item.submenu.map((sub) => (
                            <Link
                              key={sub.path}
                              to={sub.path}
                              className={`
                                flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150 mb-0.5
                                ${isActive(sub.path)
                                  ? 'text-emerald-400 bg-emerald-500/10 font-medium'
                                  : 'text-gray-400 hover:text-white hover:bg-white/5'}
                              `}
                            >
                              {sub.icon && <span className="flex-shrink-0">{sub.icon}</span>}
                              {sub.title}
                            </Link>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <Link
                      to={item.path}
                      className={`
                        flex items-center transition-all duration-150 group relative
                        ${isOpen ? 'px-4 py-2.5 mx-1 rounded-xl' : 'py-2.5 justify-center mx-0'}
                        ${isActive(item.path)
                          ? 'text-white bg-white/10'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'}
                      `}
                      style={isOpen ? { width: 'calc(100% - 8px)' } : {}}
                    >
                      {/* Active left bar */}
                      {isActive(item.path) && isOpen && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-emerald-500 rounded-r-full" />
                      )}
                      <span className={`flex-shrink-0 ${isActive(item.path) ? 'text-emerald-400' : ''}`}>
                        {item.icon}
                      </span>
                      {isOpen && (
                        <span className="ml-3 text-sm font-medium flex-1">{item.title}</span>
                      )}
                      {item.badge && isOpen ? (
                        <span className="ml-auto bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                          {item.badge}
                        </span>
                      ) : null}
                      {/* Tooltip on collapsed */}
                      {!isOpen && (
                        <span className="absolute left-full ml-3 px-2 py-1 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 shadow-xl">
                          {item.title}
                        </span>
                      )}
                    </Link>
                  )}
                </div>
              ))}
            </div>
          ))}
        </nav>

        {/* User Profile + Logout */}
        <div className="flex-shrink-0 border-t border-white/10 p-3">
          {isOpen ? (
            <>
              <Link
                to="/profile"
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group mb-1"
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-xs font-bold">{adminInitials}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-medium truncate">{currentAdmin?.full_name || 'Admin User'}</p>
                  <p className="text-gray-500 text-xs truncate">{currentAdmin?.email || ''}</p>
                </div>
                <User size={14} className="text-gray-500 group-hover:text-gray-300 flex-shrink-0" />
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150"
              >
                <LogOut size={18} className="flex-shrink-0" />
                <span className="text-sm font-medium">Logout</span>
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Link
                to="/profile"
                className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center group relative"
                title="Profile"
              >
                <span className="text-white text-xs font-bold">{adminInitials}</span>
                <span className="absolute left-full ml-3 px-2 py-1 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 shadow-xl">
                  Profile
                </span>
              </Link>
              <button
                onClick={handleLogout}
                className="w-9 h-9 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-all group relative"
                title="Logout"
              >
                <LogOut size={18} />
                <span className="absolute left-full ml-3 px-2 py-1 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50 shadow-xl">
                  Logout
                </span>
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

export default AdminSidebar;
