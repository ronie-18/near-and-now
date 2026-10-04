import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Plus, Edit, Trash2, Layers, Package, RefreshCw, ImageOff, FolderOpen, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  getCategories,
  deleteCategory,
  getProductCountsByCategory,
  getProductCountForCategory,
  Category,
} from '../../services/adminService';
import IdCell from '../../components/admin/IdCell';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  FilterBar,
  IconButton,
  LinkButton,
  PageHeader,
  Pagination,
  SearchInput,
  StatCard,
  StatGrid,
  Table,
  TableContainer,
  TableEmptyRow,
  TableSkeletonRows,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr,
  useConfirm,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { formatNumber } from '../../utils/format';
import { cn } from '../../utils/cn';

// Constants
const ITEMS_PER_PAGE = 10;
const TABLE_COLUMNS = 6;

/**
 * Whether the per-category product counts can be trusted by the delete guard.
 * - loading:    first fetch still in flight
 * - ready:      counts came back and are safe to act on
 * - unverified: the counts RPC failed (see fetchData) — deleting is disabled
 */
type CountsStatus = 'loading' | 'ready' | 'unverified';

// Category Image — page-specific square thumbnail. Falls back to initials
// when there is no URL and to an ImageOff glyph when the image fails to load.
// Decorative: the category name is rendered right next to it.
const CategoryImage = ({ imageUrl, categoryName }: { imageUrl?: string; categoryName: string }) => {
  const [imgError, setImgError] = useState(false);

  if (imageUrl && !imgError) {
    return (
      <img
        src={imageUrl}
        alt=""
        className="h-10 w-10 shrink-0 rounded-md border border-gray-200 object-cover"
        loading="lazy"
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-md border',
        imgError ? 'border-gray-200 bg-gray-100 text-gray-400' : 'border-brand-100 bg-brand-50 text-brand-700',
      )}
    >
      {imgError ? (
        <ImageOff className="h-4 w-4" />
      ) : (
        <span className="text-xs font-semibold">{categoryName.substring(0, 2).toUpperCase()}</span>
      )}
    </span>
  );
};

const CategoriesPage = () => {
  const confirm = useConfirm();
  const { showToast } = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [productCounts, setProductCounts] = useState<Record<string, number>>({});
  const [countsStatus, setCountsStatus] = useState<CountsStatus>('loading');

  // Stale-response guard: Refresh used to be clickable while a fetch was in
  // flight, so two concurrent fetchData() calls raced and the last resolver
  // won. Only the most recent request may write state now. `loadedOnceRef`
  // decides between the first-load skeleton and a keep-content-visible
  // refresh.
  const requestIdRef = useRef(0);
  const loadedOnceRef = useRef(false);

  // Fetch data
  const fetchData = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (loadedOnceRef.current) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const data = await getCategories();
      if (requestId !== requestIdRef.current) return;
      setCategories(data);
      loadedOnceRef.current = true;

      // Counts are loaded separately from the list so a failed RPC marks them
      // 'unverified' (Delete disabled + Alert) while the categories still
      // render. getProductCountsByCategory() throws on failure, so an empty
      // map genuinely means "no products in any category" and is 'ready'.
      try {
        const countsByCategory = await getProductCountsByCategory();
        if (requestId !== requestIdRef.current) return;
        const counts: Record<string, number> = {};
        data.forEach(category => {
          counts[category.id] = countsByCategory[category.name] || 0;
        });
        setProductCounts(counts);
        setCountsStatus('ready');
      } catch (countsErr) {
        if (requestId !== requestIdRef.current) return;
        console.error('Error fetching product counts:', countsErr);
        setProductCounts({});
        setCountsStatus('unverified');
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError('Failed to load categories. Please try again.');
      console.error('Error fetching categories:', err);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle category deletion
  const handleDeleteCategory = async (category: Category) => {
    const { id, name } = category;
    if (deleteLoading) return; // one delete at a time

    // The DB FK (master_products.category -> categories.name) is ON DELETE
    // CASCADE, so deleting a non-empty category permanently deletes every
    // product in it, not just orphans them. Block outright rather than
    // warning-and-proceeding — there's no undo. Unknown counts are treated
    // as unsafe for the same reason.
    if (countsStatus !== 'ready') {
      showToast('Product counts could not be verified, so deleting is disabled. Refresh and try again.', 'error');
      return;
    }
    if (productCounts[id] > 0) {
      showToast(
        `Cannot delete "${name}": it still has ${formatNumber(productCounts[id])} product(s). ` +
          'Move or delete those products first, then delete the category.',
        'error',
      );
      return;
    }

    const confirmed = await confirm({
      title: 'Delete category?',
      message: (
        <>
          Delete <strong className="font-medium text-gray-900">{name}</strong>? This cannot be undone.
        </>
      ),
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!confirmed) return;

    try {
      setDeleteLoading(id);

      // The counts above are a page-load snapshot; products may have been
      // added to this category since. Re-check live (one head:true count)
      // right before the irreversible delete and abort if the category is no
      // longer empty or the count cannot be fetched.
      let liveCount: number;
      try {
        liveCount = await getProductCountForCategory(name);
      } catch (countErr) {
        console.error('Error verifying product count before delete:', countErr);
        showToast('Could not verify product counts, so the category was not deleted. Please try again.', 'error');
        return;
      }
      if (liveCount > 0) {
        setProductCounts(prev => ({ ...prev, [id]: liveCount }));
        showToast(
          `Cannot delete "${name}": it now has ${formatNumber(liveCount)} product(s). ` +
            'Move or delete those products first, then delete the category.',
          'error',
        );
        return;
      }

      // deleteCategory throws on failure (with the Supabase error, e.g. an FK
      // violation), so the toast can carry the real reason.
      await deleteCategory(id);
      setCategories(prev => prev.filter(cat => cat.id !== id));
      setProductCounts(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      showToast(`"${name}" has been deleted.`, 'success');
    } catch (err) {
      const message = (err as { message?: string } | null)?.message;
      showToast(
        message ? `Could not delete "${name}": ${message}` : 'An error occurred while deleting the category.',
        'error',
      );
      console.error('Error deleting category:', err);
    } finally {
      setDeleteLoading(null);
    }
  };

  // Filtered categories — search only. Previously also hard-filtered out any
  // category with 0 products, which made a brand-new category (0 products by
  // definition) vanish from this list the instant it was created, with no
  // other UI path to reach it again (the only links to /categories/edit/:id
  // were rendered from this same filtered list). The "products" column
  // already renders a plain "0 products" badge for this case (see below), so
  // there's nothing else to fix once the row itself isn't hidden.
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
  }), [categories, productCounts]);

  // Pagination — clamped so that deleting the last row on the final page (or
  // a refresh that shrank the list) never renders an empty page; the shared
  // Pagination also resyncs `currentPage` state when it falls out of range.
  const totalPages = Math.max(1, Math.ceil(filteredCategories.length / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const indexOfLastCategory = safePage * ITEMS_PER_PAGE;
  const indexOfFirstCategory = indexOfLastCategory - ITEMS_PER_PAGE;
  const currentCategories = filteredCategories.slice(indexOfFirstCategory, indexOfLastCategory);

  // Reset page on search
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // After a failed first load nothing is known: show "—" rather than a "0"
  // category count (and never leave the products stat on its skeleton —
  // countsStatus stays 'loading' when getCategories itself threw).
  const listUnavailable = error !== null && categories.length === 0;

  const retryAction = (
    <Button variant="secondary" size="sm" loading={refreshing} onClick={() => fetchData()}>
      Retry
    </Button>
  );

  const deleteTooltip = (category: Category): string => {
    if (countsStatus !== 'ready') return 'Deleting disabled until product counts load';
    if (productCounts[category.id] > 0) return 'Cannot delete: category has products';
    return 'Delete';
  };

  const renderTableBody = () => {
    if (loading) {
      return <TableSkeletonRows rows={6} cols={TABLE_COLUMNS} />;
    }

    // A failed fetch is not an empty list — never show "No categories" here.
    if (error && categories.length === 0) {
      return (
        <TableEmptyRow colSpan={TABLE_COLUMNS}>
          <EmptyState
            compact
            icon={AlertCircle}
            title="Categories could not be loaded"
            description="Use Retry above to load the list again."
          />
        </TableEmptyRow>
      );
    }

    if (filteredCategories.length === 0) {
      return (
        <TableEmptyRow colSpan={TABLE_COLUMNS}>
          <EmptyState
            compact
            icon={FolderOpen}
            title="No categories found"
            description={
              searchTerm
                ? 'Try a different search term or clear the search.'
                : 'Get started by creating your first category to organize products.'
            }
            action={
              !searchTerm ? (
                <LinkButton to="/categories/add" leftIcon={<Plus />}>
                  Create first category
                </LinkButton>
              ) : undefined
            }
          />
        </TableEmptyRow>
      );
    }

    return currentCategories.map((category) => {
      const count = productCounts[category.id] ?? 0;
      const isDeleting = deleteLoading === category.id;
      return (
        <Tr key={category.id} className="hover:bg-gray-50">
          <Td nowrap>
            <IdCell id={category.id} />
          </Td>
          <Td>
            <div className="flex items-center gap-3">
              <CategoryImage imageUrl={category.image_url ?? undefined} categoryName={category.name} />
              <Link
                to={`/categories/edit/${category.id}`}
                className="rounded font-medium text-gray-900 hover:text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                {category.name}
              </Link>
            </div>
          </Td>
          <Td>
            {/* No `block` on the clamped span: Tailwind emits `.block` after
                `.line-clamp-*`, so display:block would override -webkit-box
                and defeat the two-line clamp. */}
            {category.description ? (
              <span className="max-w-xs text-gray-600 line-clamp-2">{category.description}</span>
            ) : (
              <span className="text-gray-400">No description</span>
            )}
          </Td>
          <Td align="right" nowrap className="tabular-nums">
            {countsStatus === 'unverified' ? (
              <span className="text-gray-400" title="Product counts could not be loaded">
                —
              </span>
            ) : (
              <Badge tone={count > 0 ? 'brand' : 'neutral'}>
                {formatNumber(count)} {count === 1 ? 'product' : 'products'}
              </Badge>
            )}
          </Td>
          <Td align="right" nowrap muted className="tabular-nums">
            {/* `??` not `||`: a display_order of 0 is a real value, not "unset". */}
            {category.display_order ?? '—'}
          </Td>
          <Td align="right" nowrap>
            <div className="flex items-center justify-end gap-1">
              <Tooltip content="Edit">
                {/* `!px-0`: the sm button's px-3 would otherwise win over px-0 in CSS order. */}
                <LinkButton
                  to={`/categories/edit/${category.id}`}
                  variant="ghost"
                  size="sm"
                  aria-label={`Edit ${category.name}`}
                  className="w-8 !px-0"
                >
                  <Edit className="h-4 w-4" aria-hidden="true" />
                </LinkButton>
              </Tooltip>
              <Tooltip content={deleteTooltip(category)}>
                <IconButton
                  variant="ghost"
                  size="sm"
                  aria-label={`Delete ${category.name}`}
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  loading={isDeleting}
                  disabled={countsStatus !== 'ready' || (deleteLoading !== null && !isDeleting)}
                  onClick={() => handleDeleteCategory(category)}
                >
                  <Trash2 aria-hidden="true" />
                </IconButton>
              </Tooltip>
            </div>
          </Td>
        </Tr>
      );
    });
  };

  return (
    <>
      <PageHeader
        title="Categories"
        description="Organize and manage your product categories."
        actions={
          <LinkButton to="/categories/add" leftIcon={<Plus />}>
            Add category
          </LinkButton>
        }
      />

      <div className="space-y-6">
        {/* Alerts */}
        {error ? (
          <Alert
            tone="danger"
            actions={retryAction}
            // Dismissible only when a previous list is still on screen; with
            // nothing loaded, dismissing would swap the error row for the
            // "No categories found" CTA and orphan its "Use Retry above".
            onDismiss={categories.length > 0 ? () => setError(null) : undefined}
          >
            {error}
          </Alert>
        ) : null}
        {countsStatus === 'unverified' && !error ? (
          <Alert tone="warning" title="Product counts could not be loaded" actions={retryAction}>
            Deleting is disabled until the counts load, because deleting a category also permanently deletes
            every product in it.
          </Alert>
        ) : null}

        {/* Stats */}
        <StatGrid columns={4}>
          <StatCard
            label="Total categories"
            value={listUnavailable ? '—' : formatNumber(stats.totalCategories)}
            icon={Layers}
            loading={loading}
          />
          <StatCard
            label="Total products"
            value={countsStatus === 'ready' ? formatNumber(stats.totalProducts) : '—'}
            hint={countsStatus === 'unverified' ? 'Counts could not be loaded' : undefined}
            icon={Package}
            loading={loading}
          />
        </StatGrid>

        {/* Categories Table */}
        <Card>
          <CardBody padding="none">
            <FilterBar
              actions={
                <Button
                  variant="secondary"
                  leftIcon={<RefreshCw />}
                  loading={refreshing}
                  disabled={loading}
                  onClick={() => fetchData()}
                >
                  Refresh
                </Button>
              }
            >
              <SearchInput
                id="category-search"
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder="Search categories…"
                aria-label="Search categories by name, description or ID"
              />
            </FilterBar>

            <TableContainer className="border-0 rounded-none">
              <Table aria-label="Categories">
                <THead>
                  <Tr>
                    <Th>ID</Th>
                    <Th>Category</Th>
                    <Th>Description</Th>
                    <Th align="right">Products</Th>
                    <Th align="right">Order</Th>
                    <Th align="right">Actions</Th>
                  </Tr>
                </THead>
                <TBody>{renderTableBody()}</TBody>
              </Table>
            </TableContainer>

            {/* Pagination */}
            {!loading && filteredCategories.length > 0 ? (
              <Pagination
                page={currentPage}
                pageSize={ITEMS_PER_PAGE}
                total={filteredCategories.length}
                onPageChange={setCurrentPage}
              />
            ) : null}
          </CardBody>
        </Card>
      </div>
    </>
  );
};

export default CategoriesPage;
