import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  Plus,
  Filter,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Package,
  ShoppingCart,
  AlertTriangle,
  TrendingUp,
  Eye,
  X
} from 'lucide-react';
import AdminLayout from '../../components/admin/layout/AdminLayout';
import { getAdminProducts, deleteProduct } from '../../services/adminService';
import { Product } from '../../services/supabase';

// Constants
const ITEMS_PER_PAGE = 8;

// Helper functions
const truncateId = (id: string) => id.substring(0, 8);
const formatPrice = (price: number) => `₹${price.toLocaleString('en-IN')}`;

// Sub-components
interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  bgColor: string;
  iconColor: string;
  label: string;
  value: number | string;
  subtitle?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  icon: Icon,
  bgColor,
  iconColor,
  label,
  value,
  subtitle
}) => (
  <div className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow duration-200">
    <div className="flex items-center">
      <div className={`w-10 h-10 ${bgColor} rounded-lg flex items-center justify-center mr-3`}>
        <Icon className={`w-5 h-5 ${iconColor}`} />
      </div>
      <div>
        <p className="text-xs text-gray-600">{label}</p>
        <p className="text-xl font-bold text-gray-900">{value}</p>
        {subtitle && (
          <p className="text-xs text-gray-500">{subtitle}</p>
        )}
      </div>
    </div>
  </div>
);

interface ErrorAlertProps {
  message: string;
  onDismiss: () => void;
}

const ErrorAlert: React.FC<ErrorAlertProps> = ({ message, onDismiss }) => (
  <div className="bg-red-50 border-l-4 border-red-500 text-red-700 px-4 py-2 rounded-lg mb-4 flex items-center shadow-sm">
    <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0" />
    <span className="flex-1 text-sm">{message}</span>
    <button
      onClick={onDismiss}
      className="ml-4 text-red-700 hover:text-red-900 transition-colors"
      aria-label="Dismiss"
    >
      <X size={18} />
    </button>
  </div>
);

const LoadingSpinner = () => (
  <div className="p-6 flex justify-center">
    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary" />
  </div>
);

interface EmptyStateProps {
  searchTerm: string;
  selectedCategory: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({ searchTerm, selectedCategory }) => (
  <div className="p-8 text-center">
    <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
      <Package className="w-7 h-7 text-gray-400" />
    </div>
    <h3 className="text-base font-medium text-gray-900 mb-1">No products found</h3>
    <p className="text-sm text-gray-500 mb-4">
      {searchTerm || selectedCategory !== 'All'
        ? 'Try adjusting your search or filters.'
        : 'Get started by adding your first product.'}
    </p>
    {!searchTerm && selectedCategory === 'All' && (
      <Link
        to="/admin/products/add"
        className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors shadow-md text-sm"
      >
        <Plus size={16} className="mr-2" />
        Add First Product
      </Link>
    )}
  </div>
);

interface ProductImageProps {
  imageUrl?: string;
  productName: string;
}

const ProductImage: React.FC<ProductImageProps> = ({ imageUrl, productName }) => (
  imageUrl ? (
    <img
      src={imageUrl}
      alt={productName}
      className="w-10 h-10 object-cover rounded-lg shadow-sm"
      loading="lazy"
    />
  ) : (
    <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-lg flex items-center justify-center shadow-sm">
      <span className="text-xs font-bold text-white">{productName.substring(0, 2).toUpperCase()}</span>
    </div>
  )
);

const QuickAddModal = ({
  isOpen,
  onClose
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Quick Add Product</h2>
            <p className="text-xs text-gray-600 mt-0.5">Add essential product details quickly</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={22} />
          </button>
        </div>

        <div className="p-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <div className="flex items-start">
              <AlertCircle className="w-4 h-4 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-blue-800 font-medium">Quick Add Mode</p>
                <p className="text-xs text-blue-700 mt-0.5">
                  For full product configuration with images, descriptions, and advanced options,
                  use the "Add New Product" button to access the complete form.
                </p>
              </div>
            </div>
          </div>

          <form className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Product Name *
                </label>
                <input
                  type="text"
                  placeholder="Enter product name"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Category *
                </label>
                <select className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow">
                  <option value="">Select category</option>
                  <option value="Electronics">Electronics</option>
                  <option value="Clothing">Clothing</option>
                  <option value="Food">Food</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Price (₹) *
                </label>
                <input
                  type="number"
                  placeholder="0.00"
                  step="0.01"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Stock Status *
                </label>
                <select className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow">
                  <option value="true">In Stock</option>
                  <option value="false">Out of Stock</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                Cancel
              </button>
              <Link
                to="/admin/products/add"
                className="px-4 py-2 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
              >
                Full Form
              </Link>
              <button
                type="submit"
                className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium shadow-md"
              >
                Quick Add
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

const ProductsPage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [categories, setCategories] = useState<string[]>(['All']);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  // Fetch products on mount
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getAdminProducts();
        setProducts(data);

        // Extract unique categories
        const uniqueCategories = ['All', ...new Set(data.map(product => product.category))];
        setCategories(uniqueCategories as string[]);
      } catch (err) {
        console.error('Error fetching products:', err);
        setError('Failed to load products. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  // Handle product deletion
  const handleDeleteProduct = async (id: string, productName: string) => {
    if (confirm(`Are you sure you want to delete "${productName}"? This action cannot be undone.`)) {
      try {
        setDeleteLoading(id);
        setError(null);
        const success = await deleteProduct(id);

        if (success) {
          setProducts(prevProducts => prevProducts.filter(product => product.id !== id));
        } else {
          setError('Failed to delete product. Please try again.');
        }
      } catch (err) {
        console.error('Error deleting product:', err);
        setError('An error occurred while deleting the product.');
      } finally {
        setDeleteLoading(null);
      }
    }
  };

  // Memoized calculations
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        product.name.toLowerCase().includes(searchLower) ||
        (product.id && product.id.toLowerCase().includes(searchLower));
      const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  const stats = useMemo(() => ({
    total: products.length,
    inStock: products.filter(p => p.in_stock).length,
    outOfStock: products.filter(p => !p.in_stock).length,
    totalValue: products.reduce((sum, p) => sum + (p.price || 0), 0),
  }), [products]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const indexOfLastProduct = currentPage * ITEMS_PER_PAGE;
  const indexOfFirstProduct = indexOfLastProduct - ITEMS_PER_PAGE;
  const currentProducts = filteredProducts.slice(indexOfFirstProduct, indexOfLastProduct);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory]);

  return (
    <AdminLayout>
      {/* Fixed Header Section */}
      <div className="sticky top-0 z-10 bg-gray-50 pb-4 -mx-6 px-6 -mt-6 pt-6">
        {/* Compact Header */}
        <div className="mb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Products</h1>
            <p className="text-sm text-gray-600 mt-0.5">Manage your product inventory and catalog</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowQuickAdd(true)}
              className="inline-flex items-center px-4 py-2 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all duration-200 shadow-md hover:shadow-lg font-medium"
            >
              <Plus size={18} className="mr-1.5" />
              Quick Add
            </button>
            <Link
              to="/admin/products/add"
              className="inline-flex items-center px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 transition-all duration-200 shadow-md hover:shadow-lg font-medium"
            >
              <Plus size={18} className="mr-1.5" />
              Add Product
            </Link>
          </div>
        </div>

        {/* Error Alert */}
        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

        {/* Compact Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <StatCard
            icon={Package}
            bgColor="bg-blue-100"
            iconColor="text-blue-600"
            label="Total Products"
            value={stats.total}
          />
          <StatCard
            icon={ShoppingCart}
            bgColor="bg-green-100"
            iconColor="text-green-600"
            label="In Stock"
            value={stats.inStock}
            subtitle={`${((stats.inStock / (stats.total || 1)) * 100).toFixed(0)}% of total`}
          />
          <StatCard
            icon={AlertTriangle}
            bgColor="bg-red-100"
            iconColor="text-red-600"
            label="Out of Stock"
            value={stats.outOfStock}
            subtitle={stats.outOfStock > 0 ? "Needs attention" : "All good!"}
          />
          <StatCard
            icon={TrendingUp}
            bgColor="bg-purple-100"
            iconColor="text-purple-600"
            label="Total Value"
            value={formatPrice(stats.totalValue)}
          />
        </div>

        {/* Compact Filters and Search */}
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                <Search size={18} className="text-gray-400" />
              </span>
              <input
                type="text"
                placeholder="Search by product name or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-10 py-2 text-sm w-full rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow text-gray-900"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Filter size={16} className="text-gray-400" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="py-2 px-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow min-w-[140px]"
              >
                {categories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Products Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden mt-4">
        {loading ? (
          <LoadingSpinner />
        ) : filteredProducts.length === 0 ? (
          <EmptyState searchTerm={searchTerm} selectedCategory={selectedCategory} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                <tr className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Stock</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {currentProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50 transition-colors duration-150">
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-gray-500">
                        {truncateId(product.id)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <ProductImage
                          imageUrl={product.image}
                          productName={product.name}
                        />
                        <span className="text-sm font-semibold text-gray-900">
                          {product.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {product.category}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-semibold text-gray-900">
                        {formatPrice(product.price)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-600">
                        {product.in_stock ? 'In Stock' : 'Out of Stock'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                        ${product.in_stock ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {product.in_stock ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end items-center gap-2">
                        <Link
                          to={`/admin/products/${product.id}`}
                          className="text-gray-600 hover:text-gray-900 transition-colors p-1 hover:bg-gray-100 rounded"
                          aria-label={`View ${product.name}`}
                        >
                          <Eye size={16} />
                        </Link>
                        <Link
                          to={`/admin/products/edit/${product.id}`}
                          className="text-blue-600 hover:text-blue-800 transition-colors p-1 hover:bg-blue-50 rounded"
                          aria-label={`Edit ${product.name}`}
                        >
                          <Edit size={16} />
                        </Link>
                        <button
                          onClick={() => handleDeleteProduct(product.id, product.name)}
                          disabled={deleteLoading === product.id}
                          className={`text-red-600 hover:text-red-800 transition-colors p-1 hover:bg-red-50 rounded
                            ${deleteLoading === product.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                          aria-label={`Delete ${product.name}`}
                        >
                          {deleteLoading === product.id ? (
                            <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 size={16} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Compact Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <div className="text-xs text-gray-600">
              Showing <span className="font-medium">{indexOfFirstProduct + 1}</span> to{' '}
              <span className="font-medium">{Math.min(indexOfLastProduct, filteredProducts.length)}</span> of{' '}
              <span className="font-medium">{filteredProducts.length}</span> products
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className={`p-1.5 rounded-lg transition-all duration-200
                  ${currentPage === 1
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-700 hover:bg-gray-200'}`}
                aria-label="Previous page"
              >
                <ChevronLeft size={16} />
              </button>

              <div className="flex gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-2.5 py-1 rounded-lg transition-all duration-200 text-xs font-medium
                      ${currentPage === page
                        ? 'bg-primary text-white shadow-md'
                        : 'text-gray-700 hover:bg-gray-200'}`}
                    aria-label={`Page ${page}`}
                    aria-current={currentPage === page ? 'page' : undefined}
                  >
                    {page}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className={`p-1.5 rounded-lg transition-all duration-200
                  ${currentPage === totalPages
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-700 hover:bg-gray-200'}`}
                aria-label="Next page"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quick Add Modal */}
      <QuickAddModal isOpen={showQuickAdd} onClose={() => setShowQuickAdd(false)} />
    </AdminLayout>
  );
};

export default ProductsPage;