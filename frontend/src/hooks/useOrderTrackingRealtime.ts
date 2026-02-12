/**
 * Real-time order tracking subscription hook.
 * Subscribes to customer_orders, store_orders, order_status_history,
 * and driver_locations for live updates on the tracking page.
 */

import { useEffect, useRef } from 'react';
import { supabaseAdmin } from '../services/supabase';

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
  estimated_delivery?: string;
  delivery_latitude?: number;
  delivery_longitude?: number;
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

async function fetchDeliveryPartner(partnerId: string) {
  const { data } = await supabaseAdmin
    .from('app_users')
    .select('id, name, phone')
    .eq('id', partnerId)
    .single();
  return data ? { id: data.id, name: data.name || 'Delivery Partner', phone: data.phone || '' } : null;
}

async function fetchStatusHistory(orderId: string) {
  const { data } = await supabaseAdmin
    .from('order_status_history')
    .select('status, notes, created_at')
    .eq('customer_order_id', orderId)
    .order('created_at', { ascending: true });
  return data || [];
}

export function useOrderTrackingRealtime(
  orderId: string | undefined,
  order: Order | null,
  setOrder: SetOrder,
  setTrackingHistory: SetTrackingHistory,
  setDriverLocation: SetDriverLocation,
  buildTrackingHistory: (order: Order, statusHistory: { status: string; notes?: string; created_at: string }[]) => OrderStatus[]
) {
  const buildRef = useRef(buildTrackingHistory);
  buildRef.current = buildTrackingHistory;

  const refreshOrderAndHistory = async () => {
    if (!orderId || !order) return;
    const build = buildRef.current;

    const { data: co } = await supabaseAdmin
      .from('customer_orders')
      .select('*')
      .eq('id', orderId)
      .single();
    if (!co) return;

    const { data: storeOrders } = await supabaseAdmin
      .from('store_orders')
      .select('*, order_items(*)')
      .eq('customer_order_id', orderId);

    const statusHistory = await fetchStatusHistory(orderId);
    const storeOrderWithPartner = (storeOrders || []).find((so: any) => so.delivery_partner_id);
    let deliveryAgent = order.delivery_agent;
    if (storeOrderWithPartner?.delivery_partner_id) {
      const partner = await fetchDeliveryPartner(storeOrderWithPartner.delivery_partner_id);
      if (partner) deliveryAgent = { ...partner, vehicle_number: order.delivery_agent?.vehicle_number };
    }

    const updatedOrder: Order = {
      ...order,
      id: co.id,
      order_number: co.order_code || co.id?.substring(0, 8)?.toUpperCase(),
      status: co.status || 'pending_at_store',
      created_at: co.placed_at || co.created_at,
      delivery_address: co.delivery_address,
      total_amount: co.total_amount ?? 0,
      delivery_agent: deliveryAgent,
      estimated_delivery: co.estimated_delivery_time,
      delivery_latitude: co.delivery_latitude,
      delivery_longitude: co.delivery_longitude,
      items: (storeOrders || []).flatMap((so: any) => so.order_items || []),
    };

    setOrder(updatedOrder);
    setTrackingHistory(build(updatedOrder, statusHistory));
  };

  // Subscribe to order and store_orders changes
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

    return () => {
      supabaseAdmin.removeChannel(channel);
    };
  }, [orderId]);

  // Subscribe to driver location when delivery partner is assigned
  const deliveryPartnerId = order?.delivery_agent?.id;
  useEffect(() => {
    if (!deliveryPartnerId) return;

    // Fetch initial driver location
    supabaseAdmin
      .from('driver_locations')
      .select('latitude, longitude, updated_at')
      .eq('delivery_partner_id', deliveryPartnerId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setDriverLocation({
            latitude: data.latitude,
            longitude: data.longitude,
            updated_at: data.updated_at,
          });
        }
      });

    const locChannel = supabaseAdmin
      .channel(`driver-location-${deliveryPartnerId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'driver_locations',
          filter: `delivery_partner_id=eq.${deliveryPartnerId}`,
        },
        (payload) => {
          const row = (payload.new || payload.old) as { latitude?: number; longitude?: number; updated_at?: string } | null;
          if (row && typeof row.latitude === 'number' && typeof row.longitude === 'number') {
            setDriverLocation({
              latitude: row.latitude,
              longitude: row.longitude,
              updated_at: row.updated_at || new Date().toISOString(),
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabaseAdmin.removeChannel(locChannel);
    };
  }, [deliveryPartnerId, setDriverLocation]);
}
