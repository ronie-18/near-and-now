# Distance-Based Delivery Fee Implementation Guide

## Overview
This document outlines the implementation of distance-based delivery fees for the Near & Now application.

## Revenue Plan (April & May)

### Fee Structure
- **Platform Fee**: ₹9.50 (fixed)
- **Handling Fee**: ₹5.50 (fixed)
- **Delivery Fee** (distance-based):
  - 0-1 km: ₹15
  - 1-2 km: ₹20
  - 2-3 km: ₹25
  - 3-4 km: ₹30 (exceptional, maximum range)

### Product Display Logic
- **Default Display**: Products within 2km of user location
- **Extended Range**: Products up to 4km can be ordered (with higher delivery fee)
- **Location Required**: User must set location on first app visit

## Implementation Status

### ✅ Completed

1. **Utility Functions** (`frontend/src/utils/deliveryFees.ts`)
   - `calculateDeliveryFee(distanceKm)` - Returns delivery fee based on distance
   - `calculateFeeBreakdown(distanceKm)` - Returns complete fee breakdown
   - `calculateDistance(lat1, lon1, lat2, lon2)` - Haversine formula for distance calculation
   - Constants: `PLATFORM_FEE`, `HANDLING_FEE`, `DEFAULT_PRODUCT_RADIUS_KM`, `MAX_DELIVERY_RANGE_KM`

2. **Location Context** (`frontend/src/context/LocationContext.tsx`)
   - Manages user location state
   - Persists location to localStorage
   - Provides `calculateDistanceToStore()` helper
   - Integrated into App.tsx

3. **Cart Context Updates** (`frontend/src/context/CartContext.tsx`)
   - Added `getFeeBreakdown(distanceKm)` method
   - Updated `getDeliveryFee(distanceKm)` to support distance-based calculation
   - Exposed `platformFee` and `handlingFee` constants
   - Maintains backward compatibility with legacy fee calculation

4. **App.tsx**
   - Added `LocationProvider` wrapper
   - Location context available throughout the app

### 🔄 Pending Implementation

#### 1. Update CheckoutPage (`frontend/src/pages/CheckoutPage.tsx`)

**Required Changes:**

```typescript
// Import the utilities
import { calculateDistance, calculateFeeBreakdown } from '../utils/deliveryFees';
import { useLocation } from '../context/LocationContext';

// Inside CheckoutPage component:
const { userLocation } = useLocation();

// Calculate fees with distance
const calculateOrderTotalsWithDistance = () => {
  let userLat = userLocation?.latitude;
  let userLng = userLocation?.longitude;
  
  // Get from selected address if available
  if (selectedAddressId) {
    const addr = savedAddresses.find(a => a.id === selectedAddressId);
    if (addr?.latitude && addr?.longitude) {
      userLat = addr.latitude;
      userLng = addr.longitude;
    }
  }
  
  // Get nearest store coordinates (implement store selection logic)
  const storeLat = /* nearest store latitude */;
  const storeLng = /* nearest store longitude */;
  
  if (userLat && userLng && storeLat && storeLng) {
    const distance = calculateDistance(userLat, userLng, storeLat, storeLng);
    const fees = calculateFeeBreakdown(distance);
    return {
      subtotal: cartTotal,
      deliveryFee: fees.deliveryFee,
      platformFee: fees.platformFee,
      handlingFee: fees.handlingFee,
      distance: distance,
      total: cartTotal + fees.totalFees
    };
  }
  
  // Fallback to legacy calculation
  return {
    subtotal: cartTotal,
    deliveryFee: cartTotal > 500 ? 0 : 40,
    platformFee: 0,
    handlingFee: 0,
    distance: 0,
    total: cartTotal + (cartTotal > 500 ? 0 : 40)
  };
};

// Update Order Summary Display:
<div className="flex justify-between text-gray-600">
  <span>Delivery Fee{distance > 0 ? ` (${distance.toFixed(1)}km)` : ''}</span>
  <span className="font-semibold">₹{Math.round(deliveryFee)}</span>
</div>

{platformFee > 0 && (
  <div className="flex justify-between text-gray-600">
    <span>Platform Fee</span>
    <span className="font-semibold">₹{platformFee.toFixed(2)}</span>
  </div>
)}

{handlingFee > 0 && (
  <div className="flex justify-between text-gray-600">
    <span>Handling Fee</span>
    <span className="font-semibold">₹{handlingFee.toFixed(2)}</span>
  </div>
)}
```

#### 2. Update CartPage (`frontend/src/pages/CartPage.tsx`)

**Required Changes:**

```typescript
import { useLocation } from '../context/LocationContext';
import { useCart } from '../context/CartContext';

const { userLocation } = useLocation();
const { getFeeBreakdown, platformFee, handlingFee } = useCart();

// Calculate distance to nearest store
const distance = /* calculate based on cart items and user location */;
const feeBreakdown = getFeeBreakdown(distance);

// Display in Order Summary:
{feeBreakdown && (
  <>
    <div className="flex justify-between text-gray-600">
      <span>Delivery Fee ({distance.toFixed(1)}km)</span>
      <span>₹{feeBreakdown.deliveryFee}</span>
    </div>
    <div className="flex justify-between text-gray-600">
      <span>Platform Fee</span>
      <span>₹{feeBreakdown.platformFee.toFixed(2)}</span>
    </div>
    <div className="flex justify-between text-gray-600">
      <span>Handling Fee</span>
      <span>₹{feeBreakdown.handlingFee.toFixed(2)}</span>
    </div>
  </>
)}
```

#### 3. Update HomePage - Location Prompt

**Add location prompt on first visit:**

```typescript
import { useLocation } from '../context/LocationContext';
import LocationPicker from '../components/location/LocationPicker';

const { userLocation, setUserLocation, isLocationSet } = useLocation();
const [showLocationModal, setShowLocationModal] = useState(!isLocationSet);

// Show LocationPicker modal if location not set
<LocationPicker
  isOpen={showLocationModal}
  onClose={() => setShowLocationModal(false)}
  onLocationSelect={(location) => {
    setUserLocation({
      latitude: location.lat,
      longitude: location.lng,
      address: location.address,
      city: location.city,
      state: location.state,
      pincode: location.pincode
    });
    setShowLocationModal(false);
  }}
/>
```

#### 4. Update Product Filtering Logic

**Filter products by distance (2km default, 4km max):**

```typescript
import { useLocation } from '../context/LocationContext';
import { calculateDistance, DEFAULT_PRODUCT_RADIUS_KM, MAX_DELIVERY_RANGE_KM } from '../utils/deliveryFees';

const { userLocation } = useLocation();

// Filter products based on store distance
const filterProductsByDistance = (products) => {
  if (!userLocation) return products;
  
  return products.filter(product => {
    if (!product.store_latitude || !product.store_longitude) return true;
    
    const distance = calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      product.store_latitude,
      product.store_longitude
    );
    
    // Show products within 2km by default, up to 4km max
    return distance <= DEFAULT_PRODUCT_RADIUS_KM;
  });
};

// For extended search (show all within 4km):
const showExtendedRange = () => {
  return products.filter(product => {
    const distance = calculateDistance(...);
    return distance <= MAX_DELIVERY_RANGE_KM;
  });
};
```

#### 5. Backend Updates (Optional but Recommended)

**Update database schema to store fees:**

```sql
-- Add columns to customer_orders table
ALTER TABLE customer_orders 
ADD COLUMN platform_fee DECIMAL(10,2) DEFAULT 0,
ADD COLUMN handling_fee DECIMAL(10,2) DEFAULT 0,
ADD COLUMN delivery_distance_km DECIMAL(10,2);

-- Update order creation to include new fees
```

**Update order creation API:**

```typescript
// backend/src/services/database.service.ts
async createCustomerOrder(orderData: {
  // ... existing fields
  platform_fee?: number;
  handling_fee?: number;
  delivery_distance_km?: number;
}) {
  const { data, error } = await supabase
    .from('customer_orders')
    .insert({
      // ... existing fields
      platform_fee: orderData.platform_fee || 0,
      handling_fee: orderData.handling_fee || 0,
      delivery_distance_km: orderData.delivery_distance_km
    });
}
```

## Testing Checklist

- [ ] User can set location on first app visit
- [ ] Products within 2km are displayed by default
- [ ] Delivery fee calculates correctly based on distance:
  - [ ] 0-1km: ₹15
  - [ ] 1-2km: ₹20
  - [ ] 2-3km: ₹25
  - [ ] 3-4km: ₹30
- [ ] Platform fee (₹9.50) displays in checkout
- [ ] Handling fee (₹5.50) displays in checkout
- [ ] Total calculation includes all fees
- [ ] Distance displays in checkout summary
- [ ] Location persists across page refreshes
- [ ] Fallback to legacy fees if location not available
- [ ] Products beyond 4km are not shown

## Migration Notes

### Backward Compatibility
- Legacy fee calculation (`subtotal > 500 ? free : ₹40`) still works if no location is set
- Existing orders are not affected
- New fee structure only applies when user location is available

### User Communication
- Display banner: "Set your location to see accurate delivery fees"
- Show distance and fee breakdown clearly in cart/checkout
- Explain fee structure in Help/FAQ section

## Next Steps

1. Implement CheckoutPage updates
2. Implement CartPage updates  
3. Add location prompt to HomePage
4. Update product filtering logic
5. Test thoroughly with various distances
6. Update backend to store new fee fields
7. Deploy and monitor

## Support

For questions or issues, refer to:
- `frontend/src/utils/deliveryFees.ts` - Fee calculation logic
- `frontend/src/context/LocationContext.tsx` - Location management
- `frontend/src/context/CartContext.tsx` - Cart with fee integration
