import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import ProductGrid from '../components/products/ProductGrid';
import { getProductsByCategory, Product } from '../services/supabase';
import { useNotification } from '../context/NotificationContext';
import { formatCategoryName } from '../utils/formatters';

type SortOption = 'default' | 'price-asc' | 'price-desc' | 'name-asc' | 'name-desc';

const CategoryPage = () => {
  const { categoryId } = useParams<{ categoryId: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('default');
  const { showNotification } = useNotification();

  // Fetch products by category
  useEffect(() => {
    const fetchProducts = async () => {
      if (!categoryId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        console.log('🔍 CategoryPage - Fetching products for category:', categoryId);

        const categoryProducts = await getProductsByCategory(categoryId);
        console.log('📦 CategoryPage - Products found:', categoryProducts.length);

        setProducts(categoryProducts);
      } catch (err) {
        const errorMessage = 'Failed to load products. Please try again.';
        console.error('Error fetching products:', err);
        setError(errorMessage);
        showNotification(errorMessage, 'error');
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId]);

  // Memoized sorting function
  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) => {
      switch (sortBy) {
        case 'price-asc':
          return a.price - b.price;
        case 'price-desc':
          return b.price - a.price;
        case 'name-asc':
          return a.name.localeCompare(b.name);
        case 'name-desc':
          return b.name.localeCompare(a.name);
        case 'default':
        default:
          return b.id.localeCompare(a.id);
      }
    });
  }, [products, sortBy]);

  // Memoized category name
  const categoryName = useMemo(
    () => categoryId ? formatCategoryName(categoryId) : 'Category',
    [categoryId]
  );

  // Handle sort change with useCallback
  const handleSortChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortBy(e.target.value as SortOption);
  }, []);

  // Product count text
  const productCountText = useMemo(() => {
    if (loading) return 'Loading products...';
    if (error) return 'Failed to load products';

    const count = products.length;
    return count === 1 ? '1 product found' : `${count} products found`;
  }, [loading, error, products.length]);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">
          {categoryName}
        </h1>

        <p className="text-gray-600">
          Browse our selection of {categoryName.toLowerCase()}
        </p>
      </header>

      {/* Sort and Filter Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 bg-white rounded-lg shadow-md p-4">
        <div>
          <span className="text-gray-600 font-medium">
            {productCountText}
          </span>
        </div>

        <div className="flex items-center w-full sm:w-auto">
          <label htmlFor="sort-by" className="text-gray-600 mr-2 whitespace-nowrap">
            Sort by:
          </label>
          <select
            id="sort-by"
            value={sortBy}
            onChange={handleSortChange}
            disabled={loading || error !== null}
            className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors w-full sm:w-auto"
            aria-label="Sort products"
          >
            <option value="default">Newest</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="name-asc">Name: A to Z</option>
            <option value="name-desc">Name: Z to A</option>
          </select>
        </div>
      </div>

      {/* Products Grid */}
      <ProductGrid products={sortedProducts} loading={loading} />

      {/* Empty State */}
      {!loading && !error && products.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">
            No products found in this category.
          </p>
        </div>
      )}
    </div>
  );
};

export default CategoryPage;