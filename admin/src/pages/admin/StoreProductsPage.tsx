import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AdminLayout from '../../components/admin/layout/AdminLayout';
import { Search, Store, Package, Plus, Trash2, Loader2, AlertCircle, ArrowLeft, X } from 'lucide-react';
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
}

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
      <AdminLayout>
        <div className="max-w-2xl mx-auto mt-12 p-8 bg-white rounded-2xl border-2 border-gray-100 text-center">
          <AlertCircle className="w-10 h-10 text-amber-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Not permitted</h1>
          <p className="text-gray-500">Only super admins and admins can manage store inventory.</p>
        </div>
      </AdminLayout>
    );
  }

  return storeId ? <StoreProductList storeId={storeId} /> : <StorePicker />;
};

// ─── Step 1: pick a store ───────────────────────────────────────────────────

const StorePicker = () => {
  const navigate = useNavigate();
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data, error: fetchError } = await getAdminClient()
          .from('stores')
          .select('id, name, phone, address')
          .order('name');
        if (fetchError) throw fetchError;
        setStores(data || []);
      } catch (err) {
        console.error('Error fetching stores:', err);
        setError('Failed to load stores. Please try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return stores;
    return stores.filter(
      (s) => s.name?.toLowerCase().includes(q) || s.phone?.includes(q) || s.address?.toLowerCase().includes(q)
    );
  }, [stores, search]);

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Store Inventory</h1>
          <p className="text-gray-500 mt-1">Pick a store to view and manage its product listing.</p>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by store name, phone, or address..."
            className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl mb-4">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          </div>
        ) : (
          <div className="bg-white rounded-2xl border-2 border-gray-100 divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No stores match your search.</div>
            ) : (
              filtered.map((store) => (
                <button
                  key={store.id}
                  onClick={() => navigate(`/stores/${store.id}/products`)}
                  className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Store className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{store.name}</p>
                    <p className="text-sm text-gray-500 truncate">{store.address || store.phone || '—'}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

// ─── Step 2: manage one store's products ────────────────────────────────────

const StoreProductList = ({ storeId }: { storeId: string }) => {
  const navigate = useNavigate();
  const [store, setStore] = useState<StoreOption | null>(null);
  const [products, setProducts] = useState<StoreProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAddPanel, setShowAddPanel] = useState(false);

  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [{ data: storeRow }, storeProducts] = await Promise.all([
        getAdminClient().from('stores').select('id, name, phone, address').eq('id', storeId).maybeSingle(),
        getStoreProducts(storeId),
      ]);
      setStore(storeRow || null);
      setProducts(storeProducts);
    } catch (err) {
      console.error('Error loading store products:', err);
      setError('Failed to load this store\'s products. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handleToggle = async (product: StoreProductRow) => {
    try {
      setBusyId(product.id);
      await setStoreProductActive(storeId, product.id, !product.is_active);
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, is_active: !p.is_active } : p)));
    } catch (err) {
      console.error('Error toggling store product:', err);
      setError('Failed to update this product. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (product: StoreProductRow) => {
    if (!confirm(`Remove "${product.master_product?.name ?? product.product_name ?? 'this product'}" from this store?`)) return;
    try {
      setBusyId(product.id);
      await removeStoreProduct(storeId, product.id);
      setProducts((prev) => prev.filter((p) => p.id !== product.id));
    } catch (err) {
      console.error('Error removing store product:', err);
      setError('Failed to remove this product. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const handleAdded = (product: StoreProductRow) => {
    setProducts((prev) => [product, ...prev.filter((p) => p.id !== product.id)]);
    setShowAddPanel(false);
  };

  const existingMasterIds = useMemo(() => new Set(products.map((p) => p.master_product_id)), [products]);

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => navigate('/stores/products')}
          className="inline-flex items-center text-gray-500 hover:text-gray-700 transition-colors mb-4 group"
        >
          <ArrowLeft size={18} className="mr-2 group-hover:-translate-x-1 transition-transform" />
          Back to Stores
        </button>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{store?.name || 'Store'} — Products</h1>
            <p className="text-gray-500 mt-1">{store?.address || store?.phone || ''}</p>
          </div>
          <button
            onClick={() => setShowAddPanel(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition-colors"
          >
            <Plus size={18} /> Add from Catalog
          </button>
        </div>

        {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl mb-4">{error}</div>}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
          </div>
        ) : (
          <div className="bg-white rounded-2xl border-2 border-gray-100 divide-y divide-gray-100">
            {products.length === 0 ? (
              <div className="p-8 text-center text-gray-500">This store has no products yet.</div>
            ) : (
              products.map((p) => (
                <div key={p.id} className="flex items-center gap-4 p-4">
                  <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {p.master_product?.image_url ? (
                      <img src={p.master_product.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Package className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">
                      {p.product_name || p.master_product?.name || 'Unnamed product'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {p.master_product ? `₹${p.master_product.discounted_price} / ${p.master_product.unit}` : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggle(p)}
                    disabled={busyId === p.id}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      p.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {p.is_active ? 'Active' : 'Inactive'}
                  </button>
                  <button
                    onClick={() => handleRemove(p)}
                    disabled={busyId === p.id}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {showAddPanel && (
        <AddFromCatalogPanel
          storeId={storeId}
          excludeIds={existingMasterIds}
          onClose={() => setShowAddPanel(false)}
          onAdded={handleAdded}
        />
      )}
    </AdminLayout>
  );
};

// ─── Add-from-catalog modal ──────────────────────────────────────────────────

const AddFromCatalogPanel = ({
  storeId,
  excludeIds,
  onClose,
  onAdded,
}: {
  storeId: string;
  excludeIds: Set<string>;
  onClose: () => void;
  onAdded: (product: StoreProductRow) => void;
}) => {
  const [catalog, setCatalog] = useState<MasterProductOption[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error: fetchError } = await getAdminClient()
          .from('master_products')
          .select('id, name, image_url, discounted_price')
          .eq('is_active', true)
          .order('name');
        if (fetchError) throw fetchError;
        setCatalog(data || []);
      } catch (err) {
        console.error('Error fetching catalog:', err);
        setError('Failed to load the catalog.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter((c) => !excludeIds.has(c.id) && (!q || c.name.toLowerCase().includes(q)));
  }, [catalog, excludeIds, search]);

  const handleAdd = async (masterProductId: string) => {
    try {
      setAddingId(masterProductId);
      const product = await addStoreProduct(storeId, masterProductId);
      onAdded(product);
    } catch (err) {
      console.error('Error adding store product:', err);
      setError('Failed to add this product. Please try again.');
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Add from Catalog</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search catalog..."
              className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No matching catalog items.</div>
          ) : (
            filtered.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-4">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {c.image_url ? (
                    <img src={c.image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Package className="w-4 h-4 text-gray-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{c.name}</p>
                  <p className="text-sm text-gray-500">₹{c.discounted_price}</p>
                </div>
                <button
                  onClick={() => handleAdd(c.id)}
                  disabled={addingId === c.id}
                  className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {addingId === c.id ? '...' : 'Add'}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default StoreProductsPage;
