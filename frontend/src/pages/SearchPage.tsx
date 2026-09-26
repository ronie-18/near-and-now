import { useState, useEffect, FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { searchProducts } from '../services/supabase';
import { Product } from '../services/supabase';
import ProductGrid from '../components/products/ProductGrid';
import { useNotification } from '../context/NotificationContext';
import { describeError } from '../utils/apiErrors';

const SearchPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = (searchParams.get('q') || '').trim();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(Boolean(query));
  const [searchTerm, setSearchTerm] = useState(query);
  const { showNotification } = useNotification();

  // Keep the input in sync when the URL changes (back/forward, header search).
  useEffect(() => {
    setSearchTerm(query);
  }, [query]);

  useEffect(() => {
    if (!query) {
      setProducts([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    searchProducts(query)
      .then((results) => {
        if (!cancelled) setProducts(results);
      })
      .catch((error) => {
        if (cancelled) return;
        setProducts([]);
        showNotification(describeError('SearchPage.search', `Could not search for "${query}"`, error), 'error');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // A slower earlier search must not overwrite the results of a newer one.
    return () => {
      cancelled = true;
    };
  }, [query, showNotification]);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    const next = searchTerm.trim();
    if (next) setSearchParams({ q: next });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl md:text-3xl font-bold text-gray-800 mb-6">
        {query ? `Search Results for "${query}"` : 'Search Products'}
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
      {query ? (
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
                We couldn't find any products matching "{query}". Try using different keywords or check for typos.
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
