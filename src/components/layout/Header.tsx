import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import CartSidebar from '../cart/CartSidebar';
import LocationPicker from '../location/LocationPicker';
import {
  Search, ShoppingCart, User, MapPin, ChevronDown, Menu, X,
  LogOut, Package, UserCircle, LogIn, UserPlus, Clock
} from 'lucide-react';

interface Location {
  address: string;
  city: string;
  pincode: string;
  lat: number;
  lng: number;
}

const Header = () => {
  const { user, isAuthenticated, logoutUser } = useAuth();
  const { cartCount } = useCart();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);

  const userMenuRef = useRef<HTMLDivElement>(null);
  const mobileUserMenuRef = useRef<HTMLDivElement>(null);

  // Load saved location from localStorage
  useEffect(() => {
    const savedLocation = localStorage.getItem('currentLocation');
    if (savedLocation) {
      try {
        setCurrentLocation(JSON.parse(savedLocation));
      } catch (e) {
        console.error('Error loading saved location:', e);
      }
    }
  }, []);

  // Handle scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Handle click outside to close user menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const isOutsideDesktopMenu = userMenuRef.current && !userMenuRef.current.contains(event.target as Node);
      const isOutsideMobileMenu = mobileUserMenuRef.current && !mobileUserMenuRef.current.contains(event.target as Node);

      if (isOutsideDesktopMenu && isOutsideMobileMenu) {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/search?q=${encodeURIComponent(searchQuery)}`;
      setSearchQuery('');
    }
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const toggleUserMenu = () => {
    setIsUserMenuOpen(!isUserMenuOpen);
  };

  const toggleCartSidebar = () => {
    setIsCartOpen(!isCartOpen);
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
      setIsUserMenuOpen(false);
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const handleLocationSelect = (location: Location) => {
    setCurrentLocation(location);
    localStorage.setItem('currentLocation', JSON.stringify(location));
  };

  const toggleLocationPicker = () => {
    setIsLocationPickerOpen(!isLocationPickerOpen);
  };

  // Format address to show first 2 lines
  const formatAddressLines = (address: string): { line1: string; line2: string } => {
    const parts = address.split(',').map(part => part.trim());
    if (parts.length <= 2) {
      return { line1: parts[0] || '', line2: parts[1] || '' };
    }
    // First line: first part, Second line: next 1-2 parts
    const line1 = parts[0];
    const line2 = parts.slice(1, 3).join(', ');
    return { line1, line2 };
  };

  const popularSearches = ['Rice', 'Milk', 'Vegetables', 'Atta', 'Oil'];

  return (
    <>
      <header className={`bg-white sticky top-0 z-50 transition-all duration-300 ${
        scrolled ? 'shadow-lg' : 'shadow-md'
      }`}>

        {/* Main Header */}
        <div className="border-b border-gray-100">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              {/* Logo */}
              <Link to="/" className="flex items-center flex-shrink-0 group">
                <div className="relative">
                  <img
                    src="/Logo.png"
                    alt="Near & Now"
                    className="h-12 w-12 object-contain transform group-hover:scale-110 transition-transform duration-300"
                  />
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                </div>
                <div className="ml-3">
                  <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent leading-none">
                    Near & Now
                  </h1>
                  <p className="text-xs text-gray-500 mt-0.5 font-medium">Digital Dukan, Local Dil Se</p>
                </div>
              </Link>

              {/* Location Selector - Desktop */}
              <div className="hidden lg:block">
                <button 
                  onClick={toggleLocationPicker}
                  className="flex items-center gap-3 px-4 py-3 border-2 border-gray-200 rounded-xl hover:border-primary hover:shadow-lg transition-all duration-300 group bg-gray-50 hover:bg-white min-w-[280px] max-w-[320px]"
                >
                  <div className="w-10 h-10 bg-gradient-to-br from-primary to-green-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-md">
                    <MapPin className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Deliver to</p>
                    {currentLocation ? (
                      <>
                        <p className="text-sm font-bold text-gray-800 truncate leading-tight">
                          {formatAddressLines(currentLocation.address).line1}
                        </p>
                        <p className="text-xs text-gray-600 truncate leading-tight mt-0.5">
                          {formatAddressLines(currentLocation.address).line2}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm font-bold text-gray-800 flex items-center gap-1">
                        Select Location
                      </p>
                    )}
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-primary transition-colors flex-shrink-0" />
                </button>
              </div>

              {/* Search Bar - Desktop */}
              <div className="hidden md:block flex-1 max-w-2xl">
                <form onSubmit={handleSearch} className="relative">
                  <div className={`relative transition-all duration-300 ${
                    isSearchFocused ? 'transform scale-105' : ''
                  }`}>
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search for products, brands and more..."
                      className="w-full pl-12 pr-4 py-3.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:shadow-lg transition-all duration-300 text-sm bg-gray-50 focus:bg-white"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => setIsSearchFocused(true)}
                      onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Search Suggestions Dropdown */}
                  {isSearchFocused && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 p-4 z-50">
                      <div className="mb-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Popular Searches
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {popularSearches.map((term) => (
                            <button
                              key={term}
                              type="button"
                              onClick={() => setSearchQuery(term)}
                              className="px-3 py-1.5 bg-gray-100 hover:bg-primary hover:text-white text-sm rounded-lg transition-colors duration-200"
                            >
                              {term}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </form>
              </div>

              {/* Right Side Actions */}
              <div className="flex items-center gap-2 lg:gap-4 flex-shrink-0">

                {/* User Menu - Desktop */}
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={toggleUserMenu}
                    className="hidden md:flex flex-col items-center text-gray-600 hover:text-primary transition-all duration-300 group px-2"
                  >
                    <div className="relative">
                      {isAuthenticated ? (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold shadow-lg group-hover:shadow-xl transition-shadow">
                          {user?.name?.charAt(0).toUpperCase() || 'U'}
                        </div>
                      ) : (
                        <UserCircle className="w-6 h-6 group-hover:scale-110 transition-transform" />
                      )}
                    </div>
                    <span className="text-xs mt-1 font-medium">
                      {isAuthenticated ? user?.name?.split(' ')[0] || 'Account' : 'Login'}
                    </span>
                  </button>

                  {/* User Dropdown */}
                  {isUserMenuOpen && (
                    <div className="absolute right-0 mt-3 w-64 bg-white rounded-2xl shadow-2xl py-2 z-50 border border-gray-100 animate-fadeIn">
                      {isAuthenticated ? (
                        <>
                          <div className="px-4 py-4 border-b border-gray-100 bg-gradient-to-r from-primary/5 to-secondary/5">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold text-lg shadow-lg">
                                {user?.name?.charAt(0).toUpperCase() || 'U'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-gray-800 truncate">{user?.name || 'User'}</p>
                                <p className="text-xs text-gray-500 truncate">{user?.phone || user?.email}</p>
                              </div>
                            </div>
                          </div>
                          <div className="py-1">
                            <Link
                              to="/profile"
                              className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-primary/5 hover:text-primary transition-all group"
                              onClick={() => setIsUserMenuOpen(false)}
                            >
                              <div className="w-8 h-8 rounded-lg bg-gray-100 group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                                <User className="w-4 h-4" />
                              </div>
                              <span className="font-medium">My Profile</span>
                            </Link>
                            <Link
                              to="/orders"
                              className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-primary/5 hover:text-primary transition-all group"
                              onClick={() => setIsUserMenuOpen(false)}
                            >
                              <div className="w-8 h-8 rounded-lg bg-gray-100 group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                                <Package className="w-4 h-4" />
                              </div>
                              <span className="font-medium">My Orders</span>
                            </Link>
                          </div>
                          <div className="border-t border-gray-100 mt-1 pt-1">
                            <button
                              onClick={handleLogout}
                              className="flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-all w-full group"
                            >
                              <div className="w-8 h-8 rounded-lg bg-red-50 group-hover:bg-red-100 flex items-center justify-center transition-colors">
                                <LogOut className="w-4 h-4" />
                              </div>
                              <span className="font-medium">Logout</span>
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="px-4 py-3 bg-gradient-to-r from-primary/5 to-secondary/5 border-b border-gray-100">
                            <p className="text-sm font-semibold text-gray-800">Welcome to Near & Now</p>
                            <p className="text-xs text-gray-500 mt-0.5">Login to get best offers</p>
                          </div>
                          <div className="py-1">
                            <Link
                              to="/login"
                              className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-primary/5 hover:text-primary transition-all group"
                              onClick={() => setIsUserMenuOpen(false)}
                            >
                              <div className="w-8 h-8 rounded-lg bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center transition-colors">
                                <LogIn className="w-4 h-4 text-primary" />
                              </div>
                              <span className="font-medium">Login</span>
                            </Link>
                            <Link
                              to="/register"
                              className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-primary/5 hover:text-primary transition-all group"
                              onClick={() => setIsUserMenuOpen(false)}
                            >
                              <div className="w-8 h-8 rounded-lg bg-secondary/10 group-hover:bg-secondary/20 flex items-center justify-center transition-colors">
                                <UserPlus className="w-4 h-4 text-secondary" />
                              </div>
                              <span className="font-medium">Create Account</span>
                            </Link>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Cart Button */}
                <button
                  onClick={toggleCartSidebar}
                  className="hidden md:flex flex-col items-center text-gray-600 hover:text-primary transition-all duration-300 relative group px-2"
                >
                  <div className="relative">
                    <ShoppingCart className="w-6 h-6 group-hover:scale-110 transition-transform" />
                    {cartCount > 0 && (
                      <span className="absolute -top-2 -right-2 bg-gradient-to-r from-red-500 to-red-600 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center shadow-lg animate-pulse">
                        {cartCount}
                      </span>
                    )}
                  </div>
                  <span className="text-xs mt-1 font-medium">Cart</span>
                </button>

                {/* Mobile Icons */}
                <div className="flex md:hidden items-center gap-3">
                  {isAuthenticated ? (
                    <div ref={mobileUserMenuRef} className="relative">
                      <button
                        onClick={toggleUserMenu}
                        className="relative"
                      >
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold shadow-lg">
                          {user?.name?.charAt(0).toUpperCase() || 'U'}
                        </div>
                      </button>
                      {isUserMenuOpen && (
                        <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl py-2 z-50 border border-gray-100">
                          <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-primary/5 to-secondary/5">
                            <p className="font-bold text-gray-800 truncate">{user?.name || 'User'}</p>
                            <p className="text-xs text-gray-500 truncate mt-0.5">{user?.phone || user?.email}</p>
                          </div>
                          <Link to="/profile" className="block px-4 py-3 text-sm text-gray-700 hover:bg-primary/5 font-medium" onClick={() => setIsUserMenuOpen(false)}>
                            My Profile
                          </Link>
                          <Link to="/orders" className="block px-4 py-3 text-sm text-gray-700 hover:bg-primary/5 font-medium" onClick={() => setIsUserMenuOpen(false)}>
                            My Orders
                          </Link>
                          <button
                            onClick={handleLogout}
                            className="block w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 font-medium border-t border-gray-100"
                          >
                            Logout
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <Link to="/login" className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center hover:bg-primary hover:text-white transition-all">
                      <User className="w-5 h-5" />
                    </Link>
                  )}

                  <button onClick={toggleCartSidebar} className="relative">
                    <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center hover:bg-primary hover:text-white transition-all">
                      <ShoppingCart className="w-5 h-5" />
                    </div>
                    {cartCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-gradient-to-r from-red-500 to-red-600 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center shadow-lg">
                        {cartCount}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={toggleMobileMenu}
                    className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center hover:bg-primary hover:text-white transition-all"
                  >
                    {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Mobile Search */}
            <div className="mt-3 md:hidden">
              <form onSubmit={handleSearch} className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search products..."
                  className="w-full pl-11 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:shadow-lg transition-all text-sm bg-gray-50 focus:bg-white"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </form>
            </div>
          </div>
        </div>

      </header>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-40" onClick={toggleMobileMenu}>
          <div
            className="absolute right-0 top-0 h-full w-80 bg-white shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-800">Menu</h2>
                <button onClick={toggleMobileMenu} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2">
                <Link to="/category/staples" className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors" onClick={toggleMobileMenu}>
                  <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                    🌾
                  </div>
                  <span className="font-medium text-gray-800">Staples</span>
                </Link>
                <Link to="/category/vegetables" className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors" onClick={toggleMobileMenu}>
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                    🥬
                  </div>
                  <span className="font-medium text-gray-800">Vegetables</span>
                </Link>
                <Link to="/category/fruits" className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors" onClick={toggleMobileMenu}>
                  <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                    🍎
                  </div>
                  <span className="font-medium text-gray-800">Fruits</span>
                </Link>
                <Link to="/category/dairy" className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors" onClick={toggleMobileMenu}>
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    🥛
                  </div>
                  <span className="font-medium text-gray-800">Dairy</span>
                </Link>
                <Link to="/offers" className="flex items-center gap-3 p-3 rounded-xl bg-red-50 hover:bg-red-100 transition-colors" onClick={toggleMobileMenu}>
                  <div className="w-10 h-10 rounded-lg bg-red-200 flex items-center justify-center">
                    🏷️
                  </div>
                  <span className="font-bold text-red-600">Special Offers</span>
                </Link>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-200">
                <button 
                  onClick={toggleLocationPicker}
                  className="flex items-start gap-3 w-full p-4 rounded-xl hover:bg-primary/5 transition-all border-2 border-transparent hover:border-primary/20"
                >
                  <div className="w-10 h-10 bg-gradient-to-br from-primary to-green-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-md mt-0.5">
                    <MapPin className="w-5 h-5 text-white" />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1.5">Deliver to</p>
                    {currentLocation ? (
                      <>
                        <p className="text-sm font-bold text-gray-800 line-clamp-1 leading-tight">
                          {formatAddressLines(currentLocation.address).line1}
                        </p>
                        <p className="text-xs text-gray-600 line-clamp-1 leading-tight mt-1">
                          {formatAddressLines(currentLocation.address).line2}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm font-bold text-gray-800">
                        Select Location
                      </p>
                    )}
                  </div>
                  <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0 mt-1" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cart Sidebar */}
      <CartSidebar isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />

      {/* Location Picker Modal */}
      <LocationPicker
        isOpen={isLocationPickerOpen}
        onClose={() => setIsLocationPickerOpen(false)}
        onLocationSelect={handleLocationSelect}
        currentLocation={currentLocation || undefined}
      />
    </>
  );
};

export default Header;