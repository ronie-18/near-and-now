import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import ProductGrid from '../components/products/ProductGrid';
import { getAllProducts } from '../services/supabase';
import { Product } from '../services/supabase';
import { useNotification } from '../context/NotificationContext';

type SortOption = 'default' | 'price-low' | 'price-high' | 'name-asc' | 'name-desc' | 'newest';

const HomePage = () => {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [displayedProducts, setDisplayedProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('default');
  const [itemsToShow, setItemsToShow] = useState(12);
  const { showNotification } = useNotification();
  const observerTarget = useRef<HTMLDivElement>(null);

  const ITEMS_PER_LOAD = 12;

  // Fetch all products on mount
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const products = await getAllProducts();
        setAllProducts(products);
      } catch (error) {
        console.error('Error fetching products:', error);
        showNotification('Failed to load products. Please try again.', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [showNotification]);

  // Sort products based on selected option
  const sortProducts = useCallback((products: Product[], sortOption: SortOption): Product[] => {
    const sorted = [...products];

    switch (sortOption) {
      case 'price-low':
        return sorted.sort((a, b) => a.price - b.price);
      case 'price-high':
        return sorted.sort((a, b) => b.price - a.price);
      case 'name-asc':
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case 'name-desc':
        return sorted.sort((a, b) => b.name.localeCompare(a.name));
      case 'newest':
        return sorted.sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA;
        });
      case 'default':
      default:
        return sorted;
    }
  }, []);

  // Update displayed products when sorting changes or items to show changes
  useEffect(() => {
    const sorted = sortProducts(allProducts, sortBy);
    setDisplayedProducts(sorted.slice(0, itemsToShow));
  }, [allProducts, sortBy, itemsToShow, sortProducts]);

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && !loadingMore) {
          if (itemsToShow < allProducts.length) {
            setLoadingMore(true);
            // Simulate loading delay for better UX
            setTimeout(() => {
              setItemsToShow((prev) => prev + ITEMS_PER_LOAD);
              setLoadingMore(false);
            }, 500);
          }
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [loading, loadingMore, itemsToShow, allProducts.length]);

  // Handle sort change
  const handleSortChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortBy(e.target.value as SortOption);
    setItemsToShow(ITEMS_PER_LOAD); // Reset to initial load
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);


  const categories = [
    {
  name: 'Staples',
  image: 'https://images.unsplash.com/photo-1536304993881-ff6e9eefa2a6?w=300&h=200&fit=crop',
  description: 'Rice, Dal & Atta',
  bgColor: 'bg-amber-50'
},
{
  name: 'Spices',
  image: 'https://deliciousfoods.in/cdn/shop/articles/spices_1100x.jpg?v=1742457010',
  description: 'Fresh & Aromatic',
  bgColor: 'bg-red-50'
},
{
  name: 'Oils',
  image: 'https://images.healthshots.com/healthshots/en/uploads/2024/11/04115103/Best-cooking-oils-1.jpg',
  description: 'Cooking & Essential Oils',
  bgColor: 'bg-yellow-50'
},
{
  name: 'Pasta, Noodles & Vermicelli',
  image: 'https://images.unsplash.com/photo-1551892374-ecf8754cf8b0?w=300&h=200&fit=crop',
  description: 'Fresh & Instant',
  bgColor: 'bg-orange-50'
},
{
  name: 'Bakery',
  image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=300&h=200&fit=crop',
  description: 'Fresh Bread & Pastries',
  bgColor: 'bg-pink-50'
},
{
  name: 'Salt and Sugar',
  image: 'https://images.unsplash.com/photo-1518843875459-f738682238a6?w=300&h=200&fit=crop',
  description: 'Essential Ingredients',
  bgColor: 'bg-slate-50'
},
{
  name: 'Dairy Products',
  image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=300&h=200&fit=crop',
  description: 'Milk, Paneer & More',
  bgColor: 'bg-blue-50'
},
{
  name: 'Vegetables',
  image: 'https://images.unsplash.com/photo-1610348725531-843dff563e2c?w=300&h=200&fit=crop',
  description: 'Fresh & Organic',
  bgColor: 'bg-green-50'
},
{
  name: 'Snacks',
  image: 'https://images.unsplash.com/photo-1599490659213-e2b9527bd087?w=300&h=200&fit=crop',
  description: 'Healthy & Tasty',
  bgColor: 'bg-purple-50'
},
{
  name: 'Beverages',
  image: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=300&h=200&fit=crop',
  description: 'Tea & Drinks',
  bgColor: 'bg-teal-50'
},
  ];

  return (
    <>
      {/* Categories Section */}
      <section className="py-16 bg-gradient-to-b from-white to-gray-50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-3">
              Shop by Category
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Discover a wide variety of fresh products across all your favorite categories
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-6">
            {loading ? (
              // Category Skeleton Loaders
              Array.from({ length: 10 }).map((_, index) => (
                <div key={`skeleton-cat-${index}`} className="bg-white rounded-xl p-4 animate-pulse shadow-sm">
                  <div className="w-full h-32 bg-gray-200 rounded-lg mb-3"></div>
                  <div className="h-4 bg-gray-200 rounded mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-3/4"></div>
                </div>
              ))
            ) : (
              categories.map((category) => (
                <Link
                  key={category.name}
                  to={`/category/${encodeURIComponent(category.name.toLowerCase().replace(/\s+/g, '-'))}`}
                  className="group bg-white rounded-xl shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden transform hover:-translate-y-1"
                >
                  <div className={`${category.bgColor} p-3`}>
                    <div className="overflow-hidden rounded-lg">
                      <img
                        src={category.image}
                        alt={category.name}
                        loading="lazy"
                        className="w-full h-32 object-cover transform group-hover:scale-110 transition-transform duration-300"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = `https://via.placeholder.com/300x200?text=${encodeURIComponent(category.name)}`;
                        }}
                      />
                    </div>
                  </div>
                  <div className="p-3 text-center">
                    <h3 className="font-semibold text-gray-800 text-sm mb-1 group-hover:text-green-600 transition-colors">
                      {category.name}
                    </h3>
                    <p className="text-xs text-gray-500">
                      {category.description}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </section>

      {/* All Products Section */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          {/* Header with Sort */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-800 mb-2">
                Our Products
              </h2>
              <p className="text-gray-600">
                {allProducts.length > 0
                  ? `Showing ${displayedProducts.length} of ${allProducts.length} products`
                  : 'Browse through our complete collection of quality products'
                }
              </p>
            </div>

            {/* Sort Dropdown */}
            {!loading && allProducts.length > 0 && (
              <div className="flex items-center gap-3">
                <label htmlFor="sort-select" className="text-gray-700 font-medium whitespace-nowrap">
                  Sort by:
                </label>
                <select
                  id="sort-select"
                  value={sortBy}
                  onChange={handleSortChange}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white text-gray-700 cursor-pointer"
                >
                  <option value="default">All</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                  <option value="name-asc">Name: A to Z</option>
                  <option value="name-desc">Name: Z to A</option>
                  <option value="newest">Newest First</option>
                </select>
              </div>
            )}
          </div>

          {/* Products Grid */}
          <ProductGrid products={displayedProducts} loading={loading} />

          {/* Loading More Indicator */}
          {loadingMore && (
            <div className="flex justify-center items-center py-8">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-gray-600 font-medium">Loading more products...</span>
              </div>
            </div>
          )}

          {/* Infinite Scroll Observer Target */}
          {!loading && displayedProducts.length < allProducts.length && (
            <div ref={observerTarget} className="h-20 flex items-center justify-center">
              <div className="text-gray-400 text-sm">Scroll for more products</div>
            </div>
          )}

          {/* End of Products Message */}
          {!loading && displayedProducts.length > 0 && displayedProducts.length === allProducts.length && (
            <div className="text-center py-8">
              <div className="inline-flex items-center gap-2 text-gray-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">You've reached the end of our catalog</span>
              </div>
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