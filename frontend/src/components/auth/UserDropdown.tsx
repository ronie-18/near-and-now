import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface UserDropdownProps {
  isOpen: boolean;
  onClose: () => void;
}

const UserDropdown = ({ isOpen, onClose }: UserDropdownProps) => {
  const { user, logoutUser } = useAuth();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Handle logout
  const handleLogout = async () => {
    try {
      await logoutUser();
      onClose();
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      ref={dropdownRef}
      className="absolute right-0 mt-2 w-56 bg-white rounded-md shadow-lg py-1 z-10"
    >
      {/* User Info */}
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-sm font-medium text-gray-800">
          {user?.name || 'Welcome'}
        </p>
        <p className="text-xs text-gray-500 truncate">
          {user?.phone || user?.email || ''}
        </p>
      </div>
      
      {/* Menu Items */}
      <div className="py-1">
        <Link
          to="/profile"
          onClick={onClose}
          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          <div className="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            My Profile
          </div>
        </Link>
        
        <Link
          to="/orders"
          onClick={onClose}
          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          <div className="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
            My Orders
          </div>
        </Link>
        
        <Link
          to="/addresses"
          onClick={onClose}
          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          <div className="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            My Addresses
          </div>
        </Link>
        
        <Link
          to="/wishlist"
          onClick={onClose}
          className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          <div className="flex items-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            My Wishlist
          </div>
        </Link>
      </div>
      
      {/* Logout */}
      <div className="py-1 border-t border-gray-100">
        <button
          onClick={handleLogout}
          className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
        >
          <div className="flex items-center text-red-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </div>
        </button>
      </div>
    </div>
  );
};

export default UserDropdown;
