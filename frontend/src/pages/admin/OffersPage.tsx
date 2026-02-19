import { useState, useEffect } from 'react';
import { Tag, Search, Plus, Edit, Trash2, CheckCircle, XCircle, Calendar, Users } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';

interface Coupon {
  id: string;
  code: string;
  description?: string;
  coupon_type: 'flat' | 'percent' | 'first_order_discount';
  discount_value: number;
  max_discount_amount?: number;
  min_order_value?: number;
  applies_to_first_n_orders?: number;
  usage_limit?: number;
  usage_count: number;
  per_user_limit: number;
  valid_from: string;
  valid_until?: string;
  is_active: boolean;
  created_at?: string;
}

const API_BASE = import.meta.env.VITE_API_URL || '';

const OffersPage = () => {
  const { showNotification } = useNotification();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [formData, setFormData] = useState({
    code: '',
    description: '',
    coupon_type: 'flat' as 'flat' | 'percent' | 'first_order_discount',
    discount_value: 0,
    max_discount_amount: '',
    min_order_value: 0,
    applies_to_first_n_orders: '',
    usage_limit: '',
    per_user_limit: 1,
    valid_from: new Date().toISOString().split('T')[0],
    valid_until: '',
    is_active: true,
  });

  useEffect(() => {
    fetchCoupons();
  }, []);

  const fetchCoupons = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/coupons`);
      if (!res.ok) throw new Error('Failed to fetch coupons');
      const data = await res.json();
      setCoupons(data);
    } catch (error) {
      console.error('Error fetching coupons:', error);
      showNotification('Failed to load coupons', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const payload: any = {
        ...formData,
        discount_value: Number(formData.discount_value),
        min_order_value: Number(formData.min_order_value),
        per_user_limit: Number(formData.per_user_limit),
        max_discount_amount: formData.max_discount_amount ? Number(formData.max_discount_amount) : undefined,
        applies_to_first_n_orders: formData.applies_to_first_n_orders ? Number(formData.applies_to_first_n_orders) : undefined,
        usage_limit: formData.usage_limit ? Number(formData.usage_limit) : undefined,
        valid_from: new Date(formData.valid_from).toISOString(),
        valid_until: formData.valid_until ? new Date(formData.valid_until).toISOString() : undefined,
      };
      const res = await fetch(`${API_BASE}/api/coupons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to create coupon');
      }
      showNotification('Coupon created successfully', 'success');
      setShowModal(false);
      resetForm();
      fetchCoupons();
    } catch (error: any) {
      console.error('Error creating coupon:', error);
      showNotification(error.message || 'Failed to create coupon', 'error');
    }
  };

  const handleUpdate = async () => {
    if (!editingCoupon) return;
    try {
      const payload: any = {
        ...formData,
        discount_value: Number(formData.discount_value),
        min_order_value: Number(formData.min_order_value),
        per_user_limit: Number(formData.per_user_limit),
        max_discount_amount: formData.max_discount_amount ? Number(formData.max_discount_amount) : undefined,
        applies_to_first_n_orders: formData.applies_to_first_n_orders ? Number(formData.applies_to_first_n_orders) : undefined,
        usage_limit: formData.usage_limit ? Number(formData.usage_limit) : undefined,
        valid_from: new Date(formData.valid_from).toISOString(),
        valid_until: formData.valid_until ? new Date(formData.valid_until).toISOString() : undefined,
      };
      const res = await fetch(`${API_BASE}/api/coupons/${editingCoupon.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update coupon');
      }
      showNotification('Coupon updated successfully', 'success');
      setShowModal(false);
      setEditingCoupon(null);
      resetForm();
      fetchCoupons();
    } catch (error: any) {
      console.error('Error updating coupon:', error);
      showNotification(error.message || 'Failed to update coupon', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this coupon?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/coupons/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete coupon');
      showNotification('Coupon deleted successfully', 'success');
      fetchCoupons();
    } catch (error) {
      console.error('Error deleting coupon:', error);
      showNotification('Failed to delete coupon', 'error');
    }
  };

  const toggleActive = async (coupon: Coupon) => {
    try {
      const res = await fetch(`${API_BASE}/api/coupons/${coupon.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !coupon.is_active }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      fetchCoupons();
    } catch (error) {
      console.error('Error updating status:', error);
      showNotification('Failed to update coupon status', 'error');
    }
  };

  const resetForm = () => {
    setFormData({
      code: '',
      description: '',
      coupon_type: 'flat',
      discount_value: 0,
      max_discount_amount: '',
      min_order_value: 0,
      applies_to_first_n_orders: '',
      usage_limit: '',
      per_user_limit: 1,
      valid_from: new Date().toISOString().split('T')[0],
      valid_until: '',
      is_active: true,
    });
  };

  const openEditModal = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setFormData({
      code: coupon.code,
      description: coupon.description || '',
      coupon_type: coupon.coupon_type,
      discount_value: coupon.discount_value,
      max_discount_amount: coupon.max_discount_amount?.toString() || '',
      min_order_value: coupon.min_order_value || 0,
      applies_to_first_n_orders: coupon.applies_to_first_n_orders?.toString() || '',
      usage_limit: coupon.usage_limit?.toString() || '',
      per_user_limit: coupon.per_user_limit,
      valid_from: coupon.valid_from.split('T')[0],
      valid_until: coupon.valid_until ? coupon.valid_until.split('T')[0] : '',
      is_active: coupon.is_active,
    });
    setShowModal(true);
  };

  const openCreateModal = () => {
    setEditingCoupon(null);
    resetForm();
    setShowModal(true);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const isExpired = (coupon: Coupon) => {
    if (!coupon.valid_until) return false;
    return new Date(coupon.valid_until) < new Date();
  };

  const filteredCoupons = coupons.filter((c) =>
    c.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.description?.toLowerCase().includes(searchTerm.toLowerCase())
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
          <h1 className="text-3xl font-bold text-gray-900">Offers & Coupons</h1>
          <p className="text-gray-600 mt-1">Manage offers and coupons for customers</p>
        </div>
        <button
          onClick={openCreateModal}
          className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 flex items-center"
        >
          <Plus size={20} className="mr-2" />
          Create Coupon
        </button>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-lg shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search coupons..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Coupons Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCoupons.length === 0 ? (
          <div className="col-span-full text-center py-12 text-gray-500">
            No coupons found
          </div>
        ) : (
          filteredCoupons.map((coupon) => (
            <div
              key={coupon.id}
              className={`bg-white rounded-lg shadow-sm p-6 border-2 ${
                coupon.is_active && !isExpired(coupon)
                  ? 'border-green-200'
                  : 'border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Tag className={`w-5 h-5 ${coupon.is_active ? 'text-primary' : 'text-gray-400'}`} />
                  <h3 className="text-lg font-bold text-gray-900">{coupon.code}</h3>
                </div>
                <button
                  onClick={() => toggleActive(coupon)}
                  className={`p-1 rounded ${
                    coupon.is_active ? 'text-green-600' : 'text-gray-400'
                  }`}
                >
                  {coupon.is_active ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                </button>
              </div>

              {coupon.description && (
                <p className="text-sm text-gray-600 mb-3">{coupon.description}</p>
              )}

              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Discount:</span>
                  <span className="font-medium text-gray-900">
                    {coupon.coupon_type === 'flat'
                      ? `₹${coupon.discount_value}`
                      : `${coupon.discount_value}%`}
                    {coupon.max_discount_amount && coupon.coupon_type === 'percent' && (
                      <span className="text-gray-500"> (max ₹{coupon.max_discount_amount})</span>
                    )}
                  </span>
                </div>
                {coupon.min_order_value > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Min Order:</span>
                    <span className="font-medium text-gray-900">₹{coupon.min_order_value}</span>
                  </div>
                )}
                {coupon.applies_to_first_n_orders && (
                  <div className="flex items-center gap-1 text-sm text-blue-600">
                    <Users className="w-4 h-4" />
                    <span>First {coupon.applies_to_first_n_orders} orders only</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Usage:</span>
                  <span className="font-medium text-gray-900">
                    {coupon.usage_count}
                    {coupon.usage_limit ? ` / ${coupon.usage_limit}` : ' / ∞'}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <Calendar className="w-4 h-4" />
                  <span>
                    {formatDate(coupon.valid_from)} -{' '}
                    {coupon.valid_until ? formatDate(coupon.valid_until) : 'No expiry'}
                  </span>
                </div>
                {isExpired(coupon) && (
                  <span className="text-xs text-red-600 font-medium">Expired</span>
                )}
              </div>

              <div className="flex items-center gap-2 pt-3 border-t">
                <button
                  onClick={() => openEditModal(coupon)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(coupon.id)}
                  className="px-3 py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">
              {editingCoupon ? 'Edit Coupon' : 'Create Coupon'}
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                    placeholder="SAVE20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                  <select
                    value={formData.coupon_type}
                    onChange={(e) => setFormData({ ...formData, coupon_type: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="flat">Flat Amount</option>
                    <option value="percent">Percentage</option>
                    <option value="first_order_discount">First Order Discount</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Discount Value *</label>
                  <input
                    type="number"
                    value={formData.discount_value}
                    onChange={(e) => setFormData({ ...formData, discount_value: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                    min="0"
                  />
                </div>
                {formData.coupon_type === 'percent' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Max Discount (₹)</label>
                    <input
                      type="number"
                      value={formData.max_discount_amount}
                      onChange={(e) => setFormData({ ...formData, max_discount_amount: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      min="0"
                    />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min Order Value (₹)</label>
                  <input
                    type="number"
                    value={formData.min_order_value}
                    onChange={(e) => setFormData({ ...formData, min_order_value: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Per User Limit</label>
                  <input
                    type="number"
                    value={formData.per_user_limit}
                    onChange={(e) => setFormData({ ...formData, per_user_limit: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    min="1"
                  />
                </div>
              </div>
              {formData.coupon_type === 'first_order_discount' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Applies to First N Orders</label>
                  <input
                    type="number"
                    value={formData.applies_to_first_n_orders}
                    onChange={(e) => setFormData({ ...formData, applies_to_first_n_orders: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    min="1"
                    placeholder="e.g., 3"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Usage Limit (leave empty for unlimited)</label>
                  <input
                    type="number"
                    value={formData.usage_limit}
                    onChange={(e) => setFormData({ ...formData, usage_limit: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={formData.is_active ? 'true' : 'false'}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'true' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valid From *</label>
                  <input
                    type="date"
                    value={formData.valid_from}
                    onChange={(e) => setFormData({ ...formData, valid_from: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valid Until (leave empty for no expiry)</label>
                  <input
                    type="date"
                    value={formData.valid_until}
                    onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowModal(false);
                  setEditingCoupon(null);
                  resetForm();
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={editingCoupon ? handleUpdate : handleCreate}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
              >
                {editingCoupon ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OffersPage;
