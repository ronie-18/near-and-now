import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
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
  X,
  Grid3X3,
  List,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Check,
  ToggleLeft,
  ToggleRight,
  Loader2,
  ImageOff,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import AdminLayout from "../../components/admin/layout/AdminLayout";
import {
  getAdminProducts,
  deleteProduct,
  createProduct,
  updateProduct,
  getCategories,
  Category,
} from "../../services/adminService";
import { Product } from "../../services/supabase";

// Constants
const ITEMS_PER_PAGE = 10;

// Helper functions
const truncateId = (id: string) => id.substring(0, 8);
const formatPrice = (price: number) => `₹${Math.round(price).toLocaleString("en-IN")}`;

type SortField = "name" | "price" | "category" | "in_stock" | "created_at";
type SortDirection = "asc" | "desc";

// Modern Stat Card
interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  label: string;
  value: number | string;
  subtitle?: string;
  trend?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  icon: Icon,
  gradient,
  label,
  value,
  subtitle,
  trend,
}) => (
  <div
    className={`relative overflow-hidden rounded-2xl ${gradient} p-5 text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1`}
  >
    <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
    <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-20 h-20 bg-white/10 rounded-full blur-xl" />
    <div className="relative z-10">
      <div className="flex items-center justify-between mb-3">
        <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
          <Icon className="w-6 h-6" />
        </div>
        {trend && (
          <span className="text-xs font-medium bg-white/20 px-2 py-1 rounded-full backdrop-blur-sm">
            {trend}
          </span>
        )}
      </div>
      <p className="text-white/80 text-sm font-medium">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
      {subtitle && <p className="text-white/60 text-xs mt-1">{subtitle}</p>}
    </div>
  </div>
);

// Error Alert with animation
interface ErrorAlertProps {
  message: string;
  onDismiss: () => void;
}

const ErrorAlert: React.FC<ErrorAlertProps> = ({ message, onDismiss }) => (
  <div className="bg-gradient-to-r from-red-500 to-rose-500 text-white px-5 py-4 rounded-xl mb-6 flex items-center shadow-lg animate-in slide-in-from-top duration-300">
    <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center mr-4">
      <AlertCircle className="w-5 h-5" />
    </div>
    <span className="flex-1 font-medium">{message}</span>
    <button
      onClick={onDismiss}
      className="ml-4 p-2 hover:bg-white/20 rounded-lg transition-colors"
      aria-label="Dismiss"
    >
      <X size={18} />
    </button>
  </div>
);

// Success Alert
interface SuccessAlertProps {
  message: string;
  onDismiss: () => void;
}

const SuccessAlert: React.FC<SuccessAlertProps> = ({ message, onDismiss }) => (
  <div className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-5 py-4 rounded-xl mb-6 flex items-center shadow-lg animate-in slide-in-from-top duration-300">
    <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center mr-4">
      <Check className="w-5 h-5" />
    </div>
    <span className="flex-1 font-medium">{message}</span>
    <button
      onClick={onDismiss}
      className="ml-4 p-2 hover:bg-white/20 rounded-lg transition-colors"
      aria-label="Dismiss"
    >
      <X size={18} />
    </button>
  </div>
);

// Modern Loading Spinner
const LoadingSpinner = () => (
  <div className="p-16 flex flex-col items-center justify-center">
    <div className="relative">
      <div className="w-16 h-16 border-4 border-emerald-200 rounded-full" />
      <div className="absolute top-0 left-0 w-16 h-16 border-4 border-emerald-500 rounded-full animate-spin border-t-transparent" />
    </div>
    <p className="mt-4 text-gray-500 font-medium">Loading products...</p>
  </div>
);

// Empty State
interface EmptyStateProps {
  searchTerm: string;
  selectedCategory: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  searchTerm,
  selectedCategory,
}) => (
  <div className="p-16 text-center">
    <div className="w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
      <Package className="w-12 h-12 text-gray-400" />
    </div>
    <h3 className="text-xl font-bold text-gray-800 mb-2">No products found</h3>
    <p className="text-gray-500 mb-6 max-w-md mx-auto">
      {searchTerm || selectedCategory !== "All"
        ? "Try adjusting your search or filters to find what you're looking for."
        : "Get started by adding your first product to the catalog."}
    </p>
    {!searchTerm && selectedCategory === "All" && (
      <Link
        to="/admin/products/add"
        className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all shadow-lg hover:shadow-xl font-semibold"
      >
        <Plus size={20} className="mr-2" />
        Add Your First Product
      </Link>
    )}
  </div>
);

// Product Image Component
interface ProductImageProps {
  imageUrl?: string;
  productName: string;
  size?: "sm" | "md" | "lg";
}

const ProductImage: React.FC<ProductImageProps> = ({
  imageUrl,
  productName,
  size = "md",
}) => {
  const sizeClasses = {
    sm: "w-10 h-10 text-xs",
    md: "w-14 h-14 text-sm",
    lg: "w-20 h-20 text-base",
  };

  const [imgError, setImgError] = useState(false);

  if (imageUrl && !imgError) {
    return (
      <img
        src={imageUrl}
        alt={productName}
        className={`${sizeClasses[size]} object-cover rounded-xl shadow-md ring-2 ring-white`}
        loading="lazy"
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} bg-gradient-to-br from-violet-400 via-purple-500 to-indigo-500 rounded-xl flex items-center justify-center shadow-md ring-2 ring-white`}
    >
      {imgError ? (
        <ImageOff className="w-1/2 h-1/2 text-white/80" />
      ) : (
        <span className="font-bold text-white">
          {productName.substring(0, 2).toUpperCase()}
        </span>
      )}
    </div>
  );
};

// Sortable Column Header
interface SortableHeaderProps {
  label: string;
  field: SortField;
  currentSort: SortField;
  direction: SortDirection;
  onSort: (field: SortField) => void;
}

const SortableHeader: React.FC<SortableHeaderProps> = ({
  label,
  field,
  currentSort,
  direction,
  onSort,
}) => (
  <th
    className="px-5 py-4 cursor-pointer group hover:bg-gray-100 transition-colors"
    onClick={() => onSort(field)}
  >
    <div className="flex items-center gap-2">
      <span>{label}</span>
      <span className="opacity-0 group-hover:opacity-100 transition-opacity">
        {currentSort === field ? (
          direction === "asc" ? (
            <ArrowUp size={14} className="text-emerald-500" />
          ) : (
            <ArrowDown size={14} className="text-emerald-500" />
          )
        ) : (
          <ArrowUpDown size={14} className="text-gray-400" />
        )}
      </span>
    </div>
  </th>
);

// Quick Add Modal
const QuickAddModal = ({
  isOpen,
  onClose,
  categories,
  onProductAdded,
}: {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onProductAdded: () => void;
}) => {
  const [formData, setFormData] = useState({
    name: "",
    category: "",
    price: "",
    in_stock: true,
    description: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError("Product name is required");
      return;
    }
    if (!formData.category) {
      setError("Please select a category");
      return;
    }
    if (!formData.price || parseFloat(formData.price) <= 0) {
      setError("Please enter a valid price");
      return;
    }

    try {
      setIsSubmitting(true);
      await createProduct({
        name: formData.name.trim(),
        category: formData.category,
        price: parseFloat(formData.price),
        in_stock: formData.in_stock,
        description: formData.description.trim() || undefined,
        image: undefined,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        unit: 'piece',
      });

      // Reset form and close
      setFormData({
        name: "",
        category: "",
        price: "",
        in_stock: true,
        description: "",
      });
      onProductAdded();
      onClose();
    } catch (err) {
      console.error("Error creating product:", err);
      setError("Failed to create product. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">
                  Quick Add Product
                </h2>
                <p className="text-emerald-100 text-sm">
                  Add a product in seconds
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-xl transition-colors text-white"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Product Name *
            </label>
            <input
              type="text"
              placeholder="e.g., Organic Brown Rice 1kg"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-emerald-500 focus:ring-0 transition-colors text-gray-800"
              disabled={isSubmitting}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Category *
              </label>
              <select
                value={formData.category}
                onChange={(e) =>
                  setFormData({ ...formData, category: e.target.value })
                }
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-emerald-500 focus:ring-0 transition-colors text-gray-800"
                disabled={isSubmitting}
              >
                <option value="">Select...</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Price (₹) *
              </label>
              <input
                type="number"
                placeholder="0.00"
                step="0.01"
                min="0"
                value={formData.price}
                onChange={(e) =>
                  setFormData({ ...formData, price: e.target.value })
                }
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-emerald-500 focus:ring-0 transition-colors text-gray-800"
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Description (Optional)
            </label>
            <textarea
              placeholder="Brief product description..."
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-emerald-500 focus:ring-0 transition-colors text-gray-800 h-20 resize-none"
              disabled={isSubmitting}
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div>
              <p className="font-semibold text-gray-800">Stock Status</p>
              <p className="text-sm text-gray-500">
                Is this product available?
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setFormData({ ...formData, in_stock: !formData.in_stock })
              }
              className={`relative w-14 h-8 rounded-full transition-colors ${formData.in_stock ? "bg-emerald-500" : "bg-gray-300"}`}
              disabled={isSubmitting}
            >
              <span
                className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${formData.in_stock ? "left-7" : "left-1"}`}
              />
            </button>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-5 py-3 text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors font-semibold"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <Link
              to="/admin/products/add"
              className="px-5 py-3 text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors font-semibold text-center"
            >
              Full Form
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-5 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all font-semibold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus size={18} />
                  Add Product
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Product Row Component
const ProductRow: React.FC<{
  product: Product;
  onDelete: (id: string, name: string) => void;
  onToggleStock: (id: string, currentStatus: boolean) => void;
  deleteLoading: string | null;
  toggleLoading: string | null;
}> = ({ product, onDelete, onToggleStock, deleteLoading, toggleLoading }) => (
  <tr className="group hover:bg-gradient-to-r hover:from-gray-50 hover:to-emerald-50/30 transition-all duration-200">
    <td className="px-5 py-4">
      <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">
        {truncateId(product.id)}
      </span>
    </td>
    <td className="px-5 py-4">
      <div className="flex items-center gap-4">
        <ProductImage imageUrl={product.image} productName={product.name} />
        <div>
          <p className="font-semibold text-gray-800 group-hover:text-emerald-600 transition-colors">
            {product.name}
          </p>
          {product.description && (
            <p className="text-xs text-gray-500 truncate max-w-[200px]">
              {product.description}
            </p>
          )}
        </div>
      </div>
    </td>
    <td className="px-5 py-4">
      <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold bg-gradient-to-r from-violet-100 to-purple-100 text-purple-700">
        {product.category}
      </span>
    </td>
    <td className="px-5 py-4">
      <span className="text-lg font-bold text-gray-800">
        {formatPrice(product.price)}
      </span>
    </td>
    <td className="px-5 py-4">
      <button
        onClick={() => onToggleStock(product.id, product.in_stock)}
        disabled={toggleLoading === product.id}
        className="flex items-center gap-2 group/toggle"
      >
        {toggleLoading === product.id ? (
          <Loader2 size={24} className="animate-spin text-gray-400" />
        ) : product.in_stock ? (
          <ToggleRight
            size={28}
            className="text-emerald-500 group-hover/toggle:text-emerald-600"
          />
        ) : (
          <ToggleLeft
            size={28}
            className="text-gray-400 group-hover/toggle:text-gray-500"
          />
        )}
        <span
          className={`text-sm font-medium ${product.in_stock ? "text-emerald-600" : "text-gray-500"}`}
        >
          {product.in_stock ? "In Stock" : "Out of Stock"}
        </span>
      </button>
    </td>
    <td className="px-5 py-4">
      <span
        className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold
        ${
          product.in_stock
            ? "bg-gradient-to-r from-emerald-100 to-teal-100 text-emerald-700"
            : "bg-gradient-to-r from-red-100 to-rose-100 text-red-700"
        }`}
      >
        <span
          className={`w-2 h-2 rounded-full mr-2 ${product.in_stock ? "bg-emerald-500" : "bg-red-500"}`}
        />
        {product.in_stock ? "Active" : "Inactive"}
      </span>
    </td>
    <td className="px-5 py-4">
      <div className="flex justify-end items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Link
          to={`/admin/products/edit/${product.id}`}
          className="p-2.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-all"
          title="Edit"
        >
          <Edit size={18} />
        </Link>
        <button
          onClick={() => onDelete(product.id, product.name)}
          disabled={deleteLoading === product.id}
          className="p-2.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all disabled:opacity-50"
          title="Delete"
        >
          {deleteLoading === product.id ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Trash2 size={18} />
          )}
        </button>
      </div>
    </td>
  </tr>
);

// Product Card for Grid View
const ProductCard: React.FC<{
  product: Product;
  onDelete: (id: string, name: string) => void;
  onToggleStock: (id: string, currentStatus: boolean) => void;
  deleteLoading: string | null;
  toggleLoading: string | null;
}> = ({ product, onDelete, onToggleStock, deleteLoading, toggleLoading }) => (
  <div className="bg-white rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden group border border-gray-100">
    {/* Image */}
    <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-50 p-4 flex items-center justify-center relative">
      <ProductImage
        imageUrl={product.image}
        productName={product.name}
        size="lg"
      />
      <div className="absolute top-3 right-3">
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold shadow-sm
          ${
            product.in_stock
              ? "bg-emerald-500 text-white"
              : "bg-red-500 text-white"
          }`}
        >
          {product.in_stock ? "In Stock" : "Out of Stock"}
        </span>
      </div>
    </div>

    {/* Content */}
    <div className="p-4">
      <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
        #{truncateId(product.id)}
      </span>
      <h3 className="font-bold text-gray-800 mt-2 line-clamp-1">
        {product.name}
      </h3>
      <p className="text-xs text-gray-500 mt-1 line-clamp-2 h-8">
        {product.description || "No description"}
      </p>

      <div className="flex items-center justify-between mt-3">
        <span className="text-xl font-bold text-emerald-600">
          {formatPrice(product.price)}
        </span>
        <span className="text-xs font-medium px-2 py-1 bg-purple-100 text-purple-700 rounded-full">
          {product.category}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
        <button
          onClick={() => onToggleStock(product.id, product.in_stock)}
          disabled={toggleLoading === product.id}
          className="flex-1 py-2 text-sm font-medium rounded-xl transition-colors flex items-center justify-center gap-1.5
            ${product.in_stock ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
        >
          {toggleLoading === product.id ? (
            <Loader2 size={14} className="animate-spin" />
          ) : product.in_stock ? (
            <ToggleRight size={16} />
          ) : (
            <ToggleLeft size={16} />
          )}
          Toggle
        </button>
        <Link
          to={`/admin/products/edit/${product.id}`}
          className="p-2 text-blue-500 hover:bg-blue-50 rounded-xl transition-colors"
        >
          <Edit size={16} />
        </Link>
        <button
          onClick={() => onDelete(product.id, product.name)}
          disabled={deleteLoading === product.id}
          className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50"
        >
          {deleteLoading === product.id ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Trash2 size={16} />
          )}
        </button>
      </div>
    </div>
  </div>
);

// Main Component
const ProductsPage = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Fetch data
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [productsData, categoriesData] = await Promise.all([
        getAdminProducts(),
        getCategories(),
      ]);
      setProducts(productsData);
      setCategories(categoriesData);
    } catch (err) {
      console.error("Error fetching data:", err);
      setError("Failed to load products. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Handle product deletion
  const handleDeleteProduct = async (id: string, productName: string) => {
    if (
      confirm(
        `Are you sure you want to delete "${productName}"? This action cannot be undone.`
      )
    ) {
      try {
        setDeleteLoading(id);
        setError(null);
        const successResult = await deleteProduct(id);

        if (successResult) {
          setProducts((prev) => prev.filter((p) => p.id !== id));
          setSuccess(`"${productName}" has been deleted successfully.`);
          setTimeout(() => setSuccess(null), 3000);
        } else {
          setError("Failed to delete product. Please try again.");
        }
      } catch (err) {
        console.error("Error deleting product:", err);
        setError("An error occurred while deleting the product.");
      } finally {
        setDeleteLoading(null);
      }
    }
  };

  // Handle stock toggle
  const handleToggleStock = async (id: string, currentStatus: boolean) => {
    try {
      setToggleLoading(id);
      setError(null);

      const updated = await updateProduct(id, { in_stock: !currentStatus });

      if (updated) {
        // Update the product in the state
        setProducts((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, in_stock: !currentStatus } : p
          )
        );

        // Show success message
        const newStatus = currentStatus ? "Out of Stock" : "In Stock";
        setSuccess(`Stock status updated to "${newStatus}"`);
        setTimeout(() => setSuccess(null), 2000);
      } else {
        setError("Failed to update stock status. Please try again.");
      }
    } catch (err) {
      console.error("Error toggling stock:", err);
      setError("Failed to update stock status. Please try again.");
    } finally {
      setToggleLoading(null);
    }
  };

  // Filtered and sorted products
  const filteredProducts = useMemo(() => {
    let result = products.filter((product) => {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch =
        product.name.toLowerCase().includes(searchLower) ||
        (product.id && product.id.toLowerCase().includes(searchLower)) ||
        (product.description &&
          product.description.toLowerCase().includes(searchLower));
      const matchesCategory =
        selectedCategory === "All" || product.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "price":
          comparison = a.price - b.price;
          break;
        case "category":
          comparison = (a.category || "").localeCompare(b.category || "");
          break;
        case "in_stock":
          comparison = a.in_stock === b.in_stock ? 0 : a.in_stock ? -1 : 1;
          break;
        case "created_at":
          comparison =
            new Date(a.created_at || 0).getTime() -
            new Date(b.created_at || 0).getTime();
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return result;
  }, [products, searchTerm, selectedCategory, sortField, sortDirection]);

  // Stats
  const stats = useMemo(
    () => ({
      total: products.length,
      inStock: products.filter((p) => p.in_stock).length,
      outOfStock: products.filter((p) => !p.in_stock).length,
    }),
    [products]
  );

  // Pagination
  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const indexOfLastProduct = currentPage * ITEMS_PER_PAGE;
  const indexOfFirstProduct = indexOfLastProduct - ITEMS_PER_PAGE;
  const currentProducts = filteredProducts.slice(
    indexOfFirstProduct,
    indexOfLastProduct
  );

  // Reset page on filter change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory]);

  // Get unique categories from products
  const productCategories = useMemo(
    () => ["All", ...new Set(products.map((p) => p.category).filter(Boolean))],
    [products]
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Products</h1>
            <p className="text-gray-500 mt-1">
              Manage your product inventory and catalog
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchData}
              className="p-3 text-gray-600 bg-white rounded-xl hover:bg-gray-50 transition-colors shadow-sm border border-gray-200"
              title="Refresh"
            >
              <RefreshCw size={20} />
            </button>
            <button
              onClick={() => setShowQuickAdd(true)}
              className="inline-flex items-center px-5 py-3 bg-white text-gray-700 rounded-xl hover:bg-gray-50 transition-all shadow-sm border border-gray-200 font-semibold"
            >
              <Sparkles size={18} className="mr-2 text-amber-500" />
              Quick Add
            </button>
            <Link
              to="/admin/products/add"
              className="inline-flex items-center px-5 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all shadow-lg hover:shadow-xl font-semibold"
            >
              <Plus size={18} className="mr-2" />
              Add Product
            </Link>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <ErrorAlert message={error} onDismiss={() => setError(null)} />
        )}
        {success && (
          <SuccessAlert message={success} onDismiss={() => setSuccess(null)} />
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <StatCard
            icon={Package}
            gradient="bg-gradient-to-br from-blue-500 to-indigo-600"
            label="Total Products"
            value={stats.total}
            trend="+12%"
          />
          <StatCard
            icon={ShoppingCart}
            gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
            label="In Stock"
            value={stats.inStock}
            subtitle={`${((stats.inStock / (stats.total || 1)) * 100).toFixed(0)}% of catalog`}
          />
          <StatCard
            icon={AlertTriangle}
            gradient="bg-gradient-to-br from-red-500 to-rose-600"
            label="Out of Stock"
            value={stats.outOfStock}
            subtitle={
              stats.outOfStock > 0 ? "Needs attention" : "All stocked up!"
            }
          />
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search
                size={20}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search products by name, ID, or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-12 py-3 rounded-xl border-2 border-gray-200 focus:border-emerald-500 focus:ring-0 transition-colors text-gray-800"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-3">
              <Filter size={18} className="text-gray-400" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-emerald-500 focus:ring-0 transition-colors min-w-[160px] text-gray-700"
              >
                {productCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            {/* View Toggle */}
            <div className="flex items-center bg-gray-100 rounded-xl p-1">
              <button
                onClick={() => setViewMode("list")}
                className={`p-2.5 rounded-lg transition-all ${viewMode === "list" ? "bg-white shadow-sm text-emerald-600" : "text-gray-500 hover:text-gray-700"}`}
              >
                <List size={20} />
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={`p-2.5 rounded-lg transition-all ${viewMode === "grid" ? "bg-white shadow-sm text-emerald-600" : "text-gray-500 hover:text-gray-700"}`}
              >
                <Grid3X3 size={20} />
              </button>
            </div>
          </div>
        </div>

        {/* Products */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <LoadingSpinner />
          ) : filteredProducts.length === 0 ? (
            <EmptyState
              searchTerm={searchTerm}
              selectedCategory={selectedCategory}
            />
          ) : viewMode === "list" ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                  <tr className="text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    <th className="px-5 py-4">ID</th>
                    <SortableHeader
                      label="Product"
                      field="name"
                      currentSort={sortField}
                      direction={sortDirection}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Category"
                      field="category"
                      currentSort={sortField}
                      direction={sortDirection}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Price"
                      field="price"
                      currentSort={sortField}
                      direction={sortDirection}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Stock"
                      field="in_stock"
                      currentSort={sortField}
                      direction={sortDirection}
                      onSort={handleSort}
                    />
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {currentProducts.map((product) => (
                    <ProductRow
                      key={product.id}
                      product={product}
                      onDelete={handleDeleteProduct}
                      onToggleStock={handleToggleStock}
                      deleteLoading={deleteLoading}
                      toggleLoading={toggleLoading}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {currentProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onDelete={handleDeleteProduct}
                  onToggleStock={handleToggleStock}
                  deleteLoading={deleteLoading}
                  toggleLoading={toggleLoading}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-gray-600">
                Showing{" "}
                <span className="font-semibold text-gray-800">
                  {indexOfFirstProduct + 1}
                </span>{" "}
                to{" "}
                <span className="font-semibold text-gray-800">
                  {Math.min(indexOfLastProduct, filteredProducts.length)}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-gray-800">
                  {filteredProducts.length}
                </span>{" "}
                products
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(prev - 1, 1))
                  }
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
                          ${
                            currentPage === page
                              ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg"
                              : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                          }`}
                      >
                        {page}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                  }
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

      {/* Quick Add Modal */}
      <QuickAddModal
        isOpen={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        categories={categories}
        onProductAdded={() => {
          fetchData();
          setSuccess("Product added successfully!");
          setTimeout(() => setSuccess(null), 3000);
        }}
      />
    </AdminLayout>
  );
};

export default ProductsPage;
