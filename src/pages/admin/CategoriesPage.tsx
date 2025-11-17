import { useState, useEffect } from 'react';
import AdminLayout from '../../components/admin/layout/AdminLayout';
import { Search, Plus, Edit, Trash2, ChevronLeft, ChevronRight, Layers, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getCategories, deleteCategory, getProductCountsByCategory } from '../../services/adminService';
import { Category } from '../../services/adminService';


const CategoriesPage = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [productCounts, setProductCounts] = useState<Record<string, number>>({});
  const itemsPerPage = 8;

  // Fetch categories from Supabase
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoading(true);
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
  const handleDeleteCategory = async (id: string) => {
    if (confirm('Are you sure you want to delete this category? This action cannot be undone.')) {
      try {
        setDeleteLoading(id);
        const success = await deleteCategory(id);
        if (success) {
          setCategories(categories.filter(category => category.id !== id));
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

  // Filter categories based on search term
  const filteredCategories = categories.filter(category => {
    const matchesSearch = category.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (category.description?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false) ||
                         category.id.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  // Pagination
  const indexOfLastCategory = currentPage * itemsPerPage;
  const indexOfFirstCategory = indexOfLastCategory - itemsPerPage;
  const currentCategories = filteredCategories.slice(indexOfFirstCategory, indexOfLastCategory);
  const totalPages = Math.ceil(filteredCategories.length / itemsPerPage);

  // Removed status filter as it doesn't exist in the database

  return (
    <AdminLayout>
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Categories</h1>
          <p className="text-gray-600">Manage product categories</p>
        </div>
        <div className="mt-4 md:mt-0">
          <Link
            to="/admin/categories/add"
            className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
          >
            <Plus size={18} className="mr-2" />
            Add New Category
          </Link>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-center">
          <AlertCircle className="w-5 h-5 mr-2" />
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-700 hover:text-red-900"
          >
            <span className="sr-only">Dismiss</span>
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      {/* Category Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
              <Layers className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Categories</p>
              <p className="text-xl font-bold text-gray-800">{categories.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mr-4">
              <Layers className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Products</p>
              <p className="text-xl font-bold text-gray-800">
                {Object.values(productCounts).reduce((sum, count) => sum + count, 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
              <Search size={18} className="text-gray-400" />
            </span>
            <input
              type="text"
              placeholder="Search categories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 w-full rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Categories Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {loading ? (
          <div className="p-8 flex justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500">No categories found. {searchTerm && 'Try a different search term.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <th className="px-6 py-3">ID</th>
                  <th className="px-6 py-3">Category</th>
                  <th className="px-6 py-3">Description</th>
                  <th className="px-6 py-3">Products</th>
                  <th className="px-6 py-3">Display Order</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {currentCategories.map((category) => (
                  <tr key={category.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-800">{category.id.substring(0, 8)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        {category.image_url ? (
                          <img
                            src={category.image_url}
                            alt={category.name}
                            className="w-10 h-10 object-cover rounded-md mr-3"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-gray-200 rounded-md flex items-center justify-center mr-3">
                            <span className="text-xs text-gray-500">{category.name.substring(0, 2)}</span>
                          </div>
                        )}
                        <span className="text-sm font-medium text-gray-800">{category.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">{category.description || 'No description'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{productCounts[category.id] || 0}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{category.display_order || '-'}</td>
                    <td className="px-6 py-4 text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        <Link to={`/admin/categories/edit/${category.id}`} className="text-blue-600 hover:text-blue-900">
                          <Edit size={16} />
                        </Link>
                        <button
                          onClick={() => handleDeleteCategory(category.id)}
                          disabled={deleteLoading === category.id}
                          className={`text-red-600 hover:text-red-900 ${deleteLoading === category.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {deleteLoading === category.id ? (
                            <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              Showing {indexOfFirstCategory + 1} to {Math.min(indexOfLastCategory, filteredCategories.length)} of {filteredCategories.length} categories
            </div>
            <div className="flex space-x-1">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className={`px-3 py-1 rounded ${currentPage === 1 ? 'text-gray-400 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-200'}`}
              >
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-3 py-1 rounded ${currentPage === page ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-200'}`}
                >
                  {page}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className={`px-3 py-1 rounded ${currentPage === totalPages ? 'text-gray-400 cursor-not-allowed' : 'text-gray-600 hover:bg-gray-200'}`}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default CategoriesPage;
