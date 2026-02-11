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
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import { useState } from 'react';
import { secureAdminLogout } from '../../../services/secureAdminAuth';

interface AdminSidebarProps {
  isOpen: boolean;
}

interface NavItem {
  title: string;
  path: string;
  icon: React.ReactNode;
  submenu?: { title: string; path: string }[];
}

const AdminSidebar = ({ isOpen }: AdminSidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});

  const handleLogout = async () => {
    try {
      await secureAdminLogout();
      // Also clear direct DB auth tokens
      sessionStorage.removeItem('adminToken');
      sessionStorage.removeItem('adminTokenExpiry');
      navigate('/admin/login');
    } catch (error) {
      console.error('Error during logout:', error);
      // Clear session storage anyway
      sessionStorage.clear();
      navigate('/admin/login');
    }
  };

  const toggleSubmenu = (title: string) => {
    setExpandedMenus(prev => ({
      ...prev,
      [title]: !prev[title]
    }));
  };

  const navItems: NavItem[] = [
    {
      title: 'Dashboard',
      path: '/admin',
      icon: <LayoutDashboard size={20} />
    },
    {
      title: 'Products',
      path: '/admin/products',
      icon: <ShoppingBag size={20} />,
      submenu: [
        { title: 'All Products', path: '/admin/products' },
        { title: 'Add Product', path: '/admin/products/add' },
        { title: 'Categories', path: '/admin/categories' }
      ]
    },
    {
      title: 'Orders',
      path: '/admin/orders',
      icon: <ClipboardList size={20} />
    },
    {
      title: 'Customers',
      path: '/admin/customers',
      icon: <Users size={20} />
    },
    {
      title: 'Reports',
      path: '/admin/reports',
      icon: <BarChart3 size={20} />
    },
    {
      title: 'Delivery',
      path: '/admin/delivery',
      icon: <Truck size={20} />
    },
    {
      title: 'Offers',
      path: '/admin/offers',
      icon: <Tag size={20} />
    },
    {
      title: 'Admins',
      path: '/admin/admins',
      icon: <Users size={20} />
    },
    {
      title: 'Settings',
      path: '/admin/settings',
      icon: <Settings size={20} />
    }
  ];

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  return (
    <aside 
      className={`bg-white fixed inset-y-0 left-0 z-50 transform transition-all duration-300 ease-in-out shadow-lg
        ${isOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0 md:w-20'}`}
    >
      {/* Logo */}
      <div className={`flex items-center justify-center h-16 border-b ${isOpen ? 'px-6' : 'px-2'}`}>
        {isOpen ? (
          <Link to="/admin" className="flex items-center">
            <img src="/Logo.png" alt="Near & Now" className="h-10 w-10" />
            <span className="ml-3 text-xl font-bold text-primary">Admin Panel</span>
          </Link>
        ) : (
          <Link to="/admin">
            <img src="/Logo.png" alt="Near & Now" className="h-10 w-10" />
          </Link>
        )}
      </div>

      {/* Navigation */}
      <nav className="mt-6 px-4">
        <ul className="space-y-2">
          {navItems.map((item) => (
            <li key={item.title}>
              {item.submenu ? (
                <div className="mb-2">
                  <button
                    onClick={() => toggleSubmenu(item.title)}
                    className={`flex items-center w-full p-3 rounded-lg transition-colors
                      ${isActive(item.path) ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100'}
                      ${!isOpen && 'justify-center'}`}
                  >
                    <span className="flex items-center">
                      {item.icon}
                      {isOpen && <span className="ml-3">{item.title}</span>}
                    </span>
                    {isOpen && (
                      <span className="ml-auto">
                        {expandedMenus[item.title] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </span>
                    )}
                  </button>
                  
                  {/* Submenu */}
                  {isOpen && expandedMenus[item.title] && (
                    <ul className="pl-10 mt-1 space-y-1">
                      {item.submenu.map((subItem) => (
                        <li key={subItem.title}>
                          <Link
                            to={subItem.path}
                            className={`block p-2 rounded-md text-sm transition-colors
                              ${isActive(subItem.path) ? 'bg-primary/10 text-primary font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
                          >
                            {subItem.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <Link
                  to={item.path}
                  className={`flex items-center p-3 rounded-lg transition-colors
                    ${isActive(item.path) ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100'}
                    ${!isOpen && 'justify-center'}`}
                >
                  {item.icon}
                  {isOpen && <span className="ml-3">{item.title}</span>}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>

      {/* Logout Button */}
      <div className="absolute bottom-0 w-full p-4 border-t">
        <button 
          onClick={handleLogout}
          className={`flex items-center p-3 rounded-lg text-red-600 hover:bg-red-50 transition-colors w-full
            ${!isOpen && 'justify-center'}`}
        >
          <LogOut size={20} />
          {isOpen && <span className="ml-3">Logout</span>}
        </button>
      </div>
    </aside>
  );
};

export default AdminSidebar;
