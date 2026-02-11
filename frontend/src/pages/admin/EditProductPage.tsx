import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AdminLayout from '../../components/admin/layout/AdminLayout';
import {
  ArrowLeft,
  Save,
  AlertCircle,
  Plus,
  X,
  Trash2,
  GripVertical,
  Check,
  Loader2,
  ImageOff,
  Star,
  Sparkles,
  Upload,
  FileImage
} from 'lucide-react';
import { getProductById, updateProduct, createCategory, uploadProductImage, getCategories } from '../../services/adminService';

// Image item interface
interface ImageData {
  id: string;
  url: string;
  file?: File;
  isUploading: boolean;
  isUploaded: boolean;
  error?: string;
}

// Image item component (reuse from AddProductPage)
interface ImageItemProps {
  image: ImageData;
  index: number;
  isPrimary: boolean;
  onRemove: (id: string) => void;
  onSetPrimary: (id: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  totalCount: number;
}

const ImageItem: React.FC<ImageItemProps> = ({
  image,
  index,
  isPrimary,
  onRemove,
  onSetPrimary,
  onMoveUp,
  onMoveDown,
  totalCount
}) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  return (
    <div className={`relative group bg-white rounded-xl border-2 transition-all duration-200 overflow-hidden
      ${isPrimary ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-gray-200 hover:border-gray-300'}
      ${image.isUploading ? 'opacity-75' : ''}`}>
      {isPrimary && !image.isUploading && (
        <div className="absolute top-2 left-2 z-10 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-bold px-2 py-1 rounded-lg flex items-center gap-1 shadow-lg">
          <Star size={12} className="fill-white" />
          Primary
        </div>
      )}
      {image.isUploading && (
        <div className="absolute inset-0 z-20 bg-white/80 flex flex-col items-center justify-center">
          <Loader2 size={28} className="animate-spin text-emerald-500 mb-2" />
          <span className="text-xs font-medium text-gray-600">Uploading...</span>
        </div>
      )}
      {image.error && (
        <div className="absolute inset-0 z-20 bg-red-50/90 flex flex-col items-center justify-center p-3">
          <AlertCircle size={24} className="text-red-500 mb-2" />
          <span className="text-xs font-medium text-red-600 text-center">{image.error}</span>
        </div>
      )}
      <div className="aspect-square bg-gray-50 flex items-center justify-center relative">
        {!imageError && image.url ? (
          <>
            {!imageLoaded && !image.isUploading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 size={24} className="animate-spin text-gray-400" />
              </div>
            )}
            <img
              src={image.url}
              alt={`Product image ${index + 1}`}
              className={`w-full h-full object-cover transition-opacity duration-200 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          </>
        ) : imageError ? (
          <div className="flex flex-col items-center text-gray-400">
            <ImageOff size={32} />
            <span className="text-xs mt-2">Failed to load</span>
          </div>
        ) : (
          <div className="flex flex-col items-center text-gray-400">
            <FileImage size={32} />
            <span className="text-xs mt-2">Preview unavailable</span>
          </div>
        )}
        {!image.isUploading && !image.error && (
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            {!isPrimary && (
              <button
                type="button"
                onClick={() => onSetPrimary(image.id)}
                className="p-2 bg-white/20 hover:bg-white/30 rounded-lg text-white transition-colors"
                title="Set as primary"
              >
                <Star size={18} />
              </button>
            )}
            <button
              type="button"
              onClick={() => onRemove(image.id)}
              className="p-2 bg-red-500/80 hover:bg-red-500 rounded-lg text-white transition-colors"
              title="Remove image"
            >
              <Trash2 size={18} />
            </button>
          </div>
        )}
      </div>
      <div className="p-2 flex items-center justify-between bg-gray-50 border-t border-gray-100">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMoveUp(index)}
            disabled={index === 0 || image.isUploading}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move up"
          >
            <GripVertical size={14} className="rotate-90" />
          </button>
          <span className="text-xs text-gray-500 font-medium">#{index + 1}</span>
          <button
            type="button"
            onClick={() => onMoveDown(index)}
            disabled={index === totalCount - 1 || image.isUploading}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move down"
          >
            <GripVertical size={14} className="-rotate-90" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => onRemove(image.id)}
          disabled={image.isUploading}
          className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30"
          title="Remove"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

const EditProductPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [images, setImages] = useState<ImageData[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

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
    category: '',
    in_stock: true,
    rating: '4.5',
    size: '',
  });

  // Fetch product and categories
  useEffect(() => {
    const fetchData = async () => {
      if (!id) {
        setError('Product ID is missing');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const [product, categoriesData] = await Promise.all([
          getProductById(id),
          getCategories()
        ]);

        if (!product) {
          setError('Product not found');
          setLoading(false);
          return;
        }

        // Populate form with product data
        setFormData({
          name: product.name || '',
          price: String(product.price || ''),
          original_price: String(product.original_price || ''),
          description: product.description || '',
          category: product.category || '',
          in_stock: product.in_stock ?? true,
          rating: String(product.rating || '4.5'),
          size: product.size || '',
        });

        // Load existing images
        const existingImages: ImageData[] = [];
        if (product.image) {
          existingImages.push({
            id: 'existing_0',
            url: product.image,
            isUploading: false,
            isUploaded: true
          });
        }
        if (product.images && product.images.length > 0) {
          product.images.forEach((img: string, idx: number) => {
            existingImages.push({
              id: `existing_${idx + 1}`,
              url: img,
              isUploading: false,
              isUploaded: true
            });
          });
        }
        setImages(existingImages);

        const categoryNames = categoriesData.map(cat => cat.name);
        setCategories(categoryNames);
      } catch (err) {
        console.error('Error fetching product:', err);
        setError('Failed to load product. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

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

  const generateId = () => `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(file => {
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      const maxSize = 5 * 1024 * 1024;

      if (!validTypes.includes(file.type)) {
        setError(`Invalid file type: ${file.name}. Supported: JPG, PNG, WebP, GIF`);
        return false;
      }
      if (file.size > maxSize) {
        setError(`File too large: ${file.name}. Max size: 5MB`);
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) return;

    const placeholders: ImageData[] = validFiles.map(file => ({
      id: generateId(),
      url: URL.createObjectURL(file),
      file,
      isUploading: true,
      isUploaded: false
    }));

    setImages(prev => [...prev, ...placeholders]);

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      const placeholder = placeholders[i];

      try {
        const uploadedUrl = await uploadProductImage(file);
        setImages(prev => prev.map(img => {
          if (img.id === placeholder.id) {
            if (uploadedUrl) {
              URL.revokeObjectURL(img.url);
              return {
                ...img,
                url: uploadedUrl,
                isUploading: false,
                isUploaded: true
              };
            } else {
              return {
                ...img,
                isUploading: false,
                error: 'Upload failed'
              };
            }
          }
          return img;
        }));
      } catch (err) {
        console.error('Upload error:', err);
        setImages(prev => prev.map(img => {
          if (img.id === placeholder.id) {
            return {
              ...img,
              isUploading: false,
              error: 'Upload failed'
            };
          }
          return img;
        }));
      }
    }
  }, []);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === dropZoneRef.current) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFiles(files);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFiles(files);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = (id: string) => {
    setImages(prev => {
      const img = prev.find(i => i.id === id);
      if (img && img.url.startsWith('blob:')) {
        URL.revokeObjectURL(img.url);
      }
      return prev.filter(i => i.id !== id);
    });
  };

  const setPrimaryImage = (id: string) => {
    setImages(prev => {
      const index = prev.findIndex(i => i.id === id);
      if (index <= 0) return prev;
      const newImages = [...prev];
      const [selected] = newImages.splice(index, 1);
      return [selected, ...newImages];
    });
  };

  const moveImageUp = (index: number) => {
    if (index === 0) return;
    setImages(prev => {
      const newImages = [...prev];
      [newImages[index - 1], newImages[index]] = [newImages[index], newImages[index - 1]];
      return newImages;
    });
  };

  const moveImageDown = (index: number) => {
    if (index === images.length - 1) return;
    setImages(prev => {
      const newImages = [...prev];
      [newImages[index], newImages[index + 1]] = [newImages[index + 1], newImages[index]];
      return newImages;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;

    setError(null);
    setSuccess(false);

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

    const uploadingImages = images.filter(img => img.isUploading);
    if (uploadingImages.length > 0) {
      setError('Please wait for all images to finish uploading');
      return;
    }

    try {
      setSaving(true);

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
          setSaving(false);
          return;
        }
        categoryToUse = newCategory.name;
      }

      const uploadedImages = images.filter(img => img.isUploaded && !img.error);
      const primaryImage = uploadedImages[0]?.url || undefined;
      const additionalImages = uploadedImages.slice(1).map(img => img.url);

      const productData = {
        name: formData.name.trim(),
        price: parseFloat(formData.price),
        original_price: formData.original_price ? parseFloat(formData.original_price) : undefined,
        description: formData.description.trim() || undefined,
        image: primaryImage,
        images: additionalImages.length > 0 ? additionalImages : undefined,
        category: categoryToUse,
        in_stock: formData.in_stock,
        rating: formData.rating ? parseFloat(formData.rating) : undefined,
        size: formData.size.trim() || undefined,
        unit: formData.size?.trim() || 'piece',
      };

      const result = await updateProduct(id, productData);

      if (result) {
        setSuccess(true);
        setTimeout(() => {
          navigate('/admin/products');
        }, 1500);
      } else {
        setError('Failed to update product. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while updating the product.');
      console.error('Error updating product:', err);
    } finally {
      setSaving(false);
    }
  };

  const uploadingCount = images.filter(img => img.isUploading).length;
  const uploadedCount = images.filter(img => img.isUploaded).length;
  const errorCount = images.filter(img => img.error).length;

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <Loader2 size={48} className="animate-spin text-emerald-500 mx-auto mb-4" />
            <p className="text-gray-600">Loading product...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <button
            onClick={() => navigate('/admin/products')}
            className="inline-flex items-center text-gray-500 hover:text-gray-700 transition-colors mb-4 group"
          >
            <ArrowLeft size={18} className="mr-2 group-hover:-translate-x-1 transition-transform" />
            Back to Products
          </button>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-2xl flex items-center justify-center shadow-lg">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Edit Product</h1>
              <p className="text-gray-500 mt-1">Update product information</p>
            </div>
          </div>
        </div>

        {success && (
          <div className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-5 py-4 rounded-xl mb-6 flex items-center shadow-lg">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center mr-4">
              <Check className="w-5 h-5" />
            </div>
            <span className="font-medium">Product updated successfully! Redirecting...</span>
          </div>
        )}

        {error && (
          <div className="bg-gradient-to-r from-red-500 to-rose-500 text-white px-5 py-4 rounded-xl mb-6 flex items-center shadow-lg">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center mr-4">
              <AlertCircle className="w-5 h-5" />
            </div>
            <span className="flex-1 font-medium">{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-4 p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <form onSubmit={handleSubmit}>
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 text-sm font-bold">1</span>
                Basic Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="md:col-span-2">
                  <label htmlFor="name" className="block text-sm font-semibold text-gray-700 mb-2">
                    Product Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500 transition-colors text-gray-800"
                    placeholder="e.g., Organic Basmati Rice"
                  />
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="category" className="block text-sm font-semibold text-gray-700 mb-2">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="category"
                    name="category"
                    value={showNewCategoryInput ? '__NEW_CATEGORY__' : formData.category}
                    onChange={handleCategoryChange}
                    required={!showNewCategoryInput}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500 transition-colors text-gray-800"
                  >
                    <option value="">Select a category</option>
                    <option value="__NEW_CATEGORY__">+ Create New Category</option>
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>

                  {showNewCategoryInput && (
                    <div className="mt-4 p-5 border-2 border-dashed border-emerald-300 rounded-xl bg-emerald-50/50">
                      <h3 className="text-sm font-bold text-emerald-800 mb-4 flex items-center gap-2">
                        <Plus size={16} />
                        New Category Details
                      </h3>
                      <div className="space-y-4">
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
                            className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500 transition-colors"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label htmlFor="newCategoryColor" className="block text-sm font-medium text-gray-700 mb-1">
                              Color Theme <span className="text-gray-400 text-xs">(Optional)</span>
                            </label>
                            <input
                              type="text"
                              id="newCategoryColor"
                              name="color"
                              value={newCategoryData.color}
                              onChange={handleNewCategoryChange}
                              placeholder="e.g., from-green-100 to-green-200"
                              className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500 transition-colors"
                            />
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
                              placeholder="1, 2, 3..."
                              className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500 transition-colors"
                            />
                          </div>
                        </div>
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
                            className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500 transition-colors"
                          />
                        </div>
                        <div>
                          <label htmlFor="newCategoryDescription" className="block text-sm font-medium text-gray-700 mb-1">
                            Description <span className="text-gray-400 text-xs">(Optional)</span>
                          </label>
                          <textarea
                            id="newCategoryDescription"
                            name="description"
                            value={newCategoryData.description}
                            onChange={handleNewCategoryChange}
                            rows={2}
                            placeholder="Enter category description..."
                            className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500 transition-colors resize-none"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="description" className="block text-sm font-semibold text-gray-700 mb-2">
                    Description <span className="text-gray-400 text-xs font-normal">(Optional)</span>
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    rows={3}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500 transition-colors text-gray-800 resize-none"
                    placeholder="Enter product description..."
                  />
                </div>
              </div>
            </div>

            <div className="p-6 border-b border-gray-100 bg-gradient-to-br from-purple-50/50 to-indigo-50/50">
              <h2 className="text-lg font-bold text-gray-800 mb-1 flex items-center gap-2">
                <span className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600 text-sm font-bold">2</span>
                Product Images
              </h2>
              <p className="text-sm text-gray-500 mb-5 ml-10">
                Upload product images. First image will be the primary image.
                {images.length > 0 && (
                  <span className="ml-2">
                    ({uploadedCount} uploaded
                    {uploadingCount > 0 && `, ${uploadingCount} uploading`}
                    {errorCount > 0 && `, ${errorCount} failed`})
                  </span>
                )}
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                onChange={handleFileInputChange}
                className="hidden"
              />

              <div
                ref={dropZoneRef}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 mb-5
                  ${isDragging
                    ? 'border-purple-500 bg-purple-50 scale-[1.02]'
                    : 'border-gray-300 hover:border-purple-400 hover:bg-purple-50/50'}`}
              >
                <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center transition-colors
                  ${isDragging ? 'bg-purple-200' : 'bg-gray-100'}`}>
                  <Upload size={32} className={isDragging ? 'text-purple-600' : 'text-gray-400'} />
                </div>
                <h3 className="font-semibold text-gray-700 mb-1">
                  {isDragging ? 'Drop images here' : 'Drag & drop images here'}
                </h3>
                <p className="text-sm text-gray-500 mb-3">or click to browse files</p>
                <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <FileImage size={14} />
                    JPG, PNG, WebP, GIF
                  </span>
                  <span>•</span>
                  <span>Max 5MB per file</span>
                </div>
              </div>

              {images.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {images.map((image, index) => (
                    <ImageItem
                      key={image.id}
                      image={image}
                      index={index}
                      isPrimary={index === 0}
                      onRemove={removeImage}
                      onSetPrimary={setPrimaryImage}
                      onMoveUp={moveImageUp}
                      onMoveDown={moveImageDown}
                      totalCount={images.length}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:border-purple-400 hover:text-purple-500 hover:bg-purple-50 transition-all"
                  >
                    <Plus size={24} />
                    <span className="text-xs mt-2 font-medium">Add More</span>
                  </button>
                </div>
              )}
            </div>

            <div className="p-6 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                <span className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center text-green-600 text-sm font-bold">3</span>
                Pricing & Details
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                <div>
                  <label htmlFor="price" className="block text-sm font-semibold text-gray-700 mb-2">
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
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500 transition-colors text-gray-800"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label htmlFor="original_price" className="block text-sm font-semibold text-gray-700 mb-2">
                    Original Price <span className="text-gray-400 text-xs font-normal">(Optional)</span>
                  </label>
                  <input
                    type="number"
                    id="original_price"
                    name="original_price"
                    value={formData.original_price}
                    onChange={handleChange}
                    min="0"
                    step="0.01"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500 transition-colors text-gray-800"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label htmlFor="rating" className="block text-sm font-semibold text-gray-700 mb-2">
                    Rating <span className="text-gray-400 text-xs font-normal">(0-5)</span>
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
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500 transition-colors text-gray-800"
                    placeholder="4.5"
                  />
                </div>
                <div>
                  <label htmlFor="size" className="block text-sm font-semibold text-gray-700 mb-2">
                    Size/Weight <span className="text-gray-400 text-xs font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    id="size"
                    name="size"
                    value={formData.size}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500 transition-colors text-gray-800"
                    placeholder="e.g., 1kg, 500g"
                  />
                </div>
              </div>

              <div className="mt-5 p-4 bg-gray-50 rounded-xl flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-800">Stock Status</p>
                  <p className="text-sm text-gray-500">Is this product available for purchase?</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, in_stock: !prev.in_stock }))}
                  className={`relative w-14 h-8 rounded-full transition-colors ${formData.in_stock ? 'bg-emerald-500' : 'bg-gray-300'}`}
                >
                  <span
                    className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${formData.in_stock ? 'left-7' : 'left-1'}`}
                  />
                </button>
              </div>
            </div>

            <div className="p-6 bg-gray-50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => navigate('/admin/products')}
                className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-100 transition-colors font-semibold"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || uploadingCount > 0}
                className="inline-flex items-center px-8 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl hover:from-blue-600 hover:to-indigo-600 transition-all font-semibold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <Loader2 size={20} className="animate-spin mr-2" />
                    Updating...
                  </>
                ) : uploadingCount > 0 ? (
                  <>
                    <Loader2 size={20} className="animate-spin mr-2" />
                    Uploading Images...
                  </>
                ) : (
                  <>
                    <Save size={20} className="mr-2" />
                    Update Product
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

export default EditProductPage;
