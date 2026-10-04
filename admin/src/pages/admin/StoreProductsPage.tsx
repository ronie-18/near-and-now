import { useState, useEffect, useMemo, useCallback, useRef, useId } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Store, Package, Plus, Trash2, ShieldAlert, ChevronRight, RefreshCw } from 'lucide-react';
import { getAdminClient } from '../../services/supabase';
import {
  getStoreProducts,
  addStoreProduct,
  setStoreProductActive,
  removeStoreProduct,
  StoreProductRow,
} from '../../services/adminService';
import { getCurrentAdmin } from '../../services/secureAdminAuth';
import { hasRole } from '../../services/adminAuthService';
import {
  PageHeader,
  Card,
  CardBody,
  FilterBar,
  SearchInput,
  Button,
  IconButton,
  LinkButton,
  Tooltip,
  Toggle,
  Badge,
  StatusBadge,
  Avatar,
  Modal,
  Alert,
  EmptyState,
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
  Skeleton,
  useConfirm,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { formatCurrency, formatDate } from '../../utils/format';

interface StoreOption {
  id: string;
  name: string;
  phone?: string;
  address?: string;
}

interface MasterProductOption {
  id: string;
  name: string;
  image_url: string | null;
  discounted_price: number;
  unit: string;
}

type LoadMode = 'initial' | 'refresh';
type RowAction = 'toggle' | 'remove';

const PAGE_SIZE = 25;

// master_products prices are rupees with optional paise (step 0.01) — same
// convention as ProductsPage: only show decimals when the value has any.
const formatPrice = (price: number) => formatCurrency(price, { paise: !Number.isInteger(price) });

const priceLabel = (price: number, unit: string | null | undefined) =>
  unit ? `${formatPrice(price)} / ${unit}` : formatPrice(price);

const productDisplayName = (p: StoreProductRow) => p.product_name || p.master_product?.name || 'Unnamed product';

/** Neutral bordered thumbnail with the Package fallback for a null image_url. Decorative: the name sits beside it. */
const ProductThumb = ({ src }: { src: string | null | undefined }) => (
  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border border-gray-200 bg-gray-50">
    {src ? (
      <img src={src} alt="" className="h-full w-full object-cover" />
    ) : (
      <Package className="h-4 w-4 text-gray-400" aria-hidden="true" />
    )}
  </div>
);

/**
 * Two-step admin screen: pick a store, then view/manage that store's own
 * `products` rows (which master_products catalog items it carries + its own
 * is_active toggle). This mutates the same rows the shopkeeper app manages
 * from its side — an intentional ops/support surface, not a duplicate, but
 * there's no coordination between the two actors (last write wins).
 */
const StoreProductsPage = () => {
  const { storeId } = useParams<{ storeId?: string }>();
  const currentAdmin = getCurrentAdmin();
  const canManage = Boolean(currentAdmin && hasRole(currentAdmin, ['super_admin', 'admin']));

  if (!canManage) {
    return (
      <>
        <PageHeader title="Store inventory" />
        <Card>
          <CardBody>
            <EmptyState
              icon={ShieldAlert}
              title="Not permitted"
              description="Only super admins and admins can manage store inventory."
            />
          </CardBody>
        </Card>
      </>
    );
  }

  return storeId ? <StoreProductList storeId={storeId} /> : <StorePicker />;
};

// ─── Step 1: pick a store ───────────────────────────────────────────────────

const StorePicker = () => {
  const navigate = useNavigate();
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  // Monotonic request id so a slow earlier response never overwrites a newer one.
  const requestIdRef = useRef(0);

  const loadStores = useCallback(async (mode: LoadMode = 'initial') => {
    const requestId = ++requestIdRef.current;
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await getAdminClient()
        .from('stores')
        .select('id, name, phone, address')
        .order('name');
      if (requestId !== requestIdRef.current) return;
      if (fetchError) throw fetchError;
      setStores(data || []);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      console.error('Error fetching stores:', err);
      setError('Failed to load stores. Please try again.');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter(
      (s) => s.name?.toLowerCase().includes(q) || s.phone?.includes(q) || s.address?.toLowerCase().includes(q)
    );
  }, [stores, search]);

  // Clamp before slicing: Pagination resyncs an out-of-range `page`, but only
  // after a paint, so without this a removal that empties the last page (or a
  // search that shrinks the set) flashes the "no match" row for a frame.
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const pageRows = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage]
  );

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  // A failed first load shows only the error (never an "empty" table); a failed
  // refresh keeps the current rows visible under the error.
  const showTable = loading || stores.length > 0 || !error;

  return (
    <>
      <PageHeader
        title="Store inventory"
        description="Pick a store to view and manage its product listing."
        actions={
          <Button
            variant="secondary"
            leftIcon={<RefreshCw />}
            loading={refreshing}
            disabled={loading}
            onClick={() => loadStores('refresh')}
          >
            Refresh
          </Button>
        }
      />

      {error && (
        <Alert
          tone="danger"
          className="mb-4"
          onDismiss={() => setError(null)}
          actions={
            <Button variant="secondary" size="sm" onClick={() => loadStores(stores.length ? 'refresh' : 'initial')}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {showTable && (
        <Card>
          <CardBody padding="none">
            <FilterBar>
              <SearchInput
                value={search}
                onChange={handleSearch}
                placeholder="Search by name, phone or address"
                aria-label="Search stores"
                containerClassName="sm:w-96"
              />
            </FilterBar>

            <TableContainer className="border-0 rounded-none">
              <Table>
                <THead>
                  <Tr>
                    <Th>Store</Th>
                    <Th>Address</Th>
                    <Th>Phone</Th>
                    <Th align="right">
                      <span className="sr-only">Manage</span>
                    </Th>
                  </Tr>
                </THead>
                <TBody>
                  {loading ? (
                    <TableSkeletonRows rows={6} cols={4} />
                  ) : pageRows.length === 0 ? (
                    <TableEmptyRow colSpan={4}>
                      <EmptyState
                        compact
                        icon={Store}
                        title={stores.length === 0 ? 'No stores yet' : 'No stores match your search'}
                        description={
                          stores.length === 0
                            ? 'Stores appear here once they are registered.'
                            : 'Try a different name, phone number or address.'
                        }
                        action={
                          search ? (
                            <Button variant="secondary" size="sm" onClick={() => handleSearch('')}>
                              Clear search
                            </Button>
                          ) : undefined
                        }
                      />
                    </TableEmptyRow>
                  ) : (
                    pageRows.map((store) => (
                      <Tr key={store.id} clickable onClick={() => navigate(`/stores/${store.id}/products`)}>
                        <Td>
                          <div className="flex items-center gap-3">
                            <Avatar name={store.name} size="sm" />
                            <span className="font-medium text-gray-900">{store.name}</span>
                          </div>
                        </Td>
                        <Td muted>
                          <span className="block max-w-md truncate">{store.address || '—'}</span>
                        </Td>
                        <Td muted nowrap className="tabular-nums">
                          {store.phone || '—'}
                        </Td>
                        <Td align="right" nowrap>
                          {/* Keyboard-reachable equivalent of the row click. */}
                          <LinkButton
                            to={`/stores/${store.id}/products`}
                            variant="ghost"
                            size="sm"
                            rightIcon={<ChevronRight />}
                            onClick={(e) => e.stopPropagation()}
                          >
                            Manage
                          </LinkButton>
                        </Td>
                      </Tr>
                    ))
                  )}
                </TBody>
              </Table>
            </TableContainer>

            {!loading && filtered.length > 0 && (
              <Pagination page={currentPage} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
            )}
          </CardBody>
        </Card>
      )}
    </>
  );
};

// ─── Step 2: manage one store's products ────────────────────────────────────

const StoreProductList = ({ storeId }: { storeId: string }) => {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [store, setStore] = useState<StoreOption | null>(null);
  const [storeMissing, setStoreMissing] = useState(false);
  const [products, setProducts] = useState<StoreProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-row busy map (not a single id) so two rows acted on back-to-back
  // cannot re-enable each other mid-flight; each row disables only itself.
  const [busy, setBusy] = useState<Record<string, RowAction>>({});
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  // Monotonic request id: the component stays mounted when navigating between
  // two /stores/:id/products URLs, so a stale response must never win.
  const requestIdRef = useRef(0);

  const setRowBusy = (id: string, action: RowAction | null) =>
    setBusy((prev) => {
      const next = { ...prev };
      if (action) next[id] = action;
      else delete next[id];
      return next;
    });

  const loadProducts = useCallback(
    async (mode: LoadMode = 'initial') => {
      const requestId = ++requestIdRef.current;
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        // allSettled so an unknown :storeId is reported as "not found" even
        // when the products call fails for the same reason.
        const [storeRes, productsRes] = await Promise.allSettled([
          getAdminClient().from('stores').select('id, name, phone, address').eq('id', storeId).maybeSingle(),
          getStoreProducts(storeId),
        ]);
        if (requestId !== requestIdRef.current) return;
        if (storeRes.status === 'rejected') throw storeRes.reason;
        if (storeRes.value.error) throw storeRes.value.error;
        const storeRow = storeRes.value.data;
        if (!storeRow) {
          setStore(null);
          setProducts([]);
          setStoreMissing(true);
          return;
        }
        if (productsRes.status === 'rejected') throw productsRes.reason;
        // A 2xx whose body has no `products` array is a failure, not an empty
        // store — surface the Alert instead of crashing on products.filter().
        if (!Array.isArray(productsRes.value)) {
          throw new Error('Unexpected response from the store products API');
        }
        setStore(storeRow);
        setStoreMissing(false);
        setProducts(productsRes.value);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        console.error('Error loading store products:', err);
        setError("Failed to load this store's products. Please try again.");
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [storeId]
  );

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Reset view state when the route param changes to a different store. The
  // previous store's header/rows are cleared too, so its name is never shown
  // over the new store's skeleton while that load is in flight.
  useEffect(() => {
    setSearch('');
    setPage(1);
    setShowAddPanel(false);
    setStore(null);
    setProducts([]);
    setStoreMissing(false);
  }, [storeId]);

  const handleToggle = async (product: StoreProductRow, next: boolean) => {
    const name = productDisplayName(product);
    try {
      setRowBusy(product.id, 'toggle');
      await setStoreProductActive(storeId, product.id, next);
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, is_active: next } : p)));
      showToast(`${name} is now ${next ? 'active' : 'inactive'}`, 'success');
    } catch (err) {
      console.error('Error toggling store product:', err);
      showToast('Failed to update this product. Please try again.', 'error');
    } finally {
      setRowBusy(product.id, null);
    }
  };

  const handleRemove = async (product: StoreProductRow) => {
    const name = product.master_product?.name ?? product.product_name ?? 'this product';
    const ok = await confirm({
      title: 'Remove product from store?',
      message: (
        <>
          This removes <strong className="font-medium text-gray-900">{name}</strong> from{' '}
          {store?.name ?? 'this store'}. You can add it back from the catalog later.
        </>
      ),
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      setRowBusy(product.id, 'remove');
      await removeStoreProduct(storeId, product.id);
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
      showToast(`Removed ${name} from ${store?.name ?? 'the store'}`, 'success');
    } catch (err) {
      console.error('Error removing store product:', err);
      showToast('Failed to remove this product. Please try again.', 'error');
    } finally {
      setRowBusy(product.id, null);
    }
  };

  // Prepend + dedupe: the backend lists rows newest-first, so this matches the
  // server order and keeps the row the admin just added visible on page 1.
  const handleAdded = (product: StoreProductRow) => {
    setProducts((prev) => [product, ...prev.filter((p) => p.id !== product.id)]);
    setShowAddPanel(false);
    // Clear any search too, or the row just added may not match and stay hidden.
    setSearch('');
    setPage(1);
    showToast(`Added ${productDisplayName(product)} to ${store?.name ?? 'the store'}`, 'success');
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => productDisplayName(p).toLowerCase().includes(q) || p.master_product?.name.toLowerCase().includes(q)
    );
  }, [products, search]);

  // Clamp before slicing: Pagination resyncs an out-of-range `page`, but only
  // after a paint, so without this a removal that empties the last page (or a
  // search that shrinks the set) flashes the "no match" row for a frame.
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const pageRows = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage]
  );
  const activeCount = useMemo(() => products.filter((p) => p.is_active).length, [products]);
  const existingMasterIds = useMemo(() => new Set(products.map((p) => p.master_product_id)), [products]);

  if (storeMissing && !loading) {
    return (
      <>
        <PageHeader backTo="/stores/products" backLabel="Back to stores" title="Store not found" />
        <Card>
          <CardBody>
            <EmptyState
              icon={Store}
              title="Store not found"
              description="This store does not exist or is no longer available."
              action={
                <LinkButton to="/stores/products" variant="secondary" size="sm">
                  Back to stores
                </LinkButton>
              }
            />
          </CardBody>
        </Card>
      </>
    );
  }

  // Same rule as the picker: never show an "empty" table for a failed first load.
  const showTable = loading || products.length > 0 || !error;

  return (
    <>
      <PageHeader
        backTo="/stores/products"
        backLabel="Back to stores"
        title={store?.name ?? 'Store products'}
        description={store?.address || store?.phone || undefined}
        actions={
          <>
            <Button
              variant="secondary"
              leftIcon={<RefreshCw />}
              loading={refreshing}
              disabled={loading}
              onClick={() => loadProducts('refresh')}
            >
              Refresh
            </Button>
            <Button leftIcon={<Plus />} disabled={loading || !store} onClick={() => setShowAddPanel(true)}>
              Add from catalog
            </Button>
          </>
        }
      />

      {error && (
        <Alert
          tone="danger"
          className="mb-4"
          onDismiss={() => setError(null)}
          actions={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => loadProducts(products.length ? 'refresh' : 'initial')}
            >
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {showTable && (
        <Card>
          <CardBody padding="none">
            <FilterBar
              actions={
                !loading && (
                  <div className="flex items-center gap-2">
                    <Badge>
                      {products.length} {products.length === 1 ? 'product' : 'products'}
                    </Badge>
                    <Badge tone="success">{activeCount} active</Badge>
                  </div>
                )
              }
            >
              <SearchInput
                value={search}
                onChange={handleSearch}
                placeholder="Search products"
                aria-label="Search products"
                containerClassName="sm:w-80"
              />
            </FilterBar>

            <TableContainer className="border-0 rounded-none">
              <Table>
                <THead>
                  <Tr>
                    <Th>Product</Th>
                    <Th align="right">Price</Th>
                    <Th>Added</Th>
                    <Th>Status</Th>
                    <Th align="right">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </Tr>
                </THead>
                <TBody>
                  {loading ? (
                    <TableSkeletonRows rows={6} cols={5} />
                  ) : pageRows.length === 0 ? (
                    <TableEmptyRow colSpan={5}>
                      {products.length === 0 ? (
                        <EmptyState
                          compact
                          icon={Package}
                          title="This store has no products yet"
                          description="Add catalog items to build this store's listing."
                          action={
                            <Button size="sm" leftIcon={<Plus />} onClick={() => setShowAddPanel(true)}>
                              Add from catalog
                            </Button>
                          }
                        />
                      ) : (
                        <EmptyState
                          compact
                          icon={Package}
                          title="No products match your search"
                          action={
                            <Button variant="secondary" size="sm" onClick={() => handleSearch('')}>
                              Clear search
                            </Button>
                          }
                        />
                      )}
                    </TableEmptyRow>
                  ) : (
                    pageRows.map((p) => {
                      const name = productDisplayName(p);
                      const rowBusy = busy[p.id];
                      const renamed = Boolean(p.master_product && p.product_name && p.product_name !== p.master_product.name);
                      return (
                        <Tr key={p.id}>
                          <Td>
                            <div className="flex items-center gap-3">
                              <ProductThumb src={p.master_product?.image_url} />
                              <div className="min-w-0">
                                <p className="truncate font-medium text-gray-900">{name}</p>
                                {renamed && (
                                  <p className="truncate text-xs text-gray-500">Catalog: {p.master_product?.name}</p>
                                )}
                              </div>
                            </div>
                          </Td>
                          <Td align="right" nowrap className="tabular-nums">
                            {/* master_product is null for orphaned rows (catalog item deleted). */}
                            {p.master_product
                              ? priceLabel(p.master_product.discounted_price, p.master_product.unit)
                              : '—'}
                          </Td>
                          <Td muted nowrap>
                            {formatDate(p.created_at)}
                          </Td>
                          <Td nowrap>
                            <div className="flex items-center gap-3">
                              <Toggle
                                size="sm"
                                checked={p.is_active}
                                disabled={Boolean(rowBusy)}
                                onChange={(next) => handleToggle(p, next)}
                                aria-label={`${name} active`}
                              />
                              <StatusBadge kind="generic" value={p.is_active ? 'active' : 'inactive'} />
                            </div>
                          </Td>
                          <Td align="right" nowrap>
                            <Tooltip content="Remove from store">
                              <IconButton
                                aria-label={`Remove ${name} from store`}
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                                loading={rowBusy === 'remove'}
                                disabled={Boolean(rowBusy)}
                                onClick={() => handleRemove(p)}
                              >
                                <Trash2 />
                              </IconButton>
                            </Tooltip>
                          </Td>
                        </Tr>
                      );
                    })
                  )}
                </TBody>
              </Table>
            </TableContainer>

            {!loading && filtered.length > 0 && (
              <Pagination page={currentPage} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
            )}
          </CardBody>
        </Card>
      )}

      {showAddPanel && (
        <AddFromCatalogPanel
          storeId={storeId}
          storeName={store?.name}
          excludeIds={existingMasterIds}
          onClose={() => setShowAddPanel(false)}
          onAdded={handleAdded}
        />
      )}
    </>
  );
};

// ─── Add-from-catalog modal ──────────────────────────────────────────────────

const AddFromCatalogPanel = ({
  storeId,
  storeName,
  excludeIds,
  onClose,
  onAdded,
}: {
  storeId: string;
  storeName?: string;
  excludeIds: Set<string>;
  onClose: () => void;
  onAdded: (product: StoreProductRow) => void;
}) => {
  const [catalog, setCatalog] = useState<MasterProductOption[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  // Bumped by Retry to re-run the catalog fetch.
  const [attempt, setAttempt] = useState(0);
  // The parent unmounts this panel on a successful add; guard setState after that.
  const mountedRef = useRef(true);
  // Modal moves focus to its panel in a timeout after mount, which beats a plain
  // autoFocus; SearchInput forwards no ref, so resolve the input by id for
  // Modal's initialFocusRef instead.
  const searchId = useId();
  const searchRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    searchRef.current = document.getElementById(searchId);
  }, [searchId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const { data, error: fetchError } = await getAdminClient()
          .from('master_products')
          .select('id, name, image_url, discounted_price, unit')
          .eq('is_active', true)
          .order('name');
        if (cancelled) return;
        if (fetchError) throw fetchError;
        setCatalog(data || []);
      } catch (err) {
        if (cancelled) return;
        console.error('Error fetching catalog:', err);
        setLoadError('Failed to load the catalog.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Items the store already carries never show up here.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter((c) => !excludeIds.has(c.id) && (!q || c.name.toLowerCase().includes(q)));
  }, [catalog, excludeIds, search]);

  const handleAdd = async (item: MasterProductOption) => {
    if (addingId) return; // one add at a time; every Add button is disabled meanwhile
    setAddError(null);
    setAddingId(item.id);
    try {
      const product = await addStoreProduct(storeId, item.id);
      // A 2xx without a `product` body would otherwise crash handleAdded on .id.
      if (!product || typeof product.id !== 'string') {
        throw new Error('Unexpected response from the store products API');
      }
      onAdded(product);
    } catch (err) {
      console.error('Error adding store product:', err);
      if (mountedRef.current) setAddError(`Failed to add ${item.name}. Please try again.`);
    } finally {
      if (mountedRef.current) setAddingId(null);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Add from catalog"
      description={`Active catalog items that ${storeName ?? 'this store'} does not carry yet.`}
      size="md"
      initialFocusRef={searchRef}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        <SearchInput
          id={searchId}
          value={search}
          onChange={setSearch}
          placeholder="Search catalog"
          aria-label="Search catalog"
          containerClassName="sm:w-full"
        />

        {loadError && (
          <Alert
            tone="danger"
            actions={
              <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
                Retry
              </Button>
            }
          >
            {loadError}
          </Alert>
        )}

        {addError && (
          <Alert tone="danger" onDismiss={() => setAddError(null)}>
            {addError}
          </Alert>
        )}

        {(loading || !loadError) && (
          <ul className="max-h-[50vh] divide-y divide-gray-200 overflow-y-auto rounded-md border border-gray-200">
            {loading ? (
              Array.from({ length: 5 }, (_, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3" aria-hidden="true">
                  <Skeleton className="h-10 w-10 flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/5" />
                    <Skeleton className="h-3 w-1/5" />
                  </div>
                  <Skeleton className="h-8 w-14" />
                </li>
              ))
            ) : filtered.length === 0 ? (
              <li>
                <EmptyState
                  compact
                  icon={Package}
                  title={search ? 'No matching catalog items' : 'Nothing left to add'}
                  description={
                    search
                      ? 'Try a different product name.'
                      : 'This store already carries every active catalog item.'
                  }
                />
              </li>
            ) : (
              filtered.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <ProductThumb src={c.image_url} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{c.name}</p>
                    <p className="text-xs text-gray-500 tabular-nums">{priceLabel(c.discounted_price, c.unit)}</p>
                  </div>
                  <Button
                    size="sm"
                    leftIcon={<Plus />}
                    loading={addingId === c.id}
                    disabled={addingId !== null}
                    onClick={() => handleAdd(c)}
                    aria-label={`Add ${c.name}`}
                  >
                    Add
                  </Button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </Modal>
  );
};

export default StoreProductsPage;
