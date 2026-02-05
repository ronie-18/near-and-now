# 📦 Order Tracking System - Setup Guide

## 🎉 What's Been Implemented

A comprehensive real-time order tracking system with the following features:

### ✅ Core Features
1. **Real-time GPS tracking** of delivery agents
2. **Interactive Google Maps** showing delivery boy location and destination
3. **Live status updates** with timeline view
4. **Delivery agent information** (name, phone, vehicle, rating)
5. **Order details** with items, shipping address, and totals
6. **WebSocket-based real-time updates** using Supabase Realtime
7. **Tracking by Order ID** or **Tracking Number**

---

## 📁 Files Created/Modified

### New Files
1. **`supabase/tracking-schema.sql`** - Complete database schema for tracking system
2. **`src/pages/TrackOrderPage.tsx`** - Main tracking page with map and timeline
3. **`TRACKING_SETUP_GUIDE.md`** - This setup guide

### Modified Files
1. **`src/services/supabase.ts`** - Added 10+ tracking-related functions
2. **`src/App.tsx`** - Added tracking route: `/track/:orderId`
3. **`src/pages/OrdersPage.tsx`** - Added "Track Order" buttons

---

## 🚀 Setup Instructions

### Step 1: Run Database Schema

1. Open **Supabase Dashboard** → **SQL Editor**
2. Open the file `supabase/tracking-schema.sql`
3. Copy all SQL code and paste into Supabase SQL Editor
4. Click **Run** to execute

**What this creates:**
- `delivery_agents` table - Stores delivery agent/boy information
- `order_tracking` table - Stores status updates and timeline
- `agent_location_history` table - GPS location history
- Database functions for generating tracking numbers and updating locations
- Row Level Security (RLS) policies
- Real-time subscriptions enabled

### Step 2: Verify Tables Created

Run this query in Supabase SQL Editor to verify:

```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('delivery_agents', 'order_tracking', 'agent_location_history');
```

You should see all three tables listed.

### Step 3: Check Sample Data

The schema automatically inserts 5 sample delivery agents. Verify with:

```sql
SELECT id, name, phone, vehicle_type, is_active, is_available 
FROM delivery_agents;
```

### Step 4: Enable Google Maps

The tracking page uses Google Maps API. Ensure your `.env` file has:

```env
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
```

**To get Google Maps API Key:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Maps JavaScript API**
3. Create credentials → API Key
4. Copy the key to your `.env` file

### Step 5: Test the System

1. **Start the development server:**
   ```bash
   npm run dev
   ```

2. **Navigate to Orders Page:**
   - Login to your account
   - Go to `/orders`
   - You should see a **"Track Order"** button on each order

3. **Click "Track Order":**
   - Opens the tracking page at `/track/{orderId}`
   - Shows order status, timeline, and map
   - Displays delivery agent info (if assigned)

---

## 🎮 How to Use the Tracking System

### For Customers

1. **From Orders Page:**
   - Click "Track Order" button on any order
   - View real-time location of delivery agent
   - See order timeline with status updates
   - Contact delivery agent via phone

2. **Direct Link:**
   - Access via: `https://yoursite.com/track/{orderId}`
   - Or use tracking number: `https://yoursite.com/track?tracking=TRACK-20260112-0001`

### For Admin/Delivery Agents

The system provides functions to:

1. **Assign Delivery Agent to Order:**
```typescript
import { assignDeliveryAgent } from './services/supabase';

// Assign agent to order
await assignDeliveryAgent(
  orderId, 
  agentId, 
  new Date(Date.now() + 60 * 60 * 1000) // Est. 1 hour from now
);
```

2. **Add Status Updates:**
```typescript
import { addTrackingUpdate } from './services/supabase';

// Add tracking update
await addTrackingUpdate(orderId, 'in_transit', {
  latitude: 28.6139,
  longitude: 77.2090,
  location_name: 'Near Connaught Place',
  notes: 'On the way to your location',
  updated_by: 'agent'
});
```

3. **Update Agent Location (GPS):**
```typescript
import { updateAgentLocation } from './services/supabase';

// Update agent's current location
await updateAgentLocation(agentId, latitude, longitude, orderId, {
  accuracy: 10, // meters
  speed: 25, // km/h
  heading: 180 // degrees
});
```

---

## 📱 Order Status Flow

The tracking system supports these statuses:

1. **order_placed** - Order has been placed
2. **order_confirmed** - Store confirmed the order
3. **preparing** - Store is preparing the order
4. **ready_for_pickup** - Order is ready
5. **agent_assigned** - Delivery agent assigned
6. **picked_up** - Agent picked up from store
7. **in_transit** - Agent is on the way
8. **nearby** - Agent is nearby (< 1km)
9. **arrived** - Agent has arrived
10. **delivered** - Order delivered successfully
11. **failed** - Delivery failed
12. **cancelled** - Order cancelled

---

## 🔄 Real-Time Updates

The system uses **Supabase Realtime** for live updates:

### Automatic Updates Include:
- ✅ Delivery agent location changes
- ✅ Order status changes
- ✅ Timeline updates
- ✅ Notifications

### How It Works:
1. Customer opens tracking page
2. System subscribes to real-time channel for that order
3. When agent updates location → Map automatically updates
4. When status changes → Timeline automatically updates
5. User sees changes instantly without refresh

---

## 🗺️ Map Features

### Customer View:
- 📍 **Green marker** - Delivery destination (customer address)
- 🔵 **Blue marker** - Delivery agent's current location
- 🗺️ **Auto-zoom** - Map adjusts to show both markers
- 🔄 **Real-time movement** - Agent marker moves as location updates

### Map Controls:
- Zoom in/out
- Full-screen mode
- Pan and navigate

---

## 🔐 Security Features

### Row Level Security (RLS):
- ✅ Users can only view tracking for their own orders
- ✅ Public can track with valid tracking number
- ✅ Agents can update their own location only
- ✅ Admin has full access

### Privacy:
- Customer address displayed only to order owner
- Agent's full location history not exposed
- Phone numbers clickable only on tracking page

---

## 📊 Database Schema Overview

### `delivery_agents` Table
```
- id (UUID)
- name
- phone
- email
- vehicle_type (bike, scooter, car, bicycle, on_foot)
- vehicle_number
- current_latitude
- current_longitude
- is_active
- is_available
- rating
- total_deliveries
```

### `order_tracking` Table
```
- id (UUID)
- order_id (FK → orders)
- delivery_agent_id (FK → delivery_agents)
- status
- latitude
- longitude
- location_name
- notes
- updated_by
- timestamp
```

### `agent_location_history` Table
```
- id (UUID)
- agent_id (FK → delivery_agents)
- order_id (FK → orders)
- latitude
- longitude
- accuracy
- speed
- heading
- timestamp
```

### `orders` Table (New Fields)
```
- delivery_agent_id (FK → delivery_agents)
- tracking_number (unique)
- estimated_delivery_time
- actual_delivery_time
- delivery_instructions
- delivery_proof (JSONB)
```

---

## 🛠️ Admin Functions to Build (Future)

You can create admin pages to:

1. **Delivery Agent Management**
   - View all agents
   - Add/edit/delete agents
   - Mark agents as available/unavailable
   - View agent performance stats

2. **Order Assignment**
   - Auto-assign orders to nearest available agent
   - Manual assignment interface
   - Bulk assignment

3. **Tracking Dashboard**
   - View all active deliveries on map
   - Monitor agent locations in real-time
   - Track delivery performance
   - Generate reports

---

## 🧪 Testing the System

### Test Scenario 1: View Tracking Page
1. Place an order (or use existing order)
2. Go to Orders page
3. Click "Track Order"
4. Verify map loads correctly
5. Check order details are displayed

### Test Scenario 2: Assign Agent (Manual)
Run in Supabase SQL Editor:

```sql
-- Assign first available agent to your order
UPDATE orders 
SET delivery_agent_id = (
  SELECT id FROM delivery_agents 
  WHERE is_active = true AND is_available = true 
  LIMIT 1
)
WHERE id = 'your-order-id-here';
```

Refresh tracking page - agent info should appear!

### Test Scenario 3: Add Tracking Update
Run in Supabase SQL Editor:

```sql
-- Add a tracking update
SELECT add_tracking_update(
  'your-order-id-here'::uuid,
  'in_transit',
  28.6139, -- latitude
  77.2090, -- longitude
  'Near Connaught Place',
  'On the way to your location!',
  'agent'
);
```

Tracking page should show new update in timeline!

### Test Scenario 4: Simulate Agent Movement
Run in Supabase SQL Editor:

```sql
-- Update agent location
SELECT update_agent_location(
  'agent-id-here'::uuid,
  28.6150, -- new latitude
  77.2095, -- new longitude
  'order-id-here'::uuid,
  10.5, -- accuracy
  25.0, -- speed
  180.0 -- heading
);
```

Map marker should move to new location!

---

## 🚨 Troubleshooting

### Map Not Loading
**Problem:** Map shows "Map loading..." forever
**Solution:** 
1. Check Google Maps API key in `.env`
2. Verify API is enabled in Google Cloud Console
3. Check browser console for errors

### Real-time Not Working
**Problem:** Status updates don't appear automatically
**Solution:**
1. Verify Supabase Realtime is enabled (check schema)
2. Check browser console for subscription errors
3. Ensure RLS policies are correct

### Agent Info Not Showing
**Problem:** Delivery agent info not displayed
**Solution:**
1. Verify `delivery_agent_id` is set on order
2. Check agent exists in `delivery_agents` table
3. Verify agent is active (`is_active = true`)

### Tracking Number Not Found
**Problem:** "Order not found" error
**Solution:**
1. Verify tracking number format: `TRACK-YYYYMMDD-XXXX`
2. Check tracking number exists in orders table
3. Ensure order belongs to logged-in user (or use public link)

---

## 🎨 Customization Options

### Change Map Style
Edit `TrackOrderPage.tsx`:

```typescript
const map = new window.google.maps.Map(mapRef.current, {
  // Add custom styles
  styles: [
    // Your custom map styles here
  ]
});
```

### Customize Status Colors
Edit status color function in `TrackOrderPage.tsx`:

```typescript
const getStatusColor = (status: string): string => {
  // Customize colors for each status
};
```

### Add More Map Markers
You can add markers for:
- Store/pickup location
- Waypoints in delivery route
- Delivery zones

---

## 📈 Next Steps / Enhancements

### Immediate:
1. ✅ Test with real orders
2. ✅ Assign agents to orders
3. ✅ Add tracking updates

### Future Enhancements:
1. **Agent Mobile App**
   - GPS auto-update from agent's phone
   - One-tap status updates
   - Navigation integration

2. **SMS Notifications**
   - Send tracking link via SMS
   - Status update notifications

3. **Route Optimization**
   - Calculate best route
   - Multi-order batching
   - ETA prediction

4. **Analytics Dashboard**
   - Delivery time analytics
   - Agent performance metrics
   - Customer satisfaction tracking

---

## ✅ Checklist

- [ ] Run `tracking-schema.sql` in Supabase
- [ ] Verify tables created
- [ ] Check sample agents inserted
- [ ] Add Google Maps API key to `.env`
- [ ] Test tracking page loads
- [ ] Assign agent to test order
- [ ] Add test tracking update
- [ ] Verify real-time updates work
- [ ] Test on mobile devices

---

## 💡 Tips

1. **For Development:** Use sample agents created by schema
2. **For Production:** Add real delivery agents through admin panel
3. **Testing Real-time:** Open tracking page in two browsers to see updates
4. **Performance:** Location updates every 10-30 seconds are sufficient
5. **Privacy:** Never expose customer address to unauthorized users

---

## 📞 Support

If you encounter issues:
1. Check browser console for errors
2. Verify database tables and functions exist
3. Check Supabase logs for RLS policy issues
4. Ensure all environment variables are set

---

## 🎉 You're All Set!

The tracking system is now fully functional. Users can track their orders in real-time with GPS location updates, status timeline, and delivery agent information.

**Happy Tracking! 🚚📦**
