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
  X,
  Loader2,
  RefreshCw,
  ImageOff,
  Check,
  FolderOpen
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { getCategories, deleteCategory, getProductCountsByCategory, Category } from '../../services/adminService';

// Constants
const ITEMS_PER_PAGE = 10;

// Helper function
const truncateId = (id: string) => id.substring(0, 8);

// Modern Stat Card
interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  label: string;
  value: number | string;
}

const StatCard: React.FC<StatCardProps> = ({ icon: Icon, gradient, label, value }) => (
  <div className={`relative overflow-hidden rounded-2xl ${gradient} p-5 text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1`}>
    <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
    <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-20 h-20 bg-white/10 rounded-full blur-xl" />
    <div className="relative z-10">
      <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center mb-3">
        <Icon className="w-6 h-6" />
      </div>
      <p className="text-white/80 text-sm font-medium">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  </div>
);

// Error Alert
const ErrorAlert = ({ message, onDismiss }: { message: string; onDismiss: () => void }) => (
  <div className="bg-gradient-to-r from-red-500 to-rose-500 text-white px-5 py-4 rounded-xl mb-6 flex items-center shadow-lg">
    <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center mr-4">
      <AlertCircle className="w-5 h-5" />
    </div>
    <span className="flex-1 font-medium">{message}</span>
    <button onClick={onDismiss} className="ml-4 p-2 hover:bg-white/20 rounded-lg transition-colors">
      <X size={18} />
    </button>
  </div>
);

// Success Alert
const SuccessAlert = ({ message, onDismiss }: { message: string; onDismiss: () => void }) => (
  <div className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-5 py-4 rounded-xl mb-6 flex items-center shadow-lg">
    <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center mr-4">
      <Check className="w-5 h-5" />
    </div>
    <span className="flex-1 font-medium">{message}</span>
    <button onClick={onDismiss} className="ml-4 p-2 hover:bg-white/20 rounded-lg transition-colors">
      <X size={18} />
    </button>
  </div>
);

// Loading Spinner
const LoadingSpinner = () => (
  <div className="p-16 flex flex-col items-center justify-center">
    <div className="relative">
      <div className="w-16 h-16 border-4 border-violet-200 rounded-full" />
      <div className="absolute top-0 left-0 w-16 h-16 border-4 border-violet-500 rounded-full animate-spin border-t-transparent" />
    </div>
    <p className="mt-4 text-gray-500 font-medium">Loading categories...</p>
  </div>
);

// Empty State
const EmptyState = ({ searchTerm }: { searchTerm: string }) => (
  <div className="p-16 text-center">
    <div className="w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
      <FolderOpen className="w-12 h-12 text-gray-400" />
    </div>
    <h3 className="text-xl font-bold text-gray-800 mb-2">No categories found</h3>
    <p className="text-gray-500 mb-6 max-w-md mx-auto">
      {searchTerm
        ? 'Try a different search term or clear your filters.'
        : 'Get started by creating your first category to organize products.'}
    </p>
    {!searchTerm && (
      <Link
        to="/admin/categories/add"
        className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-violet-500 to-purple-500 text-white rounded-xl hover:from-violet-600 hover:to-purple-600 transition-all shadow-lg hover:shadow-xl font-semibold"
      >
        <Plus size={20} className="mr-2" />
        Create First Category
      </Link>
    )}
  </div>
);

// Category Image
const CategoryImage = ({ imageUrl, categoryName }: { imageUrl?: string; categoryName: string }) => {
  const [imgError, setImgError] = useState(false);

  if (imageUrl && !imgError) {
    return (
      <img
        src={imageUrl}
        alt={categoryName}
        className="w-14 h-14 object-cover rounded-xl shadow-md ring-2 ring-white"
        loading="lazy"
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div className="w-14 h-14 bg-gradient-to-br from-violet-400 via-purple-500 to-indigo-500 rounded-xl flex items-center justify-center shadow-md ring-2 ring-white">
      {imgError ? (
        <ImageOff className="w-6 h-6 text-white/80" />
      ) : (
        <span className="text-sm font-bold text-white">{categoryName.substring(0, 2).toUpperCase()}</span>
      )}
    </div>
  );
};

const CategoriesPage = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [productCounts, setProductCounts] = useState<Record<string, number>>({});

  // Fetch data
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getCategories();
      setCategories(data);

      const countsByCategory = await getProductCountsByCategory();
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

  useEffect(() => {
    fetchData();
  }, []);

  // Handle category deletion
  const handleDeleteCategory = async (id: string, categoryName: string) => {
    const hasProducts = productCounts[id] > 0;
    const confirmMessage = hasProducts
      ? `This category "${categoryName}" has ${productCounts[id]} product(s). Are you sure you want to delete it?`
      : `Are you sure you want to delete "${categoryName}"?`;

    if (confirm(confirmMessage)) {
      try {
        setDeleteLoading(id);
        setError(null);
        const deleted = await deleteCategory(id);

        if (deleted) {
          setCategories(prev => prev.filter(cat => cat.id !== id));
          setSuccess(`"${categoryName}" has been deleted successfully.`);
          setTimeout(() => setSuccess(null), 3000);
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

  // Filtered categories
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

  // Stats
  const stats = useMemo(() => ({
    totalCategories: categories.length,
    totalProducts: Object.values(productCounts).reduce((sum, count) => sum + count, 0),
  }), [categories, productCounts]);

  // Pagination
  const totalPages = Math.ceil(filteredCategories.length / ITEMS_PER_PAGE);
  const indexOfLastCategory = currentPage * ITEMS_PER_PAGE;
  const indexOfFirstCategory = indexOfLastCategory - ITEMS_PER_PAGE;
  const currentCategories = filteredCategories.slice(indexOfFirstCategory, indexOfLastCategory);

  // Reset page on search
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Categories</h1>
            <p className="text-gray-500 mt-1">Organize and manage your product categories</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchData}
              className="p-3 text-gray-600 bg-white rounded-xl hover:bg-gray-50 transition-colors shadow-sm border border-gray-200"
              title="Refresh"
            >
              <RefreshCw size={20} />
            </button>
            <Link
              to="/admin/categories/add"
              className="inline-flex items-center px-5 py-3 bg-gradient-to-r from-violet-500 to-purple-500 text-white rounded-xl hover:from-violet-600 hover:to-purple-600 transition-all shadow-lg hover:shadow-xl font-semibold"
            >
              <Plus size={18} className="mr-2" />
              Add Category
            </Link>
          </div>
        </div>

        {/* Alerts */}
        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}
        {success && <SuccessAlert message={success} onDismiss={() => setSuccess(null)} />}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <StatCard
            icon={Layers}
            gradient="bg-gradient-to-br from-violet-500 to-purple-600"
            label="Total Categories"
            value={stats.totalCategories}
          />
          <StatCard
            icon={Package}
            gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
            label="Total Products"
            value={stats.totalProducts}
          />
        </div>

        {/* Search */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="relative">
            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search categories by name, description, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-12 py-3 rounded-xl border-2 border-gray-200 focus:border-violet-500 focus:ring-0 transition-colors text-gray-800"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Categories Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <LoadingSpinner />
          ) : filteredCategories.length === 0 ? (
            <EmptyState searchTerm={searchTerm} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                  <tr className="text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    <th className="px-6 py-4">ID</th>
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4">Description</th>
                    <th className="px-6 py-4">Products</th>
                    <th className="px-6 py-4">Order</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {currentCategories.map((category) => (
                    <tr key={category.id} className="group hover:bg-gradient-to-r hover:from-gray-50 hover:to-violet-50/30 transition-all duration-200">
                      <td className="px-6 py-4">
                        <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">
                          {truncateId(category.id)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <CategoryImage imageUrl={category.image_url} categoryName={category.name} />
                          <span className="font-semibold text-gray-800 group-hover:text-violet-600 transition-colors">
                            {category.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600 max-w-xs line-clamp-2">
                          {category.description || <span className="text-gray-400 italic">No description</span>}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold
                          ${productCounts[category.id] > 0
                            ? 'bg-gradient-to-r from-emerald-100 to-teal-100 text-emerald-700'
                            : 'bg-gray-100 text-gray-500'}`}>
                          {productCounts[category.id] || 0} products
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-gray-600">
                          {category.display_order || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link
                            to={`/admin/categories/edit/${category.id}`}
                            className="p-2.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-all"
                            title="Edit"
                          >
                            <Edit size={18} />
                          </Link>
                          <button
                            onClick={() => handleDeleteCategory(category.id, category.name)}
                            disabled={deleteLoading === category.id}
                            className="p-2.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all disabled:opacity-50"
                            title="Delete"
                          >
                            {deleteLoading === category.id ? (
                              <Loader2 size={18} className="animate-spin" />
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
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-gray-600">
                Showing <span className="font-semibold text-gray-800">{indexOfFirstCategory + 1}</span> to{' '}
                <span className="font-semibold text-gray-800">{Math.min(indexOfLastCategory, filteredCategories.length)}</span> of{' '}
                <span className="font-semibold text-gray-800">{filteredCategories.length}</span> categories
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft size={20} />
                </button>
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let page: number;
                    if (totalPages <= 5) {
                      page = i + 1;
                    } else if (currentPage <= 3) {
                      page = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      page = totalPages - 4 + i;
                    } else {
                      page = currentPage - 2 + i;
                    }
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`w-10 h-10 rounded-xl font-semibold transition-all
                          ${currentPage === page
                            ? 'bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-lg'
                            : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                      >
                        {page}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default CategoriesPage;
