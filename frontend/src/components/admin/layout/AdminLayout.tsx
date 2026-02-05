import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingBag,
  Users,
  ClipboardList,
  Settings,
  Tag,
  Truck,
  LogOut,
  Menu,
  User,
  Bell,
  Search,
  ChevronDown,
  Layers,
  BarChart3,
  Shield
} from 'lucide-react';

interface AdminLayoutProps {
  children: ReactNode;
}

const AdminLayout = ({ children }: AdminLayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const location = useLocation();

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const toggleUserMenu = () => {
    setUserMenuOpen(!userMenuOpen);
  };

  const toggleNotifications = () => {
    setNotificationsOpen(!notificationsOpen);
  };

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className={`bg-white fixed inset-y-0 left-0 z-50 transform transition-all duration-300 ease-in-out shadow-lg
        ${sidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0 md:w-20'}`}>
        {/* Logo */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-center">
          {sidebarOpen ? (
            <div className="flex items-center">
              <img src="/Logo.png" alt="Near & Now" className="h-10 w-10" />
              <h1 className="ml-3 text-xl font-bold text-primary">Admin Panel</h1>
            </div>
          ) : (
            <img src="/Logo.png" alt="Near & Now" className="h-10 w-10" />
          )}
        </div>

        {/* Navigation */}
        <nav className="mt-6 px-4">
          <ul className="space-y-2">
            <li>
              <Link
                to="/admin"
                className={`flex items-center p-3 rounded-lg transition-colors ${isActive('/admin') && !isActive('/admin/products') && !isActive('/admin/orders') && !isActive('/admin/customers') ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                <LayoutDashboard className="h-5 w-5 mr-3" />
                {sidebarOpen && <span>Dashboard</span>}
              </Link>
            </li>
            <li>
              <Link
                to="/admin/products"
                className={`flex items-center p-3 rounded-lg transition-colors ${isActive('/admin/products') ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                <ShoppingBag className="h-5 w-5 mr-3" />
                {sidebarOpen && <span>Products</span>}
              </Link>
            </li>
            <li>
              <Link
                to="/admin/categories"
                className={`flex items-center p-3 rounded-lg transition-colors ${isActive('/admin/categories') ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                <Layers className="h-5 w-5 mr-3" />
                {sidebarOpen && <span>Categories</span>}
              </Link>
            </li>
            <li>
              <Link
                to="/admin/orders"
                className={`flex items-center p-3 rounded-lg transition-colors ${isActive('/admin/orders') ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                <ClipboardList className="h-5 w-5 mr-3" />
                {sidebarOpen && <span>Orders</span>}
              </Link>
            </li>
            <li>
              <Link
                to="/admin/customers"
                className={`flex items-center p-3 rounded-lg transition-colors ${isActive('/admin/customers') ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                <Users className="h-5 w-5 mr-3" />
                {sidebarOpen && <span>Customers</span>}
              </Link>
            </li>
            <li>
              <Link
                to="/admin/delivery"
                className={`flex items-center p-3 rounded-lg transition-colors ${isActive('/admin/delivery') ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                <Truck className="h-5 w-5 mr-3" />
                {sidebarOpen && <span>Delivery</span>}
              </Link>
            </li>
            <li>
              <Link
                to="/admin/offers"
                className={`flex items-center p-3 rounded-lg transition-colors ${isActive('/admin/offers') ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                <Tag className="h-5 w-5 mr-3" />
                {sidebarOpen && <span>Offers</span>}
              </Link>
            </li>
            <li>
              <Link
                to="/admin/reports"
                className={`flex items-center p-3 rounded-lg transition-colors ${isActive('/admin/reports') ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                <BarChart3 className="h-5 w-5 mr-3" />
                {sidebarOpen && <span>Reports</span>}
              </Link>
            </li>
            <li>
              <Link
                to="/admin/admins"
                className={`flex items-center p-3 rounded-lg transition-colors ${isActive('/admin/admins') ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                <Shield className="h-5 w-5 mr-3" />
                {sidebarOpen && <span>Admin Management</span>}
              </Link>
            </li>
            <li>
              <Link
                to="/admin/settings"
                className={`flex items-center p-3 rounded-lg transition-colors ${isActive('/admin/settings') ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100'}`}
              >
                <Settings className="h-5 w-5 mr-3" />
                {sidebarOpen && <span>Settings</span>}
              </Link>
            </li>
          </ul>

          {/* Logout Button */}
          <div className="mt-10 pt-6 border-t border-gray-200">
            <Link
              to="/admin/login"
              className="flex items-center p-3 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="h-5 w-5 mr-3" />
              {sidebarOpen && <span>Logout</span>}
            </Link>
          </div>
        </nav>
      </div>

      {/* Main Content */}
      <div className={`flex-1 flex flex-col transition-all duration-300 ${sidebarOpen ? 'md:ml-64' : 'md:ml-20'}`}>
        {/* Admin Header */}
        <header className="bg-white shadow-sm z-10">
          <div className="flex items-center justify-between px-6 py-3">
            {/* Left side - Menu toggle & Search */}
            <div className="flex items-center">
              <button
                onClick={toggleSidebar}
                className="p-2 rounded-md text-gray-600 hover:bg-gray-100 focus:outline-none"
              >
                <Menu className="h-6 w-6" />
              </button>

              <div className="ml-4 hidden md:block">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search..."
                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent w-64"
                  />
                </div>
              </div>
            </div>

            {/* Right side - Notifications & User */}
            <div className="flex items-center space-x-4">
              {/* Notifications */}
              <div className="relative">
                <button
                  onClick={toggleNotifications}
                  className="p-2 rounded-full text-gray-600 hover:bg-gray-100 focus:outline-none relative"
                >
                  <Bell className="h-6 w-6" />
                  <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-red-500"></span>
                </button>

                {notificationsOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg py-2 z-50 border border-gray-200">
                    <div className="px-4 py-2 border-b border-gray-200">
                      <h3 className="text-sm font-semibold text-gray-700">Notifications</h3>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      <div className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50">
                        <p className="text-sm font-medium text-gray-800">New order received</p>
                        <p className="text-xs text-gray-500 mt-1">Order #12345 has been placed</p>
                      </div>
                      <div className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50">
                        <p className="text-sm font-medium text-gray-800">Low stock alert</p>
                        <p className="text-xs text-gray-500 mt-1">Product "Organic Apples" is running low</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* User Menu */}
              <div className="relative">
                <button
                  onClick={toggleUserMenu}
                  className="flex items-center space-x-2 focus:outline-none"
                >
                  <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center">
                    <User className="h-5 w-5" />
                  </div>
                  <span className="hidden md:block text-sm font-medium text-gray-700">Admin User</span>
                  <ChevronDown className="hidden md:block h-4 w-4 text-gray-500" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-2 z-50 border border-gray-200">
                    <Link to="/admin/profile" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                      Profile
                    </Link>
                    <Link to="/admin/settings" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                      Settings
                    </Link>
                    <Link to="/admin/help" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                      Help
                    </Link>
                    <div className="border-t border-gray-200 mt-1 pt-1">
                      <Link to="/admin/login" className="block px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                        Logout
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
