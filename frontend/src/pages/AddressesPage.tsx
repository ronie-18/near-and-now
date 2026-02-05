import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import {
  getUserAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  Address as DbAddress
} from '../services/supabase';

interface Address {
  id: string;
  name: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  isDefault: boolean;
}

const AddressesPage = () => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { showNotification } = useNotification();
  const navigate = useNavigate();
  
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    pincode: '',
    phone: '',
    isDefault: false
  });

  // Redirect if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/login');
    }
  }, [isAuthenticated, isLoading, navigate]);

  // Fetch addresses from database
  useEffect(() => {
    const fetchAddresses = async () => {
      if (!user?.id) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const data = await getUserAddresses(user.id);
        
        // Transform database addresses to component format
        const transformedAddresses = data.map(addr => ({
          id: addr.id,
          name: addr.name,
          addressLine1: addr.address_line_1,
          addressLine2: addr.address_line_2,
          city: addr.city,
          state: addr.state,
          pincode: addr.pincode,
          phone: addr.phone,
          isDefault: addr.is_default
        }));
        
        setAddresses(transformedAddresses);
      } catch (error) {
        console.error('Error fetching addresses:', error);
        showNotification('Failed to load addresses', 'error');
      } finally {
        setLoading(false);
      }
    };

    if (user?.id) {
      fetchAddresses();
    }
  }, [user?.id, showNotification]);

  // Reset form when editing state changes
  useEffect(() => {
    if (editingAddress) {
      setFormData({
        name: editingAddress.name,
        addressLine1: editingAddress.addressLine1,
        addressLine2: editingAddress.addressLine2 || '',
        city: editingAddress.city,
        state: editingAddress.state,
        pincode: editingAddress.pincode,
        phone: editingAddress.phone,
        isDefault: editingAddress.isDefault
      });
      setShowAddForm(true);
    } else if (!showAddForm) {
      // Reset form data when not editing and form is hidden
      setFormData({
        name: '',
        addressLine1: '',
        addressLine2: '',
        city: '',
        state: '',
        pincode: '',
        phone: '',
        isDefault: false
      });
    }
  }, [editingAddress, showAddForm]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target as HTMLInputElement;
    const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.name || !formData.addressLine1 || !formData.city || !formData.state || !formData.pincode || !formData.phone) {
      showNotification('Please fill all required fields', 'error');
      return;
    }
    
    // Phone validation
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(formData.phone)) {
      showNotification('Please enter a valid 10-digit phone number', 'error');
      return;
    }
    
    // Pincode validation
    const pincodeRegex = /^\d{6}$/;
    if (!pincodeRegex.test(formData.pincode)) {
      showNotification('Please enter a valid 6-digit pincode', 'error');
      return;
    }

    if (!user?.id) {
      showNotification('User not authenticated', 'error');
      return;
    }

    try {
      if (editingAddress) {
        // Update existing address
        const updateData = {
          name: formData.name,
          address_line_1: formData.addressLine1,
          address_line_2: formData.addressLine2 || undefined,
          city: formData.city,
          state: formData.state,
          pincode: formData.pincode,
          phone: formData.phone,
          is_default: formData.isDefault
        };

        await updateAddress(editingAddress.id, user.id, updateData);
        
        // Refresh addresses list
        const data = await getUserAddresses(user.id);
        const transformedAddresses = data.map(addr => ({
          id: addr.id,
          name: addr.name,
          addressLine1: addr.address_line_1,
          addressLine2: addr.address_line_2,
          city: addr.city,
          state: addr.state,
          pincode: addr.pincode,
          phone: addr.phone,
          isDefault: addr.is_default
        }));
        setAddresses(transformedAddresses);
        
        showNotification('Address updated successfully', 'success');
      } else {
        // Add new address
        const createData = {
          user_id: user.id,
          name: formData.name,
          address_line_1: formData.addressLine1,
          address_line_2: formData.addressLine2 || undefined,
          city: formData.city,
          state: formData.state,
          pincode: formData.pincode,
          phone: formData.phone,
          is_default: formData.isDefault
        };

        await createAddress(createData);
        
        // Refresh addresses list
        const data = await getUserAddresses(user.id);
        const transformedAddresses = data.map(addr => ({
          id: addr.id,
          name: addr.name,
          addressLine1: addr.address_line_1,
          addressLine2: addr.address_line_2,
          city: addr.city,
          state: addr.state,
          pincode: addr.pincode,
          phone: addr.phone,
          isDefault: addr.is_default
        }));
        setAddresses(transformedAddresses);
        
        showNotification('Address added successfully', 'success');
      }
      
      setEditingAddress(null);
      setShowAddForm(false);
    } catch (error) {
      console.error('Error saving address:', error);
      showNotification('Failed to save address. Please try again.', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    const addressToDelete = addresses.find(addr => addr.id === id);
    
    if (addressToDelete?.isDefault) {
      showNotification('Cannot delete default address', 'error');
      return;
    }

    if (!user?.id) {
      showNotification('User not authenticated', 'error');
      return;
    }

    try {
      await deleteAddress(id, user.id);
      
      // Refresh addresses list
      const data = await getUserAddresses(user.id);
      const transformedAddresses = data.map(addr => ({
        id: addr.id,
        name: addr.name,
        addressLine1: addr.address_line_1,
        addressLine2: addr.address_line_2,
        city: addr.city,
        state: addr.state,
        pincode: addr.pincode,
        phone: addr.phone,
        isDefault: addr.is_default
      }));
      setAddresses(transformedAddresses);
      
      showNotification('Address deleted successfully', 'success');
    } catch (error) {
      console.error('Error deleting address:', error);
      showNotification('Failed to delete address. Please try again.', 'error');
    }
  };

  const handleSetDefault = async (id: string) => {
    if (!user?.id) {
      showNotification('User not authenticated', 'error');
      return;
    }

    try {
      await setDefaultAddress(id, user.id);
      
      // Refresh addresses list
      const data = await getUserAddresses(user.id);
      const transformedAddresses = data.map(addr => ({
        id: addr.id,
        name: addr.name,
        addressLine1: addr.address_line_1,
        addressLine2: addr.address_line_2,
        city: addr.city,
        state: addr.state,
        pincode: addr.pincode,
        phone: addr.phone,
        isDefault: addr.is_default
      }));
      setAddresses(transformedAddresses);
      
      showNotification('Default address updated', 'success');
    } catch (error) {
      console.error('Error setting default address:', error);
      showNotification('Failed to set default address. Please try again.', 'error');
    }
  };

  if (isLoading || loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-800 mb-6">My Addresses</h1>
          <div className="animate-pulse space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white p-6 rounded-lg shadow-md">
                <div className="h-5 bg-gray-200 rounded w-1/4 mb-4"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-2/3 mb-4"></div>
                <div className="flex justify-between">
                  <div className="h-8 bg-gray-200 rounded w-24"></div>
                  <div className="h-8 bg-gray-200 rounded w-24"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">My Addresses</h1>
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-primary hover:bg-secondary text-white px-4 py-2 rounded-md transition-colors"
            >
              Add New Address
            </button>
          )}
        </div>
        
        {/* Address Form */}
        {showAddForm && (
          <div className="bg-white p-6 rounded-lg shadow-md mb-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              {editingAddress ? 'Edit Address' : 'Add New Address'}
            </h2>
            
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                    Address Name*
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="e.g. Home, Office"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                </div>
                
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number*
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="10-digit mobile number"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                    maxLength={10}
                  />
                </div>
                
                <div className="md:col-span-2">
                  <label htmlFor="addressLine1" className="block text-sm font-medium text-gray-700 mb-1">
                    Address Line 1*
                  </label>
                  <textarea
                    id="addressLine1"
                    name="addressLine1"
                    value={formData.addressLine1}
                    onChange={handleChange}
                    placeholder="House/Flat No., Building Name, Street"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                    rows={2}
                  />
                </div>
                
                <div className="md:col-span-2">
                  <label htmlFor="addressLine2" className="block text-sm font-medium text-gray-700 mb-1">
                    Address Line 2
                  </label>
                  <textarea
                    id="addressLine2"
                    name="addressLine2"
                    value={formData.addressLine2}
                    onChange={handleChange}
                    placeholder="Landmark, Area (Optional)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    rows={2}
                  />
                </div>
                
                <div>
                  <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-1">
                    City*
                  </label>
                  <input
                    type="text"
                    id="city"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                </div>
                
                <div>
                  <label htmlFor="state" className="block text-sm font-medium text-gray-700 mb-1">
                    State*
                  </label>
                  <select
                    id="state"
                    name="state"
                    value={formData.state}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  >
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
                
                <div>
                  <label htmlFor="pincode" className="block text-sm font-medium text-gray-700 mb-1">
                    PIN Code*
                  </label>
                  <input
                    type="text"
                    id="pincode"
                    name="pincode"
                    value={formData.pincode}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                    maxLength={6}
                  />
                </div>
                
                <div className="md:col-span-2">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="isDefault"
                      name="isDefault"
                      checked={formData.isDefault}
                      onChange={handleChange}
                      className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                    />
                    <label htmlFor="isDefault" className="ml-2 block text-sm text-gray-700">
                      Set as default address
                    </label>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingAddress(null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary hover:bg-secondary text-white rounded-md transition-colors"
                >
                  {editingAddress ? 'Update Address' : 'Save Address'}
                </button>
              </div>
            </form>
          </div>
        )}
        
        {/* Address List */}
        {addresses.length === 0 ? (
          <div className="bg-white p-8 rounded-lg shadow-md text-center">
            <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">No Addresses Yet</h2>
            <p className="text-gray-600 mb-6">
              You haven't added any delivery addresses yet.
            </p>
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-primary hover:bg-secondary text-white px-6 py-3 rounded-md font-medium transition-colors"
            >
              Add New Address
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {addresses.map((address) => (
              <div key={address.id} className="bg-white p-6 rounded-lg shadow-md">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center">
                      <h3 className="font-medium text-gray-800">{address.name}</h3>
                      {address.isDefault && (
                        <span className="ml-2 bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-gray-600 mt-2">{address.addressLine1}</p>
                    {address.addressLine2 && <p className="text-gray-600">{address.addressLine2}</p>}
                    <p className="text-gray-600">{address.city}, {address.state} - {address.pincode}</p>
                    <p className="text-gray-600 mt-1">Phone: {address.phone}</p>
                  </div>
                  
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setEditingAddress(address)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Edit
                    </button>
                    {!address.isDefault && (
                      <>
                        <span className="text-gray-300">|</span>
                        <button
                          onClick={() => handleDelete(address.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
                
                {!address.isDefault && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <button
                      onClick={() => handleSetDefault(address.id)}
                      className="text-primary hover:text-secondary text-sm"
                    >
                      Set as Default
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        
        <div className="mt-8 text-center">
          <button
            onClick={() => navigate('/profile')}
            className="text-primary hover:text-secondary"
          >
            Back to Profile
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddressesPage;
