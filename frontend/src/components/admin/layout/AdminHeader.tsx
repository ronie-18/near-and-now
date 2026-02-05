import { useState, useRef, useEffect } from 'react';
import { Bell, Search, Menu, User, Settings, HelpCircle, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';

interface AdminHeaderProps {
  toggleSidebar: () => void;
}

const AdminHeader = ({ toggleSidebar }: AdminHeaderProps) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close menus
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
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <header className="bg-white shadow-sm z-10">
      <div className="flex items-center justify-between px-6 py-3">
        {/* Left side */}
        <div className="flex items-center">
          <button 
            onClick={toggleSidebar} 
            className="p-2 rounded-md text-gray-600 hover:bg-gray-100 focus:outline-none"
          >
            <Menu size={20} />
          </button>
          
          <div className="ml-4 hidden md:block">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                <Search size={18} className="text-gray-400" />
              </span>
              <input
                type="text"
                placeholder="Search..."
                className="pl-10 pr-4 py-2 w-64 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </div>
        </div>
        
        {/* Right side */}
        <div className="flex items-center space-x-4">
          {/* Notifications */}
          <div className="relative" ref={notificationRef}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="p-2 rounded-full text-gray-600 hover:bg-gray-100 focus:outline-none relative"
            >
              <Bell size={20} />
              <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-red-500"></span>
            </button>
            
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg py-2 z-50 border border-gray-200">
                <div className="px-4 py-2 border-b border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-700">Notifications</h3>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  <div className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50">
                    <p className="text-sm font-medium text-gray-800">New order received</p>
                    <p className="text-xs text-gray-500 mt-1">Order #12345 has been placed</p>
                    <p className="text-xs text-gray-400 mt-1">10 minutes ago</p>
                  </div>
                  <div className="px-4 py-3 border-b border-gray-100 hover:bg-gray-50">
                    <p className="text-sm font-medium text-gray-800">Low stock alert</p>
                    <p className="text-xs text-gray-500 mt-1">Product "Organic Apples" is running low</p>
                    <p className="text-xs text-gray-400 mt-1">1 hour ago</p>
                  </div>
                  <div className="px-4 py-3 hover:bg-gray-50">
                    <p className="text-sm font-medium text-gray-800">New user registered</p>
                    <p className="text-xs text-gray-500 mt-1">John Doe has created an account</p>
                    <p className="text-xs text-gray-400 mt-1">3 hours ago</p>
                  </div>
                </div>
                <div className="px-4 py-2 border-t border-gray-200 text-center">
                  <Link to="/admin/notifications" className="text-xs text-primary font-medium hover:underline">
                    View all notifications
                  </Link>
                </div>
              </div>
            )}
          </div>
          
          {/* User Menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center space-x-2 focus:outline-none"
            >
              <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center">
                <User size={18} />
              </div>
              <span className="hidden md:block text-sm font-medium text-gray-700">Admin User</span>
            </button>
            
            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-2 z-50 border border-gray-200">
                <div className="px-4 py-2 border-b border-gray-200">
                  <p className="text-sm font-medium text-gray-800">Admin User</p>
                  <p className="text-xs text-gray-500">admin@nearnow.com</p>
                </div>
                <Link to="/admin/profile" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                  <div className="flex items-center">
                    <User size={16} className="mr-2" />
                    Profile
                  </div>
                </Link>
                <Link to="/admin/settings" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                  <div className="flex items-center">
                    <Settings size={16} className="mr-2" />
                    Settings
                  </div>
                </Link>
                <Link to="/admin/help" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                  <div className="flex items-center">
                    <HelpCircle size={16} className="mr-2" />
                    Help
                  </div>
                </Link>
                <div className="border-t border-gray-200 mt-1 pt-1">
                  <button className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                    <div className="flex items-center">
                      <LogOut size={16} className="mr-2" />
                      Logout
                    </div>
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
