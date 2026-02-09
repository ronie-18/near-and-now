import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useNotification } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { createOrder, CreateOrderData, getUserAddresses, createAddress, updateAddress, deleteAddress, Address as DbAddress, UpdateAddressData, getAllProducts, Product } from '../services/supabase';
import { geocodeAddress, LocationData } from '../services/placesService';
import { ShoppingBag, CreditCard, Truck, Shield, CheckCircle, MapPin, User, Mail, Phone, Lock, Plus, ChevronLeft, ChevronRight, Home, Briefcase } from 'lucide-react';
import LocationPicker from '../components/location/LocationPicker';
import ProductCard from '../components/products/ProductCard';

const calculateOrderTotals = (cartTotal: number) => {
  const subtotal = cartTotal;
  const deliveryFee = 0;
  const discount = cartTotal > 1000 ? cartTotal * 0.1 : 0;
  const orderTotal = subtotal + deliveryFee - discount;
  return { subtotal, deliveryFee, discount, orderTotal };
};

const CheckoutPage = () => {
  const { cartItems, cartTotal, clearCart } = useCart();
  const { showNotification } = useNotification();
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    paymentMethod: 'cod',
    addressName: '' // For naming saved addresses
  });

  // Enhanced address fields
  const [addressLabel, setAddressLabel] = useState<'Home' | 'Work' | 'Other'>('Home');
  const [landmark, setLandmark] = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');

  // Order for others
  const [orderForOthers, setOrderForOthers] = useState(false);
  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [receiverAddress, setReceiverAddress] = useState('');

  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [tipAmount, setTipAmount] = useState(0);
  const [customTip, setCustomTip] = useState('');
  const [selectedTip, setSelectedTip] = useState<string | null>(null);

  // Address management
  const [savedAddresses, setSavedAddresses] = useState<DbAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const [saveAddress, setSaveAddress] = useState(true); // Save address by default
  const [editAddressId, setEditAddressId] = useState<string | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [pickedLocation, setPickedLocation] = useState<LocationData | null>(null);

  // Suggested products
  const [suggestedProducts, setSuggestedProducts] = useState<Product[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const suggestionsScrollRef = useRef<HTMLDivElement>(null);

  // Fetch saved addresses on component mount
  useEffect(() => {
    const fetchAddresses = async () => {
      if (!user?.id) {
        setLoadingAddresses(false);
        return;
      }

      try {
        setLoadingAddresses(true);
        const addresses = await getUserAddresses(user.id);
        setSavedAddresses(addresses);

        // Auto-select default address if available
        const defaultAddress = addresses.find(addr => addr.is_default);
        if (defaultAddress) {
          setSelectedAddressId(defaultAddress.id);
          populateFormWithAddress(defaultAddress);
          setShowNewAddressForm(false);
        } else if (addresses.length > 0) {
          // Select first address if no default
          setSelectedAddressId(addresses[0].id);
          populateFormWithAddress(addresses[0]);
          setShowNewAddressForm(false);
        } else {
          // Show new address form if no addresses exist
          setShowNewAddressForm(true);
        }
      } catch (error) {
        console.error('Error fetching addresses:', error);
        setShowNewAddressForm(true);
      } finally {
        setLoadingAddresses(false);
      }
    };

    if (user?.id) {
      fetchAddresses();
    }
  }, [user?.id]);

  // Fetch and filter suggested products based on cart items
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (cartItems.length === 0) {
        setSuggestedProducts([]);
        return;
      }

      try {
        setLoadingSuggestions(true);
        const allProducts = await getAllProducts();

        // Get unique categories from cart items
        const cartCategories = Array.from(
          new Set(cartItems.map(item => {
            // Find the product category from all products
            const product = allProducts.find(p => p.id === item.id);
            return product?.category;
          }).filter(Boolean))
        );

        // Get cart item IDs to exclude
        const cartItemIds = new Set(cartItems.map(item => item.id));

        // Filter products: same category as cart items, not already in cart, in stock
        const suggestions = allProducts
          .filter(product => {
            return (
              cartCategories.includes(product.category) &&
              !cartItemIds.has(product.id) &&
              product.in_stock
            );
          })
          .slice(0, 10); // Limit to 10 suggestions

        setSuggestedProducts(suggestions);
      } catch (error) {
        console.error('Error fetching suggested products:', error);
        setSuggestedProducts([]);
      } finally {
        setLoadingSuggestions(false);
      }
    };

    fetchSuggestions();
  }, [cartItems]);

  // Scroll suggestions left
  const scrollSuggestionsLeft = () => {
    if (suggestionsScrollRef.current) {
      const cardWidth = 280; // Approximate card width with gap
      suggestionsScrollRef.current.scrollBy({ left: -cardWidth, behavior: 'smooth' });
    }
  };

  // Scroll suggestions right
  const scrollSuggestionsRight = () => {
    if (suggestionsScrollRef.current) {
      const cardWidth = 280; // Approximate card width with gap
      suggestionsScrollRef.current.scrollBy({ left: cardWidth, behavior: 'smooth' });
    }
  };

  // Handle location picked from LocationPicker modal
  const handleLocationPicked = (location: LocationData) => {
    setPickedLocation(location);
    setFormData(prev => ({
      ...prev,
      address: location.address,
      city: location.city || '',
      state: location.state || '',
      pincode: location.pincode || '',
    }));
    // Show the new address form when location is picked
    setShowNewAddressForm(true);
    setSelectedAddressId(null);
    setEditAddressId(null);
    setShowLocationPicker(false);
  };

  // Helper function to get address icon
  const getAddressIcon = (label?: string) => {
    switch (label?.toLowerCase()) {
      case 'home':
        return <Home className="w-5 h-5" />;
      case 'work':
        return <Briefcase className="w-5 h-5" />;
      default:
        return <MapPin className="w-5 h-5" />;
    }
  };

  const populateFormWithAddress = (address: DbAddress) => {
    setFormData(prev => ({
      ...prev,
      address: address.address_line_1 + (address.address_line_2 ? ', ' + address.address_line_2 : ''),
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      phone: address.phone
    }));

    if (address.label) setAddressLabel(address.label as 'Home' | 'Work' | 'Other');
    if (address.landmark) setLandmark(address.landmark);
    if (address.delivery_instructions) setDeliveryInstructions(address.delivery_instructions);
    if (address.delivery_for === 'others') {
      setOrderForOthers(true);
      setReceiverName(address.receiver_name || '');
      setReceiverPhone(address.receiver_phone || '');
      setReceiverAddress(address.receiver_address || '');
    } else {
      setOrderForOthers(false);
      setReceiverName('');
      setReceiverPhone('');
      setReceiverAddress('');
    }
  };

  const handleAddressSelect = (addressId: string) => {
    setEditAddressId(null); // Clear edit mode when selecting an address
    setSelectedAddressId(addressId);
    const address = savedAddresses.find(addr => addr.id === addressId);
    if (address) {
      populateFormWithAddress(address);
      setShowNewAddressForm(false);
    }
  };

  const handleNewAddress = () => {
    setEditAddressId(null); // Clear edit mode
    setSelectedAddressId(null);
    setFormData(prev => ({
      ...prev,
      address: '',
      city: '',
      state: '',
      pincode: '',
      phone: user?.phone || '',
      addressName: ''
    }));
    setAddressLabel('Home');
    setLandmark('');
    setDeliveryInstructions('');
    setOrderForOthers(false);
    setReceiverName('');
    setReceiverPhone('');
    setReceiverAddress('');
    setPickedLocation(null);
    setShowNewAddressForm(true);
    setSaveAddress(true); // Default to saving new addresses
  };

  const handleEditAddress = (addressId: string) => {
    const addr = savedAddresses.find(a => a.id === addressId);
    if (addr) {
      setEditAddressId(addressId);
      setSelectedAddressId(addressId);
      setShowNewAddressForm(true);
      setFormData(prev => ({
        ...prev,
        name: user?.name || '',
        email: user?.email || '',
        phone: addr.phone,
        address: addr.address_line_1 + (addr.address_line_2 ? ', ' + addr.address_line_2 : ''),
        city: addr.city,
        state: addr.state,
        pincode: addr.pincode,
        addressName: addr.name
      }));
      if (addr.label) setAddressLabel(addr.label as 'Home' | 'Work' | 'Other');
      if (addr.landmark) setLandmark(addr.landmark);
      if (addr.delivery_instructions) setDeliveryInstructions(addr.delivery_instructions);
      if (addr.delivery_for === 'others') {
        setOrderForOthers(true);
        setReceiverName(addr.receiver_name || '');
        setReceiverPhone(addr.receiver_phone || '');
        setReceiverAddress(addr.receiver_address || '');
      } else {
        setOrderForOthers(false);
        setReceiverName('');
        setReceiverPhone('');
        setReceiverAddress('');
      }
      setSaveAddress(true);
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    if (!user?.id) return;
    if (!window.confirm('Are you sure you want to delete this address?')) return;
    try {
      setLoadingAddresses(true);
      await deleteAddress(addressId, user.id);
      let addresses = await getUserAddresses(user.id);
      setSavedAddresses(addresses);

      // Re-select default or first
      if (addresses.length > 0) {
        const defaultAddr = addresses.find(a => a.is_default) || addresses[0];
        setSelectedAddressId(defaultAddr.id);
        populateFormWithAddress(defaultAddr);
        setShowNewAddressForm(false);
      } else {
        setSelectedAddressId(null);
        setShowNewAddressForm(true);
      }
      showNotification('Address deleted', 'success');
    } catch (error) {
      showNotification('Failed to delete address', 'error');
    } finally {
      setLoadingAddresses(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editAddressId) {
      // Editing existing address
      if (!user?.id) {
        showNotification('User not authenticated', 'error');
        return;
      }
      const addressParts = formData.address.split(',');
      const addressLine1 = addressParts[0]?.trim() || formData.address;
      const addressLine2 = addressParts.slice(1).join(',').trim() || undefined;
      try {
        setLoadingAddresses(true);
        const fullAddress = [formData.address, formData.city, formData.state, formData.pincode].filter(Boolean).join(', ');
        const geocoded = await geocodeAddress(fullAddress);
        const updatePayload: UpdateAddressData = {
          name: formData.addressName,
          address_line_1: addressLine1,
          address_line_2: addressLine2,
          city: formData.city,
          state: formData.state,
          pincode: formData.pincode,
          phone: formData.phone,
          label: addressLabel,
          landmark: landmark || undefined,
          delivery_instructions: deliveryInstructions || undefined,
          delivery_for: (orderForOthers ? 'others' : 'self') as 'self' | 'others',
          receiver_name: orderForOthers ? receiverName : undefined,
          receiver_phone: orderForOthers ? receiverPhone : undefined,
          receiver_address: orderForOthers ? receiverAddress : undefined,
        };
        if (geocoded) {
          updatePayload.latitude = geocoded.lat;
          updatePayload.longitude = geocoded.lng;
        }
        await updateAddress(editAddressId, user.id, updatePayload);
        const updatedAddressId = editAddressId; // Store before clearing
        let addresses = await getUserAddresses(user.id);
        setSavedAddresses(addresses);
        setEditAddressId(null);
        setShowNewAddressForm(false);
        showNotification('Address updated', 'success');
        // Update form and selection
        const updated = addresses.find(a => a.id === updatedAddressId);
        if (updated) {
          setSelectedAddressId(updatedAddressId);
          populateFormWithAddress(updated);
        }
      } catch (error) {
        showNotification('Failed to update address', 'error');
      } finally {
        setLoadingAddresses(false);
      }
      return;
    }
    // Otherwise fall back to normal submission logic
    handleSubmit(e);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (cartItems.length === 0) {
      showNotification('Your cart is empty', 'error');
      return;
    }

    // If we're not on the final step, move to the next step
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
      return;
    }

    // Only process the order on the final step
    try {
      setLoading(true);

      // Save new address if checkbox is checked and it's a new address (not from saved addresses)
      if (saveAddress && showNewAddressForm && !editAddressId && user?.id) {
        try {
          // Use picked location if available, otherwise geocode
          let lat: number, lng: number;
          if (pickedLocation) {
            lat = pickedLocation.lat;
            lng = pickedLocation.lng;
          } else {
            // Geocode to get latitude/longitude (required by customer_saved_addresses)
            const fullAddress = [formData.address, formData.city, formData.state, formData.pincode].filter(Boolean).join(', ');
            const geocoded = await geocodeAddress(fullAddress);
            if (!geocoded) {
              throw new Error('Could not verify address. Please use the location picker or try a different address.');
            }
            lat = geocoded.lat;
            lng = geocoded.lng;
          }

          const addressParts = formData.address.split(',');
          const addressLine1 = addressParts[0]?.trim() || formData.address;
          const addressLine2 = addressParts.slice(1).join(',').trim() || undefined;

          const newAddressData = {
            user_id: user.id,
            name: formData.addressName || addressLabel || 'Delivery Address',
            address_line_1: addressLine1,
            address_line_2: addressLine2,
            city: formData.city || pickedLocation?.city || '',
            state: formData.state || pickedLocation?.state || '',
            pincode: formData.pincode || pickedLocation?.pincode || '',
            phone: formData.phone,
            is_default: savedAddresses.length === 0,
            latitude: lat,
            longitude: lng,
            label: addressLabel,
            landmark: landmark || undefined,
            delivery_instructions: deliveryInstructions || undefined,
            delivery_for: (orderForOthers ? 'others' : 'self') as 'self' | 'others',
            receiver_name: orderForOthers ? receiverName : undefined,
            receiver_phone: orderForOthers ? receiverPhone : undefined,
            receiver_address: orderForOthers ? receiverAddress : undefined,
            google_place_id: pickedLocation?.placeId || undefined,
            google_formatted_address: pickedLocation?.formattedAddress || undefined,
            google_place_data: pickedLocation?.placeData || undefined,
          };

          const createdAddress = await createAddress(newAddressData);

          // Refresh the addresses list to include the newly added address
          const updatedAddresses = await getUserAddresses(user.id);
          setSavedAddresses(updatedAddresses);

          // Select the newly created address
          setSelectedAddressId(createdAddress.id);
          setShowNewAddressForm(false);

          showNotification('Address saved for future orders', 'success');
        } catch (addressError) {
          console.error('Error saving address:', addressError);
          // Don't fail the order if address save fails
          showNotification('Order placed but address could not be saved', 'info');
        }
      }

      // Prepare order items from cart
      const orderItems = cartItems.map(item => ({
        product_id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        image: item.image
      }));

      // Calculate totals
      const { subtotal, deliveryFee, orderTotal } = calculateOrderTotals(cartTotal);
      const finalOrderTotal = Math.round(orderTotal + tipAmount);

      // Prepare order data
      const orderData: CreateOrderData = {
        user_id: user?.id,
        customer_name: formData.name,
        customer_email: formData.email || undefined,
        customer_phone: formData.phone,
        order_status: 'placed',
        payment_status: formData.paymentMethod === 'cod' ? 'pending' : 'pending',
        payment_method: formData.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online Payment',
        order_total: finalOrderTotal,
        subtotal: subtotal,
        delivery_fee: deliveryFee,
        items: orderItems,
        shipping_address: {
          address: formData.address,
          city: formData.city,
          state: formData.state,
          pincode: formData.pincode
        }
      };

      // Create order in database
      const createdOrder = await createOrder(orderData);

      showNotification('Order placed successfully! 🎉', 'success');
      clearCart();

      // Navigate to thank you page with order data
      navigate('/thank-you', {
        state: {
          order: createdOrder,
          orderId: createdOrder.id,
          orderNumber: createdOrder.order_number
        }
      });
    } catch (error: any) {
      console.error('Error placing order:', error);
      showNotification(
        error?.message || 'Failed to place order. Please try again.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  const goToPreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleTipSelect = (amount: number) => {
    setSelectedTip(amount.toString());
    setTipAmount(amount);
    setCustomTip('');
  };

  const handleCustomTipChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCustomTip(value);
    const numValue = parseFloat(value) || 0;
    setTipAmount(numValue);
    setSelectedTip('custom');
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-white to-secondary/5 flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-2xl shadow-2xl p-8 transform hover:scale-[1.02] transition-all duration-300">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-gray-800 mb-3 text-center">Please Login</h1>
            <p className="text-gray-600 mb-8 text-center">You need to be logged in to proceed with checkout.</p>
            <Link
              to="/login"
              className="block w-full bg-gradient-to-r from-primary to-secondary text-white text-center py-3 px-6 rounded-xl hover:shadow-lg transform hover:-translate-y-1 transition-all duration-300 font-semibold"
            >
              Login to Continue
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { discount, orderTotal } = calculateOrderTotals(cartTotal);
  const finalTotal = Math.round(orderTotal + tipAmount);

  return (
    <>
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-white to-secondary/5 py-8">
      <div className="container mx-auto px-4">
        {/* Progress Steps */}
        <div className="max-w-4xl mx-auto mb-8">
          <div className="flex items-center justify-between">
            {[
              { step: 1, label: 'Shipping', icon: Truck },
              { step: 2, label: 'Payment', icon: CreditCard },
              { step: 3, label: 'Review', icon: CheckCircle }
            ].map(({ step, label, icon: Icon }, index) => (
              <div key={step} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-500 ${
                    currentStep >= step
                      ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-lg scale-110'
                      : 'bg-gray-200 text-gray-400'
                  }`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className={`mt-2 text-sm font-medium transition-colors duration-300 ${
                    currentStep >= step ? 'text-primary' : 'text-gray-400'
                  }`}>
                    {label}
                  </span>
                </div>
                {index < 2 && (
                  <div className={`flex-1 h-1 mx-2 transition-all duration-500 ${
                    currentStep > step ? 'bg-gradient-to-r from-primary to-secondary' : 'bg-gray-200'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-8 max-w-7xl mx-auto">
          {/* Main Checkout Form */}
          <div className="lg:w-2/3">
            <div className="bg-white rounded-2xl shadow-xl p-8 transform hover:shadow-2xl transition-all duration-300">
              <div className="flex items-center mb-6">
                <div className="w-10 h-10 bg-gradient-to-r from-primary to-secondary rounded-lg flex items-center justify-center mr-3">
                  <ShoppingBag className="w-6 h-6 text-white" />
                </div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  Checkout
                </h1>
              </div>

              <form onSubmit={handleFormSubmit}>
                {/* Step 1: Shipping Information */}
                {currentStep === 1 && (
                  <div className="mb-8">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center">
                        <MapPin className="w-5 h-5 text-primary mr-2" />
                        <h2 className="text-xl font-bold text-gray-800">Shipping Information</h2>
                      </div>
                      {savedAddresses.length > 0 && !showNewAddressForm && (
                        <button
                          type="button"
                          onClick={handleNewAddress}
                          className="flex items-center text-primary hover:text-secondary text-sm font-medium"
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          Add New Address
                        </button>
                      )}
                    </div>

                    {/* Loading state */}
                    {loadingAddresses && (
                      <div className="animate-pulse space-y-3 mb-6">
                        <div className="h-24 bg-gray-200 rounded-xl"></div>
                        <div className="h-24 bg-gray-200 rounded-xl"></div>
                      </div>
                    )}

                    {/* Saved addresses selection */}
                    {!loadingAddresses && savedAddresses.length > 0 && !showNewAddressForm && (
                      <div className="mb-6 space-y-3">
                        <p className="text-sm text-gray-600 mb-3">Select a delivery address:</p>
                        {savedAddresses.map((address) => (
                          <label
                            key={address.id}
                            className={`block p-4 border-2 rounded-xl cursor-pointer transition-all duration-300 ${
                              selectedAddressId === address.id
                                ? 'border-primary bg-primary/5 shadow-md'
                                : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                            }`}
                          >
                            <div className="flex items-start w-full">
                              <input
                                type="radio"
                                name="savedAddress"
                                value={address.id}
                                checked={selectedAddressId === address.id}
                                onChange={() => handleAddressSelect(address.id)}
                                className="mt-1 h-4 w-4 text-primary focus:ring-primary border-gray-300"
                              />
                              <div className="ml-1 mt-0.5 text-primary">
                                {getAddressIcon(address.label)}
                              </div>
                              <div className="ml-2 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-gray-800">{address.name}</span>
                                  {address.label && (
                                    <span className="bg-primary/10 text-primary text-xs font-medium px-2 py-0.5 rounded-full">
                                      {address.label}
                                    </span>
                                  )}
                                  {address.is_default && (
                                    <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-0.5 rounded-full">
                                      Default
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-gray-600 mt-1">
                                  {address.address_line_1}
                                  {address.address_line_2 && `, ${address.address_line_2}`}
                                </p>
                                <p className="text-sm text-gray-600">
                                  {address.city}, {address.state} - {address.pincode}
                                </p>
                                {address.landmark && (
                                  <p className="text-xs text-gray-500 mt-0.5">Landmark: {address.landmark}</p>
                                )}
                                <p className="text-sm text-gray-600">Phone: {address.phone}</p>
                                {address.delivery_for === 'others' && address.receiver_name && (
                                  <p className="text-xs text-orange-600 mt-1 font-medium">
                                    Delivering to: {address.receiver_name}
                                  </p>
                                )}
                              </div>
                              <div className="flex flex-col gap-2 ml-2">
                                <button
                                  type="button"
                                  className="text-blue-500 hover:text-blue-600 text-xs font-medium px-2 py-1 rounded"
                                  style={{minWidth:'44px'}}
                                  onClick={() => handleEditAddress(address.id)}
                                >Edit</button>
                                <button
                                  type="button"
                                  className="text-red-500 hover:text-red-600 text-xs font-medium px-2 py-1 rounded"
                                  style={{minWidth:'44px'}}
                                  onClick={() => handleDeleteAddress(address.id)}
                                >Delete</button>
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}

                    {/* New address form or when showing new address */}
                    {(!loadingAddresses && (showNewAddressForm || savedAddresses.length === 0)) && (
                      <>
                        {savedAddresses.length > 0 && (
                          <div className="mb-4">
                            <button
                              type="button"
                              onClick={() => {
                                setEditAddressId(null); // Clear edit mode
                                setShowNewAddressForm(false);
                                if (savedAddresses.length > 0) {
                                  const defaultAddr = savedAddresses.find(a => a.is_default) || savedAddresses[0];
                                  setSelectedAddressId(defaultAddr.id);
                                  populateFormWithAddress(defaultAddr);
                                }
                              }}
                              className="text-sm text-primary hover:text-secondary"
                            >
                              ← Back to saved addresses
                            </button>
                          </div>
                        )}

                        {/* Use Location Button */}
                        <button
                          type="button"
                          onClick={() => setShowLocationPicker(true)}
                          className="w-full flex items-center gap-3 px-4 py-3 mb-4 border-2 border-primary rounded-xl hover:bg-primary/5 transition-all group"
                        >
                          <div className="w-10 h-10 bg-gradient-to-br from-primary to-green-600 rounded-lg flex items-center justify-center flex-shrink-0">
                            <MapPin className="w-5 h-5 text-white" />
                          </div>
                          <div className="text-left flex-1">
                            <p className="font-semibold text-gray-800 group-hover:text-primary transition-colors">
                              {pickedLocation ? 'Change Location' : 'Use Current Location / Search'}
                            </p>
                            <p className="text-xs text-gray-500">
                              {pickedLocation
                                ? `${pickedLocation.city}, ${pickedLocation.pincode}`
                                : 'Detect location or search for address'
                              }
                            </p>
                          </div>
                        </button>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="group">
                            <label htmlFor="name" className="block text-gray-700 mb-2 font-medium flex items-center">
                              <User className="w-4 h-4 mr-1" />
                              Full Name *
                            </label>
                            <input
                              type="text"
                              id="name"
                              name="name"
                              value={formData.name}
                              onChange={handleChange}
                              required
                              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300 group-hover:border-gray-300"
                              placeholder="John Doe"
                            />
                          </div>

                          <div className="group">
                            <label htmlFor="email" className="block text-gray-700 mb-2 font-medium flex items-center">
                              <Mail className="w-4 h-4 mr-1" />
                              Email *
                            </label>
                            <input
                              type="email"
                              id="email"
                              name="email"
                              value={formData.email}
                              onChange={handleChange}
                              required
                              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300 group-hover:border-gray-300"
                              placeholder="john@example.com"
                            />
                          </div>

                          <div className="group">
                            <label htmlFor="phone" className="block text-gray-700 mb-2 font-medium flex items-center">
                              <Phone className="w-4 h-4 mr-1" />
                              Phone Number *
                            </label>
                            <input
                              type="tel"
                              id="phone"
                              name="phone"
                              value={formData.phone}
                              onChange={handleChange}
                              required
                              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300 group-hover:border-gray-300"
                              placeholder="+91 98765 43210"
                            />
                          </div>

                          <div className="group">
                            <label htmlFor="pincode" className="block text-gray-700 mb-2 font-medium">PIN Code *</label>
                            <input
                              type="text"
                              id="pincode"
                              name="pincode"
                              value={formData.pincode}
                              onChange={handleChange}
                              required
                              maxLength={6}
                              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300 group-hover:border-gray-300"
                              placeholder="700001"
                            />
                          </div>

                          <div className="md:col-span-2 group">
                            <label htmlFor="address" className="block text-gray-700 mb-2 font-medium">Street Address *</label>
                            <textarea
                              id="address"
                              name="address"
                              value={formData.address}
                              onChange={handleChange}
                              required
                              rows={2}
                              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300 group-hover:border-gray-300 resize-none"
                              placeholder="House no, Building name, Street"
                            />
                          </div>

                          <div className="group">
                            <label htmlFor="city" className="block text-gray-700 mb-2 font-medium">City *</label>
                            <input
                              type="text"
                              id="city"
                              name="city"
                              value={formData.city}
                              onChange={handleChange}
                              required
                              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300 group-hover:border-gray-300"
                              placeholder="Kolkata"
                            />
                          </div>

                          <div className="group">
                            <label htmlFor="state" className="block text-gray-700 mb-2 font-medium">State *</label>
                            <select
                              id="state"
                              name="state"
                              value={formData.state}
                              onChange={handleChange}
                              required
                              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300 group-hover:border-gray-300"
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

                          {/* Address Type Selector */}
                          <div className="md:col-span-2">
                            <label className="block text-gray-700 mb-2 font-medium">Address Type</label>
                            <div className="flex gap-3">
                              {(['Home', 'Work', 'Other'] as const).map((type) => (
                                <button
                                  key={type}
                                  type="button"
                                  onClick={() => setAddressLabel(type)}
                                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 font-medium transition-all duration-300 ${
                                    addressLabel === type
                                      ? 'border-primary bg-primary/10 text-primary shadow-sm'
                                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                                  }`}
                                >
                                  {type === 'Home' && <Home className="w-4 h-4" />}
                                  {type === 'Work' && <Briefcase className="w-4 h-4" />}
                                  {type === 'Other' && <MapPin className="w-4 h-4" />}
                                  {type}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Landmark */}
                          <div className="md:col-span-2 group">
                            <label htmlFor="landmark" className="block text-gray-700 mb-2 font-medium">Landmark (Optional)</label>
                            <input
                              type="text"
                              id="landmark"
                              value={landmark}
                              onChange={(e) => setLandmark(e.target.value)}
                              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300 group-hover:border-gray-300"
                              placeholder="e.g., Near City Mall, Opposite Park"
                            />
                          </div>

                          {/* Delivery Instructions */}
                          <div className="md:col-span-2 group">
                            <label htmlFor="deliveryInstructions" className="block text-gray-700 mb-2 font-medium">Delivery Instructions (Optional)</label>
                            <textarea
                              id="deliveryInstructions"
                              value={deliveryInstructions}
                              onChange={(e) => setDeliveryInstructions(e.target.value)}
                              rows={2}
                              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300 group-hover:border-gray-300 resize-none"
                              placeholder="e.g., Ring the doorbell twice, Leave at the door"
                            />
                          </div>

                          {/* Order for Others */}
                          <div className="md:col-span-2">
                            <label className="flex items-center p-4 bg-orange-50 border-2 border-orange-200 rounded-xl cursor-pointer hover:bg-orange-100 transition-all duration-300">
                              <input
                                type="checkbox"
                                checked={orderForOthers}
                                onChange={(e) => setOrderForOthers(e.target.checked)}
                                className="h-5 w-5 text-orange-500 focus:ring-orange-500 border-gray-300 rounded"
                              />
                              <div className="ml-3 flex-1">
                                <span className="font-semibold text-gray-800">Ordering for someone else?</span>
                                <p className="text-sm text-gray-600">Add receiver details for this delivery</p>
                              </div>
                            </label>

                            {orderForOthers && (
                              <div className="mt-3 p-4 border-2 border-orange-100 rounded-xl bg-orange-50/50 space-y-3">
                                <div className="group">
                                  <label htmlFor="receiverName" className="block text-gray-700 mb-1 font-medium text-sm">Receiver Name *</label>
                                  <input
                                    type="text"
                                    id="receiverName"
                                    value={receiverName}
                                    onChange={(e) => setReceiverName(e.target.value)}
                                    required={orderForOthers}
                                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300"
                                    placeholder="Receiver's full name"
                                  />
                                </div>
                                <div className="group">
                                  <label htmlFor="receiverPhone" className="block text-gray-700 mb-1 font-medium text-sm">Receiver Phone *</label>
                                  <input
                                    type="tel"
                                    id="receiverPhone"
                                    value={receiverPhone}
                                    onChange={(e) => setReceiverPhone(e.target.value)}
                                    required={orderForOthers}
                                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300"
                                    placeholder="+91 98765 43210"
                                  />
                                </div>
                                <div className="group">
                                  <label htmlFor="receiverAddress" className="block text-gray-700 mb-1 font-medium text-sm">Receiver Address (if different)</label>
                                  <textarea
                                    id="receiverAddress"
                                    value={receiverAddress}
                                    onChange={(e) => setReceiverAddress(e.target.value)}
                                    rows={2}
                                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300 resize-none"
                                    placeholder="Leave blank if same as delivery address"
                                  />
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Save Address Checkbox */}
                          <div className="md:col-span-2 mt-4">
                            <label className="flex items-center p-4 bg-blue-50 border-2 border-blue-200 rounded-xl cursor-pointer hover:bg-blue-100 transition-all duration-300">
                              <input
                                type="checkbox"
                                checked={saveAddress}
                                onChange={(e) => setSaveAddress(e.target.checked)}
                                className="h-5 w-5 text-primary focus:ring-primary border-gray-300 rounded"
                              />
                              <div className="ml-3 flex-1">
                                <span className="font-semibold text-gray-800">Save this address for future orders</span>
                                <p className="text-sm text-gray-600">You can manage your saved addresses from your profile</p>
                              </div>
                            </label>

                            {/* Address Name Field - shown when save checkbox is checked */}
                            {saveAddress && (
                              <div className="mt-3">
                                <label htmlFor="addressName" className="block text-sm font-medium text-gray-700 mb-1">
                                  Address Label (Optional)
                                </label>
                                <input
                                  type="text"
                                  id="addressName"
                                  name="addressName"
                                  value={formData.addressName}
                                  onChange={handleChange}
                                  placeholder="e.g., Home, Office, Apartment"
                                  className="w-full px-4 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                  Give this address a name to easily identify it later
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Step 2: Payment Method */}
                {currentStep === 2 && (
                  <div className="mb-8">
                    <div className="flex items-center mb-4">
                      <CreditCard className="w-5 h-5 text-primary mr-2" />
                      <h2 className="text-xl font-bold text-gray-800">Payment Method</h2>
                    </div>

                    <div className="space-y-3">
                      <label className={`flex items-center p-4 border-2 rounded-xl cursor-pointer transition-all duration-300 ${
                        formData.paymentMethod === 'cod'
                          ? 'border-primary bg-primary/5 shadow-md'
                          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                      }`}>
                        <input
                          type="radio"
                          name="paymentMethod"
                          value="cod"
                          checked={formData.paymentMethod === 'cod'}
                          onChange={handleChange}
                          className="h-5 w-5 text-primary focus:ring-primary border-gray-300"
                        />
                        <div className="ml-3 flex-1">
                          <span className="font-semibold text-gray-800">Cash on Delivery</span>
                          <p className="text-sm text-gray-500">Pay when you receive your order</p>
                        </div>
                        <Truck className="w-6 h-6 text-primary" />
                      </label>

                      <label className={`flex items-center p-4 border-2 rounded-xl cursor-pointer transition-all duration-300 ${
                        formData.paymentMethod === 'online'
                          ? 'border-primary bg-primary/5 shadow-md'
                          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                      }`}>
                        <input
                          type="radio"
                          name="paymentMethod"
                          value="online"
                          checked={formData.paymentMethod === 'online'}
                          onChange={handleChange}
                          className="h-5 w-5 text-primary focus:ring-primary border-gray-300"
                        />
                        <div className="ml-3 flex-1">
                          <span className="font-semibold text-gray-800">Online Payment</span>
                          <p className="text-sm text-gray-500">UPI, Card, Net Banking</p>
                        </div>
                        <Shield className="w-6 h-6 text-primary" />
                      </label>
                    </div>

                    {/* Tips Section */}
                    <div className="mt-8">
                      <div className="flex items-center mb-4">
                        <span className="text-xl font-bold text-gray-800">Add a Tip</span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                        {[5, 10, 15, 20].map((amount) => (
                          <button
                            key={amount}
                            type="button"
                            onClick={() => handleTipSelect(amount)}
                            className={`py-3 px-4 rounded-xl font-semibold transition-all duration-300 ${
                              selectedTip === amount.toString()
                                ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-lg scale-105'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:shadow-md'
                            }`}
                          >
                            ₹{amount}
                          </button>
                        ))}
                      </div>

                      <div className="mt-4">
                        <label htmlFor="customTip" className="block text-gray-700 mb-2 font-medium">
                          Custom Amount
                        </label>
                        <input
                          type="number"
                          id="customTip"
                          name="customTip"
                          value={customTip}
                          onChange={handleCustomTipChange}
                          min="0"
                          step="1"
                          placeholder="Enter custom tip amount"
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300 hover:border-gray-300"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 3: Order Review */}
                {currentStep === 3 && (
                  <div className="mb-8">
                    <div className="flex items-center mb-4">
                      <CheckCircle className="w-5 h-5 text-primary mr-2" />
                      <h2 className="text-xl font-bold text-gray-800">Review Your Order</h2>
                    </div>

                    <div className="bg-gray-50 rounded-xl p-4 mb-4">
                      <h3 className="font-semibold text-gray-800 mb-2">Shipping Details</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-gray-500">Name:</span> {formData.name}
                        </div>
                        <div>
                          <span className="text-gray-500">Email:</span> {formData.email}
                        </div>
                        <div>
                          <span className="text-gray-500">Phone:</span> {formData.phone}
                        </div>
                        <div>
                          <span className="text-gray-500">PIN Code:</span> {formData.pincode}
                        </div>
                        <div className="md:col-span-2">
                          <span className="text-gray-500">Address:</span> {formData.address}, {formData.city}, {formData.state}
                        </div>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-xl p-4">
                      <h3 className="font-semibold text-gray-800 mb-2">Payment Method</h3>
                      <div className="flex items-center">
                        {formData.paymentMethod === 'cod' ? (
                          <>
                            <Truck className="w-4 h-4 text-primary mr-2" />
                            <span>Cash on Delivery</span>
                          </>
                        ) : (
                          <>
                            <Shield className="w-4 h-4 text-primary mr-2" />
                            <span>Online Payment</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-4">
                  {currentStep > 1 && (
                    <button
                      type="button"
                      onClick={goToPreviousStep}
                      className="py-4 px-6 border-2 border-primary text-primary font-bold rounded-xl hover:bg-primary/10 transition-all duration-300 flex items-center justify-center"
                    >
                      ← Previous
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={loading || cartItems.length === 0}
                    className={`flex-1 py-4 px-6 bg-gradient-to-r from-primary to-secondary text-white font-bold rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300 flex items-center justify-center ${
                      loading || cartItems.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {loading ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        Processing...
                      </>
                    ) : (
                      <>
                        {currentStep < 3 ? (
                          <>
                            {currentStep === 1 ? <Truck className="w-5 h-5 mr-2" /> : <CreditCard className="w-5 h-5 mr-2" />}
                            {currentStep < 3 ? `Continue to ${currentStep === 1 ? 'Payment' : 'Review'}` : ''}
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-5 h-5 mr-2" />
                            {`Place Order - ₹${Math.round(finalTotal)}`}
                          </>
                        )}
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* You Might Also Like Section - Only show in Step 1 */}
              {currentStep === 1 && cartItems.length > 0 && suggestedProducts.length > 0 && (
                <div className="mt-8 pt-8 border-t border-gray-200">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-xl font-bold text-gray-800 mb-1">You might also like...</h3>
                      <p className="text-sm text-gray-500">Based on items in your cart</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={scrollSuggestionsLeft}
                        className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                        aria-label="Scroll left"
                      >
                        <ChevronLeft className="w-5 h-5 text-gray-600" />
                      </button>
                      <button
                        type="button"
                        onClick={scrollSuggestionsRight}
                        className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                        aria-label="Scroll right"
                      >
                        <ChevronRight className="w-5 h-5 text-gray-600" />
                      </button>
                    </div>
                  </div>

                  {loadingSuggestions ? (
                    <div className="flex gap-4 overflow-hidden">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <div
                          key={index}
                          className="flex-shrink-0 w-64 bg-white rounded-lg shadow-md overflow-hidden animate-pulse"
                        >
                          <div className="h-48 bg-gray-200"></div>
                          <div className="p-4">
                            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                            <div className="h-6 bg-gray-200 rounded w-1/2"></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      ref={suggestionsScrollRef}
                      className="flex gap-4 overflow-x-auto scrollbar-hide pb-4"
                      style={{
                        scrollbarWidth: 'none',
                        msOverflowStyle: 'none',
                        WebkitOverflowScrolling: 'touch'
                      }}
                    >
                      {suggestedProducts.map((product) => (
                        <div key={product.id} className="flex-shrink-0 w-64">
                          <ProductCard product={product} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Order Summary Sidebar */}
          <div className="lg:w-1/3">
            <div className="bg-white rounded-2xl shadow-xl p-6 sticky top-4">
              <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
                <ShoppingBag className="w-6 h-6 mr-2 text-primary" />
                Order Summary
              </h2>

              {cartItems.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <ShoppingBag className="w-8 h-8 text-gray-400" />
                  </div>
                  <p className="text-gray-500">Your cart is empty</p>
                </div>
              ) : (
                <>
                  <div className="max-h-64 overflow-y-auto mb-4 space-y-3">
                    {cartItems.map(item => (
                      <div key={item.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-16 h-16 object-cover rounded-lg"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-800 font-semibold truncate">{item.name}</p>
                          <p className="text-gray-500 text-sm">Qty: {item.quantity}</p>
                        </div>
                        <p className="text-gray-800 font-bold">₹{Math.round(item.price * item.quantity)}</p>
                      </div>
                    ))}
                  </div>

                  <div className="border-t-2 border-gray-100 pt-4 space-y-3">
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotal</span>
                      <span className="font-semibold">₹{Math.round(cartTotal)}</span>
                    </div>

                    {discount > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>Discount (10%)</span>
                        <span className="font-semibold">-₹{Math.round(discount)}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-gray-600">
                      <span>Tip</span>
                      <span className="font-semibold">₹{Math.round(tipAmount)}</span>
                    </div>

                    <div className="flex justify-between text-lg font-bold text-gray-800 pt-3 border-t-2 border-gray-100">
                      <span>Total</span>
                      <span className="text-primary">₹{Math.round(finalTotal)}</span>
                    </div>
                  </div>

                  <div className="mt-6">
                    <Link
                      to="/cart"
                      className="block w-full text-center py-3 px-4 border-2 border-primary text-primary rounded-xl hover:bg-primary hover:text-white transition-all duration-300 font-semibold"
                    >
                      ← Back to Cart
                    </Link>
                  </div>

                  <div className="mt-6 space-y-2">
                    <div className="flex items-center text-sm text-gray-600">
                      <Shield className="w-4 h-4 mr-2 text-green-600" />
                      <span>Secure checkout</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>

      {/* Location Picker Modal */}
      <LocationPicker
        isOpen={showLocationPicker}
        onClose={() => setShowLocationPicker(false)}
        onLocationSelect={handleLocationPicked}
        currentLocation={pickedLocation || undefined}
      />
    </>
  );
};

export default CheckoutPage;