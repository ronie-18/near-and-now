import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/admin/layout/AdminLayout';
import { 
  Search, 
  Filter, 
  Eye, 
  ChevronLeft, 
  ChevronRight, 
  Mail, 
  Phone, 
  Calendar, 
  MapPin,
  Users,
  ShoppingBag,
  TrendingUp,
  X,
  RefreshCw,
  UserCheck,
  UserX,
  Download
} from 'lucide-react';
import { getCustomersPaginated, getCustomerStats, setCustomerSuspended, notifyAdminAction, Customer } from '../../services/adminService';
import IdCell from '../../components/admin/IdCell';
import { exportToCsv } from '../../utils/csvExport';

// Constants
const ITEMS_PER_PAGE = 10;

// Modern Stat Card
interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  label: string;
  value: number | string;
  subtitle?: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon: Icon, gradient, label, value, subtitle }) => (
  <div className={`relative overflow-hidden rounded-2xl ${gradient} p-5 text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1`}>
    <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
    <div className="relative z-10">
      <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center mb-3">
        <Icon className="w-6 h-6" />
      </div>
      <p className="text-white/80 text-sm font-medium">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
      {subtitle && <p className="text-white/60 text-xs mt-1">{subtitle}</p>}
    </div>
  </div>
);

// Loading Spinner
const LoadingSpinner = () => (
  <div className="p-16 flex flex-col items-center justify-center">
    <div className="relative">
      <div className="w-16 h-16 border-4 border-purple-200 rounded-full" />
      <div className="absolute top-0 left-0 w-16 h-16 border-4 border-purple-500 rounded-full animate-spin border-t-transparent" />
    </div>
    <p className="mt-4 text-gray-500 font-medium">Loading customers...</p>
  </div>
);

// Empty State
const EmptyState = ({ searchTerm }: { searchTerm: string }) => (
  <div className="p-16 text-center">
    <div className="w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
      <Users className="w-12 h-12 text-gray-400" />
    </div>
    <h3 className="text-xl font-bold text-gray-800 mb-2">No customers found</h3>
    <p className="text-gray-500">
      {searchTerm ? 'Try a different search term.' : 'Customers will appear here when they make purchases.'}
    </p>
  </div>
);

const CustomersPage = () => {
  // Server-paginated: `customers` only ever holds the current page's rows.
  // `stats` is fetched independently via lightweight count/aggregate
  // queries so the stat cards still reflect the whole customer base, not
  // just the current page.
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalCustomers, setTotalCustomers] = useState(0);
  const [stats, setStats] = useState({ total: 0, active: 0, totalOrders: 0, totalRevenue: 0 });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Fetch the current page of customers
  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const { customers: data, total } = await getCustomersPaginated({
        page: currentPage,
        pageSize: ITEMS_PER_PAGE,
        search: debouncedSearch,
        status: selectedStatus,
      });
      setCustomers(data);
      setTotalCustomers(total);
    } catch (err) {
      console.error('Error fetching customers:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      setStats(await getCustomerStats());
    } catch (err) {
      console.error('Error fetching customer stats:', err);
    }
  };

  const handleRefresh = () => {
    fetchCustomers();
    fetchStats();
  };

  // Suspend/reactivate — matches the online-offline toggle pattern already
  // used for stores/riders; Customers was previously the only entity type
  // with no way to block an abusive/fraudulent account at all.
  const handleToggleSuspend = async (customer: Customer) => {
    const suspending = customer.status === 'Active';
    if (suspending && !window.confirm(`Suspend "${customer.name}"? They won't be able to log in or place orders until reactivated.`)) {
      return;
    }
    setTogglingId(customer.id);
    setError(null);
    try {
      await setCustomerSuspended(customer.id, suspending);
      setCustomers(prev => prev.map(c => c.id === customer.id ? { ...c, status: suspending ? 'Inactive' : 'Active' } : c));
      fetchStats();
      await notifyAdminAction(
        `${suspending ? 'suspended' : 'reactivated'} customer`,
        customer.name,
        { customer_id: customer.id, customer_name: customer.name, is_suspended: suspending },
        'admin_review_action'
      );
    } catch (err: any) {
      setError(`Failed to update customer status: ${err.message}`);
    } finally {
      setTogglingId(null);
    }
  };

  useEffect(() => {
    fetchCustomers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, debouncedSearch, selectedStatus]);

  useEffect(() => {
    fetchStats();
  }, []);

  // `customers` already holds only the current page's rows, filtered
  // server-side by fetchCustomers' query — no client-side filter pass needed.
  const currentCustomers = customers;

  // Pagination — `totalCustomers` is the server-reported total for the
  // current search/status filter.
  const totalPages = Math.ceil(totalCustomers / ITEMS_PER_PAGE) || 1;
  const indexOfFirstCustomer = (currentPage - 1) * ITEMS_PER_PAGE;
  const indexOfLastCustomer = indexOfFirstCustomer + customers.length;

  const statuses = ['All', 'Active', 'Inactive'];

  // Customers are server-paginated (see the comment on `currentCustomers`
  // above) — this exports only the currently-loaded page, hence "Export
  // Page" rather than a plain "Export".
  const exportCsv = () => {
    exportToCsv(
      `customers-page-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { header: 'Name', value: (c: Customer) => c.name },
        { header: 'Email', value: (c: Customer) => c.email ?? '' },
        { header: 'Phone', value: (c: Customer) => c.phone ?? '' },
        { header: 'Status', value: (c: Customer) => c.status },
        { header: 'Orders', value: (c: Customer) => c.orders_count },
        { header: 'Total Spent', value: (c: Customer) => c.total_spent },
        { header: 'Location', value: (c: Customer) => c.location ?? '' },
        { header: 'Joined', value: (c: Customer) => c.created_at },
        { header: 'ID', value: (c: Customer) => c.id },
      ],
      currentCustomers
    );
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Customers</h1>
            <p className="text-gray-500 mt-1">View and manage your customer database</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCsv}
              disabled={currentCustomers.length === 0}
              className="inline-flex items-center px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors shadow-sm font-medium disabled:opacity-50"
              title="Exports only the currently-loaded page, not every matching customer"
            >
              <Download size={18} className="mr-2" />
              Export Page CSV
            </button>
            <button
              onClick={handleRefresh}
              className="inline-flex items-center px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors shadow-sm font-medium"
            >
              <RefreshCw size={18} className="mr-2" />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 border border-red-200 px-4 py-3 rounded-xl text-sm font-medium">
            {error}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard
            icon={Users}
            gradient="bg-gradient-to-br from-violet-500 to-purple-600"
            label="Total Customers"
            value={stats.total}
          />
          <StatCard
            icon={UserCheck}
            gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
            label="Active Customers"
            value={stats.active}
            subtitle={`${stats.total > 0 ? Math.round((stats.active / stats.total) * 100) : 0}% of total`}
          />
          <StatCard
            icon={ShoppingBag}
            gradient="bg-gradient-to-br from-blue-500 to-indigo-600"
            label="Total Orders"
            value={stats.totalOrders}
          />
          <StatCard
            icon={TrendingUp}
            gradient="bg-gradient-to-br from-amber-500 to-orange-600"
            label="Total Revenue"
            value={`₹${stats.totalRevenue.toLocaleString()}`}
          />
        </div>

        {/* Filters */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="relative flex-1">
              <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name, email, phone, or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-12 py-3 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:ring-0 transition-colors text-gray-800"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={18} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Filter size={18} className="text-gray-400" />
              <select
                value={selectedStatus}
                onChange={(e) => { setSelectedStatus(e.target.value); setCurrentPage(1); }}
                className="px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-purple-500 focus:ring-0 transition-colors min-w-[140px] text-gray-700"
              >
                {statuses.map(status => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Customers Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <LoadingSpinner />
          ) : currentCustomers.length === 0 ? (
            <EmptyState searchTerm={searchTerm} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                  <tr className="text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    <th className="px-6 py-4">Customer</th>
                    <th className="px-6 py-4">Contact</th>
                    <th className="px-6 py-4">Location</th>
                    <th className="px-6 py-4">Joined</th>
                    <th className="px-6 py-4">Orders</th>
                    <th className="px-6 py-4">Total Spent</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {currentCustomers.map((customer) => (
                    <tr key={customer.id} className="group hover:bg-gradient-to-r hover:from-gray-50 hover:to-purple-50/30 transition-all duration-200">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-violet-400 to-purple-500 rounded-xl flex items-center justify-center shadow-md">
                            <span className="text-white font-bold">
                              {customer.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <Link
                              to={`/customers/${customer.id}`}
                              className="font-semibold text-gray-800 group-hover:text-purple-600 transition-colors hover:underline"
                            >
                              {customer.name}
                            </Link>
                            <div className="mt-1"><IdCell id={customer.id} prefix="#" /></div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          {customer.email && (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Mail size={14} className="text-gray-400" />
                              <span>{customer.email}</span>
                            </div>
                          )}
                          {customer.phone && (
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Phone size={14} className="text-gray-400" />
                              <span>{customer.phone}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {customer.location ? (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <MapPin size={14} className="text-gray-400" />
                            <span>{customer.location}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic text-sm">Not available</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Calendar size={14} className="text-gray-400" />
                          <span>{new Date(customer.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-3 py-1.5 rounded-xl bg-blue-100 text-blue-700 text-sm font-semibold">
                          {customer.orders_count} orders
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-lg font-bold text-gray-800">₹{customer.total_spent.toLocaleString()}</span>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleToggleSuspend(customer)}
                          disabled={togglingId === customer.id}
                          title={customer.status === 'Active' ? 'Suspend customer' : 'Reactivate customer'}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed
                            ${customer.status === 'Active'
                              ? 'bg-gradient-to-r from-emerald-100 to-teal-100 text-emerald-700 hover:bg-emerald-200'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                          {togglingId === customer.id ? (
                            <RefreshCw size={14} className="animate-spin" />
                          ) : customer.status === 'Active' ? (
                            <UserCheck size={14} />
                          ) : (
                            <UserX size={14} />
                          )}
                          {customer.status}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end">
                          <Link
                            to={`/customers/${customer.id}`}
                            className="p-2.5 text-purple-500 hover:text-purple-700 hover:bg-purple-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                            title="View Details"
                          >
                            <Eye size={18} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-gray-600">
                Showing <span className="font-semibold text-gray-800">{indexOfFirstCustomer + 1}</span> to{' '}
                <span className="font-semibold text-gray-800">{Math.min(indexOfLastCustomer, totalCustomers)}</span> of{' '}
                <span className="font-semibold text-gray-800">{totalCustomers}</span> customers
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft size={20} />
                </button>
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let page: number;
                    if (totalPages <= 5) page = i + 1;
                    else if (currentPage <= 3) page = i + 1;
                    else if (currentPage >= totalPages - 2) page = totalPages - 4 + i;
                    else page = currentPage - 2 + i;
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`w-10 h-10 rounded-xl font-semibold transition-all
                          ${currentPage === page
                            ? 'bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-lg'
                            : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                      >
                        {page}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
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
    </AdminLayout>
  );
};

export default CustomersPage;
