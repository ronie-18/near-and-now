import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ProductGrid from '../components/products/ProductGrid';
import { getAllProducts } from '../services/supabase';
import { Product } from '../services/supabase';
import { getCategories, Category } from '../services/adminService';
import { useNotification } from '../context/NotificationContext';
import { formatCategoryName } from '../utils/formatCategoryName';

const HomePage = () => {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [displayedProducts, setDisplayedProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const { showNotification } = useNotification();
  const navigate = useNavigate();

  const MAX_PRODUCTS_ON_HOME = 40;

  // Fetch all products and categories on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [products, categoriesData] = await Promise.all([
          getAllProducts(),
          getCategories()
        ]);
        setAllProducts(products);
        setCategories(categoriesData);
      } catch (error) {
        console.error('Error fetching data:', error);
        showNotification('Failed to load data. Please try again.', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []); // eslint-disable-next-line react-hooks/exhaustive-deps

  // Limit displayed products to MAX_PRODUCTS_ON_HOME
  useEffect(() => {
    setDisplayedProducts(allProducts.slice(0, MAX_PRODUCTS_ON_HOME));
  }, [allProducts]);

  // Generate background color for categories
  const getCategoryBgColor = (index: number) => {
    const colors = [
      'bg-green-50', 'bg-red-50', 'bg-yellow-50', 'bg-orange-50',
      'bg-pink-50', 'bg-slate-50', 'bg-blue-50', 'bg-purple-50',
      'bg-teal-50', 'bg-indigo-50'
    ];
    return colors[index % colors.length];
  };

  return (
    <>
      {/* Categories Section - Moved to Top */}
      <section className="py-16 bg-gradient-to-b from-gray-50 to-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-3">
              Shop by Category
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Discover a wide variety of fresh products across all your favorite categories
            </p>
          </div>

          {/* Categories Grid - 5 per row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
            {loading ? (
              // Category Skeleton Loaders
              Array.from({ length: 10 }).map((_, index) => (
                <div
                  key={`skeleton-cat-${index}`}
                  className="bg-white rounded-2xl p-5 animate-pulse shadow-md"
                >
                  <div className="w-full h-40 bg-gray-200 rounded-xl mb-4"></div>
                  <div className="h-5 bg-gray-200 rounded mb-2"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                </div>
              ))
            ) : (
              categories.map((category, index) => (
                <Link
                  key={category.id}
                  to={`/category/${encodeURIComponent(category.name)}`}
                  className="group bg-white rounded-2xl shadow-md hover:shadow-2xl transition-all duration-300 overflow-hidden transform hover:-translate-y-2"
                >
                  <div className={`${category.color || getCategoryBgColor(index)} p-4`}>
                    <div className="overflow-hidden rounded-xl">
                      <img
                        src={category.image_url || `https://via.placeholder.com/300x200?text=${encodeURIComponent(category.name)}`}
                        alt={category.name}
                        loading="lazy"
                        className="w-full h-40 object-cover transform group-hover:scale-110 transition-transform duration-300"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = `https://via.placeholder.com/300x200?text=${encodeURIComponent(category.name)}`;
                        }}
                      />
                    </div>
                  </div>
                  <div className="p-4 text-center">
                    <h3 className="font-bold text-gray-800 text-base mb-1.5 group-hover:text-green-600 transition-colors">
                      {formatCategoryName(category.name)}
                    </h3>
                    <p className="text-sm text-gray-500 line-clamp-2">
                      {category.description || 'Browse products'}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>

          {/* Empty State */}
          {!loading && categories.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">No categories available at the moment.</p>
            </div>
          )}
        </div>
      </section>

      {/* Featured Products Section */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-2">
              Featured Products
            </h2>
            <p className="text-gray-600">
              {allProducts.length > 0
                ? `Showing ${displayedProducts.length} of ${allProducts.length} products`
                : 'Browse through our complete collection of quality products'
              }
            </p>
          </div>

          {/* Products Grid */}
          <ProductGrid products={displayedProducts} loading={loading} />

          {/* Show More Products Button */}
          {!loading && allProducts.length > MAX_PRODUCTS_ON_HOME && (
            <div className="text-center mt-12">
              <button
                onClick={() => navigate('/shop')}
                className="inline-flex items-center gap-3 bg-gradient-to-r from-primary to-secondary hover:from-secondary hover:to-primary text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                Show More Products
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
              <p className="text-gray-500 mt-4 text-sm">
                View all {allProducts.length} products in our shop
              </p>
            </div>
          )}

          {/* Show message when no products available */}
          {!loading && allProducts.length === 0 && (
            <div className="text-center py-12">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-24 w-24 mx-auto text-gray-300 mb-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                />
              </svg>
              <h3 className="text-xl font-semibold text-gray-700 mb-2">
                No Products Available
              </h3>
              <p className="text-gray-500">
                We're working on adding new products. Check back soon!
              </p>
            </div>
          )}
        </div>
      </section>

    </>
  );
};

export default HomePage;