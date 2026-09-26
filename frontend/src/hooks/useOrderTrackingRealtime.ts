/**
 * Real-time order tracking subscription hook.
 * Subscribes to customer_orders, store_orders, order_status_history for live
 * updates on the tracking page, with a slow polling fallback, and polls the
 * driver positions for the map.
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

/**
 * Realtime delivers status changes instantly; this poll only covers missed events
 * (e.g. the simulation writing without triggering a publication). 3 s was hammering
 * the API for every open tracking page.
 */
const ORDER_REFRESH_FALLBACK_MS = 10_000;
/** Driver GPS pushes arrive every 5–10 s from the rider app, so polling faster than that is wasted. */
const DRIVER_LOCATION_POLL_MS = 4_000;

const TERMINAL_STATUSES = new Set(['order_delivered', 'order_cancelled']);

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
  const inFlight = useRef(false);
  const hasOrder = order !== null;
  const isTerminal = order ? TERMINAL_STATUSES.has(order.status) : false;

  const refreshOrderAndHistory = async () => {
    if (!orderId || inFlight.current) return;
    inFlight.current = true;
    try {
      // Use backend API (bypasses Supabase RLS 403)
      const data = await fetchOrderTrackingFull(orderId);
      const { order: co, statusHistory, storeLocations, deliveryAgent, deliveryAgents } = data;
      const storeOrders = co.store_orders || [];
      const build = buildRef.current;

      // Functional update: merge into the *current* order, not the one captured when
      // the effect was created (the old closure kept re-applying stale agents/locations).
      setOrder((prev) => {
        const updatedOrder: Order = {
          ...(prev ?? ({} as Order)),
          id: co.id || prev?.id || orderId,
          order_number: co.order_code || co.id?.substring(0, 8)?.toUpperCase() || prev?.order_number || '',
          status: co.status || 'pending_at_store',
          created_at: co.placed_at || co.created_at || prev?.created_at || '',
          delivery_address: co.delivery_address || prev?.delivery_address || '',
          total_amount: co.total_amount ?? prev?.total_amount ?? 0,
          payment_method: co.payment_method || prev?.payment_method || '',
          delivery_agent: deliveryAgent || prev?.delivery_agent,
          delivery_agents: deliveryAgents ?? prev?.delivery_agents,
          estimated_delivery: co.estimated_delivery_time,
          delivery_latitude: co.delivery_latitude,
          delivery_longitude: co.delivery_longitude,
          items: storeOrders.flatMap((so) => so.order_items || []),
          store_locations: storeLocations.length > 0 ? storeLocations : prev?.store_locations,
          store_orders: storeOrders,
        };
        setTrackingHistory(build(updatedOrder, statusHistory));
        return updatedOrder;
      });
    } catch (err) {
      // Polling failures are transient; the page keeps showing the last good state.
      console.warn('[useOrderTrackingRealtime] refresh failed:', err);
    } finally {
      inFlight.current = false;
    }
  };

  // Subscribe to order/store_orders/status changes + slow polling fallback (runs when order loads)
  useEffect(() => {
    if (!orderId || !hasOrder || isTerminal) return;

    const channel = supabaseAdmin
      .channel(`order-tracking-${orderId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_orders', filter: `id=eq.${orderId}` }, () => refreshOrderAndHistory())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_orders', filter: `customer_order_id=eq.${orderId}` }, () => refreshOrderAndHistory())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_status_history', filter: `customer_order_id=eq.${orderId}` }, () => refreshOrderAndHistory())
      .subscribe();

    const pollInterval = setInterval(() => {
      if (document.visibilityState === 'visible') refreshOrderAndHistory();
    }, ORDER_REFRESH_FALLBACK_MS);

    // Catch up immediately when the tab becomes visible again.
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshOrderAndHistory();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', onVisible);
      supabaseAdmin.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, hasOrder, isTerminal]);

  // Driver locations: poll backend API (backend gets partner IDs from DB).
  useEffect(() => {
    if (!orderId || isTerminal) return;
    let cancelled = false;
    let busy = false;

    const pollDriverLocations = async () => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        const locations = await fetchDriverLocations(orderId);
        if (!cancelled && Object.keys(locations).length > 0) {
          setDriverLocations((prev) => ({ ...prev, ...locations }));
        }
      } catch (err) {
        console.warn('[useOrderTrackingRealtime] driver location poll failed:', err);
      } finally {
        busy = false;
      }
    };

    pollDriverLocations();
    const pollInterval = setInterval(pollDriverLocations, DRIVER_LOCATION_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(pollInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, isTerminal]);
}
