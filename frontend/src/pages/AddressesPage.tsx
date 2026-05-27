import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import {
  getUserAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress
} from '../services/supabase';
import { geocodeAddress } from '../services/placesService';
import { Home, Briefcase, MapPin } from 'lucide-react';

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */
interface Address {
  id: string;
  name: string;
  label?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  isDefault: boolean;
}

/* ─────────────────────────────────────────────
   Styles
───────────────────────────────────────────── */
const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap');

  .ap-root * { box-sizing: border-box; }

  @keyframes ap-fade-up {
    from { opacity: 0; transform: translateY(18px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes ap-shimmer {
    0%   { background-position: -600px 0; }
    100% { background-position: 600px 0; }
  }
  @keyframes ap-slide-down {
    from { opacity: 0; transform: translateY(-12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes ap-spin {
    to { transform: rotate(360deg); }
  }

  .ap-fade-up    { animation: ap-fade-up    0.5s cubic-bezier(.22,.68,0,1.2) both; }
  .ap-slide-down { animation: ap-slide-down 0.35s cubic-bezier(.22,.68,0,1.2) both; }

  /* Skeleton */
  .ap-skeleton {
    background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
    background-size: 600px 100%;
    animation: ap-shimmer 1.4s infinite linear;
    border-radius: 10px;
  }

  /* Card */
  .ap-card {
    background: #fff;
    border-radius: 20px;
    border: 1px solid #f0f0f0;
    box-shadow: 0 2px 12px -2px rgba(0,0,0,.06);
    overflow: hidden;
    transition: box-shadow .25s, border-color .25s;
  }
  .ap-card:hover { box-shadow: 0 8px 28px -4px rgba(0,0,0,.1); }
  .ap-card.default-card { border-color: #c7d2fe; }

  /* Form card */
  .ap-form-card {
    background: #fff;
    border-radius: 20px;
    border: 1.5px solid #e0e7ff;
    box-shadow: 0 4px 24px -4px rgba(79,70,229,.1);
    overflow: hidden;
  }

  /* Icon badge */
  .ap-icon-badge {
    width: 40px; height: 40px; border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }

  /* Divider */
  .ap-divider { height: 1px; background: #f3f4f6; }

  /* Field */
  .ap-field { display: flex; flex-direction: column; gap: 6px; }
  .ap-label {
    font-size: 12px; font-weight: 600; color: #9ca3af;
    text-transform: uppercase; letter-spacing: .06em;
  }
  .ap-input, .ap-textarea, .ap-select {
    width: 100%; padding: 12px 16px;
    border: 1.5px solid #e5e7eb; border-radius: 12px;
    font-family: 'DM Sans', sans-serif; font-size: 15px; color: #1a1a2e;
    outline: none; transition: border-color .2s, box-shadow .2s;
    background: #fff;
  }
  .ap-textarea { resize: vertical; min-height: 76px; }
  .ap-select { appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M19 9l-7 7-7-7'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 14px center; padding-right: 40px; }
  .ap-input:focus, .ap-textarea:focus, .ap-select:focus {
    border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79,70,229,.1);
  }
  .ap-hint { font-size: 12px; color: #b0b7c3; }

  /* Checkbox */
  .ap-checkbox-wrap {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 16px; border-radius: 12px;
    border: 1.5px solid #e5e7eb; cursor: pointer;
    transition: border-color .2s, background .2s;
  }
  .ap-checkbox-wrap:has(input:checked) { border-color: #4f46e5; background: #f5f5ff; }
  .ap-checkbox-wrap input { accent-color: #4f46e5; width: 16px; height: 16px; cursor: pointer; }

  /* Buttons */
  .ap-btn-primary {
    display: inline-flex; align-items: center; justify-content: center; gap: 7px;
    background: #1a1a2e; color: #fff;
    border: none; border-radius: 12px; padding: 13px 24px;
    font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 500;
    cursor: pointer; transition: background .2s, box-shadow .2s, transform .15s;
    letter-spacing: .01em; text-decoration: none; white-space: nowrap;
  }
  .ap-btn-primary:hover { background: #16213e; box-shadow: 0 8px 24px rgba(26,26,46,.2); transform: translateY(-1px); }
  .ap-btn-primary:active { transform: translateY(0); box-shadow: none; }

  .ap-btn-ghost {
    display: inline-flex; align-items: center; justify-content: center; gap: 7px;
    background: #fff; color: #374151;
    border: 1.5px solid #e5e7eb; border-radius: 12px; padding: 13px 24px;
    font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 500;
    cursor: pointer; transition: border-color .2s, background .2s, transform .15s;
  }
  .ap-btn-ghost:hover { border-color: #374151; background: #f9fafb; transform: translateY(-1px); }
  .ap-btn-ghost:active { transform: translateY(0); }

  .ap-btn-icon {
    display: inline-flex; align-items: center; gap: 5px;
    background: none; border: none; border-radius: 8px; padding: 6px 10px;
    font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500;
    cursor: pointer; transition: background .2s, color .2s;
  }
  .ap-btn-edit  { color: #4f46e5; }
  .ap-btn-edit:hover  { background: #f0f0fa; }
  .ap-btn-delete { color: #ef4444; }
  .ap-btn-delete:hover { background: #fef2f2; }
  .ap-btn-default { color: #6b7280; font-size: 13px; }
  .ap-btn-default:hover { background: #f9fafb; color: #1a1a2e; }

  /* Default badge */
  .ap-default-badge {
    display: inline-flex; align-items: center; gap: 4px;
    background: #f0fdf4; color: #15803d;
    border-radius: 999px; padding: 3px 10px;
    font-size: 11px; font-weight: 600; letter-spacing: .03em;
  }

  /* Back link */
  .ap-back-link {
    display: inline-flex; align-items: center; gap: 6px;
    color: #9ca3af; font-size: 14px; text-decoration: none; cursor: pointer;
    background: none; border: none;
    transition: color .2s;
  }
  .ap-back-link:hover { color: #1a1a2e; }

  /* Empty */
  .ap-empty { text-align: center; padding: 60px 24px; }
  .ap-empty-icon {
    width: 72px; height: 72px; border-radius: 50%;
    background: #f5f5ff; display: flex; align-items: center; justify-content: center;
    margin: 0 auto 20px;
  }
  .ap-empty h2 {
    font-family: 'DM Serif Display', serif;
    font-size: 22px; color: #1a1a2e; margin: 0 0 8px;
  }
  .ap-empty p { color: #9ca3af; font-size: 15px; margin: 0 0 24px; }
`;

/* ─────────────────────────────────────────────
   Icon helper
───────────────────────────────────────────── */
function getAddressIcon(label?: string) {
  const lower = label?.toLowerCase();
  if (lower === 'home')
    return { icon: <Home size={18} color="#4f46e5" />, bg: '#f0f0fa' };
  if (lower === 'work' || lower === 'office')
    return { icon: <Briefcase size={18} color="#0284c7" />, bg: '#f0f9ff' };
  return { icon: <MapPin size={18} color="#059669" />, bg: '#f0fdf4' };
}

/* ─────────────────────────────────────────────
   Component
───────────────────────────────────────────── */
const AddressesPage = () => {
  const { isAuthenticated, isLoading, user, customer } = useAuth();
  const { showNotification } = useNotification();
  const navigate = useNavigate();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);

  const [formData, setFormData] = useState({
    name: '', addressLine1: '', addressLine2: '',
    city: '', state: '', pincode: '', phone: '', isDefault: false
  });

  /* ── Auth redirect ── */
  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate('/login');
  }, [isAuthenticated, isLoading, navigate]);

  /* ── Fetch addresses ── */
  useEffect(() => {
    const fetchAddresses = async () => {
      if (!user?.id) { setLoading(false); return; }
      try {
        setLoading(true);
        const data = await getUserAddresses(user.id, user.phone || undefined, customer?.phone);
        setAddresses(data.map(addr => ({
          id: addr.id, name: addr.name, label: addr.label,
          addressLine1: addr.address_line_1, addressLine2: addr.address_line_2,
          city: addr.city, state: addr.state, pincode: addr.pincode,
          phone: addr.phone, isDefault: addr.is_default
        })));
      } catch (error) {
        console.error('Error fetching addresses:', error);
        showNotification('Failed to load addresses', 'error');
      } finally {
        setLoading(false);
      }
    };
    if (user?.id) fetchAddresses();
  }, [user?.id, user?.phone, customer?.phone, showNotification]);

  /* ── Sync form when editing ── */
  useEffect(() => {
    if (editingAddress) {
      setFormData({
        name: editingAddress.name,
        addressLine1: editingAddress.addressLine1,
        addressLine2: editingAddress.addressLine2 || '',
        city: editingAddress.city, state: editingAddress.state,
        pincode: editingAddress.pincode, phone: editingAddress.phone,
        isDefault: editingAddress.isDefault
      });
      setShowAddForm(true);
    } else if (!showAddForm) {
      setFormData({ name: '', addressLine1: '', addressLine2: '', city: '', state: '', pincode: '', phone: '', isDefault: false });
    }
  }, [editingAddress, showAddForm]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target as HTMLInputElement;
    const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const refreshAddresses = async () => {
    if (!user?.id) return [];
    const data = await getUserAddresses(user.id, user.phone || undefined, customer?.phone);
    return data.map(addr => ({
      id: addr.id, name: addr.name, label: addr.label,
      addressLine1: addr.address_line_1, addressLine2: addr.address_line_2,
      city: addr.city, state: addr.state, pincode: addr.pincode,
      phone: addr.phone, isDefault: addr.is_default
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.addressLine1 || !formData.city || !formData.state || !formData.pincode || !formData.phone) {
      showNotification('Please fill all required fields', 'error'); return;
    }
    if (!/^[6-9]\d{9}$/.test(formData.phone)) {
      showNotification('Please enter a valid 10-digit phone number', 'error'); return;
    }
    if (!/^\d{6}$/.test(formData.pincode)) {
      showNotification('Please enter a valid 6-digit pincode', 'error'); return;
    }
    if (!user?.id) { showNotification('User not authenticated', 'error'); return; }

    try {
      const fullAddress = [formData.addressLine1, formData.addressLine2, formData.city, formData.state, formData.pincode].filter(Boolean).join(', ');
      const geocoded = await geocodeAddress(fullAddress);
      if (!geocoded) { showNotification('Could not verify address. Please try a different address.', 'error'); return; }

      if (editingAddress) {
        await updateAddress(editingAddress.id, user.id, {
          name: formData.name, address_line_1: formData.addressLine1,
          address_line_2: formData.addressLine2 || undefined,
          city: formData.city, state: formData.state, pincode: formData.pincode,
          phone: formData.phone, is_default: formData.isDefault,
          latitude: geocoded.lat, longitude: geocoded.lng,
        });
        showNotification('Address updated successfully', 'success');
      } else {
        await createAddress({
          user_id: user.id, name: formData.name,
          address_line_1: formData.addressLine1,
          address_line_2: formData.addressLine2 || undefined,
          city: formData.city, state: formData.state, pincode: formData.pincode,
          phone: formData.phone, is_default: formData.isDefault,
          latitude: geocoded.lat, longitude: geocoded.lng,
        });
        showNotification('Address added successfully', 'success');
      }
      setAddresses(await refreshAddresses());
      setEditingAddress(null);
      setShowAddForm(false);
    } catch (error) {
      console.error('Error saving address:', error);
      showNotification('Failed to save address. Please try again.', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (addresses.find(a => a.id === id)?.isDefault) {
      showNotification('Cannot delete default address', 'error'); return;
    }
    if (!user?.id) { showNotification('User not authenticated', 'error'); return; }
    try {
      await deleteAddress(id, user.id);
      setAddresses(await refreshAddresses());
      showNotification('Address deleted successfully', 'success');
    } catch (error) {
      console.error('Error deleting address:', error);
      showNotification('Failed to delete address. Please try again.', 'error');
    }
  };

  const handleSetDefault = async (id: string) => {
    if (!user?.id) { showNotification('User not authenticated', 'error'); return; }
    try {
      await setDefaultAddress(id, user.id);
      setAddresses(await refreshAddresses());
      showNotification('Default address updated', 'success');
    } catch (error) {
      console.error('Error setting default address:', error);
      showNotification('Failed to set default address. Please try again.', 'error');
    }
  };

  /* ── Loading skeleton ── */
  if (isLoading || loading) {
    return (
      <div className="ap-root" style={{ fontFamily: "'DM Sans', sans-serif", background: '#fafafa', minHeight: '100vh' }}>
        <style>{globalStyles}</style>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '48px 24px' }}>
          <div className="ap-skeleton" style={{ height: 32, width: 200, marginBottom: 32 }} />
          {[1, 2].map(i => (
            <div key={i} className="ap-card" style={{ padding: 24, marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 }}>
                <div className="ap-skeleton" style={{ width: 40, height: 40, borderRadius: 12 }} />
                <div style={{ flex: 1 }}>
                  <div className="ap-skeleton" style={{ height: 16, width: '40%', marginBottom: 6 }} />
                  <div className="ap-skeleton" style={{ height: 12, width: '25%' }} />
                </div>
              </div>
              <div className="ap-skeleton" style={{ height: 13, width: '85%', marginBottom: 6 }} />
              <div className="ap-skeleton" style={{ height: 13, width: '60%', marginBottom: 16 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <div className="ap-skeleton" style={{ height: 32, width: 72, borderRadius: 8 }} />
                <div className="ap-skeleton" style={{ height: 32, width: 72, borderRadius: 8 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── Main render ── */
  return (
    <div className="ap-root" style={{ fontFamily: "'DM Sans', sans-serif", background: '#fafafa', minHeight: '100vh' }}>
      <style>{globalStyles}</style>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '48px 24px 72px' }}>

        {/* Header */}
        <div className="ap-fade-up" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 32 }}>
          <div>
            <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 32, color: '#1a1a2e', margin: '0 0 4px' }}>
              My Addresses
            </h1>
            {addresses.length > 0 && (
              <p style={{ fontSize: 14, color: '#9ca3af', margin: 0 }}>
                {addresses.length} saved address{addresses.length !== 1 ? 'es' : ''}
              </p>
            )}
          </div>
          {!showAddForm && (
            <button className="ap-btn-primary" onClick={() => setShowAddForm(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add Address
            </button>
          )}
        </div>

        {/* ── Add / Edit Form ── */}
        {showAddForm && (
          <div className="ap-form-card ap-slide-down" style={{ marginBottom: 24 }}>

            {/* Form header */}
            <div style={{ padding: '22px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: '#1a1a2e', margin: 0 }}>
                {editingAddress ? 'Edit Address' : 'New Address'}
              </h2>
              <button
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4, borderRadius: 8, transition: 'color .2s' }}
                onClick={() => { setShowAddForm(false); setEditingAddress(null); }}
                onMouseEnter={e => (e.currentTarget.style.color = '#1a1a2e')}
                onMouseLeave={e => (e.currentTarget.style.color = '#9ca3af')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="ap-divider" />

            <form onSubmit={handleSubmit} style={{ padding: '24px 28px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginBottom: 20 }}>

                {/* Name */}
                <div className="ap-field">
                  <label className="ap-label" htmlFor="name">Address Label *</label>
                  <input className="ap-input" type="text" id="name" name="name" value={formData.name}
                    onChange={handleChange} placeholder="e.g. Home, Office" required />
                </div>

                {/* Phone */}
                <div className="ap-field">
                  <label className="ap-label" htmlFor="phone">Phone Number *</label>
                  <input className="ap-input" type="tel" id="phone" name="phone" value={formData.phone}
                    onChange={handleChange} placeholder="10-digit mobile" required maxLength={10} />
                </div>

                {/* Address Line 1 */}
                <div className="ap-field" style={{ gridColumn: '1 / -1' }}>
                  <label className="ap-label" htmlFor="addressLine1">Address Line 1 *</label>
                  <textarea className="ap-textarea" id="addressLine1" name="addressLine1" value={formData.addressLine1}
                    onChange={handleChange} placeholder="Flat/House No., Building, Street" required rows={2} />
                </div>

                {/* Address Line 2 */}
                <div className="ap-field" style={{ gridColumn: '1 / -1' }}>
                  <label className="ap-label" htmlFor="addressLine2">
                    Address Line 2 <span style={{ color: '#d1d5db', fontWeight: 400 }}>(Optional)</span>
                  </label>
                  <textarea className="ap-textarea" id="addressLine2" name="addressLine2" value={formData.addressLine2}
                    onChange={handleChange} placeholder="Landmark, Area" rows={2} />
                </div>

                {/* City */}
                <div className="ap-field">
                  <label className="ap-label" htmlFor="city">City *</label>
                  <input className="ap-input" type="text" id="city" name="city" value={formData.city}
                    onChange={handleChange} required />
                </div>

                {/* State */}
                <div className="ap-field">
                  <label className="ap-label" htmlFor="state">State *</label>
                  <select className="ap-select" id="state" name="state" value={formData.state} onChange={handleChange} required>
                    <option value="">Select State</option>
                    <option value="Andhra Pradesh">Andhra Pradesh</option>
                    <option value="Arunachal Pradesh">Arunachal Pradesh</option>
                    <option value="Assam">Assam</option>
                    <option value="Bihar">Bihar</option>
                    <option value="Chhattisgarh">Chhattisgarh</option>
                    <option value="Goa">Goa</option>
                    <option value="Gujarat">Gujarat</option>
                    <option value="Haryana">Haryana</option>
                    <option value="Himachal Pradesh">Himachal Pradesh</option>
                    <option value="Jharkhand">Jharkhand</option>
                    <option value="Karnataka">Karnataka</option>
                    <option value="Kerala">Kerala</option>
                    <option value="Madhya Pradesh">Madhya Pradesh</option>
                    <option value="Maharashtra">Maharashtra</option>
                    <option value="Manipur">Manipur</option>
                    <option value="Meghalaya">Meghalaya</option>
                    <option value="Mizoram">Mizoram</option>
                    <option value="Nagaland">Nagaland</option>
                    <option value="Odisha">Odisha</option>
                    <option value="Punjab">Punjab</option>
                    <option value="Rajasthan">Rajasthan</option>
                    <option value="Sikkim">Sikkim</option>
                    <option value="Tamil Nadu">Tamil Nadu</option>
                    <option value="Telangana">Telangana</option>
                    <option value="Tripura">Tripura</option>
                    <option value="Uttar Pradesh">Uttar Pradesh</option>
                    <option value="Uttarakhand">Uttarakhand</option>
                    <option value="West Bengal">West Bengal</option>
                    <optgroup label="Union Territories">
                      <option value="Andaman and Nicobar Islands">Andaman and Nicobar Islands</option>
                      <option value="Chandigarh">Chandigarh</option>
                      <option value="Dadra and Nagar Haveli and Daman and Diu">Dadra and Nagar Haveli and Daman and Diu</option>
                      <option value="Delhi">Delhi</option>
                      <option value="Jammu and Kashmir">Jammu and Kashmir</option>
                      <option value="Ladakh">Ladakh</option>
                      <option value="Lakshadweep">Lakshadweep</option>
                      <option value="Puducherry">Puducherry</option>
                    </optgroup>
                  </select>
                </div>

                {/* Pincode */}
                <div className="ap-field">
                  <label className="ap-label" htmlFor="pincode">PIN Code *</label>
                  <input className="ap-input" type="text" id="pincode" name="pincode" value={formData.pincode}
                    onChange={handleChange} required maxLength={6} />
                </div>

                {/* Default checkbox */}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="ap-checkbox-wrap">
                    <input type="checkbox" id="isDefault" name="isDefault" checked={formData.isDefault} onChange={handleChange} />
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 500, color: '#1a1a2e', margin: '0 0 2px' }}>Set as default address</p>
                      <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>Used automatically at checkout</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Form actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
                <button type="button" className="ap-btn-ghost"
                  onClick={() => { setShowAddForm(false); setEditingAddress(null); }}>
                  Cancel
                </button>
                <button type="submit" className="ap-btn-primary">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                  {editingAddress ? 'Update Address' : 'Save Address'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Address List ── */}
        {addresses.length === 0 ? (
          <div className="ap-card ap-fade-up">
            <div className="ap-empty">
              <div className="ap-empty-icon">
                <MapPin size={28} color="#4f46e5" />
              </div>
              <h2>No Addresses Yet</h2>
              <p>You haven't added any delivery addresses yet.</p>
              <button className="ap-btn-primary" onClick={() => setShowAddForm(true)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add New Address
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {addresses.map((address, idx) => {
              const { icon, bg } = getAddressIcon(address.label || address.name);
              return (
                <div
                  key={address.id}
                  className={`ap-card ap-fade-up${address.isDefault ? ' default-card' : ''}`}
                  style={{ animationDelay: `${idx * 0.06}s` }}
                >
                  <div style={{ padding: '20px 24px' }}>

                    {/* Top row */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div className="ap-icon-badge" style={{ background: bg }}>{icon}</div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 15, fontWeight: 600, color: '#1a1a2e' }}>{address.name}</span>
                            {address.isDefault && (
                              <span className="ap-default-badge">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <path d="M5 13l4 4L19 7" />
                                </svg>
                                Default
                              </span>
                            )}
                          </div>
                          <p style={{ fontSize: 12, color: '#9ca3af', margin: '2px 0 0', fontFamily: 'monospace' }}>
                            {address.phone}
                          </p>
                        </div>
                      </div>

                      {/* Edit / Delete */}
                      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                        <button className="ap-btn-icon ap-btn-edit" onClick={() => setEditingAddress(address)}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          Edit
                        </button>
                        {!address.isDefault && (
                          <button className="ap-btn-icon ap-btn-delete" onClick={() => handleDelete(address.id)}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                            </svg>
                            Delete
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Address text */}
                    <div style={{ marginTop: 14, paddingLeft: 52 }}>
                      <p style={{ fontSize: 14, color: '#374151', margin: '0 0 2px', lineHeight: 1.6 }}>
                        {address.addressLine1}
                      </p>
                      {address.addressLine2 && (
                        <p style={{ fontSize: 14, color: '#374151', margin: '0 0 2px' }}>{address.addressLine2}</p>
                      )}
                      <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
                        {address.city}, {address.state} — {address.pincode}
                      </p>
                    </div>
                  </div>

                  {/* Set default footer */}
                  {!address.isDefault && (
                    <>
                      <div className="ap-divider" />
                      <div style={{ padding: '12px 24px' }}>
                        <button className="ap-btn-icon ap-btn-default" onClick={() => handleSetDefault(address.id)}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                          Set as default
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Back */}
        <div style={{ marginTop: 40, textAlign: 'center' }}>
          <button className="ap-back-link" onClick={() => navigate('/profile')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back to Profile
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddressesPage;