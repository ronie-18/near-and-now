import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import ProductGrid from '../components/products/ProductGrid';
import { getNearbyProductsPage, getNearbyProductsMeta, hasNearbyStores, Product, ProductSortOption } from '../services/supabase';
import { useLocation } from '../context/LocationContext';
import { useNotification } from '../context/NotificationContext';
import { formatCategoryName } from '../utils/formatters';
import { Search, SlidersHorizontal, X, ChevronDown, Package, MapPin, Tag } from 'lucide-react';

const PRODUCTS_PAGE_SIZE = 24;

const ShopPage = () => {
  const [searchParams] = useSearchParams();
  // `pageProducts` accumulates across "Load More" clicks (page 1, then 1+2,
  // etc.) — previously `products` held the entire nearby-store catalog,
  // fetched via fetchProductRows across every eligible store 500 rows/
  // request until exhausted, deduped in JS. Now backed by
  // get_nearby_products_page(), which does the dedup/filter/sort/pagination
  // server-side and returns only the requested page.
  const [pageProducts, setPageProducts] = useState<Product[]>([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [noStoresNearby, setNoStoresNearby] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<ProductSortOption>('default');
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 1000]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [maxPrice, setMaxPrice] = useState(1000);
  const [dealsOnly, setDealsOnly] = useState(searchParams.get('deals') === 'true');

  // Search text and price-range dragging both fire on every keystroke/pixel
  // — debounced into the values that actually trigger a server fetch, same
  // pattern used across the admin panel's paginated pages today. Category,
  // sort, and deals-only are discrete one-tap actions and fetch immediately.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [debouncedPriceRange, setDebouncedPriceRange] = useState<[number, number]>([0, 1000]);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setDebouncedPriceRange(priceRange);
    }, 350);
    return () => clearTimeout(t);
  }, [searchQuery, priceRange]);

  const { userLocation } = useLocation();
  const { showNotification } = useNotification();
  const lastLocationKeyRef = useRef<string | null>(null);
  // Guards against a slower, older fetch overwriting a newer one — e.g. the
  // user picks location A then immediately corrects to location B; A's
  // response can resolve after B's and must not clobber it. Also guards
  // page/filter fetches against each other the same way. Same race already
  // fixed on ProductDetailPage/CategoryPage/SearchPage.
  const fetchSeqRef = useRef(0);

  const locKey = userLocation?.latitude != null && userLocation?.longitude != null
    ? `${userLocation.latitude.toFixed(3)},${userLocation.longitude.toFixed(3)}`
    : 'no-location';

  // Metadata (category list + price-slider ceiling) reflects the whole
  // nearby catalog and stays stable while filtering — fetched once per
  // location change, decoupled from the paginated product fetch below.
  useEffect(() => {
    if (lastLocationKeyRef.current === locKey) return;
    lastLocationKeyRef.current = locKey;

    (async () => {
      try {
        if (userLocation?.latitude != null && userLocation?.longitude != null) {
          const storesExist = await hasNearbyStores(userLocation.latitude, userLocation.longitude);
          if (!storesExist) {
            setNoStoresNearby(true);
            setCategories([]);
            setMaxPrice(1000);
            setPriceRange([0, 1000]);
            return;
          }
        }
        setNoStoresNearby(false);
        const opts = userLocation?.latitude != null && userLocation?.longitude != null
          ? { lat: userLocation.latitude, lng: userLocation.longitude }
          : undefined;
        const meta = await getNearbyProductsMeta(opts);
        setCategories(meta.categories);
        setMaxPrice(meta.maxPrice);
        setPriceRange([0, meta.maxPrice]);
      } catch (error) {
        console.error('Error fetching product metadata:', error);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locKey]);

  const fetchPage = async (targetPage: number, append: boolean) => {
    const seq = ++fetchSeqRef.current;
    try {
      if (append) setLoadingMore(true); else setLoading(true);
      setFetchError(false);

      const opts = userLocation?.latitude != null && userLocation?.longitude != null
        ? { lat: userLocation.latitude, lng: userLocation.longitude }
        : undefined;
      const { products: newProducts, total } = await getNearbyProductsPage({
        ...opts,
        category: selectedCategory,
        search: debouncedSearch,
        sort: sortBy,
        dealsOnly,
        minPrice: debouncedPriceRange[0],
        maxPrice: debouncedPriceRange[1],
        page: targetPage,
        pageSize: PRODUCTS_PAGE_SIZE,
      });
      if (seq !== fetchSeqRef.current) return;

      setPageProducts(prev => append ? [...prev, ...newProducts] : newProducts);
      setTotalProducts(total);
      setPage(targetPage);
    } catch (error) {
      if (seq !== fetchSeqRef.current) return;
      console.error('Error fetching products:', error);
      showNotification('Failed to load products. Please try again.', 'error');
      setFetchError(true);
      if (!append) { setPageProducts([]); setTotalProducts(0); }
    } finally {
      if (seq === fetchSeqRef.current) { setLoading(false); setLoadingMore(false); }
    }
  };

  // Any filter/sort/location change resets to page 1 and replaces the list;
  // "Load More" (below) appends instead.
  useEffect(() => {
    if (noStoresNearby) { setPageProducts([]); setTotalProducts(0); setLoading(false); return; }
    fetchPage(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locKey, selectedCategory, sortBy, dealsOnly, debouncedSearch, debouncedPriceRange, noStoresNearby]);

  const handleLoadMore = () => fetchPage(page + 1, true);

  const handleCategoryChange = (category: string) => setSelectedCategory(category);

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => setSortBy(e.target.value as ProductSortOption);

  const handlePriceRangeChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const value = parseInt(e.target.value);
    setPriceRange(prev => {
      const newRange = [...prev] as [number, number];
      newRange[index] = value;
      return newRange;
    });
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value);

  const clearFilters = () => {
    setSelectedCategory('all');
    setSortBy('default');
    setPriceRange([0, maxPrice]);
    setSearchQuery('');
    setDealsOnly(false);
    showNotification('Filters cleared', 'success');
  };

  const hasActiveFilters = selectedCategory !== 'all' ||
    priceRange[0] !== 0 ||
    priceRange[1] !== maxPrice ||
    searchQuery !== '' ||
    dealsOnly;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Shop All Products</h1>
          <p className="text-gray-600">
            {userLocation
              ? 'Products available from stores near you'
              : 'Discover our complete collection of quality products'}
          </p>
        </div>

        {/* Mobile Filter Button */}
        <div className="lg:hidden mb-6">
          <button
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className="w-full flex items-center justify-center gap-2 bg-white border-2 border-gray-300 hover:border-primary text-gray-700 px-4 py-3 rounded-xl font-medium transition-all duration-300 shadow-sm hover:shadow-md"
          >
            <SlidersHorizontal className="w-5 h-5" />
            {showMobileFilters ? 'Hide Filters' : 'Show Filters'}
            {hasActiveFilters && (
              <span className="bg-primary text-white text-xs px-2 py-1 rounded-full">Active</span>
            )}
          </button>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar Filters */}
          <div className={`lg:w-1/4 ${showMobileFilters ? 'block' : 'hidden lg:block'}`}>
            <div className="bg-white rounded-2xl shadow-lg p-6 sticky top-24 border border-gray-100">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-primary" />
                  <h2 className="text-xl font-bold text-gray-800">Filters</h2>
                </div>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="text-sm text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
                  >
                    <X className="w-4 h-4" />
                    Clear
                  </button>
                )}
              </div>

              <div className="mb-6">
                <label className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  Search Products
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Type to search..."
                    value={searchQuery}
                    onChange={handleSearch}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="mb-6">
                <button
                  type="button"
                  onClick={() => setDealsOnly(prev => !prev)}
                  className={`w-full flex items-center gap-2 px-4 py-3 rounded-xl font-medium border-2 transition-all duration-300 ${
                    dealsOnly
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-primary'
                  }`}
                >
                  <Tag className="w-4 h-4" />
                  Deals Only
                </button>
              </div>

              <div className="mb-6">
                <label className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Category
                </label>
                <div className="relative">
                  <select
                    value={selectedCategory}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300 appearance-none bg-white cursor-pointer font-medium text-gray-700"
                  >
                    <option value="all">All Categories</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {formatCategoryName(category)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-5 h-5 text-gray-400 absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none" />
                </div>
                {selectedCategory !== 'all' && (
                  <div className="mt-2 inline-flex items-center gap-1 bg-primary/10 text-primary px-3 py-1 rounded-full text-sm font-medium">
                    {formatCategoryName(selectedCategory)}
                    <button
                      onClick={() => handleCategoryChange('all')}
                      className="hover:bg-primary/20 rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              <div className="mb-6">
                <label className="text-sm font-semibold text-gray-700 mb-3 block">
                  Price Range
                </label>
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-gray-50 px-3 py-2 rounded-lg">
                    <span className="text-sm font-medium text-gray-700">₹{priceRange[0]}</span>
                    <span className="text-xs text-gray-500">to</span>
                    <span className="text-sm font-medium text-gray-700">₹{priceRange[1]}</span>
                  </div>
                  <div className="relative h-2 bg-gray-200 rounded-full">
                    <div
                      className="absolute h-full bg-gradient-to-r from-primary to-secondary rounded-full"
                      style={{
                        left: `${(priceRange[0] / maxPrice) * 100}%`,
                        right: `${100 - (priceRange[1] / maxPrice) * 100}%`
                      }}
                    />
                    <input
                      type="range" min={0} max={maxPrice} value={priceRange[0]}
                      onChange={(e) => handlePriceRangeChange(e, 0)}
                      className="absolute w-full h-2 bg-transparent appearance-none pointer-events-auto cursor-pointer"
                      style={{ zIndex: priceRange[0] > maxPrice - 100 ? 5 : 3 }}
                    />
                    <input
                      type="range" min={0} max={maxPrice} value={priceRange[1]}
                      onChange={(e) => handlePriceRangeChange(e, 1)}
                      className="absolute w-full h-2 bg-transparent appearance-none pointer-events-auto cursor-pointer"
                      style={{ zIndex: 4 }}
                    />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1 font-medium">Min Price</label>
                      <input type="number" value={priceRange[0]}
                        onChange={(e) => handlePriceRangeChange(e, 0)}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-primary text-sm"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1 font-medium">Max Price</label>
                      <input type="number" value={priceRange[1]}
                        onChange={(e) => handlePriceRangeChange(e, 1)}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-primary text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {hasActiveFilters && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-blue-800 mb-1">Active Filters</p>
                    <p className="text-xs text-blue-600">
                      {selectedCategory !== 'all' && 'Category, '}
                      {(priceRange[0] !== 0 || priceRange[1] !== maxPrice) && 'Price Range, '}
                      {searchQuery && 'Search'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Product Grid */}
          <div className="lg:w-3/4">
            <div className="flex items-center justify-between mb-6">
              <div className="text-gray-600 font-medium">
                Showing <span className="text-primary font-bold">{totalProducts}</span> products
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="sort-by" className="text-gray-600 font-medium whitespace-nowrap">Sort:</label>
                <select
                  id="sort-by" value={sortBy} onChange={handleSortChange}
                  className="border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300 font-medium text-gray-700 cursor-pointer bg-white"
                >
                  <option value="default">Featured</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                  <option value="name-asc">Name: A to Z</option>
                  <option value="name-desc">Name: Z to A</option>
                </select>
              </div>
            </div>

            {/* Fetch failed */}
            {!loading && fetchError && (
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-12 text-center">
                <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Package className="w-10 h-10 text-red-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">Couldn&apos;t Load Products</h3>
                <p className="text-gray-600 mb-6">Something went wrong. Please check your connection and try again.</p>
                <button
                  onClick={() => fetchPage(1, false)}
                  className="bg-primary hover:bg-secondary text-white px-6 py-3 rounded-xl font-medium transition-all duration-300 transform hover:scale-105"
                >
                  Try Again
                </button>
              </div>
            )}

            {/* No stores nearby state */}
            {!loading && !fetchError && noStoresNearby && (
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-12 text-center">
                <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <MapPin className="w-10 h-10 text-amber-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">No Stores Near You</h3>
                <p className="text-gray-600 mb-6">
                  We don&apos;t have a delivery store within 4 km of your location yet. Try a different address.
                </p>
              </div>
            )}

            {/* No results from active filters */}
            {!loading && !fetchError && !noStoresNearby && totalProducts === 0 && hasActiveFilters && (
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-12 text-center">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Package className="w-10 h-10 text-gray-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">No Products Found</h3>
                <p className="text-gray-600 mb-6">Try adjusting your filters or search terms</p>
                <button
                  onClick={clearFilters}
                  className="bg-primary hover:bg-secondary text-white px-6 py-3 rounded-xl font-medium transition-all duration-300 transform hover:scale-105"
                >
                  Clear All Filters
                </button>
              </div>
            )}

            {/* No location set at all */}
            {!loading && !fetchError && !noStoresNearby && totalProducts === 0 && !hasActiveFilters && !userLocation && (
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-12 text-center">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <MapPin className="w-10 h-10 text-gray-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">Set Your Location</h3>
                <p className="text-gray-600">Share your location to see what&apos;s available near you.</p>
              </div>
            )}

            {/* Location set, stores nearby, but genuinely no active products */}
            {!loading && !fetchError && !noStoresNearby && totalProducts === 0 && !hasActiveFilters && userLocation && (
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-12 text-center">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Package className="w-10 h-10 text-gray-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">No Products Yet</h3>
                <p className="text-gray-600">Stores near you haven&apos;t added products yet — check back soon.</p>
              </div>
            )}

            {pageProducts.length > 0 && (
              <>
                <ProductGrid products={pageProducts} loading={loading} />
                {pageProducts.length < totalProducts && (
                  <div className="flex justify-center mt-8">
                    <button
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      className="bg-white border-2 border-primary text-primary hover:bg-primary hover:text-white px-8 py-3 rounded-xl font-semibold transition-all duration-300 disabled:opacity-60"
                    >
                      {loadingMore ? 'Loading…' : `Load More (${totalProducts - pageProducts.length} remaining)`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShopPage;
