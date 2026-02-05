import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AdminLayout from '../../components/admin/layout/AdminLayout';
import {
  ArrowLeft,
  Save,
  AlertCircle,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Eye,
  Mail,
  User,
  Lock,
  Info,
  Loader2
} from 'lucide-react';
import { getAdminById, updateAdmin, Admin, getRoleDisplayName, getRoleDescription, getDefaultPermissions, hasPermission } from '../../services/adminAuthService';

const EditAdminPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [admin, setAdmin] = useState<Admin | null>(null);
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    full_name: '',
    role: 'admin' as Admin['role'],
    status: 'active' as Admin['status']
  });

  // Get current admin from localStorage
  const currentAdminData = localStorage.getItem('adminData');
  const currentAdmin: Admin | null = currentAdminData ? JSON.parse(currentAdminData) : null;

  // Check permission
  const canEdit = currentAdmin && hasPermission(currentAdmin, 'admins.edit');

  useEffect(() => {
    const fetchAdmin = async () => {
      if (!id) {
        setError('Invalid admin ID');
        setLoading(false);
        return;
      }

      try {
        const data = await getAdminById(id);
        if (!data) {
          setError('Admin not found');
          setLoading(false);
          return;
        }

        setAdmin(data);
        setFormData({
          email: data.email,
          password: '',
          confirmPassword: '',
          full_name: data.full_name,
          role: data.role,
          status: data.status
        });
      } catch (err) {
        console.error('Error fetching admin:', err);
        setError('Failed to load admin details');
      } finally {
        setLoading(false);
      }
    };

    fetchAdmin();
  }, [id]);

  if (!canEdit) {
    return (
      <AdminLayout>
        <div className="max-w-2xl mx-auto py-12">
          <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl flex items-center">
            <AlertCircle className="w-6 h-6 mr-3" />
            <span className="font-medium">You do not have permission to edit admins.</span>
          </div>
        </div>
      </AdminLayout>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!id) return;

    // Validation
    if (!formData.email || !formData.full_name) {
      setError('Please fill in all required fields.');
      return;
    }

    if (formData.password && formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (formData.password && formData.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    try {
      setSaving(true);

      const updates: any = {
        email: formData.email,
        full_name: formData.full_name,
        role: formData.role,
        status: formData.status
      };

      if (formData.password) {
        updates.password = formData.password;
      }

      await updateAdmin(id, updates);

      navigate('/admin/admins', { 
        state: { success: `Admin "${formData.full_name}" updated successfully!` } 
      });
    } catch (err: any) {
      console.error('Error updating admin:', err);
      if (err.message?.includes('duplicate key')) {
        setError('An admin with this email already exists.');
      } else {
        setError(err.message || 'Failed to update admin. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  const roles: Array<{ value: Admin['role']; icon: typeof Shield }> = [
    { value: 'super_admin', icon: ShieldCheck },
    { value: 'admin', icon: Shield },
    { value: 'manager', icon: ShieldAlert },
    { value: 'viewer', icon: Eye }
  ];

  const statuses: Array<{ value: Admin['status']; label: string; color: string }> = [
    { value: 'active', label: 'Active', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    { value: 'inactive', label: 'Inactive', color: 'bg-gray-100 text-gray-700 border-gray-200' },
    { value: 'suspended', label: 'Suspended', color: 'bg-red-100 text-red-700 border-red-200' }
  ];

  if (loading) {
    return (
      <AdminLayout>
        <div className="max-w-3xl mx-auto py-12">
          <div className="flex flex-col items-center justify-center">
            <Loader2 className="w-12 h-12 text-violet-500 animate-spin" />
            <p className="mt-4 text-gray-500 font-medium">Loading admin details...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (error && !admin) {
    return (
      <AdminLayout>
        <div className="max-w-2xl mx-auto py-12">
          <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl flex items-center">
            <AlertCircle className="w-6 h-6 mr-3" />
            <span className="font-medium">{error}</span>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/admin/admins')}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Edit Admin</h1>
            <p className="text-gray-500 mt-1">Update administrator details and permissions</p>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-xl flex items-center">
            <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-6">
          {/* Full Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Full Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet-500 focus:ring-0 transition-colors"
                placeholder="John Doe"
                required
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Email Address <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet-500 focus:ring-0 transition-colors"
                placeholder="admin@example.com"
                required
              />
            </div>
          </div>

          {/* Password (Optional) */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              New Password (Optional)
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet-500 focus:ring-0 transition-colors"
                placeholder="••••••••"
                minLength={8}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Leave blank to keep current password</p>
          </div>

          {/* Confirm Password */}
          {formData.password && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Confirm New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet-500 focus:ring-0 transition-colors"
                  placeholder="••••••••"
                />
              </div>
            </div>
          )}

          {/* Role Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Role <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {roles.map(({ value, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFormData({ ...formData, role: value })}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    formData.role === value
                      ? 'border-violet-500 bg-violet-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      formData.role === value ? 'bg-violet-100 text-violet-600' : 'bg-gray-100 text-gray-600'
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <p className={`font-semibold ${formData.role === value ? 'text-violet-700' : 'text-gray-800'}`}>
                        {getRoleDisplayName(value)}
                      </p>
                      <p className="text-xs text-gray-600 mt-1">
                        {getRoleDescription(value)}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Status Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Status <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-3">
              {statuses.map(({ value, label, color }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFormData({ ...formData, status: value })}
                  className={`px-4 py-2 rounded-xl border-2 font-semibold text-sm transition-all ${
                    formData.status === value
                      ? color
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Permissions Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-blue-900 mb-1">Default Permissions</p>
                <p className="text-xs text-blue-700">
                  The selected role will have the following permissions:
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {getDefaultPermissions(formData.role).map((perm, idx) => (
                    <span key={idx} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-md font-medium">
                      {perm}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => navigate('/admin/admins')}
              className="px-6 py-3 border-2 border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-violet-500 to-purple-500 text-white rounded-xl hover:from-violet-600 hover:to-purple-600 transition-all shadow-lg hover:shadow-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={20} className="mr-2" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
};

export default EditAdminPage;
