import { useState, useEffect } from 'react';
import {
  Store,
  Search,
  RefreshCw,
  MapPin,
  Phone,
  AlertCircle,
  X,
  CheckCircle,
  XCircle,
  Wifi,
  Users
} from 'lucide-react';
import AdminLayout from '../../components/admin/layout/AdminLayout';
import { getAdminClient } from '../../services/supabase';

interface StoreData {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  is_active: boolean;
  is_approved: boolean;
  owner_id?: string;
  created_at?: string;
  updated_at?: string;
}

const StoresPage = () => {
  const [stores, setStores] = useState<StoreData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const fetchStores = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: sbError } = await getAdminClient()
        .from('stores')
        .select('*')
        .order('created_at', { ascending: false });

      if (sbError) throw sbError;
      setStores(data || []);
    } catch (err: any) {
      console.error('Error fetching stores:', err);
      setError('Failed to load stores. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStores();
  }, []);

  const filteredStores = stores.filter(store => {
    const q = searchTerm.toLowerCase();
    return (
      store.name?.toLowerCase().includes(q) ||
      store.address?.toLowerCase().includes(q) ||
      store.phone?.includes(q)
    );
  });

  const toggleApproval = async (store: StoreData) => {
    setApprovingId(store.id);
    try {
      const { data, error: sbError } = await getAdminClient()
        .from('stores')
        .update({ is_approved: !store.is_approved })
        .eq('id', store.id)
        .select('id, is_approved');
      if (sbError) throw sbError;
      if (!data || data.length === 0) {
        throw new Error('Update was blocked (no admin session or insufficient permissions).');
      }
      setStores(prev => prev.map(s => s.id === store.id ? { ...s, is_approved: !store.is_approved } : s));
    } catch (err: any) {
      setError(`Failed to update approval: ${err.message}`);
    } finally {
      setApprovingId(null);
    }
  };

  const stats = {
    total: stores.length,
    active: stores.filter(s => s.is_active).length,
    pending: stores.filter(s => !s.is_approved).length,
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Stores</h1>
            <p className="text-gray-500 mt-1">Manage registered store partners and their status</p>
          </div>
          <button
            onClick={fetchStores}
            className="inline-flex items-center px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors shadow-sm font-medium"
          >
            <RefreshCw size={18} className="mr-2" />
            Refresh
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-gradient-to-r from-red-500 to-rose-500 text-white px-5 py-4 rounded-xl flex items-center shadow-lg">
            <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0" />
            <span className="flex-1 font-medium">{error}</span>
            <button onClick={() => setError(null)} className="ml-4 p-1 hover:bg-white/20 rounded-lg">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 p-5 text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
            <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
            <div className="relative z-10">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                <Store className="w-6 h-6" />
              </div>
              <p className="text-white/80 text-sm font-medium">Total Stores</p>
              <p className="text-3xl font-bold mt-1">{stats.total}</p>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-5 text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
            <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
            <div className="relative z-10">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                <Wifi className="w-6 h-6" />
              </div>
              <p className="text-white/80 text-sm font-medium">Online / Active</p>
              <p className="text-3xl font-bold mt-1">{stats.active}</p>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 p-5 text-white shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
            <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
            <div className="relative z-10">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                <AlertCircle className="w-6 h-6" />
              </div>
              <p className="text-white/80 text-sm font-medium">Pending Approval</p>
              <p className="text-3xl font-bold mt-1">{stats.pending}</p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="relative">
            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by store name, address, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-12 py-3 rounded-xl border-2 border-gray-200 focus:border-violet-500 focus:ring-0 transition-colors text-gray-800"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Stores List */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="p-16 flex flex-col items-center justify-center">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-violet-200 rounded-full" />
                <div className="absolute top-0 left-0 w-16 h-16 border-4 border-violet-500 rounded-full animate-spin border-t-transparent" />
              </div>
              <p className="mt-4 text-gray-500 font-medium">Loading stores...</p>
            </div>
          ) : filteredStores.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <Store className="w-12 h-12 text-gray-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">No stores found</h3>
              <p className="text-gray-500">
                {searchTerm ? 'Try a different search term.' : 'No stores have registered yet.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                  <tr className="text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    <th className="px-6 py-4">Store</th>
                    <th className="px-6 py-4">Contact</th>
                    <th className="px-6 py-4">Address</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Approval</th>
                    <th className="px-6 py-4">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredStores.map((store) => (
                    <tr key={store.id} className="group hover:bg-gradient-to-r hover:from-gray-50 hover:to-violet-50/30 transition-all duration-200">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center flex-shrink-0">
                            <span className="text-white font-bold text-sm">
                              {store.name?.substring(0, 2).toUpperCase() || 'ST'}
                            </span>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-800">{store.name}</p>
                            <p className="text-xs font-mono text-gray-400 mt-0.5">{store.id.substring(0, 12)}...</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {store.phone ? (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Phone size={14} className="text-gray-400" />
                            {store.phone}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {store.address ? (
                          <div className="flex items-start gap-2 text-sm text-gray-600 max-w-[200px]">
                            <MapPin size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
                            <span className="truncate">{store.address}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {store.is_active ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                            <CheckCircle size={12} />
                            Online
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                            <XCircle size={12} />
                            Offline
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {store.is_approved ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                              <CheckCircle size={11} />
                              Approved
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                              <AlertCircle size={11} />
                              Pending
                            </span>
                          )}
                          <button
                            onClick={() => toggleApproval(store)}
                            disabled={approvingId === store.id}
                            className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                              store.is_approved
                                ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                            } disabled:opacity-50`}
                          >
                            {approvingId === store.id ? '...' : store.is_approved ? 'Revoke' : 'Approve'}
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">
                          {store.created_at
                            ? new Date(store.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                            : '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Summary footer */}
        {!loading && filteredStores.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-500 px-1">
            <Users size={14} />
            Showing {filteredStores.length} of {stores.length} stores
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default StoresPage;
