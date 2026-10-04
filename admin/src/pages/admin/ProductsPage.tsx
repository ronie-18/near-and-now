import { useState, useEffect, useMemo, useRef, useCallback, useId } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Edit,
  Trash2,
  Package,
  CheckCircle2,
  XCircle,
  ImageOff,
  RefreshCw,
  Grid3X3,
  List,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import IdCell from "../../components/admin/IdCell";
import {
  getAdminProductsPaginated,
  getProductStats,
  deleteProduct,
  createProduct,
  updateProduct,
  getCategories,
  Category,
  notifyAdminAction,
} from "../../services/adminService";
import { Product } from "../../services/supabase";
import {
  PageHeader,
  StatCard,
  StatGrid,
  Card,
  CardBody,
  FilterBar,
  SearchInput,
  Select,
  Button,
  IconButton,
  LinkButton,
  Tooltip,
  TableContainer,
  Table,
  THead,
  TBody,
  Tr,
  Th,
  Td,
  TableEmptyRow,
  TableSkeletonRows,
  Pagination,
  Modal,
  FormField,
  Input,
  Textarea,
  Toggle,
  Badge,
  StatusBadge,
  Alert,
  EmptyState,
  SegmentedControl,
  Skeleton,
  useConfirm,
} from "../../components/ui";
import { useToast } from "../../context/ToastContext";
import { cn } from "../../utils/cn";
import { formatCurrency, formatNumber } from "../../utils/format";

// Constants
const PAGE_SIZE_OPTIONS: number[] = [10, 25, 50, 100];
const TABLE_COLUMNS = 6;

type SortField = "name" | "price" | "category" | "in_stock" | "created_at";
type SortDirection = "asc" | "desc";
type SortKey = `${SortField}:${SortDirection}`;
type ViewMode = "list" | "grid";

// Sort control shown in the filter bar so sorting is reachable from the grid
// view too (the grid previously inherited whatever the list headers last
// chose, with no way to change it). The field names map to database columns
// through the service's PRODUCT_SORT_COLUMN (in_stock -> is_active,
// price -> discounted_price).
const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "name:asc", label: "Name A–Z" },
  { value: "name:desc", label: "Name Z–A" },
  { value: "price:asc", label: "Price: low to high" },
  { value: "price:desc", label: "Price: high to low" },
  { value: "category:asc", label: "Category A–Z" },
  { value: "category:desc", label: "Category Z–A" },
  { value: "in_stock:desc", label: "Active first" },
  { value: "in_stock:asc", label: "Inactive first" },
  { value: "created_at:desc", label: "Newest first" },
  { value: "created_at:asc", label: "Oldest first" },
];

// Quick Add accepts paise (step 0.01); only show them when the price has any.
const priceLabel = (price: number) =>
  formatCurrency(price, { paise: !Number.isInteger(price) });

// Product Image Component
interface ProductImageProps {
  imageUrl?: string;
  productName: string;
  size?: "sm" | "md" | "lg";
}

const IMAGE_SIZE: Record<NonNullable<ProductImageProps["size"]>, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-xs",
  lg: "h-24 w-24 text-base",
};

const ProductImage = ({ imageUrl, productName, size = "md" }: ProductImageProps) => {
  const [imgError, setImgError] = useState(false);

  if (imageUrl && !imgError) {
    return (
      <img
        src={imageUrl}
        // Both call sites render the product name right next to the
        // thumbnail, so an alt would be read twice; treat it as decorative.
        alt=""
        className={cn(IMAGE_SIZE[size], "shrink-0 rounded-md border border-gray-200 bg-white object-cover")}
        loading="lazy"
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div
      className={cn(
        IMAGE_SIZE[size],
        "flex shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-100 text-gray-500"
      )}
      aria-hidden="true"
    >
      {imgError ? (
        <ImageOff className="h-1/2 w-1/2 text-gray-400" />
      ) : (
        <span className="font-semibold">{productName.substring(0, 2).toUpperCase()}</span>
      )}
    </div>
  );
};

// Sortable Column Header — a real button inside the <th> so sorting works
// from the keyboard, with aria-sort announcing the current direction.
interface SortableHeaderProps {
  label: string;
  field: SortField;
  currentSort: SortField;
  direction: SortDirection;
  onSort: (field: SortField) => void;
  align?: "left" | "right";
}

const SortableHeader = ({
  label,
  field,
  currentSort,
  direction,
  onSort,
  align = "left",
}: SortableHeaderProps) => {
  const active = currentSort === field;
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <Th
      align={align}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm uppercase transition-colors hover:text-gray-900",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
          active && "text-gray-900"
        )}
      >
        {label}
        <Icon
          className={cn("h-3.5 w-3.5", active ? "text-brand-600" : "text-gray-400")}
          aria-hidden="true"
        />
      </button>
    </Th>
  );
};

// Quick Add Modal
const EMPTY_FORM = {
  name: "",
  category: "",
  price: "",
  in_stock: true,
  description: "",
};

type QuickAddFieldErrors = Partial<Record<"name" | "category" | "price", string>>;

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
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<QuickAddFieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const formId = useId();
  const ids = {
    name: `${formId}-name`,
    category: `${formId}-category`,
    price: `${formId}-price`,
    description: `${formId}-description`,
  };

  // This component stays mounted at all times (the shared Modal renders
  // nothing while closed, but this wrapper and its state live on), and
  // formData previously only reset after a successful submit —
  // Cancel/X/backdrop-click just closed it, leaving whatever was typed
  // showing again the next time it opened. Reset on every open instead, so
  // it doesn't matter which of those ways the previous attempt ended.
  useEffect(() => {
    if (isOpen) {
      setFormData(EMPTY_FORM);
      setFieldErrors({});
      setError(null);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);

    const nextErrors: QuickAddFieldErrors = {};
    if (!formData.name.trim()) {
      nextErrors.name = "Product name is required";
    }
    if (!formData.category) {
      nextErrors.category = "Please select a category";
    }
    if (!formData.price || parseFloat(formData.price) <= 0) {
      nextErrors.price = "Please enter a valid price";
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      setIsSubmitting(true);
      // created_at/updated_at are not sent: toMasterProduct() ignores them
      // and the database sets its own timestamps.
      await createProduct({
        name: formData.name.trim(),
        category: formData.category,
        price: parseFloat(formData.price),
        in_stock: formData.in_stock,
        description: formData.description.trim() || undefined,
        image: undefined,
        unit: 'piece',
      });

      // Reset form and close
      setFormData(EMPTY_FORM);
      onProductAdded();
      onClose();
    } catch (err) {
      console.error("Error creating product:", err);
      setError("Failed to create product. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const noCategories = categories.length === 0;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Quick add product"
      description="Create a product with the essentials. Use the full form for images, GST and pack details."
      initialFocusRef={nameRef}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <LinkButton to="/products/add" variant="secondary">
            Open full form
          </LinkButton>
          <Button type="submit" form={formId} loading={isSubmitting} leftIcon={<Plus />}>
            Add product
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-5" noValidate>
        {error && (
          <Alert tone="danger" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        )}

        <FormField label="Product name" htmlFor={ids.name} required error={fieldErrors.name}>
          <Input
            ref={nameRef}
            id={ids.name}
            type="text"
            placeholder="e.g. Organic brown rice 1 kg"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            invalid={Boolean(fieldErrors.name)}
            disabled={isSubmitting}
          />
        </FormField>

        <div className="grid gap-5 md:grid-cols-2">
          <FormField
            label="Category"
            htmlFor={ids.category}
            required
            error={fieldErrors.category}
            hint={noCategories ? "No categories are available. Retry loading them or add a category first." : undefined}
          >
            <Select
              id={ids.category}
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              invalid={Boolean(fieldErrors.category)}
              disabled={isSubmitting || noCategories}
            >
              <option value="">Select a category</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.name}>
                  {cat.name}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Price (₹)" htmlFor={ids.price} required error={fieldErrors.price}>
            <Input
              id={ids.price}
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              step="0.01"
              min="0"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              invalid={Boolean(fieldErrors.price)}
              disabled={isSubmitting}
              className="tabular-nums"
            />
          </FormField>
        </div>

        <FormField label="Description" htmlFor={ids.description} hint="Optional">
          <Textarea
            id={ids.description}
            placeholder="Brief product description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            disabled={isSubmitting}
            rows={3}
          />
        </FormField>

        <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
          <Toggle
            checked={formData.in_stock}
            onChange={(next) => setFormData({ ...formData, in_stock: next })}
            disabled={isSubmitting}
            label="Active"
            description="Active products are available in the catalog."
          />
        </div>
      </form>
    </Modal>
  );
};

// Shared props for the list row and grid card
interface ProductItemProps {
  product: Product;
  onDelete: (id: string, name: string) => void;
  onToggleStock: (id: string, currentStatus: boolean) => void;
  deleteLoading: string | null;
  toggleLoading: string | null;
}

// Row actions are always visible (no hover-only reveal) so they work with a
// keyboard and on touch screens.
const ProductActions = ({ product, onDelete, deleteLoading }: Pick<ProductItemProps, "product" | "onDelete" | "deleteLoading">) => (
  <div className="flex items-center justify-end gap-1">
    <Tooltip content="Edit">
      {/* A real link (middle-click / open in new tab), not a button that
          navigates. `!px-0`: the sm button's px-3 would otherwise win over
          px-0 in CSS order (same pattern as CategoriesPage). */}
      <LinkButton
        to={`/products/edit/${product.id}`}
        variant="ghost"
        size="sm"
        aria-label={`Edit ${product.name}`}
        className="w-8 !px-0"
      >
        <Edit className="h-4 w-4" aria-hidden="true" />
      </LinkButton>
    </Tooltip>
    <Tooltip content="Delete">
      <IconButton
        variant="ghost"
        size="sm"
        aria-label={`Delete ${product.name}`}
        onClick={() => onDelete(product.id, product.name)}
        loading={deleteLoading === product.id}
        className="text-red-600 hover:bg-red-50 hover:text-red-700"
      >
        <Trash2 />
      </IconButton>
    </Tooltip>
  </div>
);

// Product Row Component
const ProductRow = ({ product, onDelete, onToggleStock, deleteLoading, toggleLoading }: ProductItemProps) => (
  <Tr>
    <Td nowrap>
      <IdCell id={product.id} />
    </Td>
    <Td>
      <div className="flex items-center gap-3">
        <ProductImage imageUrl={product.image} productName={product.name} />
        <div className="min-w-0">
          <Link
            to={`/products/edit/${product.id}`}
            className="font-medium text-gray-900 hover:text-brand-700 hover:underline"
          >
            {product.name}
          </Link>
          {product.description && (
            <p className="max-w-xs truncate text-xs text-gray-500">{product.description}</p>
          )}
        </div>
      </div>
    </Td>
    <Td nowrap>
      <Badge tone="neutral">{product.category}</Badge>
    </Td>
    <Td align="right" nowrap className="font-medium text-gray-900 tabular-nums">
      {priceLabel(product.price)}
    </Td>
    <Td nowrap>
      {/* One column for the single underlying flag (master_products.is_active,
          exposed as `in_stock` by the service): the switch changes it, the
          badge names it. */}
      <div className="flex items-center gap-3">
        <Toggle
          size="sm"
          checked={product.in_stock}
          onChange={() => onToggleStock(product.id, product.in_stock)}
          disabled={toggleLoading === product.id}
          aria-label={`${product.in_stock ? "Deactivate" : "Activate"} ${product.name}`}
        />
        <StatusBadge kind="generic" value={product.in_stock ? "active" : "inactive"} />
      </div>
    </Td>
    <Td align="right" nowrap>
      <ProductActions product={product} onDelete={onDelete} deleteLoading={deleteLoading} />
    </Td>
  </Tr>
);

// Product Card for Grid View
const ProductCard = ({ product, onDelete, onToggleStock, deleteLoading, toggleLoading }: ProductItemProps) => (
  <Card className="flex flex-col">
    <div className="flex items-center justify-center border-b border-gray-200 bg-gray-50 p-6">
      <ProductImage imageUrl={product.image} productName={product.name} size="lg" />
    </div>

    <div className="flex flex-1 flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <IdCell id={product.id} />
        <StatusBadge kind="generic" value={product.in_stock ? "active" : "inactive"} />
      </div>

      <div className="min-w-0">
        <Link
          to={`/products/edit/${product.id}`}
          className="block truncate font-medium text-gray-900 hover:text-brand-700 hover:underline"
        >
          {product.name}
        </Link>
        <p className="mt-1 line-clamp-2 min-h-[2rem] text-xs text-gray-500">
          {product.description || "No description"}
        </p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-gray-900 tabular-nums">{priceLabel(product.price)}</span>
        <Badge tone="neutral">{product.category}</Badge>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-gray-200 pt-3">
        <Toggle
          size="sm"
          checked={product.in_stock}
          onChange={() => onToggleStock(product.id, product.in_stock)}
          disabled={toggleLoading === product.id}
          label="Active"
        />
        <ProductActions product={product} onDelete={onDelete} deleteLoading={deleteLoading} />
      </div>
    </div>
  </Card>
);

const ProductCardSkeleton = () => (
  <Card aria-hidden="true">
    <div className="flex items-center justify-center border-b border-gray-200 bg-gray-50 p-6">
      <Skeleton className="h-24 w-24" />
    </div>
    <div className="space-y-3 p-4">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-3 w-3/4" />
      <div className="flex justify-between">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
      </div>
    </div>
  </Card>
);

// Main Component
const ProductsPage = () => {
  // Server-paginated: `products` only ever holds the current page's rows,
  // not the full 44,000+-row master_products table — previously
  // getAdminProducts() explicitly batch-fetched the entire table client-side
  // on every load/refresh and did all search/filter/sort/pagination in JS.
  // `stats` is fetched independently via lightweight count queries so the
  // stats bar still reflects the whole catalog, not just the current page.
  const [products, setProducts] = useState<Product[]>([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [stats, setStats] = useState({ total: 0, inStock: 0, outOfStock: 0 });
  const [statsLoading, setStatsLoading] = useState(true);
  // A failed count query must not read as a real "0" on the stat cards.
  const [statsError, setStatsError] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  // `loading` swaps the rows for skeletons (first load and every query
  // change); `refreshing` keeps the current rows on screen (Refresh button,
  // post-mutation refetch) and only spins the Refresh button.
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  // Debounced separately so the search box stays instantly responsive while
  // typing, without firing a server request per keystroke now that search
  // runs against the database instead of an in-memory array.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const confirm = useConfirm();
  const { showToast } = useToast();
  // Monotonic id per products request: rapid page/sort/filter changes fire
  // overlapping requests and a slow earlier response must not overwrite the
  // rows and total of the request that is actually current.
  const requestIdRef = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Fetch the current page of products
  const fetchData = useCallback(
    async (mode: "load" | "refresh" = "load") => {
      const requestId = ++requestIdRef.current;
      if (mode === "load") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      try {
        const { products: data, total } = await getAdminProductsPaginated({
          page: currentPage,
          pageSize: itemsPerPage,
          search: debouncedSearch,
          category: selectedCategory,
          sortField,
          sortDirection,
        });
        if (requestId !== requestIdRef.current) return;
        setProducts(data);
        setTotalProducts(total);
        setError(null);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        console.error("Error fetching data:", err);
        setError("Failed to load products. Please try again.");
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [currentPage, itemsPerPage, debouncedSearch, selectedCategory, sortField, sortDirection]
  );

  const fetchStats = useCallback(async () => {
    try {
      setStats(await getProductStats());
      setStatsError(false);
    } catch (err) {
      console.error("Error fetching product stats:", err);
      setStatsError(true);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // A failed categories load used to be console-only, leaving the filter
  // with just "All" and Quick Add unable to pass its category validation
  // with no explanation. Surface it with a retry instead.
  const loadCategories = useCallback(async () => {
    try {
      setCategoriesError(null);
      setCategories(await getCategories());
    } catch (err) {
      console.error("Error fetching categories:", err);
      setCategoriesError(
        "The category filter and Quick add are limited until categories load."
      );
    }
  }, []);

  // fetchData is memoised on exactly the query inputs, so every one of them
  // triggers one refetch. The cleanup bumps the request id so a response for
  // a superseded query (or one arriving after unmount) is ignored.
  useEffect(() => {
    void fetchData("load");
    return () => {
      requestIdRef.current++;
    };
  }, [fetchData]);

  useEffect(() => {
    void fetchStats();
    void loadCategories();
  }, [fetchStats, loadCategories]);

  const handleRefresh = () => {
    if (refreshing) return;
    void fetchData("refresh");
    void fetchStats();
  };

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const handleSortSelect = (value: string) => {
    const [field, direction] = value.split(":") as [SortField, SortDirection];
    setSortField(field);
    setSortDirection(direction);
  };

  // Handle product deletion
  const handleDeleteProduct = async (id: string, productName: string) => {
    // Per-row re-entrancy guard only: other rows stay actionable while this
    // one is in flight (their own buttons are not disabled).
    if (deleteLoading === id) return;
    const confirmed = await confirm({
      title: "Delete product?",
      message: (
        <>
          This permanently removes{" "}
          <span className="font-medium text-gray-900">{productName}</span> from the master
          catalog. This action cannot be undone. If stores already stock it (or it has order
          history), it is archived instead: hidden from customers, history kept.
        </>
      ),
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!confirmed) return;

    try {
      setDeleteLoading(id);
      const outcome = await deleteProduct(id);

      if (outcome === "archived") {
        // Referenced by store listings / order history, so it can't be
        // removed — deleteProduct deactivated it instead.
        setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, in_stock: false } : p)));
        void fetchStats();
        await notifyAdminAction('archived product', productName, { product_id: id, product_name: productName });
        showToast(
          `"${productName}" is stocked by stores or has order history, so it was archived (hidden from customers) instead of deleted.`,
          "info",
          7000
        );
        return;
      }

      const wasOnlyRowOnPage = products.length === 1;
      setProducts((prev) => prev.filter((p) => p.id !== id));
      setTotalProducts((prev) => Math.max(0, prev - 1));
      void fetchStats();
      await notifyAdminAction('deleted product', productName, { product_id: id, product_name: productName });
      showToast(`"${productName}" has been deleted.`, "success");
      // Deleting the only row of a page > 1 used to leave currentPage
      // pointing past the end ("Showing 11 to 10 of 10", Next enabled).
      // Step back a page in that case; otherwise refetch in place so the
      // row that shifted up from the next page fills the gap.
      if (wasOnlyRowOnPage && currentPage > 1) {
        setCurrentPage((prev) => prev - 1);
      } else {
        void fetchData("refresh");
      }
    } catch (err) {
      console.error("Error deleting product:", err);
      // PostgrestError is a plain object with `message`, not always an Error.
      const message = (err as { message?: unknown } | null)?.message;
      const reason = typeof message === "string" && message ? ` (${message})` : "";
      showToast(`Failed to delete product${reason}.`, "error", 7000);
    } finally {
      setDeleteLoading(null);
    }
  };

  // Handle active toggle (`in_stock` is the service's name for
  // master_products.is_active; updateProduct maps it back).
  const handleToggleStock = async (id: string, currentStatus: boolean) => {
    if (toggleLoading === id) return;
    try {
      setToggleLoading(id);

      const updated = await updateProduct(id, { in_stock: !currentStatus });

      if (updated) {
        // Update the product in the state
        const productName = products.find((p) => p.id === id)?.name ?? id;
        setProducts((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, in_stock: !currentStatus } : p
          )
        );

        const newStatus = currentStatus ? "Inactive" : "Active";
        void fetchStats();
        await notifyAdminAction(`set "${newStatus}"`, productName, { product_id: id, product_name: productName });

        showToast(`"${productName}" is now ${newStatus.toLowerCase()}.`, "success");
      } else {
        showToast("Failed to update product status. Please try again.", "error");
      }
    } catch (err) {
      console.error("Error toggling product status:", err);
      showToast("Failed to update product status. Please try again.", "error");
    } finally {
      setToggleLoading(null);
    }
  };

  // `products` already holds only the current page's rows, already filtered
  // and sorted server-side by fetchData's query — no client-side
  // filter/sort pass needed. Pagination math lives in the shared Pagination
  // component; `totalProducts` is the server-reported total for the current
  // search/category filter.

  // Category filter options come from the real `categories` table (fetched
  // once on mount), not derived from `products` — deriving from `products`
  // only worked when that array held the whole catalog; against a paginated
  // `products` array it would show a different, incomplete category list on
  // every page.
  const productCategories = useMemo(
    () => ["All", ...categories.map((c) => c.name)],
    [categories]
  );

  const hasFilters = searchTerm.trim() !== "" || selectedCategory !== "All";
  const clearFilters = () => {
    setSearchTerm("");
    setSelectedCategory("All");
    setCurrentPage(1);
  };

  // The fetch failed and there is nothing to show: render only the error,
  // never an "empty" message that would misreport the failure as no data.
  const fetchFailed = Boolean(error) && products.length === 0 && !loading;

  const emptyState = (
    <EmptyState
      compact
      icon={Package}
      title="No products found"
      description={
        hasFilters
          ? "Try adjusting your search or category filter."
          : "Get started by adding your first product to the catalog."
      }
      action={
        hasFilters ? (
          <Button variant="secondary" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        ) : (
          <LinkButton to="/products/add" size="sm" leftIcon={<Plus />}>
            Add product
          </LinkButton>
        )
      }
    />
  );

  return (
    <>
      <PageHeader
        title="Products"
        description="Manage the master catalog: names, categories, prices and availability."
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowQuickAdd(true)}>
              Quick add
            </Button>
            <LinkButton to="/products/add" leftIcon={<Plus />}>
              Add product
            </LinkButton>
          </>
        }
      />

      <div className="space-y-6">
        {/* Stats — catalog-wide counts of master_products.is_active */}
        <StatGrid columns={3}>
          <StatCard
            label="Total products"
            value={statsError ? "—" : formatNumber(stats.total)}
            hint={statsError ? "Couldn't load counts" : undefined}
            icon={Package}
            loading={statsLoading}
          />
          <StatCard
            label="Active"
            value={statsError ? "—" : formatNumber(stats.inStock)}
            hint={
              !statsError && stats.total > 0
                ? `${Math.round((stats.inStock / stats.total) * 100)}% of catalog`
                : undefined
            }
            icon={CheckCircle2}
            loading={statsLoading}
          />
          <StatCard
            label="Inactive"
            value={statsError ? "—" : formatNumber(stats.outOfStock)}
            icon={XCircle}
            loading={statsLoading}
          />
        </StatGrid>

        {categoriesError && (
          <Alert
            tone="warning"
            title="Couldn't load categories"
            actions={
              <Button variant="secondary" size="sm" onClick={() => void loadCategories()}>
                Retry
              </Button>
            }
          >
            {categoriesError}
          </Alert>
        )}

        {/* Products */}
        <Card>
          <CardBody padding="none">
            <FilterBar
              actions={
                <>
                  <SegmentedControl<ViewMode>
                    value={viewMode}
                    onChange={setViewMode}
                    aria-label="View"
                    size="md"
                    items={[
                      { value: "list", label: "List", icon: <List /> },
                      { value: "grid", label: "Grid", icon: <Grid3X3 /> },
                    ]}
                  />
                  <Button
                    variant="secondary"
                    onClick={handleRefresh}
                    loading={refreshing}
                    leftIcon={<RefreshCw />}
                  >
                    Refresh
                  </Button>
                </>
              }
            >
              {/* Search matches name and description, plus an exact match when
                  the term is a full product UUID (the service cannot ILIKE a
                  uuid column), so say exactly that. */}
              <SearchInput
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder="Search by name, description or ID"
                aria-label="Search products"
                containerClassName="sm:w-80"
              />
              <Select
                aria-label="Filter by category"
                value={selectedCategory}
                onChange={(e) => { setSelectedCategory(e.target.value); setCurrentPage(1); }}
                containerClassName="w-full sm:w-48"
              >
                {productCategories.map((category) => (
                  <option key={category} value={category}>
                    {category === "All" ? "All categories" : category}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Sort by"
                value={`${sortField}:${sortDirection}`}
                onChange={(e) => handleSortSelect(e.target.value)}
                containerClassName="w-full sm:w-48"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FilterBar>

            {error && (
              <div className="border-b border-gray-200 p-4">
                <Alert
                  tone="danger"
                  title="Couldn't load products"
                  actions={
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void fetchData(products.length > 0 ? "refresh" : "load")}
                      loading={loading || refreshing}
                    >
                      Retry
                    </Button>
                  }
                  onDismiss={products.length > 0 ? () => setError(null) : undefined}
                >
                  {error}
                </Alert>
              </div>
            )}

            {!fetchFailed && viewMode === "list" && (
              <TableContainer className="border-0 rounded-none">
                <Table aria-busy={refreshing || undefined}>
                  <THead>
                    <Tr>
                      <Th>ID</Th>
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
                        align="right"
                        currentSort={sortField}
                        direction={sortDirection}
                        onSort={handleSort}
                      />
                      <SortableHeader
                        label="Status"
                        field="in_stock"
                        currentSort={sortField}
                        direction={sortDirection}
                        onSort={handleSort}
                      />
                      <Th align="right">Actions</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {loading ? (
                      <TableSkeletonRows rows={Math.min(itemsPerPage, 10)} cols={TABLE_COLUMNS} />
                    ) : products.length === 0 ? (
                      <TableEmptyRow colSpan={TABLE_COLUMNS}>{emptyState}</TableEmptyRow>
                    ) : (
                      products.map((product) => (
                        <ProductRow
                          key={product.id}
                          product={product}
                          onDelete={handleDeleteProduct}
                          onToggleStock={handleToggleStock}
                          deleteLoading={deleteLoading}
                          toggleLoading={toggleLoading}
                        />
                      ))
                    )}
                  </TBody>
                </Table>
              </TableContainer>
            )}

            {!fetchFailed && viewMode === "grid" && (
              <div className="p-4" aria-busy={refreshing || undefined}>
                {loading ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {Array.from({ length: Math.min(itemsPerPage, 8) }, (_, i) => (
                      <ProductCardSkeleton key={i} />
                    ))}
                  </div>
                ) : products.length === 0 ? (
                  emptyState
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {products.map((product) => (
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
              </div>
            )}

            {/* Pagination — clamps currentPage back into range when a filter
                or delete shrinks the result set. */}
            {!fetchFailed && !(loading && totalProducts === 0) && (
              <Pagination
                page={currentPage}
                pageSize={itemsPerPage}
                total={totalProducts}
                onPageChange={setCurrentPage}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                onPageSizeChange={(size) => { setItemsPerPage(size); setCurrentPage(1); }}
              />
            )}
          </CardBody>
        </Card>
      </div>

      {/* Quick Add Modal */}
      <QuickAddModal
        isOpen={showQuickAdd}
        onClose={() => setShowQuickAdd(false)}
        categories={categories}
        onProductAdded={() => {
          void fetchData("refresh");
          void fetchStats();
          showToast("Product added.", "success");
        }}
      />
    </>
  );
};

export default ProductsPage;
