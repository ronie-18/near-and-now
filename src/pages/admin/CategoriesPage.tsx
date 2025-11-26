import { useState, useEffect, useMemo } from 'react';
import AdminLayout from '../../components/admin/layout/AdminLayout';
import {
  Search,
  Plus,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Layers,
  AlertCircle,
  Package,
  TrendingUp,
  Grid
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { getCategories, deleteCategory, getProductCountsByCategory } from '../../services/adminService';
import { Category } from '../../services/adminService';

// Constants
const ITEMS_PER_PAGE = 8;

// Helper function
const truncateId = (id: string) => id.substring(0, 8);

// Sub-components
const StatCard = ({
  icon: Icon,
  bgColor,
  iconColor,
  label,
  value,
  trend
}: {
  icon: any;
  bgColor: string;
  iconColor: string;
  label: string;
  value: number;
  trend?: string;
}) => (
  <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow duration-200">
    <div className="flex items-center justify-between">
      <div className="flex items-center">
        <div className={`w-12 h-12 ${bgColor} rounded-lg flex items-center justify-center mr-4`}>
          <Icon className={`w-6 h-6 ${iconColor}`} />
        </div>
        <div>
          <p className="text-sm text-gray-600">{label}</p>
          <p className="text-2xl font-bold text-gray-800">{value}</p>
        </div>
      </div>
      {trend && (
        <div className="flex items-center text-green-600 text-sm font-medium">
          <TrendingUp size={16} className="mr-1" />
          {trend}
        </div>
      )}
    </div>
  </div>
);

const ErrorAlert = ({ message, onDismiss }: { message: string; onDismiss: () => void }) => (
  <div className="bg-red-50 border-l-4 border-red-500 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-center shadow-sm animate-in slide-in-from-top duration-300">
    <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0" />
    <span className="flex-1">{message}</span>
    <button
      onClick={onDismiss}
      className="ml-4 text-red-700 hover:text-red-900 transition-colors"
      aria-label="Dismiss"
    >
      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
      </svg>
    </button>
  </div>
);

const LoadingSpinner = () => (
  <div className="p-8 flex justify-center">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
  </div>
);

const EmptyState = ({ searchTerm }: { searchTerm: string }) => (
  <div className="p-12 text-center">
    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
      <Grid className="w-8 h-8 text-gray-400" />
    </div>
    <h3 className="text-lg font-medium text-gray-900 mb-2">No categories found</h3>
    <p className="text-gray-500 mb-6">
      {searchTerm
        ? 'Try a different search term or clear your filters.'
        : 'Get started by creating your first category.'}
    </p>
    {!searchTerm && (
      <Link
        to="/admin/categories/add"
        className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
      >
        <Plus size={18} className="mr-2" />
        Add First Category
      </Link>
    )}
  </div>
);

const CategoryImage = ({ imageUrl, categoryName }: { imageUrl?: string; categoryName: string }) => (
  imageUrl ? (
    <img
      src={imageUrl}
      alt={categoryName}
      className="w-12 h-12 object-cover rounded-lg shadow-sm"
      loading="lazy"
    />
  ) : (
    <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-purple-500 rounded-lg flex items-center justify-center shadow-sm">
      <span className="text-sm font-bold text-white">{categoryName.substring(0, 2).toUpperCase()}</span>
    </div>
  )
);

const CategoriesPage = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [productCounts, setProductCounts] = useState<Record<string, number>>({});

  // Fetch categories on mount
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getCategories();
        setCategories(data);

        // Get actual product counts for each category from database
        const countsByCategory = await getProductCountsByCategory();

        // Map category IDs to category names
        const counts: Record<string, number> = {};
        data.forEach(category => {
          counts[category.id] = countsByCategory[category.name] || 0;
        });
        setProductCounts(counts);
      } catch (err) {
        setError('Failed to load categories. Please try again.');
        console.error('Error fetching categories:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, []);

  // Handle category deletion
  const handleDeleteCategory = async (id: string, categoryName: string) => {
    const hasProducts = productCounts[id] > 0;
    const confirmMessage = hasProducts
      ? `This category "${categoryName}" has ${productCounts[id]} product(s). Are you sure you want to delete it? This action cannot be undone.`
      : `Are you sure you want to delete "${categoryName}"? This action cannot be undone.`;

    if (confirm(confirmMessage)) {
      try {
        setDeleteLoading(id);
        setError(null);
        const success = await deleteCategory(id);

        if (success) {
          setCategories(prevCategories => prevCategories.filter(category => category.id !== id));

          // Refresh product counts after deletion
          const countsByCategory = await getProductCountsByCategory();
          const counts: Record<string, number> = {};
          categories.filter(cat => cat.id !== id).forEach(category => {
            counts[category.id] = countsByCategory[category.name] || 0;
          });
          setProductCounts(counts);
        } else {
          setError('Failed to delete category. Please try again.');
        }
      } catch (err) {
        setError('An error occurred while deleting the category.');
        console.error('Error deleting category:', err);
      } finally {
        setDeleteLoading(null);
      }
    }
  };

  // Memoized calculations
  const filteredCategories = useMemo(() => {
    return categories.filter(category => {
      const searchLower = searchTerm.toLowerCase();
      return (
        category.name.toLowerCase().includes(searchLower) ||
        (category.description?.toLowerCase().includes(searchLower) ?? false) ||
        category.id.toLowerCase().includes(searchLower)
      );
    });
  }, [categories, searchTerm]);

  const stats = useMemo(() => ({
    totalCategories: categories.length,
    totalProducts: Object.values(productCounts).reduce((sum, count) => sum + count, 0),
    avgProductsPerCategory: categories.length > 0
      ? Math.round(Object.values(productCounts).reduce((sum, count) => sum + count, 0) / categories.length)
      : 0,
  }), [categories, productCounts]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredCategories.length / ITEMS_PER_PAGE);
  const indexOfLastCategory = currentPage * ITEMS_PER_PAGE;
  const indexOfFirstCategory = indexOfLastCategory - ITEMS_PER_PAGE;
  const currentCategories = filteredCategories.slice(indexOfFirstCategory, indexOfLastCategory);

  // Reset to first page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return (
    <AdminLayout>
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Categories</h1>
          <p className="text-gray-600 mt-1">Organize and manage your product categories</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/admin/categories/add"
            className="inline-flex items-center px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all duration-200 shadow-md hover:shadow-lg font-medium"
          >
            <Plus size={20} className="mr-2" />
            Add Category
          </Link>
        </div>
      </div>

      {/* Error Alert */}
      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <StatCard
          icon={Layers}
          bgColor="bg-blue-100"
          iconColor="text-blue-600"
          label="Total Categories"
          value={stats.totalCategories}
        />
        <StatCard
          icon={Package}
          bgColor="bg-green-100"
          iconColor="text-green-600"
          label="Total Products"
          value={stats.totalProducts}
        />
        <StatCard
          icon={Grid}
          bgColor="bg-purple-100"
          iconColor="text-purple-600"
          label="Avg Products/Category"
          value={stats.avgProductsPerCategory}
        />
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-4">
            <Search size={20} className="text-gray-400" />
          </span>
          <input
            type="text"
            placeholder="Search by category name, description, or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-12 pr-4 py-3 w-full rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-shadow text-gray-900 placeholder-gray-500"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-400 hover:text-gray-600"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Categories Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {loading ? (
          <LoadingSpinner />
        ) : filteredCategories.length === 0 ? (
          <EmptyState searchTerm={searchTerm} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                <tr className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <th className="px-6 py-4">ID</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4">Description</th>
                  <th className="px-6 py-4">Products</th>
                  <th className="px-6 py-4">Display Order</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {currentCategories.map((category) => (
                  <tr
                    key={category.id}
                    className="hover:bg-gray-50 transition-colors duration-150"
                  >
                    <td className="px-6 py-4">
                      <span className="text-sm font-mono text-gray-500">
                        {truncateId(category.id)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <CategoryImage
                          imageUrl={category.image_url}
                          categoryName={category.name}
                        />
                        <span className="text-sm font-semibold text-gray-900">
                          {category.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600 max-w-xs line-clamp-2">
                        {category.description || (
                          <span className="text-gray-400 italic">No description</span>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`
                          inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium
                          ${productCounts[category.id] > 0
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-600'}
                        `}>
                          {productCounts[category.id] || 0}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600">
                        {category.display_order || '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end items-center gap-3">
                        <Link
                          to={`/admin/categories/edit/${category.id}`}
                          className="text-blue-600 hover:text-blue-800 transition-colors p-1 hover:bg-blue-50 rounded"
                          aria-label={`Edit ${category.name}`}
                        >
                          <Edit size={18} />
                        </Link>
                        <button
                          onClick={() => handleDeleteCategory(category.id, category.name)}
                          disabled={deleteLoading === category.id}
                          className={`
                            text-red-600 hover:text-red-800 transition-colors p-1 hover:bg-red-50 rounded
                            ${deleteLoading === category.id ? 'opacity-50 cursor-not-allowed' : ''}
                          `}
                          aria-label={`Delete ${category.name}`}
                        >
                          {deleteLoading === category.id ? (
                            <div className="w-[18px] h-[18px] border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 size={18} />
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing <span className="font-medium">{indexOfFirstCategory + 1}</span> to{' '}
              <span className="font-medium">{Math.min(indexOfLastCategory, filteredCategories.length)}</span> of{' '}
              <span className="font-medium">{filteredCategories.length}</span> categories
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className={`
                  p-2 rounded-lg transition-all duration-200
                  ${currentPage === 1
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-700 hover:bg-gray-200'}
                `}
                aria-label="Previous page"
              >
                <ChevronLeft size={18} />
              </button>

              <div className="flex gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`
                      px-3 py-1.5 rounded-lg transition-all duration-200 text-sm font-medium
                      ${currentPage === page
                        ? 'bg-primary text-white shadow-md'
                        : 'text-gray-700 hover:bg-gray-200'}
                    `}
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
                className={`
                  p-2 rounded-lg transition-all duration-200
                  ${currentPage === totalPages
                    ? 'text-gray-400 cursor-not-allowed'
                    : 'text-gray-700 hover:bg-gray-200'}
                `}
                aria-label="Next page"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default CategoriesPage;