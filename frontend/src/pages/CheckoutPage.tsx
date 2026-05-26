import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useNotification } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { createOrder, CreateOrderData, getUserAddresses, createAddress, updateAddress, deleteAddress, Address as DbAddress, UpdateAddressData } from '../services/supabase';
import { geocodeAddress, LocationData } from '../services/placesService';
import { getDeliveryFeeForSubtotal } from '../context/CartContext';
import { openRazorpayCheckout, verifyPayment } from '../services/paymentGateway';
import { ShoppingBag, CreditCard, Truck, Shield, CheckCircle, MapPin, Lock, Plus, Home, Briefcase, ChevronRight, Edit2, Trash2, Navigation, Heart, Sparkles, ArrowLeft } from 'lucide-react';
import LocationPicker from '../components/location/LocationPicker';
import { calculateCheckoutTotals } from '../utils/checkoutCalculations';

/* ─────────────────────────────────────────────
   Tiny reusable components
───────────────────────────────────────────── */

const SectionCard = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-white rounded-3xl border border-stone-100 shadow-[0_2px_16px_-4px_rgba(0,0,0,0.08)] overflow-hidden ${className}`}>
    {children}
  </div>
);

const SectionHeader = ({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) => (
  <div className="flex items-center justify-between px-6 pt-6 pb-5">
    <div className="flex items-center gap-3">
      <span className="text-primary">{icon}</span>
      <h2 className="text-base font-bold text-stone-800 tracking-tight">{title}</h2>
    </div>
    {action}
  </div>
);

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5">{children}</label>
);

const inputCls = "w-full px-4 py-3 border border-stone-200 rounded-2xl text-sm text-stone-800 placeholder-stone-300 bg-stone-50 focus:bg-white focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all duration-200";
const textareaCls = `${inputCls} resize-none`;

/* ─────────────────────────────────────────────
   Main Component
───────────────────────────────────────────── */

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
      if (!user?.id) { setLoadingAddresses(false); return; }
      try {
        setLoadingAddresses(true);
        const addresses = await getUserAddresses(user.id, user.phone || undefined);
        setSavedAddresses(addresses);
        const deliveryToLocation = getStoredDeliveryLocation();
        if (deliveryToLocation) setPickedLocation(deliveryToLocation);
        if (deliveryToLocation && addresses.length > 0) {
          const matchByCoords = addresses.find((addr) =>
            addr.latitude != null && addr.longitude != null &&
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

  /* ─── Not authenticated ─── */
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-stone-50 to-amber-50/30 flex items-center justify-center px-4">
        <div className="bg-white rounded-3xl shadow-xl border border-stone-100 p-10 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-stone-900 mb-2 tracking-tight">Sign in to checkout</h1>
          <p className="text-stone-500 mb-8 text-sm leading-relaxed">Please log in to continue with your purchase.</p>
          <Link
            to="/login"
            className="block w-full bg-primary text-white text-center py-3.5 px-6 rounded-2xl font-semibold hover:opacity-90 active:scale-[0.98] transition-all duration-200 shadow-[0_4px_14px_-2px_rgba(var(--color-primary-rgb),0.4)]"
          >
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
      {/* Global page styles */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600&display=swap');
        .checkout-root { font-family: 'DM Sans', sans-serif; }
        .checkout-root h1, .checkout-root h2, .checkout-root .font-display { font-family: 'Sora', sans-serif; }
        .step-dot { transition: all 0.3s ease; }
        .addr-card { transition: border-color 0.2s, background-color 0.2s, box-shadow 0.2s; }
        .addr-card:hover { box-shadow: 0 4px 20px -6px rgba(0,0,0,0.10); }
        .pay-card { transition: border-color 0.2s, background-color 0.2s, transform 0.15s; }
        .pay-card:hover { transform: translateY(-1px); }
        .tip-btn { transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .tip-btn:hover { transform: scale(1.05); }
        .tip-btn.active { transform: scale(1.08); }
        .place-btn { transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); }
        .place-btn:not(:disabled):hover { transform: translateY(-1px); box-shadow: 0 8px 24px -4px rgba(var(--color-primary-rgb), 0.45); }
        .place-btn:not(:disabled):active { transform: scale(0.98); }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-in { animation: fadeSlideIn 0.3s ease forwards; }
        .skeleton { background: linear-gradient(90deg, #f3f3f3 25%, #e8e8e8 50%, #f3f3f3 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      `}</style>

      <div className="checkout-root min-h-screen bg-gradient-to-br from-stone-50 via-white to-amber-50/20">

        {/* ── Top bar ── */}
        <div className="bg-white/80 backdrop-blur-md border-b border-stone-100 sticky top-0 z-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
            <Link
              to="/"
              className="w-9 h-9 rounded-xl border border-stone-200 flex items-center justify-center text-stone-500 hover:text-stone-800 hover:border-stone-300 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-base font-bold text-stone-900 leading-none font-display">Checkout</h1>
              <p className="text-xs text-stone-400 mt-0.5">{cartItems.length} item{cartItems.length !== 1 ? 's' : ''} in your bag</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5 text-xs text-stone-500 bg-green-50 border border-green-100 px-3 py-1.5 rounded-full">
              <Shield className="w-3.5 h-3.5 text-green-600" />
              <span className="text-green-700 font-medium">Secure checkout</span>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <form onSubmit={handleFormSubmit}>
            <div className="flex flex-col lg:flex-row gap-6 items-start">

              {/* ════════════════ LEFT COLUMN ════════════════ */}
              <div className="flex-1 space-y-5 min-w-0">

                {/* ── DELIVERY ADDRESS ── */}
                <SectionCard>
                  <SectionHeader
                    icon={<MapPin className="w-5 h-5" />}
                    title="Delivery Address"
                    action={
                      savedAddresses.length > 0 && !showNewAddressForm ? (
                        <button
                          type="button"
                          onClick={handleNewAddress}
                          className="flex items-center gap-1.5 text-xs text-primary font-semibold bg-primary/8 hover:bg-primary/15 px-3 py-1.5 rounded-xl transition-all"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Add new
                        </button>
                      ) : null
                    }
                  />

                  <div className="px-6 pb-6">
                    {/* Loading skeleton */}
                    {loadingAddresses && (
                      <div className="space-y-3">
                        {[1, 2].map(i => (
                          <div key={i} className="h-24 rounded-2xl skeleton" />
                        ))}
                      </div>
                    )}

                    {/* Saved addresses */}
                    {!loadingAddresses && savedAddresses.length > 0 && !showNewAddressForm && (
                      <div className="space-y-3 animate-in">
                        {savedAddresses.map((address) => (
                          <div
                            key={address.id}
                            onClick={() => handleAddressSelect(address.id)}
                            className={`addr-card relative flex items-start gap-3.5 p-4 rounded-2xl border-2 cursor-pointer ${
                              selectedAddressId === address.id
                                ? 'border-primary bg-primary/[0.03]'
                                : 'border-stone-100 hover:border-stone-200 bg-stone-50/60'
                            }`}
                          >
                            {/* Radio */}
                            <div className={`mt-1 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                              selectedAddressId === address.id ? 'border-primary' : 'border-stone-300'
                            }`}>
                              {selectedAddressId === address.id && (
                                <div className="w-2 h-2 rounded-full bg-primary" />
                              )}
                            </div>
                            {/* Icon */}
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                              selectedAddressId === address.id ? 'bg-primary/12 text-primary' : 'bg-stone-100 text-stone-500'
                            }`}>
                              {getAddressIcon(address.label)}
                            </div>
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="font-semibold text-stone-800 text-sm">{address.name}</span>
                                {address.label && (
                                  <span className="text-[10px] bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide">{address.label}</span>
                                )}
                                {address.is_default && (
                                  <span className="text-[10px] bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide">Default</span>
                                )}
                              </div>
                              <p className="text-sm text-stone-600 leading-snug">
                                {address.address_line_1}{address.address_line_2 && `, ${address.address_line_2}`}
                              </p>
                              <p className="text-xs text-stone-400 mt-0.5">{address.city}, {address.state} — {address.pincode}</p>
                              {address.landmark && <p className="text-xs text-stone-400 mt-0.5">Near {address.landmark}</p>}
                              {address.delivery_for === 'others' && address.receiver_name && (
                                <p className="text-xs text-amber-600 mt-1 font-medium">For: {address.receiver_name}</p>
                              )}
                            </div>
                            {/* Actions */}
                            <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => handleEditAddress(address.id)}
                                className="w-8 h-8 rounded-xl hover:bg-blue-50 flex items-center justify-center text-stone-400 hover:text-blue-500 transition-colors"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteAddress(address.id)}
                                className="w-8 h-8 rounded-xl hover:bg-red-50 flex items-center justify-center text-stone-400 hover:text-red-400 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* New / Edit address form */}
                    {!loadingAddresses && (showNewAddressForm || savedAddresses.length === 0) && (
                      <div className="animate-in">
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
                            className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 mb-5 font-medium transition-colors"
                          >
                            <ChevronRight className="w-4 h-4 rotate-180" />
                            Back to saved addresses
                          </button>
                        )}

                        {/* Location picker */}
                        <button
                          type="button"
                          onClick={() => setShowLocationPicker(true)}
                          className="w-full flex items-center gap-3 px-4 py-3.5 mb-5 bg-primary/5 border-2 border-primary/20 rounded-2xl hover:bg-primary/10 hover:border-primary/30 transition-all group"
                        >
                          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center flex-shrink-0 shadow-[0_4px_10px_-2px_rgba(var(--color-primary-rgb),0.4)]">
                            <Navigation className="w-4.5 h-4.5 text-white" />
                          </div>
                          <div className="text-left flex-1">
                            <p className="font-semibold text-stone-800 text-sm">
                              {pickedLocation ? 'Change Location' : 'Use Current Location'}
                            </p>
                            <p className="text-xs text-stone-500">
                              {pickedLocation ? `${pickedLocation.city}, ${pickedLocation.pincode}` : 'Detect or search for your address'}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-stone-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                        </button>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <FieldLabel>Full Name *</FieldLabel>
                            <input type="text" name="name" value={formData.name} onChange={handleChange} required placeholder="Jane Doe" className={inputCls} />
                          </div>
                          <div>
                            <FieldLabel>Phone *</FieldLabel>
                            <input type="tel" name="phone" value={formData.phone} onChange={handleChange} required placeholder="+91 98765 43210" className={inputCls} />
                          </div>
                          <div>
                            <FieldLabel>Email *</FieldLabel>
                            <input type="email" name="email" value={formData.email} onChange={handleChange} required placeholder="jane@example.com" className={inputCls} />
                          </div>
                          <div>
                            <FieldLabel>PIN Code *</FieldLabel>
                            <input type="text" name="pincode" value={formData.pincode} onChange={handleChange} required maxLength={6} placeholder="700001" className={inputCls} />
                          </div>
                          <div className="sm:col-span-2">
                            <FieldLabel>Street Address *</FieldLabel>
                            <textarea name="address" value={formData.address} onChange={handleChange} required rows={2} placeholder="House no., Building name, Street" className={textareaCls} />
                          </div>
                          <div>
                            <FieldLabel>City *</FieldLabel>
                            <input type="text" name="city" value={formData.city} onChange={handleChange} required placeholder="Kolkata" className={inputCls} />
                          </div>
                          <div>
                            <FieldLabel>State *</FieldLabel>
                            <input type="text" name="state" value={formData.state} onChange={handleChange} required placeholder="West Bengal" className={inputCls} />
                          </div>

                          {/* Address type */}
                          <div className="sm:col-span-2">
                            <FieldLabel>Address Type</FieldLabel>
                            <div className="flex gap-2">
                              {(['Home', 'Work', 'Other'] as const).map((type) => (
                                <button
                                  key={type}
                                  type="button"
                                  onClick={() => setAddressLabel(type)}
                                  className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all duration-200 ${
                                    addressLabel === type
                                      ? 'border-primary bg-primary text-white shadow-sm'
                                      : 'border-stone-200 text-stone-600 hover:border-stone-300 bg-stone-50 hover:bg-stone-100'
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

                          <div className="sm:col-span-2">
                            <FieldLabel>Landmark <span className="normal-case font-normal text-stone-300">(optional)</span></FieldLabel>
                            <input type="text" value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="e.g., Near City Mall, Opposite Park" className={inputCls} />
                          </div>

                          <div className="sm:col-span-2">
                            <FieldLabel>Delivery Instructions <span className="normal-case font-normal text-stone-300">(optional)</span></FieldLabel>
                            <textarea value={deliveryInstructions} onChange={(e) => setDeliveryInstructions(e.target.value)} rows={2} placeholder="e.g., Ring the doorbell twice, Leave at the door" className={textareaCls} />
                          </div>
                        </div>

                        {/* Order for others */}
                        <div className="mt-5">
                          <label className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-100 rounded-2xl cursor-pointer hover:bg-amber-50/80 transition-colors">
                            <div className={`mt-0.5 w-5 h-5 rounded-lg border-2 flex-shrink-0 flex items-center justify-center transition-colors ${orderForOthers ? 'border-amber-500 bg-amber-500' : 'border-stone-300'}`}>
                              {orderForOthers && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                            </div>
                            <input type="checkbox" checked={orderForOthers} onChange={(e) => setOrderForOthers(e.target.checked)} className="sr-only" />
                            <div>
                              <p className="font-semibold text-stone-800 text-sm">Ordering for someone else?</p>
                              <p className="text-xs text-stone-500 mt-0.5">Add receiver details for this delivery</p>
                            </div>
                          </label>

                          {orderForOthers && (
                            <div className="mt-3 p-4 border border-amber-100 rounded-2xl bg-amber-50/40 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in">
                              <div>
                                <FieldLabel>Receiver Name *</FieldLabel>
                                <input type="text" value={receiverName} onChange={(e) => setReceiverName(e.target.value)} required={orderForOthers} placeholder="Full name" className={inputCls} />
                              </div>
                              <div>
                                <FieldLabel>Receiver Phone *</FieldLabel>
                                <input type="tel" value={receiverPhone} onChange={(e) => setReceiverPhone(e.target.value)} required={orderForOthers} placeholder="+91 98765 43210" className={inputCls} />
                              </div>
                              <div className="sm:col-span-2">
                                <FieldLabel>Receiver Address <span className="normal-case font-normal text-stone-300">(if different)</span></FieldLabel>
                                <textarea value={receiverAddress} onChange={(e) => setReceiverAddress(e.target.value)} rows={2} placeholder="Leave blank if same as delivery address" className={textareaCls} />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Save address */}
                        <div className="mt-4">
                          <label className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-2xl cursor-pointer hover:bg-blue-50/80 transition-colors">
                            <div className={`mt-0.5 w-5 h-5 rounded-lg border-2 flex-shrink-0 flex items-center justify-center transition-colors ${saveAddress ? 'border-primary bg-primary' : 'border-stone-300'}`}>
                              {saveAddress && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                            </div>
                            <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} className="sr-only" />
                            <div className="flex-1">
                              <p className="font-semibold text-stone-800 text-sm">Save this address for future orders</p>
                              <p className="text-xs text-stone-500 mt-0.5">Manage saved addresses from your profile</p>
                            </div>
                          </label>
                          {saveAddress && (
                            <div className="mt-3 animate-in">
                              <FieldLabel>Address Label <span className="normal-case font-normal text-stone-300">(optional)</span></FieldLabel>
                              <input
                                type="text"
                                name="addressName"
                                value={formData.addressName}
                                onChange={handleChange}
                                placeholder="e.g., Home, Office, Apartment"
                                className={inputCls}
                              />
                            </div>
                          )}
                        </div>

                        {/* Submit edit */}
                        {editAddressId && (
                          <button
                            type="submit"
                            disabled={loadingAddresses}
                            className="mt-5 w-full py-3.5 bg-primary text-white font-semibold rounded-2xl hover:opacity-90 disabled:opacity-50 transition-all text-sm"
                          >
                            {loadingAddresses ? 'Saving…' : 'Save Changes'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </SectionCard>

                {/* ── PAYMENT ── */}
                <SectionCard>
                  <SectionHeader icon={<CreditCard className="w-5 h-5" />} title="Payment Method" />
                  <div className="px-6 pb-6 space-y-3">

                    {/* COD */}
                    <label className={`pay-card flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer ${
                      formData.paymentMethod === 'cod' ? 'border-primary bg-primary/[0.03]' : 'border-stone-100 hover:border-stone-200 bg-stone-50/50'
                    }`}>
                      <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${formData.paymentMethod === 'cod' ? 'border-primary' : 'border-stone-300'}`}>
                        {formData.paymentMethod === 'cod' && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                      </div>
                      <input type="radio" name="paymentMethod" value="cod" checked={formData.paymentMethod === 'cod'} onChange={handleChange} className="sr-only" />
                      <div className="flex-1">
                        <p className="font-semibold text-stone-800 text-sm">Cash on Delivery</p>
                        <p className="text-xs text-stone-400 mt-0.5">Pay when your order arrives</p>
                      </div>
                      <div className="w-9 h-9 bg-stone-100 rounded-xl flex items-center justify-center">
                        <Truck className="w-4 h-4 text-stone-500" />
                      </div>
                    </label>

                    {/* Online */}
                    <label className={`pay-card flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer ${
                      formData.paymentMethod === 'online' ? 'border-primary bg-primary/[0.03]' : 'border-stone-100 hover:border-stone-200 bg-stone-50/50'
                    }`}>
                      <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${formData.paymentMethod === 'online' ? 'border-primary' : 'border-stone-300'}`}>
                        {formData.paymentMethod === 'online' && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                      </div>
                      <input type="radio" name="paymentMethod" value="online" checked={formData.paymentMethod === 'online'} onChange={handleChange} className="sr-only" />
                      <div className="flex-1">
                        <p className="font-semibold text-stone-800 text-sm">Online Payment</p>
                        <p className="text-xs text-stone-400 mt-0.5">UPI, Cards, Net banking via Razorpay</p>
                      </div>
                      <div className="w-9 h-9 bg-green-50 rounded-xl flex items-center justify-center">
                        <Shield className="w-4 h-4 text-green-600" />
                      </div>
                    </label>

                    {/* Split Payment */}
                    <div
                      className={`pay-card border-2 rounded-2xl overflow-hidden cursor-pointer transition-all ${
                        splitEnabled ? 'border-violet-300 bg-violet-50/40' : 'border-stone-100 hover:border-stone-200 bg-stone-50/50'
                      }`}
                      onClick={handleSplitToggle}
                    >
                      <div className="flex items-center gap-4 p-4">
                        <div className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                          splitEnabled ? 'border-violet-500 bg-violet-500' : 'border-stone-300'
                        }`}>
                          {splitEnabled && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-stone-800 text-sm">Split Payment</p>
                            {splitEnabled && <span className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">Active</span>}
                          </div>
                          <p className="text-xs text-stone-400 mt-0.5">Pay part in Cash, part via UPI</p>
                        </div>
                        <div className="w-9 h-9 bg-violet-50 rounded-xl flex items-center justify-center">
                          <CreditCard className="w-4 h-4 text-violet-500" />
                        </div>
                      </div>

                      {splitEnabled && (
                        <div className="px-4 pb-4 pt-0 border-t border-violet-100 animate-in" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-between text-xs text-stone-500 mb-3 pt-3">
                            <span>Total: ₹{finalTotal}</span>
                            {(() => {
                              const total = (parseFloat(splitCashAmount) || 0) + (parseFloat(splitUpiAmount) || 0);
                              const diff = Math.abs(Math.round(total) - finalTotal);
                              return diff <= 1
                                ? <span className="text-green-600 font-semibold flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Balanced</span>
                                : <span className="text-red-500 font-semibold">{Math.round(total) > finalTotal ? `₹${Math.round(total) - finalTotal} over` : `₹${finalTotal - Math.round(total)} short`}</span>;
                            })()}
                          </div>
                          <div className="space-y-2">
                            {[
                              { label: '💵 Cash', value: splitCashAmount, onChange: handleSplitCashChange },
                              { label: '📱 UPI', value: splitUpiAmount, onChange: handleSplitUpiChange }
                            ].map(({ label, value, onChange }) => (
                              <div key={label} className="flex items-center gap-3 bg-white p-3 rounded-xl border border-stone-100">
                                <span className="text-sm">{label.split(' ')[0]}</span>
                                <span className="text-xs font-medium text-stone-600 flex-1">{label.split(' ')[1]}</span>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-xs font-medium">₹</span>
                                  <input
                                    type="number"
                                    value={value}
                                    onChange={(e) => onChange(e.target.value)}
                                    min="0"
                                    max={finalTotal}
                                    placeholder="0"
                                    className="w-24 pl-7 pr-3 py-2 border border-stone-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all bg-stone-50 focus:bg-white"
                                    onClick={e => e.stopPropagation()}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </SectionCard>

                {/* ── TIP ── */}
                <SectionCard>
                  <div className="px-6 pt-6 pb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <Heart className="w-5 h-5 text-rose-400" />
                      <h2 className="text-base font-bold text-stone-800 font-display">Add a Tip</h2>
                      <span className="text-xs text-stone-400 font-normal">(optional)</span>
                    </div>
                    <p className="text-xs text-stone-400 mb-5">Show some love to your delivery partner 💛</p>

                    <div className="grid grid-cols-4 gap-2 mb-3">
                      {[5, 10, 15, 20].map((amount) => (
                        <button
                          key={amount}
                          type="button"
                          onClick={() => handleTipSelect(amount)}
                          className={`tip-btn py-3 rounded-2xl text-sm font-bold transition-all duration-200 ${
                            selectedTip === amount.toString()
                              ? 'bg-rose-400 text-white shadow-[0_4px_12px_-2px_rgba(251,113,133,0.5)] active'
                              : 'bg-stone-50 text-stone-700 hover:bg-rose-50 hover:text-rose-500 border border-stone-100'
                          }`}
                        >
                          ₹{amount}
                        </button>
                      ))}
                    </div>
                    <div className="relative mb-4">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400 text-sm font-medium">₹</span>
                      <input
                        type="number"
                        value={customTip}
                        onChange={handleCustomTipChange}
                        min="0"
                        step="1"
                        placeholder="Custom amount"
                        className={`${inputCls} pl-8`}
                      />
                    </div>
                  </div>
                </SectionCard>

                {/* ── GSTIN ── */}
                <SectionCard>
                  <div className="px-6 py-5">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <div className={`mt-0.5 w-5 h-5 rounded-lg border-2 flex-shrink-0 flex items-center justify-center transition-colors ${gstinEnabled ? 'border-primary bg-primary' : 'border-stone-300'}`}>
                        {gstinEnabled && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <input type="checkbox" checked={gstinEnabled} onChange={(e) => setGstinEnabled(e.target.checked)} className="sr-only" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-stone-800 text-sm">Add GSTIN</p>
                          <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">Business</span>
                        </div>
                        <p className="text-xs text-stone-400 mt-0.5">Claim GST credit up to 18% on the order</p>
                      </div>
                    </label>

                    {gstinEnabled && (
                      <div className="mt-5 space-y-4 pt-5 border-t border-stone-100 animate-in">
                        <div>
                          <FieldLabel>GSTIN Number *</FieldLabel>
                          <input
                            type="text"
                            value={gstin}
                            onChange={(e) => setGstin(e.target.value.toUpperCase())}
                            maxLength={15}
                            placeholder="22AAAAA0000A1Z5"
                            className={`${inputCls} font-mono tracking-wider`}
                          />
                          <p className="text-xs text-stone-400 mt-1.5">Enter your 15-digit GSTIN</p>
                        </div>
                        <div>
                          <FieldLabel>Registered Business Name *</FieldLabel>
                          <input
                            type="text"
                            value={businessName}
                            onChange={(e) => setBusinessName(e.target.value)}
                            placeholder="Your Company Name Pvt Ltd"
                            className={inputCls}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </SectionCard>

              </div>{/* end left col */}

              {/* ════════════════ RIGHT COLUMN — ORDER SUMMARY ════════════════ */}
              <div className="lg:w-[380px] flex-shrink-0 w-full">
                <div className="bg-white rounded-3xl border border-stone-100 shadow-[0_2px_24px_-4px_rgba(0,0,0,0.10)] sticky top-24 overflow-hidden">

                  {/* Header */}
                  <div className="px-6 pt-6 pb-4 border-b border-stone-50">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
                        <ShoppingBag className="w-4.5 h-4.5 text-primary" />
                      </div>
                      <div>
                        <h2 className="font-bold text-stone-900 font-display">Order Summary</h2>
                        <p className="text-xs text-stone-400">{cartItems.length} item{cartItems.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  </div>

                  {cartItems.length === 0 ? (
                    <div className="text-center py-16 px-6">
                      <div className="w-14 h-14 bg-stone-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                        <ShoppingBag className="w-7 h-7 text-stone-300" />
                      </div>
                      <p className="text-stone-400 text-sm font-medium">Your cart is empty</p>
                    </div>
                  ) : (
                    <>
                      {/* Cart items */}
                      <div className="px-6 py-4 space-y-3 max-h-64 overflow-y-auto">
                        {cartItems.map(item => (
                          <div key={item.id} className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-stone-50 border border-stone-100">
                              <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-stone-800 truncate">{item.name}</p>
                              <p className="text-xs text-stone-400">₹{Math.round(item.price)} × {item.quantity}</p>
                            </div>
                            {/* Qty controls */}
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => item.quantity > 1 ? updateCartQuantity(item.id, item.quantity - 1, item.isLoose) : removeFromCart(item.id, item.isLoose)}
                                className="w-7 h-7 rounded-lg border border-stone-200 flex items-center justify-center hover:bg-stone-50 hover:border-stone-300 transition-colors text-stone-500 font-bold text-sm leading-none"
                              >−</button>
                              <span className="text-sm font-bold text-stone-800 w-5 text-center">{item.quantity}</span>
                              <button
                                type="button"
                                onClick={() => updateCartQuantity(item.id, item.quantity + 1, item.isLoose)}
                                className="w-7 h-7 rounded-lg border border-stone-200 flex items-center justify-center hover:bg-stone-50 hover:border-stone-300 transition-colors text-stone-500 font-bold text-sm leading-none"
                              >+</button>
                            </div>
                            <p className="text-sm font-bold text-stone-900 w-14 text-right">₹{Math.round(item.price * item.quantity)}</p>
                          </div>
                        ))}
                      </div>

                      {/* Divider */}
                      <div className="mx-6 border-t border-dashed border-stone-100" />

                      {/* Totals */}
                      <div className="px-6 py-4 space-y-2.5">
                        {[
                          { label: 'Taxable Value', val: `₹${Math.round(checkoutTotals.itemsTaxableValue)}` },
                          { label: 'GST (5%)', val: `₹${checkoutTotals.itemsGST.total.toFixed(2)}` },
                          { label: 'Platform Fee', val: `₹${checkoutTotals.platformFeeTotal.toFixed(2)}` },
                          { label: 'Handling Fee', val: `₹${checkoutTotals.handlingFeeTotal.toFixed(2)}` },
                        ].map(({ label, val }) => (
                          <div key={label} className="flex justify-between text-sm text-stone-500">
                            <span>{label}</span>
                            <span className="font-semibold text-stone-700">{val}</span>
                          </div>
                        ))}

                        <div className="flex justify-between text-sm text-stone-500">
                          <span>Delivery</span>
                          <span className={`font-semibold ${checkoutTotals.deliveryFee === 0 ? 'text-green-600' : 'text-stone-700'}`}>
                            {checkoutTotals.deliveryFee === 0 ? '🎉 Free' : `₹${checkoutTotals.deliveryFee}`}
                          </span>
                        </div>

                        {checkoutTotals.discount > 0 && (
                          <div className="flex justify-between text-sm text-green-600">
                            <span>Discount</span>
                            <span className="font-semibold">−₹{Math.round(checkoutTotals.discount)}</span>
                          </div>
                        )}
                        {tipAmount > 0 && (
                          <div className="flex justify-between text-sm text-rose-500">
                            <span>Tip 💛</span>
                            <span className="font-semibold">₹{Math.round(tipAmount)}</span>
                          </div>
                        )}

                        <div className="flex justify-between items-center pt-3 border-t border-stone-100">
                          <span className="font-bold text-stone-900 font-display">Total</span>
                          <span className="text-2xl font-bold text-primary font-display">₹{finalTotal}</span>
                        </div>

                        {splitEnabled && (
                          <div className="pt-3 border-t border-violet-100 space-y-1.5">
                            <p className="text-[10px] font-bold text-violet-600 uppercase tracking-widest mb-2">Split Breakdown</p>
                            <div className="flex justify-between text-sm text-stone-500">
                              <span>💵 Cash</span>
                              <span className="font-semibold text-green-700">₹{splitCashAmount || '0'}</span>
                            </div>
                            <div className="flex justify-between text-sm text-stone-500">
                              <span>📱 UPI</span>
                              <span className="font-semibold text-violet-600">₹{splitUpiAmount || '0'}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* CTA */}
                      <div className="px-6 pb-6">
                        <button
                          type="submit"
                          disabled={loading || cartItems.length === 0}
                          className={`place-btn w-full py-4 px-6 bg-primary text-white font-bold rounded-2xl flex items-center justify-center gap-2.5 text-sm shadow-[0_4px_16px_-4px_rgba(var(--color-primary-rgb),0.5)] ${
                            loading || cartItems.length === 0 ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                        >
                          {loading ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Processing…
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4" />
                              Place Order · ₹{finalTotal}
                            </>
                          )}
                        </button>

                        <div className="flex items-center justify-center gap-1.5 mt-3">
                          <Shield className="w-3.5 h-3.5 text-green-500" />
                          <span className="text-xs text-stone-400">Secure & encrypted checkout</span>
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