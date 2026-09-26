/**
 * Tracking API - fetches tracking data via backend (bypasses Supabase RLS 403).
 * Use this instead of direct Supabase for order_status_history and stores.
 *
 * All routes under /api/tracking require the customer's session token
 * (requireCustomer on the backend). The previous version sent no
 * Authorization header, so every call returned 401 and the tracking page
 * silently showed "order not found" / never updated.
 */

import { apiUrl } from '../utils/apiBase';
import { getAuthHeaders } from '../utils/authHeader';
import { fetchJson } from '../utils/apiErrors';

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
    eta_minutes?: number;
    store_orders?: Array<{
      id: string;
      store_id: string;
      status?: string;
      delivery_partner_id?: string;
      order_items?: Array<{
        product_name: string;
        quantity: number;
        unit_price: number;
        image_url?: string;
        unit?: string;
      }>;
    }>;
  };
  statusHistory: Array<{ status: string; notes?: string; created_at: string }>;
  storeLocations: Array<{ lat: number; lng: number; label?: string; address?: string; phone?: string; store_id?: string }>;
  deliveryAgent?: { id: string; name: string; phone: string; vehicle_number?: string };
  deliveryAgents?: Record<string, { id: string; name: string; phone: string; vehicle_number?: string }>;
}

export type DriverLocationMap = Record<string, { latitude: number; longitude: number; updated_at: string }>;

/** Throws ApiError (with `where`/`requestId`) on failure so the page can show a precise message. */
export function fetchOrderTrackingFull(orderId: string): Promise<TrackingFullResponse> {
  return fetchJson<TrackingFullResponse>(
    apiUrl(`/api/tracking/orders/${encodeURIComponent(orderId)}/full`),
    { headers: getAuthHeaders(), cache: 'no-store' },
    'trackingApi.fetchOrderTrackingFull'
  );
}

export function fetchDriverLocations(orderId: string): Promise<DriverLocationMap> {
  return fetchJson<DriverLocationMap>(
    apiUrl(`/api/tracking/orders/${encodeURIComponent(orderId)}/driver-locations`),
    { headers: getAuthHeaders(), cache: 'no-store' },
    'trackingApi.fetchDriverLocations'
  );
}
