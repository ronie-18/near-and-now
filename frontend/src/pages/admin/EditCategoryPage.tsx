import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AdminLayout from '../../components/admin/layout/AdminLayout';
import { 
  ArrowLeft, 
  Save, 
  AlertCircle, 
  X, 
  Check, 
  Loader2,
  Layers,
  Palette,
  Hash,
  Link as LinkIcon,
  FileText
} from 'lucide-react';
import { getCategoryById, updateCategory } from '../../services/adminService';

const EditCategoryPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    image_url: '',
    color: '',
    display_order: '',
  });

  useEffect(() => {
    const fetchCategory = async () => {
      if (!id) {
        setError('Category ID is missing');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const category = await getCategoryById(id);

        if (!category) {
          setError('Category not found');
          setLoading(false);
          return;
        }

        setFormData({
          name: category.name || '',
          description: category.description || '',
          image_url: category.image_url || '',
          color: category.color || '',
          display_order: String(category.display_order || ''),
        });
      } catch (err) {
        console.error('Error fetching category:', err);
        setError('Failed to load category. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchCategory();
  }, [id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    setError(null);
    setSuccess(false);

    if (!formData.name.trim()) {
      setError('Category name is required');
      return;
    }

    try {
      setSaving(true);

      const categoryData = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        image_url: formData.image_url.trim() || undefined,
        color: formData.color.trim() || undefined,
        display_order: formData.display_order ? parseInt(formData.display_order) : undefined,
      };

      const result = await updateCategory(id, categoryData);
      
      if (result) {
        setSuccess(true);
        setTimeout(() => {
          navigate('/admin/categories');
        }, 1500);
      } else {
        setError('Failed to update category. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while updating the category.');
      console.error('Error updating category:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <Loader2 size={48} className="animate-spin text-violet-500 mx-auto mb-4" />
            <p className="text-gray-600">Loading category...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <button
            onClick={() => navigate('/admin/categories')}
            className="inline-flex items-center text-gray-500 hover:text-gray-700 transition-colors mb-4 group"
          >
            <ArrowLeft size={18} className="mr-2 group-hover:-translate-x-1 transition-transform" />
            Back to Categories
          </button>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-violet-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg">
              <Layers className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Edit Category</h1>
              <p className="text-gray-500 mt-1">Update category information</p>
            </div>
          </div>
        </div>

        {success && (
          <div className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-5 py-4 rounded-xl mb-6 flex items-center shadow-lg">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center mr-4">
              <Check className="w-5 h-5" />
            </div>
            <span className="font-medium">Category updated successfully! Redirecting...</span>
          </div>
        )}

        {error && (
          <div className="bg-gradient-to-r from-red-500 to-rose-500 text-white px-5 py-4 rounded-xl mb-6 flex items-center shadow-lg">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center mr-4">
              <AlertCircle className="w-5 h-5" />
            </div>
            <span className="flex-1 font-medium">{error}</span>
            <button onClick={() => setError(null)} className="ml-4 p-2 hover:bg-white/20 rounded-lg transition-colors">
              <X size={18} />
            </button>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <form onSubmit={handleSubmit}>
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800 mb-5 flex items-center gap-2">
                <span className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center text-violet-600 text-sm font-bold">1</span>
                Category Information
              </h2>
              
              <div className="space-y-5">
                <div>
                  <label htmlFor="name" className="block text-sm font-semibold text-gray-700 mb-2">
                    Category Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Layers size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      className="w-full pl-11 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-violet-500 transition-colors text-gray-800"
                      placeholder="e.g., Vegetables, Fruits, Dairy"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="description" className="block text-sm font-semibold text-gray-700 mb-2">
                    Description <span className="text-gray-400 text-xs font-normal">(Optional)</span>
                  </label>
                  <div className="relative">
                    <FileText size={18} className="absolute left-4 top-4 text-gray-400" />
                    <textarea
                      id="description"
                      name="description"
                      value={formData.description}
                      onChange={handleChange}
                      rows={3}
                      className="w-full pl-11 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-violet-500 transition-colors text-gray-800 resize-none"
                      placeholder="Enter a brief description of this category..."
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-b border-gray-100 bg-gray-50/50">
              <h2 className="text-lg font-bold text-gray-800 mb-5 flex items-center gap-2">
                <span className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600 text-sm font-bold">2</span>
                Appearance & Display
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="color" className="block text-sm font-semibold text-gray-700 mb-2">
                    Color Theme <span className="text-gray-400 text-xs font-normal">(Optional)</span>
                  </label>
                  <div className="relative">
                    <Palette size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      id="color"
                      name="color"
                      value={formData.color}
                      onChange={handleChange}
                      className="w-full pl-11 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-violet-500 transition-colors text-gray-800"
                      placeholder="e.g., from-green-100 to-green-200"
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-gray-500">Tailwind gradient classes for category card</p>
                </div>

                <div>
                  <label htmlFor="display_order" className="block text-sm font-semibold text-gray-700 mb-2">
                    Display Order <span className="text-gray-400 text-xs font-normal">(Optional)</span>
                  </label>
                  <div className="relative">
                    <Hash size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="number"
                      id="display_order"
                      name="display_order"
                      value={formData.display_order}
                      onChange={handleChange}
                      min="0"
                      className="w-full pl-11 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-violet-500 transition-colors text-gray-800"
                      placeholder="e.g., 1, 2, 3..."
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-gray-500">Lower numbers appear first on the homepage</p>
                </div>
              </div>

              <div className="mt-5">
                <label htmlFor="image_url" className="block text-sm font-semibold text-gray-700 mb-2">
                  Image URL <span className="text-gray-400 text-xs font-normal">(Optional)</span>
                </label>
                <div className="relative">
                  <LinkIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="url"
                    id="image_url"
                    name="image_url"
                    value={formData.image_url}
                    onChange={handleChange}
                    className="w-full pl-11 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-violet-500 transition-colors text-gray-800"
                    placeholder="https://example.com/category-image.jpg"
                  />
                </div>
                <p className="mt-1.5 text-xs text-gray-500">Direct URL to the category image</p>
              </div>

              {formData.image_url && (
                <div className="mt-4 p-4 bg-white rounded-xl border-2 border-dashed border-gray-200">
                  <p className="text-xs font-medium text-gray-500 mb-2">Image Preview</p>
                  <img
                    src={formData.image_url}
                    alt="Category preview"
                    className="w-32 h-32 object-cover rounded-xl shadow-md"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
            </div>

            <div className="p-6 bg-gray-50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => navigate('/admin/categories')}
                className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-100 transition-colors font-semibold"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center px-8 py-3 bg-gradient-to-r from-violet-500 to-purple-500 text-white rounded-xl hover:from-violet-600 hover:to-purple-600 transition-all font-semibold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <Loader2 size={20} className="animate-spin mr-2" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Save size={20} className="mr-2" />
                    Update Category
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AdminLayout>
  );
};

export default EditCategoryPage;
