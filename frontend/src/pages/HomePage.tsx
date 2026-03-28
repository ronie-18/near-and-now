import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ProductGrid from '../components/products/ProductGrid';
import { getAllProducts, getAllCategories } from '../services/supabase';
import { Product, Category } from '../services/supabase';
import { useNotification } from '../context/NotificationContext';

const HomePage = () => {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [displayedProducts, setDisplayedProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const { showNotification } = useNotification();
  const navigate = useNavigate();

  const MAX_PRODUCTS_ON_HOME = 15;

  // Fetch all products and categories on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setCategoriesLoading(true);

        console.log('🔄 Starting to fetch data...');

        let products: Product[] = [];
        let categoriesData: Category[] = [];

        try {
          console.log('📦 Fetching products...');
          products = await getAllProducts();
          console.log('✅ Products fetched successfully:', products.length);
          setAllProducts(products);
        } catch (productError) {
          console.error('❌ Error fetching products:', productError);
          showNotification('Failed to load products. Please try again.', 'error');
        }

        try {
          console.log('🏷️ Fetching categories...');
          categoriesData = await getAllCategories();
          console.log('✅ Categories fetched successfully:', categoriesData.length);
          setCategories(categoriesData);
        } catch (categoryError) {
          console.error('❌ Error fetching categories:', categoryError);
          console.warn('Categories failed to load, continuing without them');
        }

      } catch (error) {
        console.error('❌ General error fetching data:', error);
        showNotification('Failed to load data. Please try again.', 'error');
      } finally {
        setLoading(false);
        setCategoriesLoading(false);
      }
    };

    fetchData();
  }, [showNotification]);

  // Randomize and limit displayed products to MAX_PRODUCTS_ON_HOME
  useEffect(() => {
    const shuffleArray = <T,>(array: T[]): T[] => {
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    };

    const randomized = shuffleArray(allProducts);
    setDisplayedProducts(randomized.slice(0, MAX_PRODUCTS_ON_HOME));
  }, [allProducts]);

  const handleCategoryClick = (categoryName: string) => {
    navigate(`/shop?category=${encodeURIComponent(categoryName)}`);
  };

  return (
    <>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-surface py-20 lg:py-32">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 items-center gap-12">
          <div className="z-10">
            <span className="inline-block px-3 py-1 rounded-full bg-tertiary-container text-on-tertiary-container text-xs font-bold font-headline uppercase tracking-wider mb-6">
              Ultra-Fast Delivery
            </span>
            <h1 className="font-headline text-5xl lg:text-7xl font-extrabold text-on-surface leading-[1.1] tracking-tight mb-6">
              Local shops, delivered in <span className="text-primary">minutes.</span>
            </h1>
            <p className="text-lg text-on-surface-variant max-w-lg mb-10 leading-relaxed">
              Your neighborhood favorites, curated and delivered with concierge-level precision. From artisan bakeries to fresh organic produce.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => navigate('/shop')}
                className="bg-primary hover:bg-primary-dim text-white px-8 py-4 rounded-lg font-semibold flex items-center justify-center gap-2 shadow-lg shadow-primary/20 transition-all active:scale-95"
              >
                Start Shopping
                <span className="material-symbols-outlined">arrow_forward</span>
              </button>
              <button className="bg-surface-container-high text-on-surface-variant px-8 py-4 rounded-lg font-semibold hover:bg-surface-container-highest transition-all">
                View Offers
              </button>
            </div>
          </div>
          <div className="relative group">
            <div className="absolute -top-10 -right-10 w-64 h-64 bg-primary-container/30 rounded-full blur-3xl group-hover:bg-primary-container/50 transition-colors"></div>
            <div className="relative aspect-square rounded-2xl overflow-hidden shadow-2xl">
              <img
                alt="Premium Grocery Delivery"
                className="w-full h-full object-cover transform transition-transform duration-700 group-hover:scale-105"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuC_qQW37pOOAL9ARm5wXE51zKPsZpyAccpATZOhJCVB90ak8q5rnTcQa0Ep5bimZFfFwcV-tMI07CmsSVR94rhCpaGojj6D1LyI_R6bixA4zYeBoV1tIoqkyQP1RUOU76zu5M6h1FemGe7BDfkIT-JJfqEBRv7c-6k41DuS_GAkoeRhw_JfHAoF42Dg8OGdrALlCcnrF--ZqjAayRc665IJ8PmNNP_nCvWTVGsNRkdUBYoZ7kJvS_Tpg3U6CsBlcykzfbqou3UogyjN"
              />
              <div className="absolute bottom-6 left-6 right-6 p-6 glass-nav bg-white/20 rounded-xl border border-white/30">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white text-xs font-medium uppercase tracking-widest opacity-80">Recent delivery</p>
                    <p className="text-white font-headline font-bold text-lg">Fresh Harvest Basket</p>
                  </div>
                  <div className="bg-primary p-2 rounded-lg text-white">
                    <span className="material-symbols-outlined">bolt</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="py-24 bg-surface-container-low">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
            <div>
              <h2 className="font-headline text-3xl font-bold text-on-surface mb-2">Shop by Category</h2>
              <p className="text-on-surface-variant">Discover fresh products organized by category.</p>
            </div>
            <button
              onClick={() => navigate('/shop')}
              className="text-primary font-semibold flex items-center gap-1 hover:underline underline-offset-4 transition-all"
            >
              View all categories <span className="material-symbols-outlined text-sm">open_in_new</span>
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {categoriesLoading ? (
              // Category Skeleton Loaders
              Array.from({ length: 6 }).map((_, index) => (
                <div key={`category-skeleton-${index}`} className="bg-surface-container-lowest p-4 rounded-xl shadow-sm animate-pulse">
                  <div className="aspect-square rounded-lg bg-surface-container mb-4"></div>
                  <div className="h-4 bg-surface-container rounded mb-2"></div>
                  <div className="h-3 bg-surface-container rounded"></div>
                </div>
              ))
            ) : (
              categories.slice(0, 6).map((category) => (
                <div
                  key={category.id}
                  onClick={() => handleCategoryClick(category.name)}
                  className="bg-surface-container-lowest p-4 rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer group"
                >
                  <div className="aspect-square rounded-lg overflow-hidden bg-surface-container mb-4 relative">
                    <img
                      alt={category.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      src={category.image_url || `https://via.placeholder.com/300x300?text=${encodeURIComponent(category.name)}`}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = `https://via.placeholder.com/300x300?text=${encodeURIComponent(category.name)}`;
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    <div className="absolute bottom-2 left-2 right-2 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="material-symbols-outlined text-sm">arrow_forward</span>
                    </div>
                  </div>
                  <h4 className="font-bold text-sm text-on-surface mb-1 truncate">{category.name}</h4>
                  <p className="text-xs text-on-surface-variant truncate">{category.description || 'Browse products'}</p>
                </div>
              ))
            )}
          </div>
          {/* Show More Categories Button */}
          {!categoriesLoading && categories.length > 6 && (
            <div className="text-center mt-8">
              <button
                onClick={() => navigate('/shop')}
                className="inline-flex items-center gap-2 text-primary font-semibold hover:underline underline-offset-4 transition-all"
              >
                View all {categories.length} categories
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Essential Groceries Grid */}
      <section className="py-24 bg-surface">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-12">
            <h2 className="font-headline text-3xl font-bold text-on-surface mb-2">Essential Groceries</h2>
            <p className="text-on-surface-variant">The staples you need, delivered with care.</p>
          </div>
          <ProductGrid
            products={displayedProducts}
            loading={loading}
            gridClassName="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6"
          />
          {/* Show More Products Button */}
          {!loading && allProducts.length > MAX_PRODUCTS_ON_HOME && (
            <div className="text-center mt-12">
              <button
                onClick={() => navigate('/shop')}
                className="inline-flex items-center gap-3 bg-gradient-to-r from-primary to-secondary hover:from-secondary hover:to-primary text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
              >
                <span className="material-symbols-outlined">shopping_bag</span>
                Show More Products
                <span className="material-symbols-outlined">arrow_forward</span>
              </button>
              <p className="text-on-surface-variant mt-4 text-sm">
                View all {allProducts.length} products in our shop
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  );
};

export default HomePage;