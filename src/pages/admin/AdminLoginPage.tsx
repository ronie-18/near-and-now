import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { authenticateAdmin } from '../../services/adminAuthService';
import { checkRateLimit } from '../../utils/rateLimit';

const AdminLoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      console.log('🔐 Attempting admin login for:', email);

      // Check rate limit
      if (!checkRateLimit('ADMIN_LOGIN', email)) {
        setError('Too many login attempts. Please try again in 15 minutes.');
        setLoading(false);
        return;
      }

      // Use direct database authentication
      console.log('📡 Calling authenticateAdmin...');
      const result = await authenticateAdmin(email, password);
      console.log('📥 Authentication result:', result ? 'Success' : 'Failed');

      if (!result) {
        console.error('❌ Authentication failed - Invalid credentials');
        setError('Invalid email or password');
        setLoading(false);
        return;
      }

      console.log('✅ Admin authenticated:', result.admin.email);

      // Store admin data and token in sessionStorage
      sessionStorage.setItem('adminData', JSON.stringify(result.admin));
      sessionStorage.setItem('adminToken', result.token);
      sessionStorage.setItem('adminTokenExpiry', (Date.now() + 12 * 60 * 60 * 1000).toString()); // 12 hours

      // Redirect to dashboard
      navigate('/admin');
    } catch (error: any) {
      console.error('❌ Login error:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      setError(error.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-white to-secondary/5 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-2xl p-8 transform hover:scale-[1.02] transition-all duration-300">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <img src="/Logo.png" alt="Near & Now" className="h-16 w-16" />
          </div>

          <h1 className="text-3xl font-bold text-gray-800 mb-2 text-center">Admin Login</h1>
          <p className="text-gray-600 mb-8 text-center">Enter your credentials to access the admin panel</p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <label htmlFor="email" className="block text-gray-700 mb-2 font-medium">Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="pl-10 w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="admin@example.com"
                />
              </div>
            </div>

            <div className="mb-8">
              <label htmlFor="password" className="block text-gray-700 mb-2 font-medium">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pl-10 pr-12 w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-4 px-6 bg-gradient-to-r from-primary to-secondary text-white font-bold rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300 flex items-center justify-center ${
                loading ? 'opacity-70 cursor-not-allowed' : ''
              }`}
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Logging in...
                </>
              ) : (
                'Login to Admin Panel'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              <span className="font-medium">Note:</span> Use your admin credentials to login
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLoginPage;
