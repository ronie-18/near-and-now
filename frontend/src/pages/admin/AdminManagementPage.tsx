import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/admin/layout/AdminLayout';
import {
  Users,
  Plus,
  Edit,
  Trash2,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Eye,
  RefreshCw,
  Search,
  X,
  AlertCircle,
  Check,
  Clock,
  Ban
} from 'lucide-react';
import { getAdmins, deleteAdmin, Admin, getRoleDisplayName, hasPermission } from '../../services/adminAuthService';

// Stat Card
interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  label: string;
  value: number | string;
}

const StatCard: React.FC<StatCardProps> = ({ icon: Icon, gradient, label, value }) => (
  <div className={`relative overflow-hidden rounded-2xl ${gradient} p-5 text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1`}>
    <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-white/10 rounded-full blur-2xl" />
    <div className="relative z-10">
      <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center mb-3">
        <Icon className="w-6 h-6" />
      </div>
      <p className="text-white/80 text-sm font-medium">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  </div>
);

// Error Alert
const ErrorAlert = ({ message, onDismiss }: { message: string; onDismiss: () => void }) => (
  <div className="bg-gradient-to-r from-red-500 to-rose-500 text-white px-5 py-4 rounded-xl mb-6 flex items-center shadow-lg">
    <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center mr-4">
      <AlertCircle className="w-5 h-5" />
    </div>
    <span className="flex-1 font-medium">{message}</span>
    <button onClick={onDismiss} className="ml-4 p-2 hover:bg-white/20 rounded-lg transition-colors">
      <X size={18} />
    </button>
  </div>
);

// Success Alert
const SuccessAlert = ({ message, onDismiss }: { message: string; onDismiss: () => void }) => (
  <div className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white px-5 py-4 rounded-xl mb-6 flex items-center shadow-lg">
    <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center mr-4">
      <Check className="w-5 h-5" />
    </div>
    <span className="flex-1 font-medium">{message}</span>
    <button onClick={onDismiss} className="ml-4 p-2 hover:bg-white/20 rounded-lg transition-colors">
      <X size={18} />
    </button>
  </div>
);

// Loading Spinner
const LoadingSpinner = () => (
  <div className="p-16 flex flex-col items-center justify-center">
    <div className="relative">
      <div className="w-16 h-16 border-4 border-violet-200 rounded-full" />
      <div className="absolute top-0 left-0 w-16 h-16 border-4 border-violet-500 rounded-full animate-spin border-t-transparent" />
    </div>
    <p className="mt-4 text-gray-500 font-medium">Loading admins...</p>
  </div>
);

// Role Badge
const getRoleIcon = (role: Admin['role']) => {
  switch (role) {
    case 'super_admin': return <ShieldCheck className="w-4 h-4" />;
    case 'admin': return <Shield className="w-4 h-4" />;
    case 'manager': return <ShieldAlert className="w-4 h-4" />;
    case 'viewer': return <Eye className="w-4 h-4" />;
  }
};

const getRoleStyle = (role: Admin['role']) => {
  switch (role) {
    case 'super_admin': return 'bg-gradient-to-r from-purple-100 to-violet-100 text-purple-700';
    case 'admin': return 'bg-gradient-to-r from-blue-100 to-indigo-100 text-blue-700';
    case 'manager': return 'bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700';
    case 'viewer': return 'bg-gradient-to-r from-gray-100 to-slate-100 text-gray-700';
  }
};

const getStatusStyle = (status: Admin['status']) => {
  switch (status) {
    case 'active': return 'bg-emerald-100 text-emerald-700';
    case 'inactive': return 'bg-gray-100 text-gray-700';
    case 'suspended': return 'bg-red-100 text-red-700';
  }
};

const getStatusIcon = (status: Admin['status']) => {
  switch (status) {
    case 'active': return <Check className="w-3 h-3" />;
    case 'inactive': return <Clock className="w-3 h-3" />;
    case 'suspended': return <Ban className="w-3 h-3" />;
  }
};

const AdminManagementPage = () => {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

  // Get current admin from localStorage
  const currentAdminData = localStorage.getItem('adminData');
  const currentAdmin: Admin | null = currentAdminData ? JSON.parse(currentAdminData) : null;

  const fetchAdmins = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAdmins();
      setAdmins(data);
    } catch (err) {
      setError('Failed to load admins. Please try again.');
      console.error('Error fetching admins:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const handleDeleteAdmin = async (id: string, name: string) => {
    if (!currentAdmin || !hasPermission(currentAdmin, 'admins.delete')) {
      setError('You do not have permission to delete admins.');
      return;
    }

    if (currentAdmin.id === id) {
      setError('You cannot delete your own account.');
      return;
    }

    if (confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) {
      try {
        setDeleteLoading(id);
        setError(null);
        const deleted = await deleteAdmin(id);

        if (deleted) {
          setAdmins(prev => prev.filter(admin => admin.id !== id));
          setSuccess(`"${name}" has been deleted successfully.`);
          setTimeout(() => setSuccess(null), 3000);
        } else {
          setError('Failed to delete admin. Please try again.');
        }
      } catch (err) {
        setError('An error occurred while deleting the admin.');
        console.error('Error deleting admin:', err);
      } finally {
        setDeleteLoading(null);
      }
    }
  };

  const filteredAdmins = admins.filter(admin => {
    const searchLower = searchTerm.toLowerCase();
    return (
      admin.full_name.toLowerCase().includes(searchLower) ||
      admin.email.toLowerCase().includes(searchLower) ||
      admin.role.toLowerCase().includes(searchLower)
    );
  });

  const stats = {
    total: admins.length,
    superAdmins: admins.filter(a => a.role === 'super_admin').length,
    active: admins.filter(a => a.status === 'active').length,
    inactive: admins.filter(a => a.status !== 'active').length
  };

  const canCreateAdmin = currentAdmin && hasPermission(currentAdmin, 'admins.create');
  const canEditAdmin = currentAdmin && hasPermission(currentAdmin, 'admins.edit');
  const canDeleteAdmin = currentAdmin && hasPermission(currentAdmin, 'admins.delete');

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Admin Management</h1>
            <p className="text-gray-500 mt-1">Manage administrator accounts and permissions</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchAdmins}
              className="p-3 text-gray-600 bg-white rounded-xl hover:bg-gray-50 transition-colors shadow-sm border border-gray-200"
              title="Refresh"
            >
              <RefreshCw size={20} />
            </button>
            {canCreateAdmin && (
              <Link
                to="/admin/admins/create"
                className="inline-flex items-center px-5 py-3 bg-gradient-to-r from-violet-500 to-purple-500 text-white rounded-xl hover:from-violet-600 hover:to-purple-600 transition-all shadow-lg hover:shadow-xl font-semibold"
              >
                <Plus size={18} className="mr-2" />
                Create Admin
              </Link>
            )}
          </div>
        </div>

        {/* Alerts */}
        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}
        {success && <SuccessAlert message={success} onDismiss={() => setSuccess(null)} />}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          <StatCard
            icon={Users}
            gradient="bg-gradient-to-br from-violet-500 to-purple-600"
            label="Total Admins"
            value={stats.total}
          />
          <StatCard
            icon={ShieldCheck}
            gradient="bg-gradient-to-br from-purple-500 to-pink-600"
            label="Super Admins"
            value={stats.superAdmins}
          />
          <StatCard
            icon={Check}
            gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
            label="Active"
            value={stats.active}
          />
          <StatCard
            icon={Ban}
            gradient="bg-gradient-to-br from-gray-500 to-slate-600"
            label="Inactive"
            value={stats.inactive}
          />
        </div>

        {/* Search */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="relative">
            <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, email, or role..."
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

        {/* Admins Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <LoadingSpinner />
          ) : filteredAdmins.length === 0 ? (
            <div className="p-16 text-center">
              <div className="w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                <Users className="w-12 h-12 text-gray-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">No admins found</h3>
              <p className="text-gray-500">
                {searchTerm ? 'Try a different search term.' : 'Create your first admin to get started.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
                  <tr className="text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    <th className="px-6 py-4">Admin</th>
                    <th className="px-6 py-4">Role</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Last Login</th>
                    <th className="px-6 py-4">Created</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredAdmins.map((admin) => (
                    <tr key={admin.id} className="group hover:bg-gradient-to-r hover:from-gray-50 hover:to-violet-50/30 transition-all duration-200">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-semibold text-gray-800">{admin.full_name}</p>
                          <p className="text-sm text-gray-500">{admin.email}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${getRoleStyle(admin.role)}`}>
                          {getRoleIcon(admin.role)}
                          {getRoleDisplayName(admin.role)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusStyle(admin.status)}`}>
                          {getStatusIcon(admin.status)}
                          {admin.status.charAt(0).toUpperCase() + admin.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">
                          {admin.last_login_at
                            ? new Date(admin.last_login_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                            : 'Never'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">
                          {new Date(admin.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {canEditAdmin && (
                            <Link
                              to={`/admin/admins/edit/${admin.id}`}
                              className="p-2.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-all"
                              title="Edit"
                            >
                              <Edit size={18} />
                            </Link>
                          )}
                          {canDeleteAdmin && admin.id !== currentAdmin?.id && (
                            <button
                              onClick={() => handleDeleteAdmin(admin.id, admin.full_name)}
                              disabled={deleteLoading === admin.id}
                              className="p-2.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all disabled:opacity-50"
                              title="Delete"
                            >
                              {deleteLoading === admin.id ? (
                                <RefreshCw size={18} className="animate-spin" />
                              ) : (
                                <Trash2 size={18} />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminManagementPage;
