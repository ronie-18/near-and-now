import { useState, useEffect } from 'react';
import { User, Mail, Phone, Shield, Save, Edit } from 'lucide-react';
import { getCurrentAdmin } from '../../services/secureAdminAuth';
import { useNavigate } from 'react-router-dom';

const ProfilePage = () => {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const currentAdmin = getCurrentAdmin();
    setAdmin(currentAdmin);
  }, []);

  if (!admin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Profile</h1>
          <p className="text-gray-600 mt-1">View and manage your admin profile</p>
        </div>
        <button
          onClick={() => navigate(`/admin/admins/edit/${admin.id}`)}
          className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 flex items-center"
        >
          <Edit size={20} className="mr-2" />
          Edit Profile
        </button>
      </div>

      {/* Profile Card */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-start space-x-6">
          {/* Avatar */}
          <div className="w-24 h-24 rounded-full bg-primary text-white flex items-center justify-center text-3xl font-bold">
            {admin.full_name ? admin.full_name.charAt(0).toUpperCase() : admin.email.charAt(0).toUpperCase()}
          </div>

          {/* Profile Info */}
          <div className="flex-1">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              {admin.full_name || 'Admin User'}
            </h2>

            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <Mail size={20} className="text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Email</p>
                  <p className="text-gray-900">{admin.email || 'N/A'}</p>
                </div>
              </div>

              {admin.phone && (
                <div className="flex items-center space-x-3">
                  <Phone size={20} className="text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Phone</p>
                    <p className="text-gray-900">{admin.phone}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center space-x-3">
                <Shield size={20} className="text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Role</p>
                  <p className="text-gray-900 capitalize">{admin.role || 'Admin'}</p>
                </div>
              </div>

              {admin.status && (
                <div className="flex items-center space-x-3">
                  <div className="w-5 h-5 rounded-full bg-green-500"></div>
                  <div>
                    <p className="text-sm text-gray-500">Status</p>
                    <p className="text-gray-900 capitalize">{admin.status}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Additional Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> To edit your profile details, click the "Edit Profile" button above or navigate to Admin Management.
        </p>
      </div>
    </div>
  );
};

export default ProfilePage;
