# Implementation Example: Distance-Based Fees in CheckoutPage

## Step-by-Step Guide

### 1. Update CheckoutPage.tsx Imports

Add these imports at the top of the file:

```typescript
import { calculateDistance, calculateFeeBreakdown } from '../utils/deliveryFees';
import { useLocation } from '../context/LocationContext';
```

### 2. Add Location Hook in CheckoutPage Component

Inside the `CheckoutPage` component, after existing hooks:

```typescript
const { userLocation } = useLocation();
```

### 3. Replace the calculateOrderTotals Function Call

Find this line (around line 673):
```typescript
const { deliveryFee, discount, orderTotal } = calculateOrderTotals(cartTotal);
```

Replace with:

```typescript
// Get user coordinates from selected address or location context
let userLat = userLocation?.latitude;
let userLng = userLocation?.longitude;

if (selectedAddressId) {
  const selectedAddr = savedAddresses.find(a => a.id === selectedAddressId);
  if (selectedAddr?.latitude && selectedAddr?.longitude) {
    userLat = selectedAddr.latitude;
    userLng = selectedAddr.longitude;
  }
}

if (!userLat && !userLng && pickedLocation) {
  userLat = pickedLocation.lat;
  userLng = pickedLocation.lng;
}

// TODO: Get nearest store coordinates from cart items
// For now, you can use a default store or implement store selection logic
const storeLat = undefined; // Replace with actual store latitude
const storeLng = undefined; // Replace with actual store longitude

const { deliveryFee, platformFee: calcPlatformFee, handlingFee: calcHandlingFee, discount, orderTotal, distance } = calculateOrderTotals(
  cartTotal,
  userLat,
  userLng,
  storeLat,
  storeLng
);
```

### 4. Update Order Summary Display

Find the order summary section (around line 1570-1593) and replace with:

```typescript
<div className="border-t-2 border-gray-100 pt-4 space-y-3">
  <div className="flex justify-between text-gray-600">
    <span>Subtotal</span>
    <span className="font-semibold">₹{Math.round(cartTotal)}</span>
  </div>

  <div className="flex justify-between text-gray-600">
    <span>Delivery Fee{distance > 0 ? ` (${distance.toFixed(1)}km)` : ''}</span>
    <span className="font-semibold">₹{Math.round(deliveryFee)}</span>
  </div>

  {calcPlatformFee > 0 && (
    <div className="flex justify-between text-gray-600">
      <span>Platform Fee</span>
      <span className="font-semibold">₹{calcPlatformFee.toFixed(2)}</span>
    </div>
  )}

  {calcHandlingFee > 0 && (
    <div className="flex justify-between text-gray-600">
      <span>Handling Fee</span>
      <span className="font-semibold">₹{calcHandlingFee.toFixed(2)}</span>
    </div>
  )}

  {discount > 0 && (
    <div className="flex justify-between text-green-600">
      <span>Discount</span>
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
```

## Quick Implementation for CartPage.tsx

### 1. Add Imports

```typescript
import { useLocation } from '../context/LocationContext';
```

### 2. Use Location Hook

```typescript
const { userLocation } = useLocation();
const { getFeeBreakdown, platformFee, handlingFee } = useCart();
```

### 3. Calculate Fees with Distance

```typescript
// Calculate distance to nearest store (you'll need to implement store selection)
const calculateFeesForCart = () => {
  if (!userLocation) {
    return {
      deliveryFee: cartTotal > 500 ? 0 : 40,
      platformFee: 0,
      handlingFee: 0
    };
  }
  
  // TODO: Get nearest store from cart items
  const storeLat = undefined; // Replace with actual
  const storeLng = undefined; // Replace with actual
  
  if (storeLat && storeLng) {
    const distance = calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      storeLat,
      storeLng
    );
    const breakdown = getFeeBreakdown(distance);
    return breakdown || { deliveryFee: 0, platformFee: 0, handlingFee: 0 };
  }
  
  return { deliveryFee: cartTotal > 500 ? 0 : 40, platformFee: 0, handlingFee: 0 };
};

const fees = calculateFeesForCart();
```

### 4. Update Order Summary Display

Replace the delivery fee section (around line 189-192) with:

```typescript
<div className="flex justify-between text-gray-600">
  <span>Delivery Fee</span>
  <span>{fees.deliveryFee === 0 ? 'Free' : formatPrice(fees.deliveryFee)}</span>
</div>

{fees.platformFee > 0 && (
  <div className="flex justify-between text-gray-600">
    <span>Platform Fee</span>
    <span>{formatPrice(fees.platformFee)}</span>
  </div>
)}

{fees.handlingFee > 0 && (
  <div className="flex justify-between text-gray-600">
    <span>Handling Fee</span>
    <span>{formatPrice(fees.handlingFee)}</span>
  </div>
)}
```

## Important Notes

1. **Store Selection Logic**: You need to implement logic to determine which store(s) the cart items come from. This could be:
   - Single store: Use that store's coordinates
   - Multiple stores: Calculate fees per store or use nearest store
   - Store data should include latitude/longitude

2. **Product Schema**: Ensure products have `store_latitude` and `store_longitude` fields

3. **Testing**: Test with various distances to ensure fees calculate correctly

4. **Fallback**: The code includes fallback to legacy calculation if location is not available

## Next Implementation Priority

1. ✅ LocationContext - DONE
2. ✅ Fee calculation utilities - DONE  
3. ✅ CartContext updates - DONE
4. ✅ App.tsx LocationProvider - DONE
5. 🔄 CheckoutPage updates - Use this guide
6. 🔄 CartPage updates - Use this guide
7. ⏳ HomePage location prompt
8. ⏳ Product filtering by distance
