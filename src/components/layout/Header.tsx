import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import CartSidebar from '../cart/CartSidebar';
import LocationPicker from '../location/LocationPicker';
import {
  Search, ShoppingCart, User, MapPin, ChevronDown, Menu, X,
  LogOut, Package, UserCircle, LogIn, UserPlus, Clock, Sparkles
} from 'lucide-react';
import { searchProducts, Product } from '../../services/supabase';

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
  const [searchSuggestions, setSearchSuggestions] = useState<Product[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

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

  // Handle click outside to close search suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // ENHANCED LIVE SEARCH SUGGESTIONS LOGIC
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }

    setSuggestionsLoading(true);

    // Clear previous timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Set new timeout for debounced search
    debounceRef.current = setTimeout(async () => {
      try {
        const products = await searchProducts(searchQuery);
        setSearchSuggestions(products.slice(0, 8)); // show max 8 suggestions
      } catch (err) {
        console.error('Search error:', err);
        setSearchSuggestions([]);
      } finally {
        setSuggestionsLoading(false);
      }
    }, 300); // 300ms debounce

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/search?q=${encodeURIComponent(searchQuery)}`;
      setSearchQuery('');
      setIsSearchFocused(false);
    }
  };

  const handleSuggestionClick = (productId: string) => {
    window.location.href = `/product/${productId}`;
    setIsSearchFocused(false);
    setSearchQuery('');
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
    if (!address) return { line1: '', line2: '' };

    let cleanAddress = address;
    cleanAddress = cleanAddress.split('\\n').join(' ');
    cleanAddress = cleanAddress.split('\\r').join(' ');
    cleanAddress = cleanAddress.replace(/\n/g, ' ');
    cleanAddress = cleanAddress.replace(/\r/g, ' ');
    cleanAddress = cleanAddress.replace(/\t/g, ' ');
    cleanAddress = cleanAddress.replace(/\s+/g, ' ').trim();

    const parts = cleanAddress.split(',').map(part => part.trim());

    if (parts.length <= 2) {
      return { line1: parts[0] || '', line2: parts[1] || '' };
    }

    const line1 = parts[0].length > 40 ? parts[0].substring(0, 37) + '...' : parts[0];
    const line2Full = parts.slice(1, 3).join(', ');
    const line2 = line2Full.length > 50 ? line2Full.substring(0, 47) + '...' : line2Full;

    return { line1, line2 };
  };

  const popularSearches = ['Rice', 'Milk', 'Vegetables', 'Atta', 'Oil'];

  return (
    <>
      <header className={`bg-white sticky top-0 z-50 transition-all duration-300 ${
        scrolled ? 'shadow-xl border-b border-gray-100' : 'shadow-md'
      }`}>

        {/* Main Header */}
        <div className="border-b border-gray-100/50">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between gap-4">
              {/* Logo - Enhanced */}
              <Link to="/" className="flex items-center flex-shrink-0 group">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all duration-300"></div>
                  <img
                    src="/Logo.png"
                    alt="Near & Now"
                    className="h-14 w-14 object-contain transform group-hover:scale-110 transition-transform duration-300 relative z-10"
                  />
                </div>
                <div className="ml-3">
                  <h1 className="text-2xl font-black bg-gradient-to-r from-primary via-green-600 to-secondary bg-clip-text text-transparent leading-none tracking-tight">
                    Near & Now
                  </h1>
                  <p className="text-xs text-gray-600 mt-1 font-semibold tracking-wide">Digital Dukan, Local Dil Se</p>
                </div>
              </Link>

              {/* Location Selector - Enhanced Desktop */}
              <div className="hidden lg:block">
                <button
                  onClick={toggleLocationPicker}
                  className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-2xl hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 group bg-gradient-to-br from-gray-50 to-white hover:from-primary/5 hover:to-secondary/5 min-w-[280px] max-w-[320px] relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/5 to-primary/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700"></div>
                  <div className="w-11 h-11 bg-gradient-to-br from-primary via-green-600 to-secondary rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg group-hover:shadow-xl group-hover:scale-110 transition-all duration-300 relative z-10">
                    <MapPin className="w-5 h-5 text-white drop-shadow-lg" />
                  </div>
                  <div className="text-left flex-1 min-w-0 relative z-10">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                      <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse"></span>
                      Deliver to
                    </p>
                    {currentLocation ? (
                      <>
                        <p className="text-sm font-bold text-gray-900 truncate leading-tight whitespace-nowrap">
                          {formatAddressLines(currentLocation.address).line1}
                        </p>
                        <p className="text-xs text-gray-600 truncate leading-tight mt-0.5 whitespace-nowrap">
                          {formatAddressLines(currentLocation.address).line2}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm font-bold text-gray-900 flex items-center gap-1">
                        Select Location
                        <Sparkles className="w-3 h-3 text-primary animate-pulse" />
                      </p>
                    )}
                  </div>
                  <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-primary group-hover:translate-y-0.5 transition-all flex-shrink-0 relative z-10" />
                </button>
              </div>

              {/* Search Bar - Enhanced Desktop */}
              <div className="hidden md:block flex-1 max-w-2xl" ref={searchRef}>
                <form onSubmit={handleSearch} className="relative">
                  <div className={`relative transition-all duration-300 ${
                    isSearchFocused ? 'transform scale-[1.02]' : ''
                  }`}>
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    <div className="relative bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-2xl focus-within:border-primary/50 focus-within:shadow-xl focus-within:shadow-primary/10 transition-all duration-300 overflow-hidden">
                      <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-primary transition-colors z-10" />
                      <input
                        type="text"
                        placeholder="Search for products, brands and more..."
                        className="w-full pl-12 pr-12 py-3.5 bg-transparent focus:outline-none text-sm text-gray-900 placeholder-gray-400 relative z-10"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onFocus={() => setIsSearchFocused(true)}
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery('');
                            setSearchSuggestions([]);
                          }}
                          className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg p-1 transition-all z-10"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Search Suggestions Dropdown - Enhanced */}
                  {isSearchFocused && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 p-5 z-50 backdrop-blur-xl">
                      {suggestionsLoading ? (
                        <div className="py-6 text-center">
                          <div className="inline-flex items-center gap-2 text-gray-500 text-sm">
                            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                            Searching...
                          </div>
                        </div>
                      ) : searchSuggestions.length > 0 ? (
                        <div>
                          <p className="text-xs font-bold text-gray-500 uppercase mb-3 tracking-wide">
                            Product Suggestions
                          </p>
                          <ul className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                            {searchSuggestions.map((product) => (
                              <li
                                key={product.id}
                                className="flex items-center gap-4 py-3 px-2 cursor-pointer hover:bg-gradient-to-r hover:from-primary/5 hover:to-transparent rounded-xl transition-all group"
                                onClick={() => handleSuggestionClick(product.id)}
                              >
                                <img
                                  src={product.image || 'https://via.placeholder.com/48?text=No+Image'}
                                  alt={product.name}
                                  className="w-12 h-12 object-cover rounded-lg border border-gray-200 group-hover:border-primary/30 transition-all flex-shrink-0"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="font-semibold text-sm text-gray-900 truncate group-hover:text-primary transition-colors">
                                    {product.name}
                                  </div>
                                  <div className="text-xs text-gray-500 mt-0.5">
                                    {product.category || 'Product'}
                                  </div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <div className="text-base font-bold text-primary">₹{Math.round(product.price)}</div>
                                  {product.unit && (
                                    <div className="text-xs text-gray-400">{product.unit}</div>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : searchQuery.trim() ? (
                        <div className="py-6">
                          <div className="text-center mb-4">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                              <Search className="w-8 h-8 text-gray-400" />
                            </div>
                            <p className="text-gray-600 font-medium">No exact matches found for "{searchQuery}"</p>
                            <p className="text-xs text-gray-400 mt-1">Try these alternative searches:</p>
                          </div>
                          <div className="space-y-2">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Suggested Searches:</p>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => setSearchQuery(searchQuery.split(' ')[0])}
                                className="px-3 py-2 bg-gradient-to-br from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200 text-sm font-medium rounded-xl transition-all border border-blue-200 hover:shadow-md"
                              >
                                Search "{searchQuery.split(' ')[0]}"
                              </button>
                              {popularSearches.slice(0, 4).map((term) => (
                                <button
                                  key={term}
                                  type="button"
                                  onClick={() => setSearchQuery(term)}
                                  className="px-3 py-2 bg-gradient-to-br from-gray-50 to-gray-100 hover:from-primary hover:to-secondary hover:text-white text-sm font-medium rounded-xl transition-all border border-gray-200 hover:border-transparent hover:shadow-md"
                                >
                                  {term}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                            <p className="text-xs text-amber-800 flex items-center gap-2">
                              <Sparkles className="w-4 h-4" />
                              <span><strong>Tip:</strong> Try searching by category like "Vegetables", "Fruits", "Dairy" or brand names</span>
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="text-xs font-bold text-gray-600 uppercase mb-3 flex items-center gap-2">
                            <div className="w-6 h-6 bg-gradient-to-br from-primary to-secondary rounded-lg flex items-center justify-center">
                              <Clock className="w-3.5 h-3.5 text-white" />
                            </div>
                            Popular Searches
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {popularSearches.map((term) => (
                              <button
                                key={term}
                                type="button"
                                onClick={() => setSearchQuery(term)}
                                className="px-4 py-2 bg-gradient-to-br from-gray-50 to-gray-100 hover:from-primary hover:to-secondary hover:text-white text-sm font-medium rounded-xl transition-all duration-200 border border-gray-200 hover:border-transparent hover:shadow-lg hover:scale-105"
                              >
                                {term}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </form>
              </div>

              {/* Right Side Actions - Enhanced */}
              <div className="flex items-center gap-2 lg:gap-4 flex-shrink-0">

                {/* User Menu - Enhanced Desktop */}
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={toggleUserMenu}
                    className="hidden md:flex flex-col items-center text-gray-600 hover:text-primary transition-all duration-300 group px-2 py-1 rounded-xl hover:bg-primary/5"
                  >
                    <div className="relative">
                      {isAuthenticated ? (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary via-green-600 to-secondary flex items-center justify-center text-white font-bold shadow-lg group-hover:shadow-xl group-hover:shadow-primary/30 group-hover:scale-110 transition-all duration-300 ring-2 ring-white">
                          {user?.name?.charAt(0).toUpperCase() || 'U'}
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center group-hover:from-primary/10 group-hover:to-secondary/10 transition-all duration-300">
                          <UserCircle className="w-6 h-6 group-hover:scale-110 transition-transform" />
                        </div>
                      )}
                    </div>
                    <span className="text-xs mt-1 font-semibold">
                      {isAuthenticated ? user?.name?.split(' ')[0] || 'Account' : 'Login'}
                    </span>
                  </button>

                  {/* User Dropdown - Enhanced */}
                  {isUserMenuOpen && (
                    <div className="absolute right-0 mt-3 w-72 bg-white rounded-3xl shadow-2xl py-2 z-50 border border-gray-100 animate-fadeIn overflow-hidden">
                      {isAuthenticated ? (
                        <>
                          <div className="px-5 py-5 border-b border-gray-100 bg-gradient-to-br from-primary/10 via-green-50 to-secondary/10 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/20 to-transparent rounded-full blur-3xl"></div>
                            <div className="flex items-center gap-3 relative z-10">
                              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary via-green-600 to-secondary flex items-center justify-center text-white font-bold text-xl shadow-xl ring-4 ring-white">
                                {user?.name?.charAt(0).toUpperCase() || 'U'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-gray-900 truncate text-base">{user?.name || 'User'}</p>
                                <p className="text-xs text-gray-600 truncate mt-0.5">{user?.phone || user?.email}</p>
                              </div>
                            </div>
                          </div>
                          <div className="py-2 px-2">
                            <Link
                              to="/profile"
                              className="flex items-center gap-3 px-4 py-3.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-primary/10 hover:to-transparent hover:text-primary transition-all group rounded-xl mx-1"
                              onClick={() => setIsUserMenuOpen(false)}
                            >
                              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 group-hover:from-primary/20 group-hover:to-primary/10 flex items-center justify-center transition-all group-hover:scale-110">
                                <User className="w-5 h-5 text-primary" />
                              </div>
                              <span className="font-semibold">My Profile</span>
                            </Link>
                            <Link
                              to="/orders"
                              className="flex items-center gap-3 px-4 py-3.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-secondary/10 hover:to-transparent hover:text-secondary transition-all group rounded-xl mx-1"
                              onClick={() => setIsUserMenuOpen(false)}
                            >
                              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-secondary/10 to-secondary/5 group-hover:from-secondary/20 group-hover:to-secondary/10 flex items-center justify-center transition-all group-hover:scale-110">
                                <Package className="w-5 h-5 text-secondary" />
                              </div>
                              <span className="font-semibold">My Orders</span>
                            </Link>
                          </div>
                          <div className="border-t border-gray-100 mt-1 pt-2 px-2">
                            <button
                              onClick={handleLogout}
                              className="flex items-center gap-3 px-4 py-3.5 text-sm text-red-600 hover:bg-red-50 transition-all w-full group rounded-xl mx-1"
                            >
                              <div className="w-10 h-10 rounded-xl bg-red-50 group-hover:bg-red-100 flex items-center justify-center transition-all group-hover:scale-110">
                                <LogOut className="w-5 h-5" />
                              </div>
                              <span className="font-semibold">Logout</span>
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="px-5 py-4 bg-gradient-to-br from-primary/10 via-green-50 to-secondary/10 border-b border-gray-100 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-primary/30 to-transparent rounded-full blur-2xl"></div>
                            <p className="text-base font-bold text-gray-900 relative z-10">Welcome to Near & Now</p>
                            <p className="text-xs text-gray-600 mt-1 relative z-10 flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-primary" />
                              Login to get best offers
                            </p>
                          </div>
                          <div className="py-2 px-2">
                            <Link
                              to="/login"
                              className="flex items-center gap-3 px-4 py-3.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-primary/10 hover:to-transparent hover:text-primary transition-all group rounded-xl mx-1"
                              onClick={() => setIsUserMenuOpen(false)}
                            >
                              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 group-hover:from-primary/20 group-hover:to-primary/10 flex items-center justify-center transition-all group-hover:scale-110">
                                <LogIn className="w-5 h-5 text-primary" />
                              </div>
                              <span className="font-semibold">Login</span>
                            </Link>
                            <Link
                              to="/register"
                              className="flex items-center gap-3 px-4 py-3.5 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-secondary/10 hover:to-transparent hover:text-secondary transition-all group rounded-xl mx-1"
                              onClick={() => setIsUserMenuOpen(false)}
                            >
                              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-secondary/10 to-secondary/5 group-hover:from-secondary/20 group-hover:to-secondary/10 flex items-center justify-center transition-all group-hover:scale-110">
                                <UserPlus className="w-5 h-5 text-secondary" />
                              </div>
                              <span className="font-semibold">Create Account</span>
                            </Link>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Cart Button - Enhanced */}
                <button
                  onClick={toggleCartSidebar}
                  className="hidden md:flex flex-col items-center text-gray-600 hover:text-primary transition-all duration-300 relative group px-2 py-1 rounded-xl hover:bg-primary/5"
                >
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center group-hover:from-primary/10 group-hover:to-secondary/10 transition-all duration-300">
                      <ShoppingCart className="w-6 h-6 group-hover:scale-110 transition-transform" />
                    </div>
                    {cartCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-gradient-to-r from-red-500 to-red-600 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center shadow-lg animate-pulse ring-2 ring-white">
                        {cartCount}
                      </span>
                    )}
                  </div>
                  <span className="text-xs mt-1 font-semibold">Cart</span>
                </button>

                {/* Mobile Icons - Enhanced */}
                <div className="flex md:hidden items-center gap-2">
                  {isAuthenticated ? (
                    <div ref={mobileUserMenuRef} className="relative">
                      <button
                        onClick={toggleUserMenu}
                        className="relative"
                      >
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary via-green-600 to-secondary flex items-center justify-center text-white font-bold shadow-lg ring-2 ring-white active:scale-95 transition-transform">
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
                    <Link to="/login" className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center hover:from-primary hover:to-secondary hover:text-white transition-all active:scale-95">
                      <User className="w-5 h-5" />
                    </Link>
                  )}

                  <button onClick={toggleCartSidebar} className="relative active:scale-95 transition-transform">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center hover:from-primary hover:to-secondary hover:text-white transition-all">
                      <ShoppingCart className="w-5 h-5" />
                    </div>
                    {cartCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-gradient-to-r from-red-500 to-red-600 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center shadow-lg ring-2 ring-white">
                        {cartCount}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={toggleMobileMenu}
                    className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center hover:from-primary hover:to-secondary hover:text-white transition-all active:scale-95"
                  >
                    {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Mobile Search - Enhanced */}
            <div className="mt-3 md:hidden">
              <form onSubmit={handleSearch} className="relative">
                <div className="relative bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-2xl focus-within:border-primary/50 focus-within:shadow-lg transition-all duration-300">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search products..."
                    className="w-full pl-11 pr-4 py-3 bg-transparent focus:outline-none text-sm"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setIsSearchFocused(true)}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setSearchSuggestions([]);
                      }}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Mobile Search Suggestions */}
                {isSearchFocused && searchQuery && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 z-50 max-h-[400px] overflow-y-auto">
                    {suggestionsLoading ? (
                      <div className="py-4 text-center">
                        <div className="inline-flex items-center gap-2 text-gray-500 text-sm">
                          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                          Searching...
                        </div>
                      </div>
                    ) : searchSuggestions.length > 0 ? (
                      <ul className="divide-y divide-gray-100">
                        {searchSuggestions.map((product) => (
                          <li
                            key={product.id}
                            className="flex items-center gap-3 py-2 cursor-pointer hover:bg-primary/5 rounded-lg transition"
                            onClick={() => handleSuggestionClick(product.id)}
                          >
                            <img
                              src={product.image || 'https://via.placeholder.com/40?text=No+Image'}
                              alt={product.name}
                              className="w-10 h-10 object-cover rounded-lg border border-gray-200"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm text-gray-900 truncate">{product.name}</div>
                              <div className="text-xs text-primary font-bold">₹{Math.round(product.price)}</div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="py-4">
                        <div className="text-center mb-3">
                          <p className="text-gray-600 text-sm font-medium">No matches for "{searchQuery}"</p>
                          <p className="text-xs text-gray-400 mt-1">Try these suggestions:</p>
                        </div>
                        <div className="flex flex-wrap gap-2 justify-center">
                          {popularSearches.slice(0, 3).map((term) => (
                            <button
                              key={term}
                              type="button"
                              onClick={() => {
                                setSearchQuery(term);
                                setIsSearchFocused(false);
                              }}
                              className="px-3 py-1.5 bg-gradient-to-br from-gray-50 to-gray-100 hover:from-primary hover:to-secondary hover:text-white text-xs font-medium rounded-lg transition-all border border-gray-200"
                            >
                              {term}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </form>
            </div>
          </div>
        </div>

      </header>

      {/* Mobile Menu Overlay - Enhanced */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-fadeIn" onClick={toggleMobileMenu}>
          <div
            className="absolute right-0 top-0 h-full w-80 bg-white shadow-2xl overflow-y-auto animate-slideInRight"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-black text-gray-900 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Menu</h2>
                <button onClick={toggleMobileMenu} className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center hover:from-red-100 hover:to-red-200 hover:text-red-600 transition-all active:scale-95">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2">
                <Link to="/category/staples" className="flex items-center gap-3 p-3 rounded-2xl hover:bg-gradient-to-r hover:from-amber-50 hover:to-transparent transition-all group" onClick={toggleMobileMenu}>
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-100 to-amber-200 flex items-center justify-center text-xl group-hover:scale-110 transition-transform shadow-sm">
                    🌾
                  </div>
                  <span className="font-bold text-gray-800">Staples</span>
                </Link>
                <Link to="/category/vegetables" className="flex items-center gap-3 p-3 rounded-2xl hover:bg-gradient-to-r hover:from-green-50 hover:to-transparent transition-all group" onClick={toggleMobileMenu}>
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-100 to-green-200 flex items-center justify-center text-xl group-hover:scale-110 transition-transform shadow-sm">
                    🥬
                  </div>
                  <span className="font-bold text-gray-800">Vegetables</span>
                </Link>
                <Link to="/category/fruits" className="flex items-center gap-3 p-3 rounded-2xl hover:bg-gradient-to-r hover:from-red-50 hover:to-transparent transition-all group" onClick={toggleMobileMenu}>
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-100 to-red-200 flex items-center justify-center text-xl group-hover:scale-110 transition-transform shadow-sm">
                    🍎
                  </div>
                  <span className="font-bold text-gray-800">Fruits</span>
                </Link>
                <Link to="/category/dairy" className="flex items-center gap-3 p-3 rounded-2xl hover:bg-gradient-to-r hover:from-blue-50 hover:to-transparent transition-all group" onClick={toggleMobileMenu}>
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-xl group-hover:scale-110 transition-transform shadow-sm">
                    🥛
                  </div>
                  <span className="font-bold text-gray-800">Dairy</span>
                </Link>
                <Link to="/offers" className="flex items-center gap-3 p-3 rounded-2xl bg-gradient-to-r from-red-50 to-red-100 hover:from-red-100 hover:to-red-200 transition-all group shadow-sm" onClick={toggleMobileMenu}>
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-200 to-red-300 flex items-center justify-center text-xl group-hover:scale-110 transition-transform shadow-md">
                    🏷️
                  </div>
                  <span className="font-black text-red-700">Special Offers</span>
                </Link>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-200">
                <button
                  onClick={toggleLocationPicker}
                  className="flex items-start gap-3 w-full p-4 rounded-2xl hover:bg-gradient-to-br hover:from-primary/5 hover:to-secondary/5 transition-all border-2 border-gray-100 hover:border-primary/30 hover:shadow-lg active:scale-[0.98]"
                >
                  <div className="w-12 h-12 bg-gradient-to-br from-primary via-green-600 to-secondary rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg mt-0.5">
                    <MapPin className="w-6 h-6 text-white drop-shadow-lg" />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse"></span>
                      Deliver to
                    </p>
                    {currentLocation ? (
                      <>
                        <p className="text-sm font-bold text-gray-800 line-clamp-1 leading-tight whitespace-nowrap">
                          {formatAddressLines(currentLocation.address).line1}
                        </p>
                        <p className="text-xs text-gray-600 line-clamp-1 leading-tight mt-1 whitespace-nowrap">
                          {formatAddressLines(currentLocation.address).line2}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                        Select Location
                        <Sparkles className="w-3 h-3 text-primary animate-pulse" />
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