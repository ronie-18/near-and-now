# 📡 Tracking System - API Reference

Quick reference for all tracking-related functions and interfaces.

---

## 🔷 TypeScript Interfaces

### DeliveryAgent
```typescript
interface DeliveryAgent {
  id: string;
  name: string;
  phone: string;
  email?: string;
  vehicle_type?: 'bike' | 'scooter' | 'car' | 'bicycle' | 'on_foot';
  vehicle_number?: string;
  current_latitude?: number;
  current_longitude?: number;
  is_active: boolean;
  is_available: boolean;
  rating?: number;
  total_deliveries?: number;
  created_at: string;
  updated_at?: string;
}
```

### TrackingUpdate
```typescript
interface TrackingUpdate {
  id: string;
  order_id: string;
  delivery_agent_id?: string;
  status: 'order_placed' | 'order_confirmed' | 'preparing' | 
          'ready_for_pickup' | 'agent_assigned' | 'picked_up' | 
          'in_transit' | 'nearby' | 'arrived' | 'delivered' | 
          'failed' | 'cancelled';
  latitude?: number;
  longitude?: number;
  location_name?: string;
  notes?: string;
  updated_by: string;
  timestamp: string;
  created_at: string;
}
```

### AgentLocation
```typescript
interface AgentLocation {
  id: string;
  agent_id: string;
  order_id?: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  timestamp: string;
}
```

---

## 📚 Service Functions

### 1. Get Order Tracking

**Function:** `getOrderTracking(orderId: string)`

**Description:** Fetch complete tracking information for an order

**Parameters:**
- `orderId` (string) - The order UUID

**Returns:**
```typescript
Promise<{
  order: Order;
  agent?: DeliveryAgent;
  tracking_updates: TrackingUpdate[];
  current_location?: AgentLocation;
}>
```

**Example:**
```typescript
import { getOrderTracking } from './services/supabase';

const trackingData = await getOrderTracking('order-uuid-here');
console.log(trackingData.order);
console.log(trackingData.agent);
console.log(trackingData.tracking_updates);
```

**Use Case:** Display tracking page for logged-in user

---

### 2. Get Order Tracking by Number

**Function:** `getOrderTrackingByNumber(trackingNumber: string)`

**Description:** Track order using tracking number (public access)

**Parameters:**
- `trackingNumber` (string) - Format: `TRACK-YYYYMMDD-XXXX`

**Returns:** Same as `getOrderTracking()`

**Example:**
```typescript
import { getOrderTrackingByNumber } from './services/supabase';

const trackingData = await getOrderTrackingByNumber('TRACK-20260112-0001');
```

**Use Case:** Public tracking link without login

---

### 3. Subscribe to Order Tracking

**Function:** `subscribeToOrderTracking(orderId: string, callback: Function)`

**Description:** Real-time subscription for order status updates

**Parameters:**
- `orderId` (string) - The order UUID
- `callback` (function) - Called when new update arrives

**Returns:** Unsubscribe function

**Example:**
```typescript
import { subscribeToOrderTracking } from './services/supabase';

const unsubscribe = subscribeToOrderTracking(orderId, (update) => {
  console.log('New status:', update.status);
  console.log('Notes:', update.notes);
  // Update UI with new status
});

// Later, cleanup:
unsubscribe();
```

**Use Case:** Live status updates on tracking page

---

### 4. Subscribe to Agent Location

**Function:** `subscribeToAgentLocation(agentId: string, orderId: string, callback: Function)`

**Description:** Real-time subscription for agent GPS location

**Parameters:**
- `agentId` (string) - The agent UUID
- `orderId` (string) - The order UUID
- `callback` (function) - Called when location updates

**Returns:** Unsubscribe function

**Example:**
```typescript
import { subscribeToAgentLocation } from './services/supabase';

const unsubscribe = subscribeToAgentLocation(agentId, orderId, (location) => {
  console.log('Lat:', location.latitude);
  console.log('Lng:', location.longitude);
  console.log('Speed:', location.speed);
  // Update map marker
});

// Cleanup
unsubscribe();
```

**Use Case:** Live agent location on map

---

### 5. Add Tracking Update

**Function:** `addTrackingUpdate(orderId: string, status: string, options?: object)`

**Description:** Add a new tracking status update

**Parameters:**
- `orderId` (string) - The order UUID
- `status` (string) - One of the tracking statuses
- `options` (object, optional):
  - `latitude` (number)
  - `longitude` (number)
  - `location_name` (string)
  - `notes` (string)
  - `updated_by` (string) - 'customer', 'agent', 'admin', 'system'

**Returns:** `Promise<TrackingUpdate>`

**Example:**
```typescript
import { addTrackingUpdate } from './services/supabase';

await addTrackingUpdate(orderId, 'in_transit', {
  latitude: 28.6139,
  longitude: 77.2090,
  location_name: 'Near Connaught Place',
  notes: 'On the way to your location!',
  updated_by: 'agent'
});
```

**Use Case:** Agent updates order status

---

### 6. Update Agent Location

**Function:** `updateAgentLocation(agentId: string, latitude: number, longitude: number, orderId?: string, options?: object)`

**Description:** Update agent's GPS location

**Parameters:**
- `agentId` (string) - The agent UUID
- `latitude` (number) - GPS latitude
- `longitude` (number) - GPS longitude
- `orderId` (string, optional) - Current order UUID
- `options` (object, optional):
  - `accuracy` (number) - GPS accuracy in meters
  - `speed` (number) - Speed in km/h
  - `heading` (number) - Direction in degrees (0-360)

**Returns:** `Promise<void>`

**Example:**
```typescript
import { updateAgentLocation } from './services/supabase';

// Called from agent's GPS
await updateAgentLocation(
  agentId,
  28.6139,
  77.2090,
  orderId,
  {
    accuracy: 10,
    speed: 25,
    heading: 180
  }
);
```

**Use Case:** Agent app sends GPS updates every 30 seconds

---

### 7. Get Available Agents

**Function:** `getAvailableAgents()`

**Description:** Get all active and available delivery agents

**Parameters:** None

**Returns:** `Promise<DeliveryAgent[]>`

**Example:**
```typescript
import { getAvailableAgents } from './services/supabase';

const agents = await getAvailableAgents();
console.log(`${agents.length} agents available`);

agents.forEach(agent => {
  console.log(`${agent.name} - ${agent.vehicle_type}`);
});
```

**Use Case:** Admin assigns agent to order

---

### 8. Assign Delivery Agent

**Function:** `assignDeliveryAgent(orderId: string, agentId: string, estimatedDeliveryTime?: Date)`

**Description:** Assign a delivery agent to an order

**Parameters:**
- `orderId` (string) - The order UUID
- `agentId` (string) - The agent UUID
- `estimatedDeliveryTime` (Date, optional) - Estimated delivery time

**Returns:** `Promise<void>`

**Example:**
```typescript
import { assignDeliveryAgent } from './services/supabase';

// Assign agent with 1-hour delivery estimate
await assignDeliveryAgent(
  orderId,
  agentId,
  new Date(Date.now() + 60 * 60 * 1000)
);
```

**Use Case:** Admin or system assigns agent to new order

---

## 🗄️ Database Functions

### generate_tracking_number()

**SQL Function:** Auto-generates tracking number

**Format:** `TRACK-YYYYMMDD-XXXX`

**Example:**
```sql
SELECT generate_tracking_number();
-- Returns: TRACK-20260112-0001
```

---

### update_agent_location()

**SQL Function:** Updates agent location and records history

**Parameters:**
- `p_agent_id` (UUID)
- `p_latitude` (DECIMAL)
- `p_longitude` (DECIMAL)
- `p_order_id` (UUID, optional)
- `p_accuracy` (DECIMAL, optional)
- `p_speed` (DECIMAL, optional)
- `p_heading` (DECIMAL, optional)

**Example:**
```sql
SELECT update_agent_location(
  'agent-uuid'::uuid,
  28.6139,
  77.2090,
  'order-uuid'::uuid,
  10.5,
  25.0,
  180.0
);
```

---

### add_tracking_update()

**SQL Function:** Adds tracking update and updates order status

**Parameters:**
- `p_order_id` (UUID)
- `p_status` (TEXT)
- `p_latitude` (DECIMAL, optional)
- `p_longitude` (DECIMAL, optional)
- `p_location_name` (TEXT, optional)
- `p_notes` (TEXT, optional)
- `p_updated_by` (TEXT, default: 'system')

**Example:**
```sql
SELECT add_tracking_update(
  'order-uuid'::uuid,
  'in_transit',
  28.6139,
  77.2090,
  'Near Connaught Place',
  'On the way!',
  'agent'
);
```

---

## 🔐 Security & RLS Policies

### delivery_agents Table
- ✅ Public can view active agents
- ✅ Agents can update their own location

### order_tracking Table
- ✅ Users can view tracking for their orders
- ✅ Public can view with valid tracking number

### agent_location_history Table
- ✅ Users can view location history for their orders

---

## 🚀 Quick Implementation Guide

### Basic Tracking Page
```typescript
import { useState, useEffect } from 'react';
import { getOrderTracking, subscribeToOrderTracking } from './services/supabase';

function TrackingPage({ orderId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    // Load initial data
    getOrderTracking(orderId).then(setData);

    // Subscribe to updates
    const unsubscribe = subscribeToOrderTracking(orderId, (update) => {
      console.log('New update:', update);
      // Refresh data or update state
    });

    return unsubscribe;
  }, [orderId]);

  return (
    <div>
      <h1>Order: {data?.order?.order_number}</h1>
      <p>Status: {data?.tracking_updates?.[0]?.status}</p>
      {data?.agent && <p>Agent: {data.agent.name}</p>}
    </div>
  );
}
```

### Agent Location Updates (Agent App)
```typescript
// In agent mobile app
import { updateAgentLocation } from './services/supabase';

// Get GPS location every 30 seconds
setInterval(async () => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(async (position) => {
      await updateAgentLocation(
        agentId,
        position.coords.latitude,
        position.coords.longitude,
        currentOrderId,
        {
          accuracy: position.coords.accuracy,
          speed: position.coords.speed || 0,
          heading: position.coords.heading || 0
        }
      );
    });
  }
}, 30000); // Every 30 seconds
```

### Admin: Assign Agent
```typescript
import { getAvailableAgents, assignDeliveryAgent } from './services/supabase';

async function assignAgentToOrder(orderId) {
  // Get available agents
  const agents = await getAvailableAgents();
  
  if (agents.length === 0) {
    alert('No agents available');
    return;
  }

  // Assign first available agent
  const agent = agents[0];
  
  // Estimate 1 hour delivery
  const estimatedTime = new Date(Date.now() + 60 * 60 * 1000);
  
  await assignDeliveryAgent(orderId, agent.id, estimatedTime);
  
  alert(`Assigned ${agent.name} to order`);
}
```

---

## 📊 Status Flow

```
order_placed
    ↓
order_confirmed
    ↓
preparing
    ↓
ready_for_pickup
    ↓
agent_assigned
    ↓
picked_up
    ↓
in_transit
    ↓
nearby (< 1km)
    ↓
arrived
    ↓
delivered ✅
```

Alternative flows:
- `cancelled` - Order cancelled
- `failed` - Delivery failed

---

## 🧪 Testing Commands

### Test in Browser Console
```javascript
// Import functions
import { getOrderTracking, addTrackingUpdate } from './services/supabase';

// Get tracking data
const data = await getOrderTracking('your-order-id');
console.log(data);

// Add update
await addTrackingUpdate('your-order-id', 'in_transit', {
  notes: 'Test update from console'
});
```

### Test in Supabase SQL Editor
```sql
-- View all tracking updates
SELECT * FROM order_tracking ORDER BY timestamp DESC LIMIT 10;

-- View agent locations
SELECT * FROM agent_location_history ORDER BY timestamp DESC LIMIT 10;

-- View available agents
SELECT * FROM delivery_agents WHERE is_active = true AND is_available = true;
```

---

## 💡 Best Practices

1. **Location Updates:** Send every 30-60 seconds (not too frequent)
2. **Status Updates:** Add meaningful notes for customers
3. **Error Handling:** Always wrap in try-catch blocks
4. **Cleanup:** Unsubscribe from real-time channels on unmount
5. **Privacy:** Never expose customer address to unauthorized users
6. **Performance:** Use indexes for location queries

---

## 🔗 Related Files

- `supabase/tracking-schema.sql` - Database schema
- `src/pages/TrackOrderPage.tsx` - Tracking page component
- `src/services/supabase.ts` - Service functions
- `TRACKING_SETUP_GUIDE.md` - Setup instructions
- `TRACKING_IMPLEMENTATION_SUMMARY.md` - Overview

---

**Quick Reference Complete! 🎉**
