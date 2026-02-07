import { useState, useEffect } from 'react';
import ProductGrid from '../components/products/ProductGrid';
import { getAllProducts, Product } from '../services/supabase';
import { useNotification } from '../context/NotificationContext';
import { formatCategoryName } from '../utils/formatters';
import { Search, SlidersHorizontal, X, ChevronDown, Package } from 'lucide-react';

const ShopPage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('default');
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 1000]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [maxPrice, setMaxPrice] = useState(1000);

  const { showNotification } = useNotification();

  // Shuffle array function for randomization
  const shuffleArray = <T,>(array: T[]): T[] => {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
  };

  // Fetch products on mount
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const allProducts = await getAllProducts();
        // Randomize products for variety
        const randomizedProducts = shuffleArray(allProducts);
        setProducts(randomizedProducts);
        setFilteredProducts(randomizedProducts);

        // Extract unique categories and sort alphabetically
        const uniqueCategories = Array.from(
          new Set(allProducts.map(product => product.category))
        ).filter(Boolean).sort((a, b) => a.localeCompare(b));
        setCategories(uniqueCategories);

        // Find max price for range slider
        const calculatedMaxPrice = Math.max(...allProducts.map(product => product.price), 1000);
        setMaxPrice(calculatedMaxPrice);
        setPriceRange([0, calculatedMaxPrice]);
      } catch (error) {
        console.error('Error fetching products:', error);
        showNotification('Failed to load products. Please try again.', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply filters and sorting
  useEffect(() => {
    let result = [...products];

    // Apply category filter
    if (selectedCategory !== 'all') {
      result = result.filter(product => product.category === selectedCategory);
    }

    // Apply price range filter
    result = result.filter(
      product => product.price >= priceRange[0] && product.price <= priceRange[1]
    );

    // Apply search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        product => product.name.toLowerCase().includes(query) ||
                  product.category.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    switch (sortBy) {
      case 'price-asc':
        result.sort((a, b) => a.price - b.price);
        break;
      case 'price-desc':
        result.sort((a, b) => b.price - a.price);
        break;
      case 'name-asc':
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'name-desc':
        result.sort((a, b) => b.name.localeCompare(a.name));
        break;
      default:
        // Default sorting keeps the randomized order from initial load
        // No additional sorting needed
        break;
    }

    setFilteredProducts(result);
  }, [products, selectedCategory, sortBy, priceRange, searchQuery]);

  // Handle category change
  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
  };

  // Handle sort change
  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortBy(e.target.value);
  };

  // Handle price range change
  const handlePriceRangeChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const value = parseInt(e.target.value);
    setPriceRange(prev => {
      const newRange = [...prev] as [number, number];
      newRange[index] = value;
      return newRange;
    });
  };

  // Handle search
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  // Clear all filters
  const clearFilters = () => {
    setSelectedCategory('all');
    setSortBy('default');
    setPriceRange([0, maxPrice]);
    setSearchQuery('');
    showNotification('Filters cleared', 'success');
  };

  // Check if any filters are active
  const hasActiveFilters = selectedCategory !== 'all' ||
                           priceRange[0] !== 0 ||
                           priceRange[1] !== maxPrice ||
                           searchQuery !== '';

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header Section */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Shop All Products</h1>
          <p className="text-gray-600">Discover our complete collection of quality products</p>
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
              {/* Filter Header */}
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

              {/* Search */}
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

              {/* Categories Dropdown */}
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

              {/* Price Range */}
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

                  {/* Dual Range Slider */}
                  <div className="relative h-2 bg-gray-200 rounded-full">
                    <div
                      className="absolute h-full bg-gradient-to-r from-primary to-secondary rounded-full"
                      style={{
                        left: `${(priceRange[0] / maxPrice) * 100}%`,
                        right: `${100 - (priceRange[1] / maxPrice) * 100}%`
                      }}
                    ></div>
                    <input
                      type="range"
                      min={0}
                      max={maxPrice}
                      value={priceRange[0]}
                      onChange={(e) => handlePriceRangeChange(e, 0)}
                      className="absolute w-full h-2 bg-transparent appearance-none pointer-events-auto cursor-pointer"
                      style={{ zIndex: priceRange[0] > maxPrice - 100 ? 5 : 3 }}
                    />
                    <input
                      type="range"
                      min={0}
                      max={maxPrice}
                      value={priceRange[1]}
                      onChange={(e) => handlePriceRangeChange(e, 1)}
                      className="absolute w-full h-2 bg-transparent appearance-none pointer-events-auto cursor-pointer"
                      style={{ zIndex: 4 }}
                    />
                  </div>

                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1 font-medium">Min Price</label>
                      <input
                        type="number"
                        value={priceRange[0]}
                        onChange={(e) => handlePriceRangeChange(e, 0)}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-primary text-sm"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1 font-medium">Max Price</label>
                      <input
                        type="number"
                        value={priceRange[1]}
                        onChange={(e) => handlePriceRangeChange(e, 1)}
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-primary text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Active Filters Summary */}
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
            {/* Sort Bar */}
            <div className="flex items-center justify-between mb-6">
              <div className="text-gray-600 font-medium">
                Showing <span className="text-primary font-bold">{filteredProducts.length}</span> products
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor="sort-by" className="text-gray-600 font-medium whitespace-nowrap">
                  Sort:
                </label>
                <select
                  id="sort-by"
                  value={sortBy}
                  onChange={handleSortChange}
                  className="border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300 font-medium text-gray-700 cursor-pointer bg-white"
                >
                  <option value="default">Random</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                  <option value="name-asc">Name: A to Z</option>
                  <option value="name-desc">Name: Z to A</option>
                </select>
              </div>
            </div>

            {/* No Results Message */}
            {!loading && filteredProducts.length === 0 && (
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-12 text-center">
                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Package className="w-10 h-10 text-gray-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">No Products Found</h3>
                <p className="text-gray-600 mb-6">
                  Try adjusting your filters or search terms
                </p>
                <button
                  onClick={clearFilters}
                  className="bg-primary hover:bg-secondary text-white px-6 py-3 rounded-xl font-medium transition-all duration-300 transform hover:scale-105"
                >
                  Clear All Filters
                </button>
              </div>
            )}

            {/* Products Grid */}
            {filteredProducts.length > 0 && (
              <ProductGrid products={filteredProducts} loading={loading} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShopPage;
