import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import ProductGrid from '../components/products/ProductGrid';
import { getAllProducts } from '../services/supabase';
import { Product } from '../services/supabase';
import { getCategories, Category } from '../services/adminService';
import { useNotification } from '../context/NotificationContext';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCategoryName } from '../utils/formatCategoryName';

const HomePage = () => {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [displayedProducts, setDisplayedProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [itemsToShow, setItemsToShow] = useState(12);
  const { showNotification } = useNotification();
  const observerTarget = useRef<HTMLDivElement>(null);
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const ITEMS_PER_LOAD = 12;

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
  }, [showNotification]);

  // Update displayed products when items to show changes
  useEffect(() => {
    setDisplayedProducts(allProducts.slice(0, itemsToShow));
  }, [allProducts, itemsToShow]);

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
            }, 200); // Reduced from 500ms to 200ms for faster loading
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

  // Create infinite loop of categories (5 copies for seamless looping)
  const infiniteCategories = [
    ...categories,
    ...categories,
    ...categories,
    ...categories,
    ...categories
  ];

  // Check for infinite scroll loop and reset position
  const checkInfiniteScroll = useCallback(() => {
    if (!categoryScrollRef.current || categories.length === 0) return;

    const container = categoryScrollRef.current;
    const currentScrollLeft = container.scrollLeft;
    const scrollWidth = container.scrollWidth;
    const singleSetWidth = scrollWidth / 5; // Width of one complete set of categories

    // Reset to center set (index 2) when at boundaries
    // If scrolled past the 3rd set, jump back to 2nd set
    if (currentScrollLeft >= singleSetWidth * 3) {
      container.scrollLeft = currentScrollLeft - singleSetWidth;
    }
    // If scrolled before the 2nd set, jump forward to 2nd set
    else if (currentScrollLeft < singleSetWidth) {
      container.scrollLeft = currentScrollLeft + singleSetWidth;
    }
  }, [categories.length]);

  // Setup scroll event listener for infinite loop
  useEffect(() => {
    const container = categoryScrollRef.current;
    if (!container || categories.length === 0) return;

    // Initialize scroll position to middle set (2nd set out of 5)
    const initializeScroll = setTimeout(() => {
      if (container.scrollWidth > 0) {
        const singleSetWidth = container.scrollWidth / 5;
        container.scrollLeft = singleSetWidth * 2; // Start at 2nd set
      }
    }, 100);

    // Use passive listener for better performance
    const handleScroll = () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        checkInfiniteScroll();
      }, 50);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      clearTimeout(initializeScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      container.removeEventListener('scroll', handleScroll);
    };
  }, [categories, checkInfiniteScroll]);

  // Scroll categories left (one card width)
  const handleScrollLeft = useCallback(() => {
    if (categoryScrollRef.current) {
      setIsScrolling(true);
      const cardWidth = categoryScrollRef.current.offsetWidth / 5; // Width of one card when 5 are visible
      categoryScrollRef.current.scrollBy({ left: -cardWidth, behavior: 'smooth' });

      // Reset scrolling state after animation completes
      setTimeout(() => setIsScrolling(false), 500);
    }
  }, []);

  // Scroll categories right (one card width)
  const handleScrollRight = useCallback(() => {
    if (categoryScrollRef.current) {
      setIsScrolling(true);
      const cardWidth = categoryScrollRef.current.offsetWidth / 5; // Width of one card when 5 are visible
      categoryScrollRef.current.scrollBy({ left: cardWidth, behavior: 'smooth' });

      // Reset scrolling state after animation completes
      setTimeout(() => setIsScrolling(false), 500);
    }
  }, []);

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

          {/* Categories Carousel with Arrow Buttons */}
          <div className="flex items-center justify-center gap-3 md:gap-4">
            {/* Left Arrow */}
            {!loading && categories.length > 0 && (
              <button
                onClick={handleScrollLeft}
                className="flex-shrink-0 bg-white hover:bg-gray-100 rounded-full p-2 md:p-3 shadow-lg transition-all duration-300 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-green-500 z-10"
                aria-label="Scroll left"
              >
                <ChevronLeft className="w-5 h-5 md:w-6 md:h-6 text-gray-700" />
              </button>
            )}

            {/* Scrollable Categories Container - Shows 5 cards at a time */}
            <div
              ref={categoryScrollRef}
              className="flex-1 flex gap-4 md:gap-6 overflow-x-hidden scrollbar-hide"
              style={{
                scrollbarWidth: 'none',
                msOverflowStyle: 'none'
              }}
            >
              {loading ? (
                // Category Skeleton Loaders - 5 cards
                Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={`skeleton-cat-${index}`}
                    className="flex-shrink-0 bg-white rounded-2xl p-5 animate-pulse shadow-md"
                    style={{
                      width: 'calc((100% - 4 * 1.5rem) / 5)',
                      minWidth: 'calc((100% - 4 * 1.5rem) / 5)'
                    }}
                  >
                    <div className="w-full h-40 bg-gray-200 rounded-xl mb-4"></div>
                    <div className="h-5 bg-gray-200 rounded mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  </div>
                ))
              ) : (
                infiniteCategories.map((category, index) => (
                  <Link
                    key={`${category.id}-${index}`}
                    to={`/category/${encodeURIComponent(category.name)}`}
                    className="flex-shrink-0 group bg-white rounded-2xl shadow-md hover:shadow-2xl transition-all duration-300 overflow-hidden transform hover:-translate-y-2"
                    style={{
                      width: 'calc((100% - 4 * 1.5rem) / 5)',
                      minWidth: 'calc((100% - 4 * 1.5rem) / 5)'
                    }}
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

            {/* Right Arrow */}
            {!loading && categories.length > 0 && (
              <button
                onClick={handleScrollRight}
                className="flex-shrink-0 bg-white hover:bg-gray-100 rounded-full p-2 md:p-3 shadow-lg transition-all duration-300 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-green-500 z-10"
                aria-label="Scroll right"
              >
                <ChevronRight className="w-5 h-5 md:w-6 md:h-6 text-gray-700" />
              </button>
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

      {/* All Products Section */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="mb-10">
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