import { useState, useEffect, useRef, useCallback } from 'react';
import type { ChangeEvent, DragEvent, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Save,
  Plus,
  ImageOff,
  Trash2,
  Upload,
  RefreshCw,
  ShieldAlert,
  IndianRupee,
} from 'lucide-react';
import {
  createProduct,
  createCategory,
  uploadProductImage,
  notifyAdminAction,
  getCategories,
} from '../../services/adminService';
import { getCurrentAdmin } from '../../services/secureAdminAuth';
import { hasRole } from '../../services/adminAuthService';
import {
  PageHeader,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  FormField,
  Input,
  Select,
  Textarea,
  Button,
  LinkButton,
  Toggle,
  Alert,
  EmptyState,
  Spinner,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { cn } from '../../utils/cn';

/**
 * The one image persisted for a product (master_products.image_url).
 *
 * Decision (2026-10-04): public.product_images exists in the baseline
 * migration, but nothing in admin/, frontend/ or backend/ reads or writes it
 * and master_products has no images column. The previous gallery UI here
 * (reorder / set primary / "add more") therefore uploaded files that were
 * never attached to the product. The form now promises exactly what is
 * stored — a single image, with upload and remove — matching EditProductPage.
 */
interface ImageData {
  id: string;
  url: string;
  isUploading: boolean;
}

// Mirrors the product-images storage bucket configuration.
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const generateId = () => `img_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

interface ImageTileProps {
  image: ImageData;
  onRemove: () => void;
}

function ImageTile({ image, onRemove }: ImageTileProps) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="w-48 shrink-0">
      <div className="relative aspect-square overflow-hidden rounded-md border border-gray-200 bg-gray-50">
        {failed ? (
          <div className="flex h-full flex-col items-center justify-center text-gray-400">
            <ImageOff className="h-5 w-5" aria-hidden="true" />
            <span className="mt-2 text-xs">Failed to load</span>
          </div>
        ) : (
          <img
            src={image.url}
            alt="Product image"
            className="h-full w-full object-cover"
            onError={() => setFailed(true)}
          />
        )}
        {image.isUploading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/80">
            <Spinner size="sm" />
            <span className="text-xs font-medium text-gray-600">Uploading…</span>
          </div>
        ) : null}
      </div>
      <Button
        variant="dangerOutline"
        size="sm"
        leftIcon={<Trash2 />}
        onClick={onRemove}
        disabled={image.isUploading}
        className="mt-2"
        fullWidth
      >
        Remove image
      </Button>
    </div>
  );
}

type FieldErrorKey =
  | 'name'
  | 'price'
  | 'original_price'
  | 'category'
  | 'newCategoryName'
  | 'max_quantity';
type FieldErrors = Partial<Record<FieldErrorKey, string>>;
/** Validated controls top to bottom; each key is also that control's DOM id. */
const FIELD_ORDER: FieldErrorKey[] = ['name', 'category', 'newCategoryName', 'price', 'original_price', 'max_quantity'];

const EMPTY_NEW_CATEGORY = {
  name: '',
  description: '',
  image_url: '',
  display_order: '',
};

const AddProductPage = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const currentAdmin = getCurrentAdmin();
  const canEditProducts = Boolean(currentAdmin && hasRole(currentAdmin, ['super_admin', 'admin']));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [categories, setCategories] = useState<string[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const categoriesRequestRef = useRef(0);
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [image, setImage] = useState<ImageData | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Depth counter so dragleave fired by child elements does not flicker the
  // highlight off (the previous currentTarget === ref check was always true).
  const dragDepthRef = useRef(0);
  // Mirror of `image` for use in handlers/cleanup outside state updaters.
  const imageRef = useRef<ImageData | null>(null);
  // Sits above the page title: a save failure scrolls back up to the error
  // banner, which is out of view when Create is pressed at the foot of the form.
  const errorAnchorRef = useRef<HTMLDivElement>(null);

  const [newCategoryData, setNewCategoryData] = useState(EMPTY_NEW_CATEGORY);

  const [formData, setFormData] = useState({
    name: '',
    price: '',
    original_price: '',
    description: '',
    category: '',
    in_stock: true,
    unit: '',
    brand: '',
    min_quantity: '1',
    max_quantity: '100',
    gst_rate: '',
    hsn_code: '',
    hsn_description: '',
    cgst: '',
    sgst: '',
  });

  useEffect(() => {
    imageRef.current = image;
  }, [image]);

  // Revoke a preview blob URL still around on unmount (an in-flight placeholder).
  useEffect(
    () => () => {
      const current = imageRef.current;
      if (current?.url.startsWith('blob:')) URL.revokeObjectURL(current.url);
    },
    [],
  );

  // Fetch categories for dropdown. Request-id guard drops stale responses
  // when Retry is pressed while an earlier request is still in flight.
  const fetchCategories = useCallback(async () => {
    const requestId = ++categoriesRequestRef.current;
    setCategoriesLoading(true);
    setCategoriesError(null);
    try {
      const data = await getCategories();
      if (requestId !== categoriesRequestRef.current) return;
      const categoryNames = data.map((cat) => cat.name);
      setCategories(categoryNames);
    } catch (err) {
      if (requestId !== categoriesRequestRef.current) return;
      console.error('Error fetching categories:', err);
      setCategoriesError('The category list could not be loaded. Retry, or choose “+ Create new category” in the list above.');
    } finally {
      if (requestId === categoriesRequestRef.current) setCategoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    // Viewers/managers only see the not-permitted state; skip the request.
    if (canEditProducts) void fetchCategories();
  }, [canEditProducts, fetchCategories]);

  const clearFieldError = (key: FieldErrorKey) => {
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  // Save/upload failures: set the banner and scroll it into view.
  const showFormError = (message: string) => {
    setError(message);
    errorAnchorRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  // Half of a GST rate as an input string ('18' -> '9', '5' -> '2.5').
  const halfRate = (rate: string) => {
    if (!rate) return '';
    const value = parseFloat(rate);
    if (Number.isNaN(value)) return '';
    return String(Number((value / 2).toFixed(2)));
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    if (name === 'gst_rate') {
      // Intra-state GST is split equally: pre-fill CGST and SGST as half the
      // rate. Both stay editable for the rare case that needs a different split.
      const half = halfRate(value);
      setFormData((prev) => ({ ...prev, gst_rate: value, cgst: half, sgst: half }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
    if (name === 'name' || name === 'price' || name === 'original_price' || name === 'max_quantity') {
      clearFieldError(name);
    }
    if (name === 'min_quantity') clearFieldError('max_quantity');
  };

  const handleCategoryChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    clearFieldError('category');
    if (value === '__NEW_CATEGORY__') {
      setShowNewCategoryInput(true);
      setFormData((prev) => ({ ...prev, category: '' }));
    } else {
      setShowNewCategoryInput(false);
      setNewCategoryData(EMPTY_NEW_CATEGORY);
      clearFieldError('newCategoryName');
      setFormData((prev) => ({ ...prev, category: value }));
    }
  };

  const handleNewCategoryChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setNewCategoryData((prev) => ({ ...prev, [name]: value }));
    if (name === 'name') clearFieldError('newCategoryName');
  };

  // Upload one file: show the local preview at once, swap in the public URL
  // when the upload finishes, and put the previous image back (or clear the
  // tile) if it fails. A drop while an upload is in flight is ignored.
  const handleFile = useCallback(async (file: File) => {
    if (imageRef.current?.isUploading) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setImageError(`${file.name} was not added: use a JPG, PNG, WebP or GIF image.`);
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setImageError(`${file.name} was not added: images must be 5MB or smaller.`);
      return;
    }
    setImageError(null);

    const previous = imageRef.current;
    const placeholder: ImageData = { id: generateId(), url: URL.createObjectURL(file), isUploading: true };
    setImage(placeholder);

    let uploadedUrl: string | null = null;
    try {
      uploadedUrl = await uploadProductImage(file);
    } catch (err) {
      console.error('Upload error:', err);
    }

    setImage((current) => {
      // Removed while uploading: leave the user's choice alone.
      if (current?.id !== placeholder.id) return current;
      return uploadedUrl ? { id: placeholder.id, url: uploadedUrl, isUploading: false } : previous;
    });
    // Revoked outside the state updater (updaters may run twice under StrictMode).
    URL.revokeObjectURL(placeholder.url);
    if (!uploadedUrl) {
      setImageError(previous ? 'Upload failed. The previous image was kept.' : 'Upload failed. Please try again.');
    }
  }, []);

  // Drag and drop handlers
  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  };

  // File input change handler
  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    // Reset input so re-selecting the same file fires change again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeImage = () => {
    const current = imageRef.current;
    if (!current || current.isUploading) return;
    if (current.url.startsWith('blob:')) URL.revokeObjectURL(current.url);
    setImage(null);
    setImageError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation (inline per field)
    const errors: FieldErrors = {};
    const price = parseFloat(formData.price);
    if (!formData.name.trim()) {
      errors.name = 'Product name is required';
    }
    if (!formData.price || Number.isNaN(price) || price <= 0) {
      errors.price = 'Enter a selling price greater than 0';
    }
    if (formData.original_price) {
      const mrp = parseFloat(formData.original_price);
      if (Number.isNaN(mrp) || mrp < 0) {
        errors.original_price = 'Enter a valid MRP';
      } else if (!errors.price && mrp < price) {
        // master_products has CHECK (discounted_price <= base_price); catch it
        // here instead of surfacing the raw Postgres constraint message.
        errors.original_price = 'MRP must be greater than or equal to the selling price';
      }
    }
    if (!formData.category && !showNewCategoryInput) {
      errors.category = 'Category is required';
    }
    if (showNewCategoryInput && !newCategoryData.name.trim()) {
      errors.newCategoryName = 'New category name is required';
    }
    const minQty = formData.min_quantity ? parseInt(formData.min_quantity, 10) : undefined;
    const maxQty = formData.max_quantity ? parseInt(formData.max_quantity, 10) : undefined;
    if (minQty !== undefined && maxQty !== undefined && minQty > maxQty) {
      errors.max_quantity = 'Max order quantity must be at least the min order quantity';
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError('Please fix the highlighted fields before saving.');
      // Focus (and scroll to) the first invalid control rather than leaving
      // the user at the submit button with the summary banner off-screen.
      const first = FIELD_ORDER.find((key) => errors[key]);
      if (first) document.getElementById(first)?.focus();
      return;
    }

    if (image?.isUploading) {
      showFormError('Please wait for the image to finish uploading');
      return;
    }

    let stage: 'category' | 'product' = 'product';
    try {
      setLoading(true);

      // Create new category if needed
      let categoryToUse = formData.category;
      if (showNewCategoryInput && newCategoryData.name.trim()) {
        stage = 'category';
        const categoryPayload = {
          name: newCategoryData.name.trim(),
          description: newCategoryData.description.trim() || undefined,
          image_url: newCategoryData.image_url.trim() || undefined,
          display_order: newCategoryData.display_order ? parseInt(newCategoryData.display_order, 10) : undefined,
        };

        const newCategory = await createCategory(categoryPayload);

        // createCategory throws on failure, so this is only a defensive guard.
        if (!newCategory) {
          showFormError('Failed to create new category. Please try again.');
          return;
        }

        categoryToUse = newCategory.name;
        stage = 'product';
      }

      const productData = {
        name: formData.name.trim(),
        price,
        original_price: formData.original_price ? parseFloat(formData.original_price) : undefined,
        description: formData.description.trim() || undefined,
        // Exactly one image is stored (master_products.image_url) — see ImageData.
        image: image && !image.isUploading ? image.url : undefined,
        category: categoryToUse,
        in_stock: formData.in_stock,
        // A new product has no reviews yet (toMasterProduct defaults to 0 too).
        rating: 0,
        rating_count: 0,
        // master_products.unit is NOT NULL; toMasterProduct falls back to 'piece' on create only.
        unit: formData.unit.trim() || 'piece',
        brand: formData.brand.trim() || undefined,
        min_quantity: minQty,
        max_quantity: maxQty,
        gst_rate: formData.gst_rate ? parseFloat(formData.gst_rate) : undefined,
        hsn_code: formData.hsn_code.trim() || undefined,
        hsn_description: formData.hsn_description.trim() || undefined,
        cgst: formData.cgst ? parseFloat(formData.cgst) : undefined,
        sgst: formData.sgst ? parseFloat(formData.sgst) : undefined,
      };

      const result = await createProduct(productData);

      if (result) {
        await notifyAdminAction('created product', productData.name, {
          product_id: result.id,
          product_name: productData.name,
        });
        // Redirect immediately and confirm with a toast. The previous success
        // banner + 1.5s delayed navigate re-enabled the Save button in the
        // meantime, so a second click created a duplicate product.
        showToast(`Product "${productData.name}" created`, 'success');
        navigate('/products');
      } else {
        showFormError('Failed to create product. Please try again.');
      }
    } catch (err: unknown) {
      console.error('Error creating product:', err);
      const details = err as { message?: string; code?: string } | null;
      const raw = details?.message || '';
      let friendly: string;
      if (raw.includes('check_discounted_price')) {
        friendly = 'MRP must be greater than or equal to the selling price.';
      } else if (details?.code === '23505' || raw.includes('duplicate key')) {
        friendly =
          stage === 'category'
            ? 'A category with this name already exists. Pick it from the list instead.'
            : 'A product with these details already exists.';
      } else {
        friendly = raw || 'An unexpected error occurred.';
      }
      showFormError(
        stage === 'category' ? `Could not create the category: ${friendly}` : `Could not create the product: ${friendly}`,
      );
    } finally {
      setLoading(false);
    }
  };

  const uploading = Boolean(image?.isUploading);

  // Tax split sanity check (non-blocking)
  const gstRateValue = formData.gst_rate ? parseFloat(formData.gst_rate) : null;
  const cgstValue = formData.cgst ? parseFloat(formData.cgst) : null;
  const sgstValue = formData.sgst ? parseFloat(formData.sgst) : null;
  const taxSplitMismatch =
    gstRateValue !== null &&
    cgstValue !== null &&
    sgstValue !== null &&
    !Number.isNaN(gstRateValue) &&
    !Number.isNaN(cgstValue) &&
    !Number.isNaN(sgstValue) &&
    Math.abs(cgstValue + sgstValue - gstRateValue) > 0.001;
  const taxSplitTotal = Number(((cgstValue ?? 0) + (sgstValue ?? 0)).toFixed(2));

  if (!canEditProducts) {
    return (
      <>
        <PageHeader
          title="Add product"
          description="Create a new product in the master catalog."
          backTo="/products"
          backLabel="Back to products"
        />
        <Card>
          <EmptyState
            icon={ShieldAlert}
            title="Not permitted"
            description="Only super admins and admins can create catalog products."
            action={
              <LinkButton to="/products" variant="secondary">
                Back to products
              </LinkButton>
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <div ref={errorAnchorRef} />
      <PageHeader
        title="Add product"
        description="Create a new product in the master catalog."
        backTo="/products"
        backLabel="Back to products"
      />

      <form onSubmit={handleSubmit} noValidate className="max-w-4xl space-y-6">
        {error && (
          <Alert tone="danger" title="Product not saved" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Basic information */}
        <Card>
          <CardHeader title="Basic information" description="Name, category and description shown to customers." />
          <CardBody>
            <div className="grid gap-5 md:grid-cols-2">
              <FormField label="Product name" htmlFor="name" required error={fieldErrors.name} className="md:col-span-2">
                <Input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  invalid={Boolean(fieldErrors.name)}
                  placeholder="e.g., Organic Basmati Rice"
                />
              </FormField>

              <FormField
                label="Category"
                htmlFor="category"
                required
                error={fieldErrors.category}
                className="md:col-span-2"
              >
                <Select
                  id="category"
                  name="category"
                  value={showNewCategoryInput ? '__NEW_CATEGORY__' : formData.category}
                  onChange={handleCategoryChange}
                  required={!showNewCategoryInput}
                  disabled={categoriesLoading}
                  invalid={Boolean(fieldErrors.category)}
                >
                  <option value="">{categoriesLoading ? 'Loading categories…' : 'Select a category'}</option>
                  <option value="__NEW_CATEGORY__">+ Create new category</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </Select>
              </FormField>

              {categoriesError && (
                <Alert
                  tone="danger"
                  title="Could not load categories"
                  className="md:col-span-2"
                  actions={
                    <Button variant="secondary" size="sm" leftIcon={<RefreshCw />} onClick={() => void fetchCategories()}>
                      Retry
                    </Button>
                  }
                >
                  {categoriesError}
                </Alert>
              )}

              {/* New category sub-form */}
              {showNewCategoryInput && (
                <div className="rounded-md border border-gray-200 bg-gray-50 p-4 md:col-span-2">
                  <div className="mb-4 flex items-center gap-2">
                    <Plus className="h-4 w-4 text-brand-600" aria-hidden="true" />
                    <h4 className="text-sm font-semibold text-gray-900">New category</h4>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      label="Category name"
                      htmlFor="newCategoryName"
                      required
                      error={fieldErrors.newCategoryName}
                      className="md:col-span-2"
                    >
                      <Input
                        type="text"
                        id="newCategoryName"
                        name="name"
                        value={newCategoryData.name}
                        onChange={handleNewCategoryChange}
                        placeholder="e.g., Vegetables, Fruits, Dairy"
                        required
                        invalid={Boolean(fieldErrors.newCategoryName)}
                      />
                    </FormField>

                    <FormField label="Display order" htmlFor="newCategoryDisplayOrder" hint="Lower numbers appear first.">
                      <Input
                        type="number"
                        id="newCategoryDisplayOrder"
                        name="display_order"
                        value={newCategoryData.display_order}
                        onChange={handleNewCategoryChange}
                        min="0"
                        placeholder="1, 2, 3…"
                        className="tabular-nums"
                      />
                    </FormField>

                    <FormField label="Image URL" htmlFor="newCategoryImageUrl">
                      <Input
                        type="url"
                        id="newCategoryImageUrl"
                        name="image_url"
                        value={newCategoryData.image_url}
                        onChange={handleNewCategoryChange}
                        placeholder="https://example.com/category-image.jpg"
                      />
                    </FormField>

                    <FormField label="Description" htmlFor="newCategoryDescription" className="md:col-span-2">
                      <Textarea
                        id="newCategoryDescription"
                        name="description"
                        value={newCategoryData.description}
                        onChange={handleNewCategoryChange}
                        rows={2}
                        placeholder="Enter category description…"
                      />
                    </FormField>
                  </div>
                </div>
              )}

              <FormField label="Description" htmlFor="description" className="md:col-span-2">
                <Textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Enter product description…"
                />
              </FormField>
            </div>
          </CardBody>
        </Card>

        {/* Product image */}
        <Card>
          <CardHeader
            title="Product image"
            description="One image is stored per product and shown in listings and on the product page."
          />
          <CardBody>
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              onChange={handleFileInputChange}
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
            />
            <FormField error={imageError ?? undefined}>
              <div className="flex flex-col gap-5 sm:flex-row">
                {image ? <ImageTile key={image.id} image={image} onRemove={removeImage} /> : null}
                {/* Drop zone (a real button so it is keyboard accessible) */}
                <button
                  type="button"
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className={cn(
                    'flex min-h-[12rem] flex-1 flex-col items-center justify-center rounded-md border-2 border-dashed px-6 py-8 text-center transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    isDragging ? 'border-brand-500 bg-brand-50' : 'border-gray-300 bg-white hover:border-brand-400 hover:bg-gray-50',
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none flex h-10 w-10 items-center justify-center rounded-md',
                      isDragging ? 'bg-brand-100 text-brand-600' : 'bg-gray-100 text-gray-400',
                    )}
                  >
                    <Upload className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="pointer-events-none mt-3 text-sm font-medium text-gray-700">
                    {isDragging
                      ? 'Drop the image here'
                      : image
                        ? 'Drop a new image to replace the current one'
                        : 'Drag and drop an image here'}
                  </span>
                  <span className="pointer-events-none mt-1 text-xs text-gray-500">or click to browse files</span>
                  <span className="pointer-events-none mt-3 text-xs text-gray-500">
                    JPG, PNG, WebP or GIF, up to 5MB
                  </span>
                </button>
              </div>
            </FormField>
          </CardBody>
        </Card>

        {/* Pricing and details */}
        <Card>
          <CardHeader title="Pricing and details" description="Selling price, MRP, unit and order quantity limits." />
          <CardBody>
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              <FormField label="Selling price" htmlFor="price" required error={fieldErrors.price}>
                <Input
                  type="number"
                  id="price"
                  name="price"
                  value={formData.price}
                  onChange={handleChange}
                  required
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  invalid={Boolean(fieldErrors.price)}
                  leftIcon={<IndianRupee />}
                  placeholder="0.00"
                  className="tabular-nums"
                />
              </FormField>

              <FormField
                label="MRP"
                htmlFor="original_price"
                error={fieldErrors.original_price}
                hint="Original price before discount. Must be at least the selling price."
              >
                <Input
                  type="number"
                  id="original_price"
                  name="original_price"
                  value={formData.original_price}
                  onChange={handleChange}
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  invalid={Boolean(fieldErrors.original_price)}
                  leftIcon={<IndianRupee />}
                  placeholder="0.00"
                  className="tabular-nums"
                />
              </FormField>

              <FormField label="Unit / size" htmlFor="unit" hint="Pack size, e.g. 1kg or 500ml. Defaults to “piece” when left blank.">
                <Input
                  type="text"
                  id="unit"
                  name="unit"
                  value={formData.unit}
                  onChange={handleChange}
                  placeholder="e.g., 1kg, 500g, piece"
                />
              </FormField>

              <FormField label="Brand" htmlFor="brand">
                <Input
                  type="text"
                  id="brand"
                  name="brand"
                  value={formData.brand}
                  onChange={handleChange}
                  placeholder="e.g., Amul"
                />
              </FormField>

              <FormField label="Min order quantity" htmlFor="min_quantity">
                <Input
                  type="number"
                  id="min_quantity"
                  name="min_quantity"
                  value={formData.min_quantity}
                  onChange={handleChange}
                  min="1"
                  step="1"
                  inputMode="numeric"
                  placeholder="1"
                  className="tabular-nums"
                />
              </FormField>

              <FormField label="Max order quantity" htmlFor="max_quantity" error={fieldErrors.max_quantity}>
                <Input
                  type="number"
                  id="max_quantity"
                  name="max_quantity"
                  value={formData.max_quantity}
                  onChange={handleChange}
                  min="1"
                  step="1"
                  inputMode="numeric"
                  invalid={Boolean(fieldErrors.max_quantity)}
                  placeholder="100"
                  className="tabular-nums"
                />
              </FormField>
            </div>
          </CardBody>
        </Card>

        {/* Tax and HSN */}
        <Card>
          <CardHeader
            title="Tax and HSN"
            description="GST rate and HSN classification used on invoices. CGST and SGST are pre-filled as half the GST rate."
          />
          <CardBody className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
              <FormField label="GST rate (%)" htmlFor="gst_rate">
                <Input
                  type="number"
                  id="gst_rate"
                  name="gst_rate"
                  value={formData.gst_rate}
                  onChange={handleChange}
                  min="0"
                  max="100"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="e.g., 18"
                  className="tabular-nums"
                />
              </FormField>

              <FormField label="CGST (%)" htmlFor="cgst">
                <Input
                  type="number"
                  id="cgst"
                  name="cgst"
                  value={formData.cgst}
                  onChange={handleChange}
                  min="0"
                  max="100"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="e.g., 9"
                  className="tabular-nums"
                />
              </FormField>

              <FormField label="SGST (%)" htmlFor="sgst">
                <Input
                  type="number"
                  id="sgst"
                  name="sgst"
                  value={formData.sgst}
                  onChange={handleChange}
                  min="0"
                  max="100"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="e.g., 9"
                  className="tabular-nums"
                />
              </FormField>

              <FormField label="HSN code" htmlFor="hsn_code">
                <Input
                  type="text"
                  id="hsn_code"
                  name="hsn_code"
                  value={formData.hsn_code}
                  onChange={handleChange}
                  placeholder="e.g., 1905"
                  className="tabular-nums"
                />
              </FormField>

              <FormField label="HSN description" htmlFor="hsn_description" className="md:col-span-2 lg:col-span-4">
                <Input
                  type="text"
                  id="hsn_description"
                  name="hsn_description"
                  value={formData.hsn_description}
                  onChange={handleChange}
                  placeholder="e.g., Bread, pastry, cakes"
                />
              </FormField>
            </div>

            {taxSplitMismatch && (
              <Alert tone="warning" title="Tax split does not add up">
                CGST + SGST ({taxSplitTotal}%) does not match the GST rate ({gstRateValue}%). Invoices use
                these values as entered.
              </Alert>
            )}
          </CardBody>
        </Card>

        {/* Availability + actions */}
        <Card>
          <CardHeader title="Availability" description="Controls whether the product is active in the catalog." />
          <CardBody>
            <Toggle
              id="is_active"
              checked={formData.in_stock}
              onChange={(next) => setFormData((prev) => ({ ...prev, in_stock: next }))}
              disabled={loading}
              label="Active in catalog"
              description="Inactive products are hidden from stores and customers until re-enabled."
            />
          </CardBody>
          <CardFooter className="flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => navigate('/products')} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" loading={loading} disabled={uploading} leftIcon={<Save />}>
              {loading ? 'Creating…' : uploading ? 'Uploading image…' : 'Create product'}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </>
  );
};

export default AddProductPage;
