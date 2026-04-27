import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useNotification } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { createOrder, CreateOrderData, getUserAddresses, createAddress, updateAddress, deleteAddress, Address as DbAddress, UpdateAddressData } from '../services/supabase';
import { geocodeAddress, LocationData } from '../services/placesService';
import { getDeliveryFeeForSubtotal } from '../context/CartContext';
import { openRazorpayCheckout, verifyPayment } from '../services/paymentGateway';
import { ShoppingBag, CreditCard, Truck, Shield, CheckCircle, MapPin, Lock, Plus, Home, Briefcase, ChevronRight, Edit2, Trash2, Navigation } from 'lucide-react';
import LocationPicker from '../components/location/LocationPicker';
import { calculateCheckoutTotals } from '../utils/checkoutCalculations';

const CheckoutPage = () => {
  const { cartItems, cartTotal, clearCart, updateCartQuantity, removeFromCart } = useCart();
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
    paymentMethod: '',
    addressName: ''
  });

  const [addressLabel, setAddressLabel] = useState<'Home' | 'Work' | 'Other'>('Home');
  const [landmark, setLandmark] = useState('');
  const [deliveryInstructions, setDeliveryInstructions] = useState('');

  const [orderForOthers, setOrderForOthers] = useState(false);
  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [receiverAddress, setReceiverAddress] = useState('');

  const [loading, setLoading] = useState(false);
  const [tipAmount, setTipAmount] = useState(0);
  const [customTip, setCustomTip] = useState('');
  const [selectedTip, setSelectedTip] = useState<string | null>(null);

  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitCashAmount, setSplitCashAmount] = useState('');
  const [splitUpiAmount, setSplitUpiAmount] = useState('');

  const [gstinEnabled, setGstinEnabled] = useState(false);
  const [gstin, setGstin] = useState('');
  const [businessName, setBusinessName] = useState('');

  const [savedAddresses, setSavedAddresses] = useState<DbAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [showNewAddressForm, setShowNewAddressForm] = useState(false);
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const [saveAddress, setSaveAddress] = useState(true);
  const [editAddressId, setEditAddressId] = useState<string | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [pickedLocation, setPickedLocation] = useState<LocationData | null>(null);

  const lastCreatedAddressRef = useRef<DbAddress | null>(null);

  const getStoredDeliveryLocation = (): LocationData | null => {
    try {
      const raw = localStorage.getItem('currentLocation');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as LocationData;
      if (typeof parsed?.lat !== 'number' || typeof parsed?.lng !== 'number') return null;
      return parsed;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const fetchAddresses = async () => {
      if (!user?.id) {
        setLoadingAddresses(false);
        return;
      }
      try {
        setLoadingAddresses(true);
        const addresses = await getUserAddresses(user.id, user.phone || undefined);
        setSavedAddresses(addresses);

        const deliveryToLocation = getStoredDeliveryLocation();
        if (deliveryToLocation) setPickedLocation(deliveryToLocation);

        if (deliveryToLocation && addresses.length > 0) {
          const matchByCoords = addresses.find((addr) =>
            addr.latitude != null &&
            addr.longitude != null &&
            Math.abs(addr.latitude - deliveryToLocation.lat) < 0.0001 &&
            Math.abs(addr.longitude - deliveryToLocation.lng) < 0.0001
          );
          if (matchByCoords) {
            setSelectedAddressId(matchByCoords.id);
            populateFormWithAddress(matchByCoords);
            setShowNewAddressForm(false);
            return;
          }
        }

        const defaultAddress = addresses.find(addr => addr.is_default);
        if (defaultAddress) {
          setSelectedAddressId(defaultAddress.id);
          populateFormWithAddress(defaultAddress);
          setShowNewAddressForm(false);
        } else if (addresses.length > 0) {
          setSelectedAddressId(addresses[0].id);
          populateFormWithAddress(addresses[0]);
          setShowNewAddressForm(false);
        } else if (deliveryToLocation) {
          setFormData(prev => ({
            ...prev,
            address: deliveryToLocation.address || '',
            city: deliveryToLocation.city || '',
            state: deliveryToLocation.state || '',
            pincode: deliveryToLocation.pincode || '',
          }));
          setShowNewAddressForm(true);
        } else {
          setShowNewAddressForm(true);
        }
      } catch (error) {
        console.error('Error fetching addresses:', error);
        setShowNewAddressForm(true);
      } finally {
        setLoadingAddresses(false);
      }
    };
    if (user?.id) fetchAddresses();
  }, [user?.id]);

  const handleLocationPicked = (location: LocationData) => {
    setPickedLocation(location);
    setFormData(prev => ({
      ...prev,
      address: location.address,
      city: location.city || '',
      state: location.state || '',
      pincode: location.pincode || '',
    }));
    setShowNewAddressForm(true);
    setSelectedAddressId(null);
    setEditAddressId(null);
    setShowLocationPicker(false);
  };

  const getAddressIcon = (label?: string) => {
    switch (label?.toLowerCase()) {
      case 'home': return <Home className="w-4 h-4" />;
      case 'work': return <Briefcase className="w-4 h-4" />;
      default: return <MapPin className="w-4 h-4" />;
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
    setEditAddressId(null);
    setSelectedAddressId(addressId);
    const address = savedAddresses.find(addr => addr.id === addressId);
    if (address) {
      populateFormWithAddress(address);
      setShowNewAddressForm(false);
    }
  };

  const handleNewAddress = () => {
    setEditAddressId(null);
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
    setSaveAddress(true);
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
      let addresses = await getUserAddresses(user.id, user.phone || undefined);
      setSavedAddresses(addresses);
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
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editAddressId) {
      if (!user?.id) { showNotification('User not authenticated', 'error'); return; }
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
        if (geocoded) { updatePayload.latitude = geocoded.lat; updatePayload.longitude = geocoded.lng; }
        await updateAddress(editAddressId, user.id, updatePayload);
        const updatedAddressId = editAddressId;
        let addresses = await getUserAddresses(user.id, user.phone || undefined);
        setSavedAddresses(addresses);
        setEditAddressId(null);
        setShowNewAddressForm(false);
        showNotification('Address updated', 'success');
        const updated = addresses.find(a => a.id === updatedAddressId);
        if (updated) { setSelectedAddressId(updatedAddressId); populateFormWithAddress(updated); }
      } catch (error) {
        showNotification('Failed to update address', 'error');
      } finally {
        setLoadingAddresses(false);
      }
      return;
    }

    // Validate before placing order
    if (!formData.address || !formData.city || !formData.state || !formData.pincode || !formData.phone) {
      showNotification('Please fill in all required shipping fields', 'error');
      return;
    }

    handleSubmit(e);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cartItems.length === 0) { showNotification('Your cart is empty', 'error'); return; }
    if (!formData.paymentMethod) { showNotification('Please select a payment method', 'error'); return; }
    try {
      setLoading(true);
      if (saveAddress && showNewAddressForm && !editAddressId && user?.id) {
        try {
          let lat: number, lng: number;
          if (pickedLocation) {
            lat = pickedLocation.lat;
            lng = pickedLocation.lng;
          } else {
            const fullAddress = [formData.address, formData.city, formData.state, formData.pincode].filter(Boolean).join(', ');
            const geocoded = await geocodeAddress(fullAddress);
            if (!geocoded) throw new Error('Could not verify address. Please use the location picker or try a different address.');
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
            google_place_id: pickedLocation?.placeId ?? undefined,
            google_formatted_address: pickedLocation?.formattedAddress ?? undefined,
            google_place_data: pickedLocation?.placeData ?? undefined,
          };
          const createdAddress = await createAddress(newAddressData);
          lastCreatedAddressRef.current = createdAddress;
          const updatedAddresses = await getUserAddresses(user.id, user.phone || undefined);
          setSavedAddresses(updatedAddresses);
          setSelectedAddressId(createdAddress.id);
          setShowNewAddressForm(false);
          showNotification('Address saved for future orders', 'success');
        } catch (addressError) {
          console.error('Error saving address:', addressError);
          showNotification('Order placed but address could not be saved', 'info');
        }
      }

      const orderItems = cartItems.map(item => ({
        product_id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        image: item.image
      }));

      const deliveryFeeAmount = getDeliveryFeeForSubtotal(cartTotal);
      const totals = calculateCheckoutTotals(cartTotal, deliveryFeeAmount, 0);
      const finalOrderTotal = Math.round(totals.grandTotal + tipAmount);

      let shippingLat: number | undefined;
      let shippingLng: number | undefined;
      if (selectedAddressId) {
        const recent = lastCreatedAddressRef.current?.id === selectedAddressId ? lastCreatedAddressRef.current : null;
        const savedAddr = recent ?? savedAddresses.find((a) => a.id === selectedAddressId);
        if (savedAddr?.latitude != null && savedAddr?.longitude != null) {
          shippingLat = savedAddr.latitude;
          shippingLng = savedAddr.longitude;
        }
      }
      if ((shippingLat == null || shippingLng == null) && pickedLocation) {
        shippingLat = pickedLocation.lat;
        shippingLng = pickedLocation.lng;
      }

      let paymentMethodLabel = formData.paymentMethod === 'cod' ? 'Cash on Delivery' : 'Online Payment';
      if (splitEnabled) {
        const cashAmt = parseFloat(splitCashAmount) || 0;
        const upiAmt = parseFloat(splitUpiAmount) || 0;
        paymentMethodLabel = `Split — Cash ₹${Math.round(cashAmt)} + UPI ₹${Math.round(upiAmt)}`;
      }

      const orderData: CreateOrderData = {
        user_id: user?.id,
        customer_name: formData.name,
        customer_email: formData.email || undefined,
        customer_phone: formData.phone,
        order_status: 'placed',
        payment_status: 'pending',
        payment_method: paymentMethodLabel,
        order_total: finalOrderTotal,
        subtotal: totals.itemsTaxableValue,
        delivery_fee: totals.deliveryFee,
        items: orderItems,
        shipping_address: {
          address: formData.address,
          city: formData.city,
          state: formData.state,
          pincode: formData.pincode,
          ...(shippingLat != null && shippingLng != null && { latitude: shippingLat, longitude: shippingLng })
        },
        ...(splitEnabled && {
          split_cash_amount: parseFloat(splitCashAmount) || 0,
          split_upi_amount: parseFloat(splitUpiAmount) || 0
        })
      };

      const createdOrder = await createOrder(orderData);
      const isOnlineRazorpay = formData.paymentMethod === 'online' && !splitEnabled;

      if (isOnlineRazorpay) {
        try {
          await openRazorpayCheckout({
            orderId: createdOrder.id,
            amount: finalOrderTotal,
            customerName: formData.name,
            customerEmail: formData.email,
            customerPhone: formData.phone,
            onSuccess: async (response) => {
              await verifyPayment({
                paymentId: response.razorpay_payment_id,
                razorpayOrderId: response.razorpay_order_id,
                signature: response.razorpay_signature,
                internalOrderId: createdOrder.id
              });
            }
          });
        } catch (payErr: unknown) {
          const msg = payErr instanceof Error ? payErr.message : String(payErr);
          if (msg.includes('cancelled') || msg.includes('Payment cancelled')) {
            showNotification('Order placed. Payment was not completed — your order is pending payment.', 'warning');
          } else {
            showNotification(msg || 'Payment could not be completed. Your order is pending payment.', 'error');
          }
          clearCart();
          lastCreatedAddressRef.current = null;
          navigate('/thank-you', { state: { order: createdOrder, orderId: createdOrder.id, orderNumber: createdOrder.order_number } });
          return;
        }
      }

      showNotification('Order placed successfully! 🎉', 'success');
      clearCart();
      lastCreatedAddressRef.current = null;
      navigate('/thank-you', { state: { order: createdOrder, orderId: createdOrder.id, orderNumber: createdOrder.order_number } });
    } catch (error: any) {
      console.error('Error placing order:', error);
      showNotification(error?.message || 'Failed to place order. Please try again.', 'error');
    } finally {
      setLoading(false);
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
    setTipAmount(parseFloat(value) || 0);
    setSelectedTip('custom');
  };

  const handleSplitToggle = () => {
    if (!splitEnabled) {
      const deliveryFeeAmount = getDeliveryFeeForSubtotal(cartTotal);
      const totals = calculateCheckoutTotals(cartTotal, deliveryFeeAmount, 0);
      const currentFinalTotal = Math.round(totals.grandTotal + tipAmount);
      const half = Math.round(currentFinalTotal / 2);
      setSplitCashAmount(half.toString());
      setSplitUpiAmount((currentFinalTotal - half).toString());
    } else {
      setSplitCashAmount('');
      setSplitUpiAmount('');
    }
    setSplitEnabled(prev => !prev);
  };

  const handleSplitCashChange = (value: string) => {
    setSplitCashAmount(value);
    const deliveryFeeAmount = getDeliveryFeeForSubtotal(cartTotal);
    const totals = calculateCheckoutTotals(cartTotal, deliveryFeeAmount, 0);
    const currentFinalTotal = Math.round(totals.grandTotal + tipAmount);
    const cash = parseFloat(value) || 0;
    const upi = Math.max(0, currentFinalTotal - cash);
    setSplitUpiAmount(upi > 0 ? upi.toString() : '0');
  };

  const handleSplitUpiChange = (value: string) => {
    setSplitUpiAmount(value);
    const deliveryFeeAmount = getDeliveryFeeForSubtotal(cartTotal);
    const totals = calculateCheckoutTotals(cartTotal, deliveryFeeAmount, 0);
    const currentFinalTotal = Math.round(totals.grandTotal + tipAmount);
    const upi = parseFloat(value) || 0;
    const cash = Math.max(0, currentFinalTotal - upi);
    setSplitCashAmount(cash > 0 ? cash.toString() : '0');
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 max-w-sm w-full text-center">
          <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-5">
            <Lock className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Login required</h1>
          <p className="text-gray-500 mb-7 text-sm">Please log in to continue with your checkout.</p>
          <Link to="/login" className="block w-full bg-primary text-white text-center py-3 px-6 rounded-xl font-semibold hover:bg-primary/90 transition-colors">
            Login to Continue
          </Link>
        </div>
      </div>
    );
  }

  const deliveryFee = getDeliveryFeeForSubtotal(cartTotal);
  const checkoutTotals = calculateCheckoutTotals(cartTotal, deliveryFee, 0);
  const finalTotal = Math.round(checkoutTotals.grandTotal + tipAmount);

  return (
    <>
      <div className="min-h-screen bg-gray-50">
        {/* Top bar */}
        <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
            <Link to="/cart" className="text-gray-400 hover:text-gray-600 transition-colors">
              <ChevronRight className="w-5 h-5 rotate-180" />
            </Link>
            <h1 className="text-lg font-bold text-gray-900">Checkout</h1>
            <div className="ml-auto flex items-center gap-1.5 text-sm text-gray-500">
              <Shield className="w-4 h-4 text-green-500" />
              <span>Secure checkout</span>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 py-8">
          <form onSubmit={handleFormSubmit}>
            <div className="flex flex-col lg:flex-row gap-6">

              {/* ─── LEFT COLUMN ─── */}
              <div className="flex-1 space-y-5">

                {/* Delivery Address Section */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-50">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                        <MapPin className="w-4 h-4 text-primary" />
                      </div>
                      <h2 className="font-bold text-gray-900">Delivery Address</h2>
                    </div>
                    {savedAddresses.length > 0 && !showNewAddressForm && (
                      <button
                        type="button"
                        onClick={handleNewAddress}
                        className="flex items-center gap-1.5 text-sm text-primary font-semibold hover:text-primary/80 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        Add New
                      </button>
                    )}
                  </div>

                  <div className="p-6">
                    {/* Loading skeleton */}
                    {loadingAddresses && (
                      <div className="space-y-3">
                        {[1, 2].map(i => (
                          <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
                        ))}
                      </div>
                    )}

                    {/* Saved addresses list */}
                    {!loadingAddresses && savedAddresses.length > 0 && !showNewAddressForm && (
                      <div className="space-y-3">
                        {savedAddresses.map((address) => (
                          <div
                            key={address.id}
                            onClick={() => handleAddressSelect(address.id)}
                            className={`relative flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                              selectedAddressId === address.id
                                ? 'border-primary bg-primary/[0.03]'
                                : 'border-gray-100 hover:border-gray-200 bg-gray-50/50'
                            }`}
                          >
                            {/* Radio indicator */}
                            <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                              selectedAddressId === address.id ? 'border-primary' : 'border-gray-300'
                            }`}>
                              {selectedAddressId === address.id && (
                                <div className="w-2 h-2 rounded-full bg-primary" />
                              )}
                            </div>

                            {/* Icon */}
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              selectedAddressId === address.id ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {getAddressIcon(address.label)}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                <span className="font-semibold text-gray-900 text-sm">{address.name}</span>
                                {address.label && (
                                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{address.label}</span>
                                )}
                                {address.is_default && (
                                  <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">Default</span>
                                )}
                              </div>
                              <p className="text-sm text-gray-600 leading-snug">
                                {address.address_line_1}{address.address_line_2 && `, ${address.address_line_2}`}
                              </p>
                              <p className="text-sm text-gray-500">{address.city}, {address.state} — {address.pincode}</p>
                              {address.landmark && <p className="text-xs text-gray-400 mt-0.5">Near {address.landmark}</p>}
                              {address.delivery_for === 'others' && address.receiver_name && (
                                <p className="text-xs text-orange-600 mt-1 font-medium">For: {address.receiver_name}</p>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => handleEditAddress(address.id)}
                                className="w-8 h-8 rounded-lg hover:bg-blue-50 flex items-center justify-center text-gray-400 hover:text-blue-500 transition-colors"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteAddress(address.id)}
                                className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* New address form */}
                    {!loadingAddresses && (showNewAddressForm || savedAddresses.length === 0) && (
                      <div>
                        {savedAddresses.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditAddressId(null);
                              setShowNewAddressForm(false);
                              if (savedAddresses.length > 0) {
                                const defaultAddr = savedAddresses.find(a => a.is_default) || savedAddresses[0];
                                setSelectedAddressId(defaultAddr.id);
                                populateFormWithAddress(defaultAddr);
                              }
                            }}
                            className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 mb-5 font-medium transition-colors"
                          >
                            <ChevronRight className="w-4 h-4 rotate-180" />
                            Back to saved addresses
                          </button>
                        )}

                        {/* Location picker button */}
                        <button
                          type="button"
                          onClick={() => setShowLocationPicker(true)}
                          className="w-full flex items-center gap-3 px-4 py-3 mb-5 bg-primary/5 border border-primary/20 rounded-xl hover:bg-primary/10 transition-all group"
                        >
                          <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
                            <Navigation className="w-4 h-4 text-white" />
                          </div>
                          <div className="text-left flex-1">
                            <p className="font-semibold text-gray-800 text-sm">
                              {pickedLocation ? 'Change Location' : 'Use Current Location'}
                            </p>
                            <p className="text-xs text-gray-500">
                              {pickedLocation ? `${pickedLocation.city}, ${pickedLocation.pincode}` : 'Detect or search for address'}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-primary transition-colors" />
                        </button>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* Full Name */}
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Full Name *</label>
                            <input
                              type="text"
                              name="name"
                              value={formData.name}
                              onChange={handleChange}
                              required
                              placeholder="John Doe"
                              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all bg-gray-50 focus:bg-white"
                            />
                          </div>

                          {/* Phone */}
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Phone *</label>
                            <input
                              type="tel"
                              name="phone"
                              value={formData.phone}
                              onChange={handleChange}
                              required
                              placeholder="+91 98765 43210"
                              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all bg-gray-50 focus:bg-white"
                            />
                          </div>

                          {/* Email */}
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Email *</label>
                            <input
                              type="email"
                              name="email"
                              value={formData.email}
                              onChange={handleChange}
                              required
                              placeholder="john@example.com"
                              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all bg-gray-50 focus:bg-white"
                            />
                          </div>

                          {/* PIN Code */}
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">PIN Code *</label>
                            <input
                              type="text"
                              name="pincode"
                              value={formData.pincode}
                              onChange={handleChange}
                              required
                              maxLength={6}
                              placeholder="700001"
                              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all bg-gray-50 focus:bg-white"
                            />
                          </div>

                          {/* Street Address */}
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Street Address *</label>
                            <textarea
                              name="address"
                              value={formData.address}
                              onChange={handleChange}
                              required
                              rows={2}
                              placeholder="House no, Building name, Street"
                              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all resize-none bg-gray-50 focus:bg-white"
                            />
                          </div>

                          {/* City */}
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">City *</label>
                            <input
                              type="text"
                              name="city"
                              value={formData.city}
                              onChange={handleChange}
                              required
                              placeholder="Kolkata"
                              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all bg-gray-50 focus:bg-white"
                            />
                          </div>

                          {/* State */}
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">State *</label>
                            <select
                              name="state"
                              value={formData.state}
                              onChange={handleChange}
                              required
                              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all bg-gray-50 focus:bg-white appearance-none"
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

                          {/* Address Type */}
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Address Type</label>
                            <div className="flex gap-2">
                              {(['Home', 'Work', 'Other'] as const).map((type) => (
                                <button
                                  key={type}
                                  type="button"
                                  onClick={() => setAddressLabel(type)}
                                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-200 ${
                                    addressLabel === type
                                      ? 'border-primary bg-primary text-white shadow-sm'
                                      : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-gray-50'
                                  }`}
                                >
                                  {type === 'Home' && <Home className="w-3.5 h-3.5" />}
                                  {type === 'Work' && <Briefcase className="w-3.5 h-3.5" />}
                                  {type === 'Other' && <MapPin className="w-3.5 h-3.5" />}
                                  {type}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Landmark */}
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Landmark <span className="normal-case font-normal text-gray-400">(optional)</span></label>
                            <input
                              type="text"
                              value={landmark}
                              onChange={(e) => setLandmark(e.target.value)}
                              placeholder="e.g., Near City Mall, Opposite Park"
                              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all bg-gray-50 focus:bg-white"
                            />
                          </div>

                          {/* Delivery Instructions */}
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Delivery Instructions <span className="normal-case font-normal text-gray-400">(optional)</span></label>
                            <textarea
                              value={deliveryInstructions}
                              onChange={(e) => setDeliveryInstructions(e.target.value)}
                              rows={2}
                              placeholder="e.g., Ring the doorbell twice, Leave at the door"
                              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all resize-none bg-gray-50 focus:bg-white"
                            />
                          </div>
                        </div>

                        {/* Order for others */}
                        <div className="mt-4">
                          <label className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-100 rounded-xl cursor-pointer hover:bg-amber-50/70 transition-colors">
                            <input
                              type="checkbox"
                              checked={orderForOthers}
                              onChange={(e) => setOrderForOthers(e.target.checked)}
                              className="mt-0.5 h-4 w-4 text-amber-500 focus:ring-amber-400 border-gray-300 rounded"
                            />
                            <div>
                              <p className="font-semibold text-gray-800 text-sm">Ordering for someone else?</p>
                              <p className="text-xs text-gray-500 mt-0.5">Add receiver details for this delivery</p>
                            </div>
                          </label>

                          {orderForOthers && (
                            <div className="mt-3 p-4 border border-amber-100 rounded-xl bg-amber-50/30 grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Receiver Name *</label>
                                <input
                                  type="text"
                                  value={receiverName}
                                  onChange={(e) => setReceiverName(e.target.value)}
                                  required={orderForOthers}
                                  placeholder="Full name"
                                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all bg-white"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Receiver Phone *</label>
                                <input
                                  type="tel"
                                  value={receiverPhone}
                                  onChange={(e) => setReceiverPhone(e.target.value)}
                                  required={orderForOthers}
                                  placeholder="+91 98765 43210"
                                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all bg-white"
                                />
                              </div>
                              <div className="sm:col-span-2">
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Receiver Address <span className="normal-case font-normal text-gray-400">(if different)</span></label>
                                <textarea
                                  value={receiverAddress}
                                  onChange={(e) => setReceiverAddress(e.target.value)}
                                  rows={2}
                                  placeholder="Leave blank if same as delivery address"
                                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all resize-none bg-white"
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Save address */}
                        <div className="mt-4">
                          <label className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-xl cursor-pointer hover:bg-blue-50/70 transition-colors">
                            <input
                              type="checkbox"
                              checked={saveAddress}
                              onChange={(e) => setSaveAddress(e.target.checked)}
                              className="mt-0.5 h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                            />
                            <div className="flex-1">
                              <p className="font-semibold text-gray-800 text-sm">Save this address for future orders</p>
                              <p className="text-xs text-gray-500 mt-0.5">Manage saved addresses from your profile</p>
                            </div>
                          </label>
                          {saveAddress && (
                            <div className="mt-3 px-1">
                              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Address Label <span className="normal-case font-normal text-gray-400">(optional)</span></label>
                              <input
                                type="text"
                                name="addressName"
                                value={formData.addressName}
                                onChange={handleChange}
                                placeholder="e.g., Home, Office, Apartment"
                                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all bg-gray-50 focus:bg-white"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Payment Method Section */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-2 px-6 pt-6 pb-4 border-b border-gray-50">
                    <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                      <CreditCard className="w-4 h-4 text-primary" />
                    </div>
                    <h2 className="font-bold text-gray-900">Payment Method</h2>
                  </div>

                  <div className="p-6 space-y-3">
                    {/* COD */}
                    <label className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                      formData.paymentMethod === 'cod' ? 'border-primary bg-primary/[0.03]' : 'border-gray-100 hover:border-gray-200 bg-gray-50/50'
                    }`}>
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                        formData.paymentMethod === 'cod' ? 'border-primary' : 'border-gray-300'
                      }`}>
                        {formData.paymentMethod === 'cod' && <div className="w-2 h-2 rounded-full bg-primary" />}
                      </div>
                      <input type="radio" name="paymentMethod" value="cod" checked={formData.paymentMethod === 'cod'} onChange={handleChange} className="sr-only" />
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900 text-sm">Cash on Delivery</p>
                        <p className="text-xs text-gray-500 mt-0.5">Pay when your order arrives</p>
                      </div>
                      <Truck className="w-5 h-5 text-gray-400" />
                    </label>

                    {/* Online */}
                    <label className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                      formData.paymentMethod === 'online' ? 'border-primary bg-primary/[0.03]' : 'border-gray-100 hover:border-gray-200 bg-gray-50/50'
                    }`}>
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                        formData.paymentMethod === 'online' ? 'border-primary' : 'border-gray-300'
                      }`}>
                        {formData.paymentMethod === 'online' && <div className="w-2 h-2 rounded-full bg-primary" />}
                      </div>
                      <input type="radio" name="paymentMethod" value="online" checked={formData.paymentMethod === 'online'} onChange={handleChange} className="sr-only" />
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900 text-sm">Online Payment</p>
                        <p className="text-xs text-gray-500 mt-0.5">UPI, Cards, Net banking via Razorpay</p>
                      </div>
                      <Shield className="w-5 h-5 text-gray-400" />
                    </label>

                    {/* Split Payment */}
                    <label className={`flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                      splitEnabled ? 'border-violet-400 bg-violet-50/50' : 'border-gray-100 hover:border-gray-200 bg-gray-50/50'
                    }`}>
                      <div className={`mt-0.5 w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                        splitEnabled ? 'border-violet-500 bg-violet-500' : 'border-gray-300'
                      }`}>
                        {splitEnabled && <CheckCircle className="w-3 h-3 text-white" />}
                      </div>
                      <input type="checkbox" checked={splitEnabled} onChange={handleSplitToggle} className="sr-only" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-900 text-sm">Split Payment</p>
                          {splitEnabled && <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">Active</span>}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">Pay part in Cash, part via UPI</p>

                        {splitEnabled && (
                          <div className="mt-3 space-y-2">
                            <div className="flex items-center gap-2 justify-between text-xs text-gray-500 mb-2">
                              <span>Total: ₹{finalTotal}</span>
                              {(() => {
                                const total = (parseFloat(splitCashAmount) || 0) + (parseFloat(splitUpiAmount) || 0);
                                const diff = Math.abs(Math.round(total) - finalTotal);
                                return diff <= 1
                                  ? <span className="text-green-600 font-semibold">✓ Balanced</span>
                                  : <span className="text-red-500 font-semibold">{Math.round(total) > finalTotal ? `₹${Math.round(total) - finalTotal} over` : `₹${finalTotal - Math.round(total)} short`}</span>;
                              })()}
                            </div>
                            <div className="flex items-center gap-2 bg-white p-2.5 rounded-lg border border-gray-100">
                              <span className="text-sm">💵</span>
                              <span className="text-xs font-medium text-gray-600 flex-1">Cash</span>
                              <div className="relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                                <input type="number" value={splitCashAmount} onChange={(e) => handleSplitCashChange(e.target.value)} min="0" max={finalTotal} placeholder="0" className="w-20 pl-6 pr-2 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-primary" onClick={e => e.stopPropagation()} />
                              </div>
                            </div>
                            <div className="flex items-center gap-2 bg-white p-2.5 rounded-lg border border-gray-100">
                              <span className="text-sm">📱</span>
                              <span className="text-xs font-medium text-gray-600 flex-1">UPI</span>
                              <div className="relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">₹</span>
                                <input type="number" value={splitUpiAmount} onChange={(e) => handleSplitUpiChange(e.target.value)} min="0" max={finalTotal} placeholder="0" className="w-20 pl-6 pr-2 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-primary" onClick={e => e.stopPropagation()} />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </label>
                  </div>
                </div>

                {/* Tip Section */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-6 pt-5 pb-4 border-b border-gray-50">
                    <h2 className="font-bold text-gray-900">Add a Tip <span className="text-sm font-normal text-gray-400">(optional)</span></h2>
                    <p className="text-xs text-gray-500 mt-0.5">Show appreciation for your delivery partner</p>
                  </div>
                  <div className="p-6">
                    <div className="grid grid-cols-4 gap-2 mb-3">
                      {[5, 10, 15, 20].map((amount) => (
                        <button
                          key={amount}
                          type="button"
                          onClick={() => handleTipSelect(amount)}
                          className={`py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                            selectedTip === amount.toString()
                              ? 'bg-primary text-white shadow-sm'
                              : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-100'
                          }`}
                        >
                          ₹{amount}
                        </button>
                      ))}
                    </div>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                      <input
                        type="number"
                        value={customTip}
                        onChange={handleCustomTipChange}
                        min="0"
                        step="1"
                        placeholder="Enter custom amount"
                        className="w-full pl-8 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all bg-gray-50 focus:bg-white"
                      />
                    </div>
                  </div>
                </div>

                {/* GSTIN Section */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-6 py-4">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={gstinEnabled}
                        onChange={(e) => setGstinEnabled(e.target.checked)}
                        className="mt-0.5 h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-gray-800 text-sm">Add GSTIN</p>
                          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">Business</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">Claim GST credit up to 18% on the order</p>
                      </div>
                    </label>

                    {gstinEnabled && (
                      <div className="mt-4 space-y-3 pt-4 border-t border-gray-100">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">GSTIN Number *</label>
                          <input
                            type="text"
                            value={gstin}
                            onChange={(e) => setGstin(e.target.value.toUpperCase())}
                            maxLength={15}
                            placeholder="22AAAAA0000A1Z5"
                            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all bg-gray-50 focus:bg-white font-mono"
                          />
                          <p className="text-xs text-gray-400 mt-1">Enter 15-digit GSTIN</p>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Registered Business Name *</label>
                          <input
                            type="text"
                            value={businessName}
                            onChange={(e) => setBusinessName(e.target.value)}
                            placeholder="Your Company Name Pvt Ltd"
                            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all bg-gray-50 focus:bg-white"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* ─── RIGHT COLUMN — ORDER SUMMARY ─── */}
              <div className="lg:w-[360px] flex-shrink-0">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm sticky top-20">
                  <div className="flex items-center gap-2 px-6 pt-6 pb-4 border-b border-gray-50">
                    <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                      <ShoppingBag className="w-4 h-4 text-primary" />
                    </div>
                    <h2 className="font-bold text-gray-900">Order Summary</h2>
                    <span className="ml-auto text-xs text-gray-400 font-medium">{cartItems.length} item{cartItems.length !== 1 ? 's' : ''}</span>
                  </div>

                  {cartItems.length === 0 ? (
                    <div className="text-center py-12 px-6">
                      <ShoppingBag className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                      <p className="text-gray-400 text-sm">Your cart is empty</p>
                    </div>
                  ) : (
                    <>
                      {/* Cart items */}
                      <div className="px-6 py-4 space-y-3 max-h-72 overflow-y-auto">
                        {cartItems.map(item => (
                          <div key={item.id} className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-50 border border-gray-100">
                              <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-800 truncate">{item.name}</p>
                              <p className="text-xs text-gray-400">₹{Math.round(item.price)} × {item.quantity}</p>
                            </div>
                            {/* Qty controls */}
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => item.quantity > 1 ? updateCartQuantity(item.id, item.quantity - 1, item.isLoose) : removeFromCart(item.id, item.isLoose)}
                                className="w-6 h-6 rounded-md border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors text-gray-500 text-sm font-bold"
                              >−</button>
                              <span className="text-sm font-semibold text-gray-800 w-5 text-center">{item.quantity}</span>
                              <button
                                type="button"
                                onClick={() => updateCartQuantity(item.id, item.quantity + 1, item.isLoose)}
                                className="w-6 h-6 rounded-md border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors text-gray-500 text-sm font-bold"
                              >+</button>
                            </div>
                            <p className="text-sm font-bold text-gray-900 w-14 text-right">₹{Math.round(item.price * item.quantity)}</p>
                          </div>
                        ))}
                      </div>

                      {/* Totals */}
                      <div className="px-6 py-4 border-t border-gray-50 space-y-2.5">
                        <div className="flex justify-between text-sm text-gray-500">
                          <span>Taxable Value</span>
                          <span className="font-semibold text-gray-700">₹{Math.round(checkoutTotals.itemsTaxableValue)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-gray-500">
                          <span>GST (5%)</span>
                          <span className="font-semibold text-gray-700">₹{checkoutTotals.itemsGST.total.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-gray-500">
                          <span>Platform Fee</span>
                          <span className="font-semibold text-gray-700">₹{checkoutTotals.platformFeeTotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-gray-500">
                          <span>Handling Fee</span>
                          <span className="font-semibold text-gray-700">₹{checkoutTotals.handlingFeeTotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-gray-500">
                          <span>Delivery</span>
                          <span className={`font-semibold ${checkoutTotals.deliveryFee === 0 ? 'text-green-600' : 'text-gray-700'}`}>
                            {checkoutTotals.deliveryFee === 0 ? 'Free' : `₹${checkoutTotals.deliveryFee}`}
                          </span>
                        </div>
                        {checkoutTotals.discount > 0 && (
                          <div className="flex justify-between text-sm text-green-600">
                            <span>Discount</span>
                            <span className="font-semibold">−₹{Math.round(checkoutTotals.discount)}</span>
                          </div>
                        )}
                        {tipAmount > 0 && (
                          <div className="flex justify-between text-sm text-gray-500">
                            <span>Tip</span>
                            <span className="font-semibold text-gray-700">₹{Math.round(tipAmount)}</span>
                          </div>
                        )}

                        <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                          <span className="font-bold text-gray-900">Total</span>
                          <span className="text-xl font-bold text-primary">₹{finalTotal}</span>
                        </div>

                        {splitEnabled && (
                          <div className="pt-3 border-t border-violet-100 space-y-1.5">
                            <p className="text-xs font-bold text-violet-700 uppercase tracking-wide">Split Payment</p>
                            <div className="flex justify-between text-xs text-gray-500">
                              <span>💵 Cash</span>
                              <span className="font-semibold text-green-700">₹{splitCashAmount || '0'}</span>
                            </div>
                            <div className="flex justify-between text-xs text-gray-500">
                              <span>📱 UPI</span>
                              <span className="font-semibold text-violet-700">₹{splitUpiAmount || '0'}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Place Order CTA */}
                      <div className="px-6 pb-6">
                        <button
                          type="submit"
                          disabled={loading || cartItems.length === 0}
                          className={`w-full py-3.5 px-6 bg-primary text-white font-bold rounded-xl shadow-sm hover:bg-primary/90 active:scale-[0.99] transition-all duration-200 flex items-center justify-center gap-2 text-sm ${
                            loading || cartItems.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          {loading ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-4 h-4" />
                              Place Order · ₹{finalTotal}
                            </>
                          )}
                        </button>

                        <div className="flex items-center justify-center gap-1.5 mt-3">
                          <Shield className="w-3.5 h-3.5 text-green-500" />
                          <span className="text-xs text-gray-400">Secure & encrypted checkout</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

            </div>
          </form>
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