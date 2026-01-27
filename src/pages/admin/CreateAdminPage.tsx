import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Info
} from 'lucide-react';
import { createAdmin, Admin, getRoleDisplayName, getRoleDescription, getDefaultPermissions, hasPermission } from '../../services/adminAuthService';

const CreateAdminPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    full_name: '',
    role: 'admin' as Admin['role']
  });

  // Get current admin from localStorage
  const currentAdminData = localStorage.getItem('adminData');
  const currentAdmin: Admin | null = currentAdminData ? JSON.parse(currentAdminData) : null;

  // Check permission
  if (!currentAdmin || !hasPermission(currentAdmin, 'admins.create')) {
    return (
      <AdminLayout>
        <div className="max-w-2xl mx-auto py-12">
          <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-xl flex items-center">
            <AlertCircle className="w-6 h-6 mr-3" />
            <span className="font-medium">You do not have permission to create admins.</span>
          </div>
        </div>
      </AdminLayout>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.email || !formData.password || !formData.full_name) {
      setError('Please fill in all required fields.');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    try {
      setLoading(true);

      await createAdmin({
        email: formData.email,
        password: formData.password,
        full_name: formData.full_name,
        role: formData.role,
        created_by: currentAdmin.id
      });

      navigate('/admin/admins', { 
        state: { success: `Admin "${formData.full_name}" created successfully!` } 
      });
    } catch (err: any) {
      console.error('Error creating admin:', err);
      if (err.message?.includes('duplicate key')) {
        setError('An admin with this email already exists.');
      } else {
        setError(err.message || 'Failed to create admin. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const roles: Array<{ value: Admin['role']; icon: React.ComponentType<{ className?: string }> }> = [
    { value: 'super_admin', icon: ShieldCheck },
    { value: 'admin', icon: Shield },
    { value: 'manager', icon: ShieldAlert },
    { value: 'viewer', icon: Eye }
  ];

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
            <h1 className="text-3xl font-bold text-gray-900">Create New Admin</h1>
            <p className="text-gray-500 mt-1">Add a new administrator to the system</p>
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

          {/* Password */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Password <span className="text-red-500">*</span>
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
                required
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Minimum 8 characters</p>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Confirm Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-violet-500 focus:ring-0 transition-colors"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

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
                      <Icon size={20} />
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
              disabled={loading}
              className="flex-1 inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-violet-500 to-purple-500 text-white rounded-xl hover:from-violet-600 hover:to-purple-600 transition-all shadow-lg hover:shadow-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Creating...
                </>
              ) : (
                <>
                  <Save size={20} className="mr-2" />
                  Create Admin
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
};

export default CreateAdminPage;
