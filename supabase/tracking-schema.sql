-- =====================================================
-- DELIVERY TRACKING SYSTEM - DATABASE SCHEMA
-- =====================================================
-- This schema supports real-time order tracking with delivery agents
-- Run this SQL in Supabase SQL Editor

-- =====================================================
-- 1. DELIVERY AGENTS TABLE
-- =====================================================
-- Stores information about delivery boys/agents
CREATE TABLE IF NOT EXISTS delivery_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  vehicle_type TEXT CHECK (vehicle_type IN ('bike', 'scooter', 'car', 'bicycle', 'on_foot')),
  vehicle_number TEXT,
  current_latitude DECIMAL(10, 8),
  current_longitude DECIMAL(11, 8),
  is_active BOOLEAN DEFAULT true,
  is_available BOOLEAN DEFAULT true,
  rating DECIMAL(3, 2) DEFAULT 5.00,
  total_deliveries INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_delivery_agents_active ON delivery_agents(is_active, is_available);
CREATE INDEX IF NOT EXISTS idx_delivery_agents_location ON delivery_agents(current_latitude, current_longitude);

-- =====================================================
-- 2. ADD TRACKING FIELDS TO ORDERS TABLE
-- =====================================================
-- Add new columns to existing orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS delivery_agent_id UUID REFERENCES delivery_agents(id),
ADD COLUMN IF NOT EXISTS tracking_number TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS estimated_delivery_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS actual_delivery_time TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS delivery_instructions TEXT,
ADD COLUMN IF NOT EXISTS delivery_proof JSONB; -- {signature_url, photo_url, notes, delivered_to}

-- Index for tracking number lookups
CREATE INDEX IF NOT EXISTS idx_orders_tracking_number ON orders(tracking_number);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_agent ON orders(delivery_agent_id);

-- =====================================================
-- 3. ORDER TRACKING UPDATES TABLE
-- =====================================================
-- Stores real-time location and status updates
CREATE TABLE IF NOT EXISTS order_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  delivery_agent_id UUID REFERENCES delivery_agents(id),
  status TEXT NOT NULL CHECK (status IN (
    'order_placed',
    'order_confirmed',
    'preparing',
    'ready_for_pickup',
    'agent_assigned',
    'picked_up',
    'in_transit',
    'nearby',
    'arrived',
    'delivered',
    'failed',
    'cancelled'
  )),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  location_name TEXT,
  notes TEXT,
  updated_by TEXT, -- 'customer', 'agent', 'admin', 'system'
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_order_tracking_order_id ON order_tracking(order_id);
CREATE INDEX IF NOT EXISTS idx_order_tracking_timestamp ON order_tracking(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_order_tracking_status ON order_tracking(status);

-- =====================================================
-- 4. DELIVERY AGENT LOCATION HISTORY TABLE
-- =====================================================
-- Stores historical GPS locations for route replay
CREATE TABLE IF NOT EXISTS agent_location_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES delivery_agents(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  accuracy DECIMAL(6, 2), -- GPS accuracy in meters
  speed DECIMAL(6, 2), -- Speed in km/h
  heading DECIMAL(5, 2), -- Direction in degrees (0-360)
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for historical queries
CREATE INDEX IF NOT EXISTS idx_agent_location_history_agent ON agent_location_history(agent_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_agent_location_history_order ON agent_location_history(order_id);

-- =====================================================
-- 5. FUNCTION: GENERATE TRACKING NUMBER
-- =====================================================
-- Generates unique tracking number: TRACK-YYYYMMDD-XXXX
CREATE OR REPLACE FUNCTION generate_tracking_number()
RETURNS TEXT AS $$
DECLARE
  date_str TEXT;
  sequence_num INTEGER;
  tracking_num TEXT;
BEGIN
  -- Get current date in YYYYMMDD format
  date_str := to_char(now(), 'YYYYMMDD');
  
  -- Get count of orders today and increment
  SELECT COUNT(*) + 1 INTO sequence_num
  FROM orders
  WHERE tracking_number LIKE 'TRACK-' || date_str || '-%';
  
  -- Generate tracking number
  tracking_num := 'TRACK-' || date_str || '-' || LPAD(sequence_num::TEXT, 4, '0');
  
  RETURN tracking_num;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 6. FUNCTION: UPDATE AGENT LOCATION
-- =====================================================
-- Updates agent's current location and records in history
CREATE OR REPLACE FUNCTION update_agent_location(
  p_agent_id UUID,
  p_latitude DECIMAL,
  p_longitude DECIMAL,
  p_order_id UUID DEFAULT NULL,
  p_accuracy DECIMAL DEFAULT NULL,
  p_speed DECIMAL DEFAULT NULL,
  p_heading DECIMAL DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  -- Update agent's current location
  UPDATE delivery_agents
  SET 
    current_latitude = p_latitude,
    current_longitude = p_longitude,
    updated_at = now()
  WHERE id = p_agent_id;
  
  -- Record in location history
  INSERT INTO agent_location_history (
    agent_id,
    order_id,
    latitude,
    longitude,
    accuracy,
    speed,
    heading
  ) VALUES (
    p_agent_id,
    p_order_id,
    p_latitude,
    p_longitude,
    p_accuracy,
    p_speed,
    p_heading
  );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 7. FUNCTION: ADD TRACKING UPDATE
-- =====================================================
-- Adds a tracking update and returns the update
CREATE OR REPLACE FUNCTION add_tracking_update(
  p_order_id UUID,
  p_status TEXT,
  p_latitude DECIMAL DEFAULT NULL,
  p_longitude DECIMAL DEFAULT NULL,
  p_location_name TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_updated_by TEXT DEFAULT 'system'
)
RETURNS order_tracking AS $$
DECLARE
  v_tracking order_tracking;
  v_agent_id UUID;
BEGIN
  -- Get delivery agent ID for this order
  SELECT delivery_agent_id INTO v_agent_id
  FROM orders
  WHERE id = p_order_id;
  
  -- Insert tracking update
  INSERT INTO order_tracking (
    order_id,
    delivery_agent_id,
    status,
    latitude,
    longitude,
    location_name,
    notes,
    updated_by
  ) VALUES (
    p_order_id,
    v_agent_id,
    p_status,
    p_latitude,
    p_longitude,
    p_location_name,
    p_notes,
    p_updated_by
  )
  RETURNING * INTO v_tracking;
  
  -- Update order status if needed
  IF p_status IN ('delivered', 'failed', 'cancelled') THEN
    UPDATE orders
    SET 
      order_status = CASE 
        WHEN p_status = 'delivered' THEN 'delivered'
        WHEN p_status = 'cancelled' THEN 'cancelled'
        ELSE order_status
      END,
      actual_delivery_time = CASE WHEN p_status = 'delivered' THEN now() ELSE NULL END,
      updated_at = now()
    WHERE id = p_order_id;
  END IF;
  
  RETURN v_tracking;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 8. ENABLE ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE delivery_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_location_history ENABLE ROW LEVEL SECURITY;

-- Policy: Public can view active agents (for map display)
CREATE POLICY "Public can view active agents" ON delivery_agents
  FOR SELECT USING (is_active = true);

-- Policy: Agents can update their own location
CREATE POLICY "Agents can update their location" ON delivery_agents
  FOR UPDATE USING (auth.uid()::text = id::text);

-- Policy: Users can view tracking for their orders
CREATE POLICY "Users can view their order tracking" ON order_tracking
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM orders WHERE user_id = auth.uid()
    )
  );

-- Policy: Public can view tracking with tracking number
CREATE POLICY "Public can view tracking with valid tracking number" ON order_tracking
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders 
      WHERE orders.id = order_tracking.order_id 
      AND orders.tracking_number IS NOT NULL
    )
  );

-- Policy: Users can view location history for their orders
CREATE POLICY "Users can view location history for their orders" ON agent_location_history
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM orders WHERE user_id = auth.uid()
    )
  );

-- =====================================================
-- 9. ENABLE REALTIME FOR TRACKING
-- =====================================================
-- Enable realtime updates for tracking tables
ALTER PUBLICATION supabase_realtime ADD TABLE order_tracking;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_location_history;
ALTER PUBLICATION supabase_realtime ADD TABLE delivery_agents;

-- =====================================================
-- 10. INSERT SAMPLE DELIVERY AGENTS (FOR TESTING)
-- =====================================================
INSERT INTO delivery_agents (name, phone, email, vehicle_type, vehicle_number, is_active, is_available) VALUES
('Rajesh Kumar', '+919876543210', 'rajesh@example.com', 'bike', 'DL01AB1234', true, true),
('Amit Singh', '+919876543211', 'amit@example.com', 'scooter', 'DL02CD5678', true, true),
('Priya Sharma', '+919876543212', 'priya@example.com', 'bicycle', NULL, true, true),
('Vijay Patel', '+919876543213', 'vijay@example.com', 'bike', 'MH12EF9012', true, false),
('Suresh Yadav', '+919876543214', 'suresh@example.com', 'car', 'HR26GH3456', true, true)
ON CONFLICT (phone) DO NOTHING;

-- =====================================================
-- SETUP COMPLETE! 🎉
-- =====================================================
-- Next steps:
-- 1. Run this SQL in Supabase SQL Editor
-- 2. Verify tables were created successfully
-- 3. Check that sample agents were inserted
-- 4. Test the functions and policies
-- =====================================================
