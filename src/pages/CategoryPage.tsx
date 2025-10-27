import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import ProductGrid from '../components/products/ProductGrid';
import { getProductsByCategory, Product } from '../services/supabase';
import { useNotification } from '../context/NotificationContext';
import { formatCategoryName } from '../utils/formatters';

const CategoryPage = () => {
  const { categoryId } = useParams<{ categoryId: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<string>('default');
  const { showNotification } = useNotification();

  // Fetch products by category
  useEffect(() => {
    const fetchProducts = async () => {
      if (!categoryId) return;
      
      try {
        setLoading(true);
        const categoryProducts = await getProductsByCategory(categoryId);
        setProducts(categoryProducts);
      } catch (error) {
        console.error('Error fetching products:', error);
        showNotification('Failed to load products. Please try again.', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, [categoryId, showNotification]);

  // Apply sorting
  const sortedProducts = [...products].sort((a, b) => {
    switch (sortBy) {
      case 'price-asc':
        return a.price - b.price;
      case 'price-desc':
        return b.price - a.price;
      case 'name-asc':
        return a.name.localeCompare(b.name);
      case 'name-desc':
        return b.name.localeCompare(a.name);
      default:
        // Default sorting (newest first based on id)
        return b.id.localeCompare(a.id);
    }
  });

  // Handle sort change
  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortBy(e.target.value);
  };

  return (
    <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">
          {categoryId ? formatCategoryName(categoryId) : 'Category'}
        </h1>
        
        <p className="text-gray-600 mb-8">
          Browse our selection of {categoryId ? formatCategoryName(categoryId.toLowerCase()) : 'products'}
        </p>
        
        {/* Sort and Filter Bar */}
        <div className="flex justify-between items-center mb-6 bg-white rounded-lg shadow-md p-4">
          <div>
            <span className="text-gray-600">
              {loading ? 'Loading products...' : `${products.length} products found`}
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
        <ProductGrid products={sortedProducts} loading={loading} />
      </div>
  );
};

export default CategoryPage;
