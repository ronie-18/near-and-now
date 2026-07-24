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

  // Effects below intentionally depend on [orderId, !!order] rather than
  // [orderId, order] — subscribing/re-subscribing the realtime channel on
  // every order field update (not just the initial null -> non-null
  // transition) would tear down and recreate it constantly. But that means
  // refreshOrderAndHistory, as captured by the effect's closure, otherwise
  // stays pinned to whatever `order` was on the render the effect last ran —
  // any field not explicitly re-assigned in updatedOrder below would silently
  // revert to its first-render value forever. Read the latest order via a ref
  // instead (same pattern already used for buildRef above) so the closure
  // itself can go stale without the data it operates on going stale too.
  const orderRef = useRef(order);
  orderRef.current = order;

  // Monotonic sequence number: each call to refreshOrderAndHistory (whether
  // triggered by realtime or by the polling fallback) claims the next number
  // before it starts fetching. If a newer call has already started by the
  // time an older one's response comes back, the older one's result is
  // discarded instead of being applied — otherwise a slow response landing
  // after a fresher one could overwrite the screen with stale data (e.g. on
  // unmount/navigation, or just two calls racing each other).
  const orderSeqRef = useRef(0);

  const refreshOrderAndHistory = async () => {
    const order = orderRef.current;
    if (!orderId || !order) return;
    const build = buildRef.current;
    const mySeq = ++orderSeqRef.current;

    // Use backend API (bypasses Supabase RLS 403)
    const data = await fetchOrderTrackingFull(orderId);
    if (!data) return;
    if (mySeq !== orderSeqRef.current) return; // a newer call already won

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

    // Tracks whether the realtime channel is currently confirmed connected.
    // The 3s interval below still ticks on a fixed schedule, but skips doing
    // any work while realtime is healthy — it's a fallback for when realtime
    // isn't (e.g. simulation updates that don't trigger it, a dropped
    // connection), not a permanent second source of the same data.
    let realtimeHealthy = false;

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
        realtimeHealthy = status === 'SUBSCRIBED';
        if (status === 'SUBSCRIBED') {
          console.log('📡 Realtime tracking subscribed for order', orderId);
        }
      });

    // Poll every 3 sec as fallback (simulation updates may not trigger realtime),
    // but only actually fetch when realtime isn't confirmed healthy.
    const pollInterval = setInterval(() => {
      if (!realtimeHealthy) refreshOrderAndHistory();
    }, 3000);

    return () => {
      clearInterval(pollInterval);
      supabaseAdmin.removeChannel(channel);
    };
  }, [orderId, !!order]);

  // Driver locations: poll backend API every 2 sec (backend gets partner IDs from DB).
  // Poll whenever we have orderId - no need to wait for order.store_orders to have
  // delivery_partner_id. Unlike order status above, there's no realtime channel for
  // driver_locations to gate against — a moving GPS marker needs this cadence
  // regardless — but still guarded against overlapping/stale responses the same way.
  useEffect(() => {
    if (!orderId) return;

    const driverSeqRef = { current: 0 };

    const pollDriverLocations = async () => {
      const mySeq = ++driverSeqRef.current;
      const locations = await fetchDriverLocations(orderId);
      if (mySeq !== driverSeqRef.current) return; // a newer poll already won
      if (Object.keys(locations).length > 0) {
        setDriverLocations((prev) => ({ ...prev, ...locations }));
      }
    };

    pollDriverLocations();

    const pollInterval = setInterval(pollDriverLocations, 2000);
    return () => clearInterval(pollInterval);
  }, [orderId]);
}
