import { useState, useEffect } from 'react';
import ProductGrid from '../components/products/ProductGrid';
import { getAllProducts, Product } from '../services/supabase';
import { useNotification } from '../context/NotificationContext';
import { formatCategoryName } from '../utils/formatters';

const ShopPage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('default');
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 1000]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  const { showNotification } = useNotification();

  // Fetch products on mount
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const allProducts = await getAllProducts();
        setProducts(allProducts);
        setFilteredProducts(allProducts);
        
        // Extract unique categories
        const uniqueCategories = Array.from(
          new Set(allProducts.map(product => product.category))
        ).filter(Boolean);
        setCategories(uniqueCategories);
        
        // Find max price for range slider
        const maxPrice = Math.max(...allProducts.map(product => product.price));
        setPriceRange([0, maxPrice]);
      } catch (error) {
        console.error('Error fetching products:', error);
        showNotification('Failed to load products. Please try again.', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [showNotification]);

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
        // Default sorting (newest first based on id)
        result.sort((a, b) => b.id.localeCompare(a.id));
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

  return (
    <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">Shop All Products</h1>
        
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar Filters */}
          <div className="lg:w-1/4">
            <div className="bg-white rounded-lg shadow-md p-6 sticky top-24">
              {/* Search */}
              <div className="mb-6">
                <h3 className="text-lg font-medium text-gray-800 mb-3">Search</h3>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={handleSearch}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
              </div>
              
              {/* Categories */}
              <div className="mb-6">
                <h3 className="text-lg font-medium text-gray-800 mb-3">Categories</h3>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <input
                      type="radio"
                      id="category-all"
                      name="category"
                      checked={selectedCategory === 'all'}
                      onChange={() => handleCategoryChange('all')}
                      className="h-4 w-4 text-primary focus:ring-primary border-gray-300"
                    />
                    <label htmlFor="category-all" className="ml-2 text-gray-700">
                      All Categories
                    </label>
                  </div>
                  
                  {categories.map((category) => (
                    <div key={category} className="flex items-center">
                      <input
                        type="radio"
                        id={`category-${category}`}
                        name="category"
                        checked={selectedCategory === category}
                        onChange={() => handleCategoryChange(category)}
                        className="h-4 w-4 text-primary focus:ring-primary border-gray-300"
                      />
                      <label htmlFor={`category-${category}`} className="ml-2 text-gray-700">
                        {formatCategoryName(category)}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Price Range */}
              <div className="mb-6">
                <h3 className="text-lg font-medium text-gray-800 mb-3">Price Range</h3>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-gray-600">₹{priceRange[0]}</span>
                    <span className="text-gray-600">₹{priceRange[1]}</span>
                  </div>
                  
                  <div className="flex gap-4">
                    <input
                      type="range"
                      min={0}
                      max={1000}
                      value={priceRange[0]}
                      onChange={(e) => handlePriceRangeChange(e, 0)}
                      className="w-full"
                    />
                    <input
                      type="range"
                      min={0}
                      max={1000}
                      value={priceRange[1]}
                      onChange={(e) => handlePriceRangeChange(e, 1)}
                      className="w-full"
                    />
                  </div>
                  
                  <div className="flex gap-4">
                    <div className="w-1/2">
                      <label htmlFor="min-price" className="block text-sm text-gray-600 mb-1">
                        Min
                      </label>
                      <input
                        type="number"
                        id="min-price"
                        value={priceRange[0]}
                        onChange={(e) => handlePriceRangeChange(e, 0)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div className="w-1/2">
                      <label htmlFor="max-price" className="block text-sm text-gray-600 mb-1">
                        Max
                      </label>
                      <input
                        type="number"
                        id="max-price"
                        value={priceRange[1]}
                        onChange={(e) => handlePriceRangeChange(e, 1)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Product Grid */}
          <div className="lg:w-3/4">
            {/* Sort and Filter Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 bg-white rounded-lg shadow-md p-4">
              <div className="mb-4 sm:mb-0">
                <span className="text-gray-600">
                  Showing {filteredProducts.length} of {products.length} products
                </span>
              </div>
              
              <div className="flex items-center">
                <label htmlFor="sort-by" className="text-gray-600 mr-2">
                  Sort by:
                </label>
                <select
                  id="sort-by"
                  value={sortBy}
                  onChange={handleSortChange}
                  className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="default">Newest</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                  <option value="name-asc">Name: A to Z</option>
                  <option value="name-desc">Name: Z to A</option>
                </select>
              </div>
            </div>
            
            {/* Products */}
            <ProductGrid products={filteredProducts} loading={loading} />
          </div>
        </div>
      </div>
  );
};

export default ShopPage;
