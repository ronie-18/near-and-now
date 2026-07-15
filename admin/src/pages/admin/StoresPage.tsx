import { useState, useEffect, useMemo } from 'react';
import {
  Store,
  Search,
  RefreshCw,
  MapPin,
  Phone,
  AlertCircle,
  X,
  CheckCircle,
  Wifi,
  WifiOff
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

type StatFilter = 'all' | 'online' | 'offline' | 'pending' | 'approved';

// ─── Stat Card (clickable — doubles as a filter button) ────────────────────
const StatCard = ({
  icon: Icon, gradient, label, value, active, onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`relative overflow-hidden rounded-2xl ${gradient} p-5 text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 text-left ${
      active ? 'ring-4 ring-white ring-offset-2 ring-offset-violet-100' : ''
    }`}
  >
    <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
    <div className="relative z-10">
      <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center mb-3">
        <Icon className="w-6 h-6" />
      </div>
      <p className="text-white/80 text-sm font-medium">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  </button>
);

const StoresPage = () => {
  const [stores, setStores] = useState<StoreData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statFilter, setStatFilter] = useState<StatFilter>('all');
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

  const stats = useMemo(() => ({
    total: stores.length,
    online: stores.filter(s => s.is_active).length,
    offline: stores.filter(s => !s.is_active).length,
    pending: stores.filter(s => !s.is_approved).length,
    approved: stores.filter(s => s.is_approved).length,
  }), [stores]);

  const filteredStores = useMemo(() => {
    return stores.filter(store => {
      const q = searchTerm.toLowerCase();
      const matchesSearch = !q || (
        store.name?.toLowerCase().includes(q) ||
        store.address?.toLowerCase().includes(q) ||
        store.phone?.includes(q)
      );
      const matchesStat =
        statFilter === 'all' ? true :
        statFilter === 'online' ? store.is_active :
        statFilter === 'offline' ? !store.is_active :
        statFilter === 'pending' ? !store.is_approved :
        store.is_approved;
      return matchesSearch && matchesStat;
    });
  }, [stores, searchTerm, statFilter]);

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

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Stores</h1>
            <p className="text-gray-500 mt-1">Manage, approve and track all store partners</p>
          </div>
          <button
            onClick={fetchStores}
            className="p-3 text-gray-600 bg-white rounded-xl hover:bg-gray-50 transition-colors shadow-sm border border-gray-200"
            title="Refresh"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
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

        {/* Stats — clickable filters */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard icon={Store} gradient="bg-gradient-to-br from-violet-500 to-purple-600" label="Total Stores" value={stats.total} active={statFilter === 'all'} onClick={() => setStatFilter('all')} />
          <StatCard icon={Wifi} gradient="bg-gradient-to-br from-emerald-500 to-teal-600" label="Online" value={stats.online} active={statFilter === 'online'} onClick={() => setStatFilter('online')} />
          <StatCard icon={WifiOff} gradient="bg-gradient-to-br from-gray-500 to-gray-600" label="Offline" value={stats.offline} active={statFilter === 'offline'} onClick={() => setStatFilter('offline')} />
          <StatCard icon={AlertCircle} gradient="bg-gradient-to-br from-amber-500 to-orange-500" label="Pending Approval" value={stats.pending} active={statFilter === 'pending'} onClick={() => setStatFilter('pending')} />
          <StatCard icon={CheckCircle} gradient="bg-gradient-to-br from-sky-500 to-blue-600" label="Approved" value={stats.approved} active={statFilter === 'approved'} onClick={() => setStatFilter('approved')} />
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
                {searchTerm || statFilter !== 'all' ? 'Try a different search or filter.' : 'No stores have registered yet.'}
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
                          <div className="flex items-start gap-2 text-sm text-gray-600 max-w-xs">
                            <MapPin size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
                            <span>{store.address}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {store.is_active ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                            <Wifi size={12} />
                            Online
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                            <WifiOff size={12} />
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

          {/* Footer summary */}
          {!loading && filteredStores.length > 0 && (
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Showing <span className="font-semibold text-gray-700">{filteredStores.length}</span> of{' '}
                <span className="font-semibold text-gray-700">{stores.length}</span> stores
              </p>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  {stats.online} online now
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  {stats.pending} pending
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default StoresPage;
