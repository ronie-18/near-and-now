/**
 * Tracking API - fetches tracking data via backend (bypasses Supabase RLS 403).
 * Use this instead of direct Supabase for order_status_history and stores.
 */

const API_BASE = import.meta.env.VITE_API_URL || '';

export interface TrackingFullResponse {
  order: {
    id: string;
    order_code?: string;
    status: string;
    placed_at?: string;
    created_at?: string;
    delivery_address: string;
    total_amount: number;
    payment_method: string;
    delivery_latitude?: number;
    delivery_longitude?: number;
    estimated_delivery_time?: string;
    store_orders?: Array<{
      id: string;
      store_id: string;
      delivery_partner_id?: string;
      order_items?: unknown[];
    }>;
  };
  statusHistory: Array<{ status: string; notes?: string; created_at: string }>;
  storeLocations: Array<{ lat: number; lng: number; label?: string; address?: string; phone?: string; store_id?: string }>;
  deliveryAgent?: { id: string; name: string; phone: string };
}

export async function fetchOrderTrackingFull(orderId: string): Promise<TrackingFullResponse | null> {
  const url = `${API_BASE || ''}/api/tracking/orders/${orderId}/full`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

export async function fetchDriverLocations(orderId: string): Promise<Record<string, { latitude: number; longitude: number; updated_at: string }>> {
  const url = `${API_BASE || ''}/api/tracking/orders/${orderId}/driver-locations`;
  const res = await fetch(url);
  if (!res.ok) return {};
  return res.json();
}
