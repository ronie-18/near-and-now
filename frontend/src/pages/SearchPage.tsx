import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { searchProducts } from '../services/supabase';
import { Product } from '../services/supabase';
import ProductGrid from '../components/products/ProductGrid';
import { useNotification } from '../context/NotificationContext';

const SearchPage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const { showNotification } = useNotification();
  const location = useLocation();

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const query = queryParams.get('q') || '';
    setSearchTerm(query);

    const fetchSearchResults = async () => {
      try {
        setLoading(true);
        if (query.trim()) {
          const results = await searchProducts(query);
          setProducts(results);
        } else {
          setProducts([]);
        }
      } catch (error) {
        console.error('Error searching products:', error);
        showNotification('Failed to load search results. Please try again.', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchSearchResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      window.history.pushState(
        {},
        '',
        `/search?q=${encodeURIComponent(searchTerm)}`
      );
      // Force a re-render
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">
        {searchTerm ? `Search Results for "${searchTerm}"` : 'Search Products'}
      </h1>

      {/* Search Form */}
      <form onSubmit={handleSearch} className="mb-8 max-w-2xl">
        <div className="flex">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search for products..."
            className="flex-grow px-4 py-3 border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="submit"
            className="bg-primary hover:bg-secondary text-white px-6 py-3 rounded-r-md transition-colors"
          >
            Search
          </button>
        </div>
      </form>

      {/* Search Results */}
      {searchTerm ? (
        <>
          <div className="mb-4 text-gray-600">
            {loading ? (
              <p>Searching...</p>
            ) : (
              <p>Found {products.length} results</p>
            )}
          </div>

          <ProductGrid products={products} loading={loading} />

          {!loading && products.length === 0 && (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">No results found</h2>
              <p className="text-gray-600 max-w-md mx-auto">
                We couldn't find any products matching "{searchTerm}". Try using different keywords or check for typos.
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-600">
            Enter a search term to find products
          </p>
        </div>
      )}
    </div>
  );
};

export default SearchPage;
