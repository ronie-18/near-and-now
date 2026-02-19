/**
 * Real-time order tracking subscription hook.
 * Subscribes to customer_orders, store_orders, order_status_history,
 * and driver_locations for live updates on the tracking page.
 */

import { useEffect, useRef } from 'react';
import { supabaseAdmin } from '../services/supabase';
import { fetchOrderTrackingFull, fetchDriverLocations } from '../services/trackingApi';

export interface Order {
  id: string;
  order_number: string;
  status: string;
  created_at: string;
  delivery_address: string;
  total_amount: number;
  payment_method: string;
  items: any[];
  delivery_agent?: {
    id: string;
    name: string;
    phone: string;
    vehicle_number?: string;
  };
  delivery_agents?: Record<string, { id: string; name: string; phone: string; vehicle_number?: string }>;
  estimated_delivery?: string;
  delivery_latitude?: number;
  delivery_longitude?: number;
  store_locations?: { lat: number; lng: number; label?: string; address?: string; phone?: string; store_id?: string }[];
  store_orders?: { id: string; store_id: string; status?: string; delivery_partner_id?: string; order_items?: { product_name: string; quantity: number; unit_price: number; image_url?: string; unit?: string }[] }[];
}

export interface OrderStatus {
  status: string;
  timestamp: string;
  description: string;
  notes?: string;
}

export interface DriverLocation {
  latitude: number;
  longitude: number;
  updated_at: string;
}

type SetOrder = React.Dispatch<React.SetStateAction<Order | null>>;
type SetTrackingHistory = React.Dispatch<React.SetStateAction<OrderStatus[]>>;
type SetDriverLocation = React.Dispatch<React.SetStateAction<DriverLocation | null>>;
type SetDriverLocations = React.Dispatch<React.SetStateAction<Record<string, DriverLocation>>>;

export function useOrderTrackingRealtime(
  orderId: string | undefined,
  order: Order | null,
  setOrder: SetOrder,
  setTrackingHistory: SetTrackingHistory,
  _setDriverLocation: SetDriverLocation,
  setDriverLocations: SetDriverLocations,
  buildTrackingHistory: (order: Order, statusHistory: { status: string; notes?: string; created_at: string }[]) => OrderStatus[]
) {
  const buildRef = useRef(buildTrackingHistory);
  buildRef.current = buildTrackingHistory;

  const refreshOrderAndHistory = async () => {
    if (!orderId || !order) return;
    const build = buildRef.current;

    // Use backend API (bypasses Supabase RLS 403)
    const data = await fetchOrderTrackingFull(orderId);
    if (!data) return;

    const { order: co, statusHistory, storeLocations, deliveryAgent, deliveryAgents } = data;
    const storeOrders = co.store_orders || [];

    const orderIdVal = co.id || order.id || '';
    const updatedOrder: Order = {
      ...order,
      id: orderIdVal,
      order_number: co.order_code || co.id?.substring(0, 8)?.toUpperCase() || '',
      status: co.status || 'pending_at_store',
      created_at: co.placed_at || co.created_at || '',
      delivery_address: co.delivery_address || '',
      total_amount: co.total_amount ?? 0,
      delivery_agent: deliveryAgent || order.delivery_agent,
      delivery_agents: deliveryAgents ?? order.delivery_agents,
      estimated_delivery: co.estimated_delivery_time,
      delivery_latitude: co.delivery_latitude,
      delivery_longitude: co.delivery_longitude,
      items: storeOrders.flatMap((so: any) => so.order_items || []),
      store_locations: storeLocations.length > 0 ? storeLocations : order.store_locations,
      store_orders: storeOrders,
    };

    setOrder(updatedOrder);
    setTrackingHistory(build(updatedOrder, statusHistory));
  };

  // Subscribe to order/store_orders/status changes + polling fallback (runs when order loads)
  useEffect(() => {
    if (!orderId || !order) return;

    const channel = supabaseAdmin
      .channel(`order-tracking-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'customer_orders',
          filter: `id=eq.${orderId}`,
        },
        () => refreshOrderAndHistory()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'store_orders',
          filter: `customer_order_id=eq.${orderId}`,
        },
        () => refreshOrderAndHistory()
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'order_status_history',
          filter: `customer_order_id=eq.${orderId}`,
        },
        () => refreshOrderAndHistory()
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('📡 Realtime tracking subscribed for order', orderId);
        }
      });

    // Poll every 3 sec as fallback (simulation updates may not trigger realtime)
    const pollInterval = setInterval(refreshOrderAndHistory, 3000);

    return () => {
      clearInterval(pollInterval);
      supabaseAdmin.removeChannel(channel);
    };
  }, [orderId, !!order]);

  // Driver locations: poll backend API every 2 sec (backend gets partner IDs from DB)
  // Poll whenever we have orderId - no need to wait for order.store_orders to have delivery_partner_id
  useEffect(() => {
    if (!orderId) return;

    const pollDriverLocations = async () => {
      const locations = await fetchDriverLocations(orderId);
      if (Object.keys(locations).length > 0) {
        setDriverLocations((prev) => ({ ...prev, ...locations }));
      }
    };

    pollDriverLocations();

    const pollInterval = setInterval(pollDriverLocations, 2000);
    return () => clearInterval(pollInterval);
  }, [orderId]);
}
