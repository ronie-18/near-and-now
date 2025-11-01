import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/admin/layout/AdminLayout';
import { ArrowLeft, Save, AlertCircle } from 'lucide-react';
import { createProduct, createCategory } from '../../services/adminService';
import { getCategories } from '../../services/adminService';

const AddProductPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryData, setNewCategoryData] = useState({
    name: '',
    description: '',
    image_url: '',
    color: '',
    display_order: '',
  });

  const [formData, setFormData] = useState({
    name: '',
    price: '',
    original_price: '',
    description: '',
    image_url: '',
    category: '',
    in_stock: true,
    rating: '4.5',
    size: '',
  });

  // Fetch categories for dropdown
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const data = await getCategories();
        const categoryNames = data.map(cat => cat.name);
        setCategories(categoryNames);
      } catch (err) {
        console.error('Error fetching categories:', err);
      }
    };
    fetchCategories();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === '__NEW_CATEGORY__') {
      setShowNewCategoryInput(true);
      setFormData(prev => ({ ...prev, category: '' }));
    } else {
      setShowNewCategoryInput(false);
      setNewCategoryData({
        name: '',
        description: '',
        image_url: '',
        color: '',
        display_order: '',
      });
      setFormData(prev => ({ ...prev, category: value }));
    }
  };

  const handleNewCategoryChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setNewCategoryData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    // Validation
    if (!formData.name.trim()) {
      setError('Product name is required');
      return;
    }
    if (!formData.price || parseFloat(formData.price) <= 0) {
      setError('Valid price is required');
      return;
    }
    if (!formData.category && !showNewCategoryInput) {
      setError('Category is required');
      return;
    }
    if (showNewCategoryInput && !newCategoryData.name.trim()) {
      setError('New category name is required');
      return;
    }

    try {
      setLoading(true);

      // Create new category if needed
      let categoryToUse = formData.category;
      if (showNewCategoryInput && newCategoryData.name.trim()) {
        const categoryPayload = {
          name: newCategoryData.name.trim(),
          description: newCategoryData.description.trim() || undefined,
          image_url: newCategoryData.image_url.trim() || undefined,
          color: newCategoryData.color.trim() || undefined,
          display_order: newCategoryData.display_order ? parseInt(newCategoryData.display_order) : undefined,
        };
        
        const newCategory = await createCategory(categoryPayload);
        
        if (!newCategory) {
          setError('Failed to create new category. Please try again.');
          setLoading(false);
          return;
        }
        
        categoryToUse = newCategory.name;
      }

      const productData = {
        name: formData.name.trim(),
        price: parseFloat(formData.price),
        original_price: formData.original_price ? parseFloat(formData.original_price) : undefined,
        description: formData.description.trim() || undefined,
        image_url: formData.image_url.trim() || undefined,
        category: categoryToUse,
        in_stock: formData.in_stock,
        rating: formData.rating ? parseFloat(formData.rating) : undefined,
        size: formData.size.trim() || undefined,
      };

      const result = await createProduct(productData);
      
      if (result) {
        setSuccess(true);
        setTimeout(() => {
          navigate('/admin/products');
        }, 1500);
      } else {
        setError('Failed to create product. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while creating the product.');
      console.error('Error creating product:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminLayout>
      <div className="mb-6">
        <button
          onClick={() => navigate('/admin/products')}
          className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft size={18} className="mr-2" />
          Back to Products
        </button>
        <h1 className="text-2xl font-bold text-gray-800">Add New Product</h1>
        <p className="text-gray-600">Create a new product in your inventory</p>
      </div>

      {/* Success Message */}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-6 flex items-center">
          <AlertCircle className="w-5 h-5 mr-2" />
          <span>Product created successfully! Redirecting...</span>
        </div>
      )}

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

      {/* Form */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Product Name */}
            <div className="md:col-span-2">
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                Product Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="e.g., Organic Basmati Rice"
              />
            </div>

            {/* Category */}
            <div className="md:col-span-2">
              <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-2">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                id="category"
                name="category"
                value={showNewCategoryInput ? '__NEW_CATEGORY__' : formData.category}
                onChange={handleCategoryChange}
                required={!showNewCategoryInput}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="">Select a category</option>
                <option value="__NEW_CATEGORY__">+ New Category</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              
              {/* New Category Form */}
              {showNewCategoryInput && (
                <div className="mt-4 p-4 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">New Category Details</h3>
                  <div className="space-y-4">
                    {/* Category Name */}
                    <div>
                      <label htmlFor="newCategoryName" className="block text-sm font-medium text-gray-700 mb-1">
                        Category Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        id="newCategoryName"
                        name="name"
                        value={newCategoryData.name}
                        onChange={handleNewCategoryChange}
                        placeholder="e.g., Vegetables, Fruits, Dairy"
                        required
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </div>

                    {/* Color and Display Order in a row */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="newCategoryColor" className="block text-sm font-medium text-gray-700 mb-1">
                          Color/Theme <span className="text-gray-400 text-xs">(Optional)</span>
                        </label>
                        <input
                          type="text"
                          id="newCategoryColor"
                          name="color"
                          value={newCategoryData.color}
                          onChange={handleNewCategoryChange}
                          placeholder="e.g., from-green-100 to-green-200"
                          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                        <p className="mt-1 text-xs text-gray-500">Tailwind gradient classes</p>
                      </div>

                      <div>
                        <label htmlFor="newCategoryDisplayOrder" className="block text-sm font-medium text-gray-700 mb-1">
                          Display Order <span className="text-gray-400 text-xs">(Optional)</span>
                        </label>
                        <input
                          type="number"
                          id="newCategoryDisplayOrder"
                          name="display_order"
                          value={newCategoryData.display_order}
                          onChange={handleNewCategoryChange}
                          min="0"
                          placeholder="e.g., 1, 2, 3..."
                          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                        <p className="mt-1 text-xs text-gray-500">Lower numbers appear first</p>
                      </div>
                    </div>

                    {/* Image URL */}
                    <div>
                      <label htmlFor="newCategoryImageUrl" className="block text-sm font-medium text-gray-700 mb-1">
                        Image URL <span className="text-gray-400 text-xs">(Optional)</span>
                      </label>
                      <input
                        type="url"
                        id="newCategoryImageUrl"
                        name="image_url"
                        value={newCategoryData.image_url}
                        onChange={handleNewCategoryChange}
                        placeholder="https://example.com/category-image.jpg"
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                      <p className="mt-1 text-xs text-gray-500">Enter a URL for the category image</p>
                    </div>

                    {/* Description */}
                    <div>
                      <label htmlFor="newCategoryDescription" className="block text-sm font-medium text-gray-700 mb-1">
                        Description <span className="text-gray-400 text-xs">(Optional)</span>
                      </label>
                      <textarea
                        id="newCategoryDescription"
                        name="description"
                        value={newCategoryData.description}
                        onChange={handleNewCategoryChange}
                        rows={3}
                        placeholder="Enter category description..."
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      />
                    </div>

                    <p className="text-xs text-gray-600 italic">
                      This category will be created and added to the system when you submit the product.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Price */}
            <div>
              <label htmlFor="price" className="block text-sm font-medium text-gray-700 mb-2">
                Price (₹) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                id="price"
                name="price"
                value={formData.price}
                onChange={handleChange}
                required
                min="0"
                step="0.01"
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="0.00"
              />
            </div>

            {/* Original Price */}
            <div>
              <label htmlFor="original_price" className="block text-sm font-medium text-gray-700 mb-2">
                Original Price (₹) <span className="text-gray-400 text-xs">(Optional)</span>
              </label>
              <input
                type="number"
                id="original_price"
                name="original_price"
                value={formData.original_price}
                onChange={handleChange}
                min="0"
                step="0.01"
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="0.00"
              />
            </div>

            {/* Rating */}
            <div>
              <label htmlFor="rating" className="block text-sm font-medium text-gray-700 mb-2">
                Rating <span className="text-gray-400 text-xs">(0-5)</span>
              </label>
              <input
                type="number"
                id="rating"
                name="rating"
                value={formData.rating}
                onChange={handleChange}
                min="0"
                max="5"
                step="0.1"
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="4.5"
              />
            </div>

            {/* Size */}
            <div>
              <label htmlFor="size" className="block text-sm font-medium text-gray-700 mb-2">
                Size <span className="text-gray-400 text-xs">(Optional)</span>
              </label>
              <input
                type="text"
                id="size"
                name="size"
                value={formData.size}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="e.g., 1kg, 500g, Large"
              />
            </div>

            {/* Image URL */}
            <div className="md:col-span-2">
              <label htmlFor="image_url" className="block text-sm font-medium text-gray-700 mb-2">
                Image URL <span className="text-gray-400 text-xs">(Optional)</span>
              </label>
              <input
                type="url"
                id="image_url"
                name="image_url"
                value={formData.image_url}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="https://example.com/image.jpg"
              />
            </div>

            {/* Description */}
            <div className="md:col-span-2">
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                Description <span className="text-gray-400 text-xs">(Optional)</span>
              </label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Enter product description..."
              />
            </div>

            {/* In Stock */}
            <div className="md:col-span-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="in_stock"
                  checked={formData.in_stock}
                  onChange={handleChange}
                  className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                />
                <span className="ml-2 text-sm font-medium text-gray-700">Product is in stock</span>
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-6 flex items-center justify-end space-x-4">
            <button
              type="button"
              onClick={() => navigate('/admin/products')}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center px-6 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Creating...
                </>
              ) : (
                <>
                  <Save size={18} className="mr-2" />
                  Create Product
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
};

export default AddProductPage;
