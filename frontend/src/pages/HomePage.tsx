import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getAllProducts } from '../services/supabase';
import { Product } from '../services/supabase';
import { getCategories, Category } from '../services/adminService';
import { useNotification } from '../context/NotificationContext';
import { formatCategoryName } from '../utils/formatCategoryName';
import ProductCard from '../components/products/ProductCard';
import { Search } from 'lucide-react';

const HomePage = () => {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const { showNotification } = useNotification();
  const navigate = useNavigate();

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

        // Filter categories: remove duplicates. When we have products, only show categories that have products; when no products, show all so the section isn't empty.

        const productCategories = new Set(products.map(p => p.category).filter(Boolean));

        const uniqueCategories = categoriesData.filter((category, index, self) => {
          // Remove duplicates by name (case-insensitive)

          const isUnique = index === self.findIndex(c =>
            c.name.toLowerCase() === category.name.toLowerCase()
          );

          const hasProducts = products.length === 0 || productCategories.has(category.name);

          return isUnique && hasProducts;
        });

        setCategories(uniqueCategories);
      } catch (error) {
        console.error('Error fetching data:', error);
        showNotification('Failed to load data. Please try again.', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []); // eslint-disable-next-line react-hooks/exhaustive-deps

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  return (
    <>
      {/* Search Bar */}
      <section className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="w-full max-w-[1600px] mx-auto px-2 sm:px-3 py-2.5">
          <form onSubmit={handleSearch} className="relative">
            <div className="relative flex items-center">
              <Search className="absolute left-3 w-5 h-5 text-green-600" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search groceries, dairy, snacks…"
                className="w-full pl-11 pr-4 py-2.5 sm:py-3 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm sm:text-base transition-all"
              />
            </div>
          </form>
        </div>
      </section>

      {/* Banner — edge-to-edge image, no letterboxing */}
      <section className="bg-neutral-50/80 border-b border-gray-100/80">
        <div className="w-full max-w-[1600px] mx-auto px-2 sm:px-3 pt-2 pb-3">
          <div className="relative w-full h-32 sm:h-36 md:h-44 overflow-hidden rounded-lg sm:rounded-xl bg-neutral-200">
            <img
              src="/near_and_now_banner.png"
              alt="Near & Now - Digital Dukan, Local Dil Se - Groceries, Essentials & More Delivered in Minutes"
              className="absolute inset-0 h-full w-full object-cover object-center"
              loading="eager"
              onError={(e) => {
                console.error('Banner image failed to load from /near_and_now_banner.png');
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
              }}
            />
          </div>
        </div>
      </section>

      {/* Categories — compact tiles */}
      <section className="py-4 bg-white">
        <div className="w-full max-w-[1600px] mx-auto px-2 sm:px-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base sm:text-lg font-bold text-gray-900">Shop by category</h2>
            <p className="text-xs sm:text-sm text-gray-500">Everything you need</p>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2 sm:gap-2.5">
            {loading ? (
              Array.from({ length: 12 }).map((_, index) => (
                <div
                  key={`skeleton-cat-${index}`}
                  className="flex flex-col items-center animate-pulse"
                >
                  <div className="w-full aspect-square max-h-24 sm:max-h-28 bg-gray-200 rounded-md mb-1.5" />
                  <div className="h-2.5 bg-gray-200 rounded w-14" />
                </div>
              ))
            ) : (
              categories.map((category) => (
                <Link
                  key={category.id}
                  to={`/category/${encodeURIComponent(category.name)}`}
                  className="flex flex-col items-center group"
                >
                  <div className="w-full aspect-square max-h-24 sm:max-h-28 bg-gradient-to-br from-green-50 to-white rounded-lg border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden mb-1 transform group-hover:scale-[1.02]">
                    <img
                      src={category.image_url || `https://via.placeholder.com/300x300?text=${encodeURIComponent(category.name)}`}
                      alt={category.name}
                      loading="lazy"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = `https://via.placeholder.com/300x300?text=${encodeURIComponent(category.name)}`;
                      }}
                    />
                  </div>
                  <p className="text-[11px] sm:text-xs font-medium text-gray-700 text-center leading-snug line-clamp-2 group-hover:text-primary transition-colors px-0.5">
                    {formatCategoryName(category.name)}
                  </p>
                </Link>
              ))
            )}
          </div>

          {!loading && categories.length === 0 && (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm">No categories available at the moment.</p>
            </div>
          )}
        </div>
      </section>

      {/* Products by category */}
      <section className="py-4 pb-8 bg-gray-50">
        <div className="w-full max-w-[1600px] mx-auto px-2 sm:px-3">
          {loading ? (
            <div className="space-y-8">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx}>
                  <div className="h-6 bg-gray-200 rounded w-40 mb-3 animate-pulse" />
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 sm:gap-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="bg-white rounded-lg shadow border border-gray-100 overflow-hidden animate-pulse">
                        <div className="h-36 bg-gray-200" />
                        <div className="p-3">
                          <div className="h-3.5 bg-gray-200 rounded w-3/4 mb-2" />
                          <div className="h-5 bg-gray-200 rounded w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : categories.length > 0 ? (
            <div className="space-y-8">
              {categories.map((category) => {
                const categoryProducts = allProducts.filter(p => p.category === category.name);
                if (categoryProducts.length === 0) return null;

                const displayProducts = categoryProducts.slice(0, 6);
                const hasMore = categoryProducts.length > 6;

                return (
                  <div key={category.id} className="bg-white rounded-xl p-3 sm:p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                          {formatCategoryName(category.name)}
                        </h2>
                        <p className="text-xs text-gray-500 mt-0.5">Top picks</p>
                      </div>
                      {hasMore && (
                        <Link
                          to={`/category/${encodeURIComponent(category.name)}`}
                          className="text-green-600 hover:text-green-700 font-semibold text-xs sm:text-sm flex items-center gap-0.5 shrink-0"
                        >
                          See all
                          <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6 gap-2.5 sm:gap-3">
                      {displayProducts.map((product) => (
                        <ProductCard key={product.id} product={product} />
                      ))}
                    </div>

                    {hasMore && (
                      <Link
                        to={`/category/${encodeURIComponent(category.name)}`}
                        className="mt-3 flex items-center justify-center gap-2 py-2.5 px-4 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg transition-colors text-sm font-medium"
                      >
                        See all products in {formatCategoryName(category.name)}
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
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