/**
 * Tracking API - fetches tracking data via backend (bypasses Supabase RLS 403).
 * Use this instead of direct Supabase for order_status_history and stores.
 */

import { getApiBase } from '../utils/apiBase';
import { getAuthHeaders } from '../utils/authHeader';
import { errorReason } from '../utils/apiErrors';
const API_BASE = getApiBase();

/** Human-readable reason for the most recent tracking failure (shown by the tracking page's error card). */
export let lastTrackingError: string | null = null;

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
    payment_status?: string;
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

/**
 * Returns null on any failure (callers treat null as "not available right now") and
 * records why in `lastTrackingError`. Every /api/tracking route is behind requireCustomer:
 * before the Authorization header was added here every call was a 401, swallowed as null,
 * so the web tracking page showed "Order not found" and never updated.
 */
export async function fetchOrderTrackingFull(orderId: string): Promise<TrackingFullResponse | null> {
  const where = 'trackingApi.fetchOrderTrackingFull';
  const url = `${API_BASE || ''}/api/tracking/orders/${encodeURIComponent(orderId)}/full`;
  try {
    const res = await fetch(url, { headers: getAuthHeaders(), cache: 'no-store' });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let serverMessage = '';
      let serverWhere = '';
      let requestId = '';
      try {
        const body = JSON.parse(text) as { error?: string; where?: string; requestId?: string };
        serverMessage = body.error ?? '';
        serverWhere = body.where ?? '';
        requestId = body.requestId ?? '';
      } catch {
        /* not JSON */
      }
      lastTrackingError =
        `Could not load tracking for order ${orderId} (${where}${serverWhere ? ` → ${serverWhere}` : ''}): ` +
        `${serverMessage || `HTTP ${res.status} ${res.statusText}`.trim()}${requestId ? ` [ref ${requestId}]` : ''}`;
      console.warn(lastTrackingError);
      return null;
    }

    lastTrackingError = null;
    return (await res.json()) as TrackingFullResponse;
  } catch (error) {
    lastTrackingError = `Could not reach the tracking API at ${url} (${where}): ${errorReason(error) || 'network error'}`;
    console.warn(lastTrackingError);
    return null;
  }
}

export async function fetchDriverLocations(orderId: string): Promise<Record<string, { latitude: number; longitude: number; updated_at: string }>> {
  const url = `${API_BASE || ''}/api/tracking/orders/${encodeURIComponent(orderId)}/driver-locations`;
  try {
    const res = await fetch(url, { headers: getAuthHeaders(), cache: 'no-store' });
    if (!res.ok) {
      console.warn(`[trackingApi.fetchDriverLocations] HTTP ${res.status} for order ${orderId}`);
      return {};
    }
    return res.json();
  } catch (error) {
    console.warn(`[trackingApi.fetchDriverLocations] network error for order ${orderId}:`, errorReason(error));
    return {};
  }
}
