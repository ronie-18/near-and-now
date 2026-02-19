import { useState, useEffect } from 'react';
import { Truck, Search, Plus, Edit, Trash2, MapPin, Phone, Mail, User, CheckCircle, XCircle, Map } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';

interface DeliveryPartner {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  is_activated: boolean;
  is_online?: boolean;
  vehicle_number?: string;
  address?: string;
  created_at?: string;
  profile?: {
    verification_document?: string;
    verification_number?: string;
  };
}

const API_BASE = import.meta.env.VITE_API_URL || '';

const DeliveryPage = () => {
  const { showNotification } = useNotification();
  const [partners, setPartners] = useState<DeliveryPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingPartner, setEditingPartner] = useState<DeliveryPartner | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<DeliveryPartner | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    vehicle_number: '',
    verification_document: '',
    verification_number: '',
  });

  useEffect(() => {
    fetchPartners();
  }, []);

  const fetchPartners = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/delivery/partners`);
      if (!res.ok) throw new Error('Failed to fetch partners');
      const data = await res.json();
      setPartners(data);
    } catch (error) {
      console.error('Error fetching partners:', error);
      showNotification('Failed to load delivery partners', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/delivery/partners`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error('Failed to create partner');
      showNotification('Delivery partner created successfully', 'success');
      setShowModal(false);
      resetForm();
      fetchPartners();
    } catch (error) {
      console.error('Error creating partner:', error);
      showNotification('Failed to create delivery partner', 'error');
    }
  };

  const handleUpdate = async () => {
    if (!editingPartner) return;
    try {
      const res = await fetch(`${API_BASE}/api/delivery/partners/${editingPartner.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error('Failed to update partner');
      showNotification('Delivery partner updated successfully', 'success');
      setShowModal(false);
      setEditingPartner(null);
      resetForm();
      fetchPartners();
    } catch (error) {
      console.error('Error updating partner:', error);
      showNotification('Failed to update delivery partner', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this delivery partner?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/delivery/partners/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete partner');
      showNotification('Delivery partner deleted successfully', 'success');
      fetchPartners();
    } catch (error) {
      console.error('Error deleting partner:', error);
      showNotification('Failed to delete delivery partner', 'error');
    }
  };

  const toggleOnlineStatus = async (partner: DeliveryPartner) => {
    try {
      const res = await fetch(`${API_BASE}/api/delivery/partners/${partner.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_online: !partner.is_online }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      fetchPartners();
    } catch (error) {
      console.error('Error updating status:', error);
      showNotification('Failed to update partner status', 'error');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      address: '',
      vehicle_number: '',
      verification_document: '',
      verification_number: '',
    });
  };

  const openEditModal = (partner: DeliveryPartner) => {
    setEditingPartner(partner);
    setFormData({
      name: partner.name,
      email: partner.email || '',
      phone: partner.phone || '',
      address: partner.address || '',
      vehicle_number: partner.vehicle_number || '',
      verification_document: partner.profile?.verification_document || '',
      verification_number: partner.profile?.verification_number || '',
    });
    setShowModal(true);
  };

  const openCreateModal = () => {
    setEditingPartner(null);
    resetForm();
    setShowModal(true);
  };

  const filteredPartners = partners.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-10 h-10 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Delivery Partners</h1>
          <p className="text-gray-600 mt-1">Manage and track delivery partners</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowMap(!showMap)}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 flex items-center"
          >
            <Map className="w-5 h-5 mr-2" />
            {showMap ? 'Hide Map' : 'Show Map'}
          </button>
          <button
            onClick={openCreateModal}
            className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 flex items-center"
          >
            <Plus size={20} className="mr-2" />
            Add Delivery Partner
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-lg shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search delivery partners..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Map View */}
      {showMap && (
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Partner Locations</h2>
          <div className="h-96 bg-gray-100 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
            <div className="text-center">
              <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-600">Map view coming soon</p>
              <p className="text-sm text-gray-500 mt-1">Shows real-time locations of online delivery partners</p>
            </div>
          </div>
        </div>
      )}

      {/* Partners Table */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Partner</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vehicle</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredPartners.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    No delivery partners found
                  </td>
                </tr>
              ) : (
                filteredPartners.map((partner) => (
                  <tr key={partner.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="w-6 h-6 text-primary" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{partner.name}</div>
                          {partner.address && (
                            <div className="text-sm text-gray-500">{partner.address}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {partner.phone && (
                          <div className="flex items-center gap-1">
                            <Phone className="w-4 h-4 text-gray-400" />
                            {partner.phone}
                          </div>
                        )}
                        {partner.email && (
                          <div className="flex items-center gap-1 mt-1">
                            <Mail className="w-4 h-4 text-gray-400" />
                            {partner.email}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {partner.vehicle_number || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleOnlineStatus(partner)}
                          className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${
                            partner.is_online
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {partner.is_online ? (
                            <>
                              <CheckCircle className="w-4 h-4" />
                              Online
                            </>
                          ) : (
                            <>
                              <XCircle className="w-4 h-4" />
                              Offline
                            </>
                          )}
                        </button>
                        {partner.is_activated ? (
                          <span className="text-xs text-green-600">Activated</span>
                        ) : (
                          <span className="text-xs text-gray-500">Inactive</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => openEditModal(partner)}
                          className="text-primary hover:text-secondary"
                        >
                          <Edit className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(partner.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">
              {editingPartner ? 'Edit Delivery Partner' : 'Add Delivery Partner'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Number</label>
                <input
                  type="text"
                  value={formData.vehicle_number}
                  onChange={(e) => setFormData({ ...formData, vehicle_number: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="e.g., KA-01-AB-1234"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Verification Document</label>
                  <select
                    value={formData.verification_document}
                    onChange={(e) => setFormData({ ...formData, verification_document: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Select document</option>
                    <option value="Aadhaar">Aadhaar</option>
                    <option value="PAN Card">PAN Card</option>
                    <option value="Driving License">Driving License</option>
                    <option value="Voter ID">Voter ID</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Document Number</label>
                  <input
                    type="text"
                    value={formData.verification_number}
                    onChange={(e) => setFormData({ ...formData, verification_number: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingPartner(null);
                  resetForm();
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={editingPartner ? handleUpdate : handleCreate}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
              >
                {editingPartner ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeliveryPage;
