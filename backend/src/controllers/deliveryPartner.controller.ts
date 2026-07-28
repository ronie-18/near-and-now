import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { supabaseAdmin } from '../config/database.js';
import { notificationService } from '../services/notification.service.js';
import { databaseService } from '../services/database.service.js';
import { dispatchReadyOrdersToDriver } from './shopkeeper.controller.js';
import { verifySignupTicket } from '../utils/signupTicket.js';
import { mintRiderRealtimeSession } from '../services/riderAuthBridge.service.js';
import {
  ALLOWED_DOC_MIME_TYPES,
  DOC_LABELS,
  DOC_TYPES,
  MAX_DOC_SIZE_BYTES,
  SIGNED_URL_TTL_SECONDS,
  VEHICLE_TYPES,
  VERIFICATION_DOCS_BUCKET,
  docNumberErrorMessage,
  formatFileSize,
  isDocType,
  isVehicleRegistrationRequired,
  isVehicleType,
  validateDocNumber,
} from '../utils/deliveryPartnerVerificationDocuments.js';

type UploadedFile = { buffer: Buffer; mimetype: string; size: number };

/**
 * Editing or removing a verification document after the rider has already
 * been approved sends them back for full re-verification — same as a manual
 * admin revoke (is_approved false, approved_at/approved_by cleared) — since
 * the documents admin signed off on are no longer what's on file. Returns
 * whether the rider was suspended by this call (was approved, now isn't),
 * plus their name — fetched in the same round-trip since every caller needs
 * both (the name for the admin-notification message). Mirrors
 * storeOwner.controller.ts's suspendStoreIfApprovedAndGetName.
 */
async function suspendRiderIfApprovedAndGetName(riderId: string): Promise<{ suspended: boolean; name: string }> {
  const { data: partner } = await supabaseAdmin
    .from('delivery_partners')
    .select('name, is_approved')
    .eq('user_id', riderId)
    .maybeSingle();

  const name = partner?.name || 'A delivery partner';
  if (!partner?.is_approved) return { suspended: false, name };

  await supabaseAdmin
    .from('delivery_partners')
    .update({ is_approved: false, approved_at: null, approved_by: null, updated_at: new Date().toISOString() })
    .eq('user_id', riderId);

  return { suspended: true, name };
}

/**
 * Atomically flips delivery_partners.verification_submitted_at from NULL to
 * now() the first time all required documents (9 or 10, depending on
 * vehicle_type) are uploaded. Backed by a Postgres function
 * (mark_rider_verification_submitted_if_ready, migration 20260805000000) that
 * locks the rider row FOR UPDATE before deciding — safe to call on every save
 * with no "was this the first upload" check in Node, since only one
 * concurrent caller can ever win the row lock and see the not-yet-submitted
 * state. Mirrors storeOwner.controller.ts's markVerificationSubmittedIfReady.
 */
async function markRiderVerificationSubmittedIfReady(riderId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('mark_rider_verification_submitted_if_ready', {
    p_partner_id: riderId,
  });
  if (error) {
    console.error('❌ markRiderVerificationSubmittedIfReady error:', error);
    return false;
  }
  return !!data;
}

/** Best-effort — a notification failure should never block the rider's request. */
async function notifyAdminsOfRiderDocs(type: string, title: string, message: string, data: Record<string, unknown>) {
  try {
    await supabaseAdmin.from('admin_notifications').insert({ type, title, message, data });
  } catch (error) {
    console.error(`❌ notifyAdminsOfRiderDocs (${type}) error:`, error);
  }
}

/**
 * Retroactive enforcement for already-approved riders. mark_rider_verification_submitted_if_ready
 * only re-checks completeness when a document is uploaded/deleted — a rider
 * approved *before* a new required document type was introduced (e.g. the 3
 * vehicle_photo_* docs added after riders were already live) would otherwise
 * stay "active" forever with no re-check ever firing. Called from getProfile,
 * which the rider app polls constantly (verification gate, home screen), so
 * any previously-approved rider who no longer meets the full current
 * required-doc set gets caught and sent back within one poll cycle.
 *
 * Sets the exact same fields as the admin panel's own "Revoke" action
 * (DeliveryPage.tsx's toggleApproval un-approve branch: is_approved false,
 * approved_at/by cleared, status back to pending_verification, is_online
 * false) so admin and rider app never disagree about this rider's state.
 * Also resets verification_submitted_at so a later re-completion fires a
 * fresh "ready for review" admin notification instead of staying suppressed.
 *
 * Self-limiting: once demoted, is_approved is false, so subsequent calls
 * bail out on the first check with no further document-count query.
 * Returns the patch actually applied (or null if nothing changed) so the
 * caller can merge it into the response it's already building, instead of
 * re-querying the row.
 */
async function demoteRiderIfDocsIncomplete(
  riderId: string,
  isApproved: boolean | null | undefined,
  vehicleType: string | null | undefined
): Promise<Record<string, unknown> | null> {
  if (!isApproved) return null;

  const { count } = await supabaseAdmin
    .from('delivery_partner_verification_documents')
    .select('id', { count: 'exact', head: true })
    .eq('partner_id', riderId)
    .not('storage_path', 'is', null);

  // DOC_TYPES.length derives the required count directly from the shared doc
  // list (10 today) rather than a hardcoded number, so this stays correct
  // automatically if more required documents are ever added — only
  // vehicle_registration is conditionally excluded (cycle/e-bike).
  const requiredCount = DOC_TYPES.length - (isVehicleRegistrationRequired(vehicleType) ? 0 : 1);
  if ((count ?? 0) >= requiredCount) return null;

  const patch = {
    is_approved: false,
    approved_at: null,
    approved_by: null,
    status: 'pending_verification',
    is_online: false,
    verification_submitted_at: null,
    updated_at: new Date().toISOString(),
  };
  await supabaseAdmin.from('delivery_partners').update(patch).eq('user_id', riderId);

  await notifyAdminsOfRiderDocs(
    'rider_verification_incomplete',
    'Rider sent back for re-verification',
    'A previously-approved rider no longer meets the full document requirements (a new required document was added) and has been automatically returned to pending verification.',
    { partner_id: riderId }
  );

  return patch;
}

// Throttle: check for missed orders at most once per 5 minutes per driver
const lastDispatchCheck = new Map<string, number>();
function shouldCheckDispatch(driverId: string): boolean {
  const last = lastDispatchCheck.get(driverId) ?? 0;
  if (Date.now() - last < 5 * 60 * 1000) return false;
  lastDispatchCheck.set(driverId, Date.now());
  return true;
}

// Extend Request to carry the authenticated rider's ID
declare module 'express' {
  interface Request {
    riderId?: string;
  }
}

// ── Auth middleware ────────────────────────────────────────────────────────────

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Location-fix quality gates for updateLocation() — see the comment there.
const MAX_ACCEPTABLE_LOCATION_ACCURACY_METERS = 100;
const MAX_LOCATION_FIX_AGE_MS = 2 * 60 * 1000; // 2 minutes

export async function requireRider(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' });
  }
  const token = auth.slice(7);

  const { data: partner, error } = await supabaseAdmin
    .from('delivery_partners')
    .select('user_id, session_token_issued_at')
    .eq('session_token', token)
    .maybeSingle();

  if (error || !partner) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  if (partner.session_token_issued_at) {
    const issuedAt = new Date(partner.session_token_issued_at).getTime();
    if (Date.now() - issuedAt > SESSION_TTL_MS) {
      await supabaseAdmin
        .from('delivery_partners')
        .update({ session_token: null, session_token_issued_at: null })
        .eq('session_token', token);
      return res.status(401).json({ error: 'Session expired — please log in again' });
    }
  }

  req.riderId = partner.user_id;
  next();
}

// ── Status helpers ─────────────────────────────────────────────────────────────

const ACTIVE_DB_STATUSES = [
  'delivery_partner_assigned',
  'ready_for_pickup',
  'picking_up',
  'order_picked_up',
  'in_transit',
];

function mapDbStatusToRider(dbStatus: string): string {
  switch (dbStatus) {
    case 'delivery_partner_assigned': return 'rider_assigned';
    case 'ready_for_pickup':          return 'rider_assigned';
    case 'picking_up':                return 'picking_up';
    case 'order_picked_up':           return 'picked_up';
    case 'in_transit':                return 'picked_up';
    case 'order_delivered':           return 'completed';
    default:                          return dbStatus;
  }
}

// ── Controller ─────────────────────────────────────────────────────────────────

/**
 * `requireRider` (below) only proves "a valid, non-expired rider session" — it
 * deliberately doesn't also gate on is_approved, since unapproved
 * (pending_verification) riders still need read access to their own
 * profile/status while waiting on admin review. Order-mutating handlers that
 * don't go through acceptOrder/acceptOffer (which already check this) need to
 * check it themselves instead. Mirrors the is_approved check in acceptOrder.
 */
async function requireApprovedRider(riderId: string): Promise<boolean> {
  const { data: partner } = await supabaseAdmin
    .from('delivery_partners')
    .select('is_approved')
    .eq('user_id', riderId)
    .maybeSingle();
  return Boolean((partner as { is_approved?: boolean } | null)?.is_approved);
}

// Flat per-order rider fee, paid by the platform (not the customer — delivery_fee
// is currently a ₹0 launch promo). No commission-based payout system exists yet;
// this is the current agreed business model, not a placeholder rate.
const RIDER_FLAT_FEE = 17;

/**
 * Writes the one delivery_partners_payouts row for this order, once, when the
 * rider marks it delivered. This is the first real write path for that table —
 * previously the schema existed but nothing anywhere ever inserted into it, and
 * the rider app's "earnings" screen computed a hardcoded 15% of order_total
 * client-side with no server record backing it at all.
 *
 * Amount = flat RIDER_FLAT_FEE + 100% of any customer tip. Idempotent: skips if
 * a payout for this (rider, order) already exists, since markDelivered has no
 * guard against being called twice for the same order.
 */
export async function payRiderForDeliveredOrder(orderId: string, riderId: string, customerId: string, tipAmount: number): Promise<void> {
  try {
    const { data: existing } = await supabaseAdmin
      .from('delivery_partners_payouts')
      .select('id')
      .eq('customer_order_id', orderId)
      .eq('partner_user_id', riderId)
      .maybeSingle();
    if (existing) return;

    // delivery_partners_payouts.store_id is NOT NULL — this table's schema was
    // designed for one row per store leg, but no such per-leg system exists
    // (or is needed) today. Attach the payout to any one store on this order
    // (the first in pickup sequence) purely to satisfy the FK; the payout
    // itself is for the whole delivery job, not specific to that store.
    const { data: firstAlloc } = await supabaseAdmin
      .from('order_store_allocations')
      .select('store_id')
      .eq('order_id', orderId)
      .order('sequence_number', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!firstAlloc?.store_id) {
      console.error(`payRiderForDeliveredOrder: no store allocation found for order ${orderId}, skipping payout`);
      return;
    }

    const amount = RIDER_FLAT_FEE + Math.max(0, Number(tipAmount) || 0);
    const { error } = await supabaseAdmin.from('delivery_partners_payouts').insert({
      partner_user_id: riderId,
      customer_id: customerId,
      customer_order_id: orderId,
      store_id: firstAlloc.store_id,
      amount,
      status: 'pending',
      notes: tipAmount > 0 ? `Flat fee ₹${RIDER_FLAT_FEE} + tip ₹${tipAmount}` : `Flat fee ₹${RIDER_FLAT_FEE}`,
    });
    if (error) console.error('payRiderForDeliveredOrder insert failed:', error);
  } catch (err) {
    console.error('payRiderForDeliveredOrder error:', err);
  }
}

export class DeliveryPartnerController {

  // POST /delivery-partner/signup/complete
  // Public self-service registration. Creates (or repairs) the app_users +
  // delivery_partners rows scoped to (phone, role='delivery_partner') and issues
  // a session token immediately; the account starts pending_verification until
  // an admin approves it (mirrors storeOwner.controller.ts's signupComplete).
  async signupComplete(req: Request, res: Response) {
    try {
      const body = req.body as Record<string, unknown>;
      const phone = body.phone;
      const name = body.name;
      const vehicleType = body.vehicleType ?? body.vehicle_type;

      if (!phone || !String(phone).trim() || !name || !String(name).trim()) {
        return res.status(400).json({ success: false, error: 'Phone and name are required' });
      }

      if (!verifySignupTicket(body.signupTicket, String(phone), 'delivery_partner')) {
        return res.status(403).json({
          success: false,
          error: 'Phone number was not verified via OTP, or verification expired. Please verify OTP again.'
        });
      }

      if (!isVehicleType(vehicleType)) {
        return res.status(400).json({
          success: false,
          error: `vehicle_type is required and must be one of ${VEHICLE_TYPES.join(', ')}`
        });
      }

      const str = (v: unknown) => (v != null && String(v).trim() !== '' ? String(v).trim() : undefined);
      const vehicleNumber = str(body.vehicleNumber ?? body.vehicle_number);

      const partner = await databaseService.createDeliveryPartner({
        name: String(name).trim(),
        phone: String(phone).trim(),
        email: str(body.email),
        address: str(body.address),
        vehicle_type: vehicleType,
        vehicle_number: vehicleNumber,
        status: 'pending_verification',
      });

      const token = crypto.randomUUID();
      await supabaseAdmin
        .from('delivery_partners')
        .update({ session_token: token, session_token_issued_at: new Date().toISOString() })
        .eq('user_id', partner.id);

      const { password_hash: _, ...userWithoutPassword } = partner as any;

      // Best-effort — see riderAuthBridge.service.ts. A failure here doesn't
      // block signup; the app just falls back to its status poll.
      const supabaseSession = await mintRiderRealtimeSession(partner.id);

      res.json({
        success: true,
        message: 'Registration complete — pending admin verification',
        token,
        user: userWithoutPassword,
        ...(supabaseSession ? { supabaseSession } : {}),
      });
    } catch (err: any) {
      console.error('deliveryPartner signupComplete error:', err);
      res.status(500).json({ success: false, error: err?.message || 'Registration failed' });
    }
  }

  async getProfile(req: Request, res: Response) {
    try {
      const { data: user } = await supabaseAdmin
        .from('app_users')
        .select('id, name, email, phone, created_at')
        .eq('id', req.riderId!)
        .single();

      const { data: profile } = await supabaseAdmin
        .from('delivery_partners')
        .select('address, vehicle_number, vehicle_type, vehicle_image_url, is_online, status, is_approved, expo_push_token, profile_image_url, verification_submitted_at')
        .eq('user_id', req.riderId!)
        .maybeSingle();

      const demotionPatch = profile
        ? await demoteRiderIfDocsIncomplete(req.riderId!, profile.is_approved, profile.vehicle_type)
        : null;
      const effectiveProfile = demotionPatch ? { ...profile, ...demotionPatch } : profile;

      // Count completed deliveries
      const { data: storeOrders } = await supabaseAdmin
        .from('store_orders')
        .select('customer_order_id')
        .eq('delivery_partner_id', req.riderId!);

      const orderIds = (storeOrders || []).map((so: any) => so.customer_order_id);
      let completedCount = 0;
      if (orderIds.length > 0) {
        const { count } = await supabaseAdmin
          .from('customer_orders')
          .select('id', { count: 'exact', head: true })
          .in('id', orderIds)
          .eq('status', 'order_delivered');
        completedCount = count || 0;
      }

      res.json({
        success: true,
        profile: {
          ...user,
          ...effectiveProfile,
          // Explicit `user_id` alongside `id` (from the app_users spread
          // above) — the rider app's own `hasRegisteredRiderProfile()` check
          // (otp.tsx) reads `profile.user_id` specifically to confirm an
          // existing account is fully registered, but this response never
          // actually included that key (delivery_partners' own select never
          // selects it, only filters by it), so that check silently failed
          // for every real rider, 100% of the time, incorrectly telling
          // already-registered riders "not registered" on every login.
          user_id: req.riderId!,
          total_deliveries: completedCount,
        },
      });
    } catch (err) {
      console.error('getProfile error:', err);
      res.status(500).json({ error: 'Failed to fetch profile' });
    }
  }

  async updateStatus(req: Request, res: Response) {
    try {
      const { is_online } = req.body;
      if (typeof is_online !== 'boolean') {
        return res.status(400).json({ error: 'is_online must be a boolean' });
      }

      if (is_online) {
        const { data: partner } = await supabaseAdmin
          .from('delivery_partners')
          .select('is_approved')
          .eq('user_id', req.riderId!)
          .maybeSingle();
        if (!(partner as any)?.is_approved) {
          return res.status(403).json({ error: 'Your account is not yet approved by admin.' });
        }
      }

      const { error } = await supabaseAdmin
        .from('delivery_partners')
        .update({ is_online })
        .eq('user_id', req.riderId!);

      if (error) throw error;

      res.json({ success: true, is_online });

      // When going online, check for any ready_for_pickup orders this driver missed
      if (is_online) {
        lastDispatchCheck.set(req.riderId!, Date.now());
        dispatchReadyOrdersToDriver(req.riderId!).catch(console.error);
      }
    } catch (err) {
      console.error('updateStatus error:', err);
      res.status(500).json({ error: 'Failed to update status' });
    }
  }

  async updateLocation(req: Request, res: Response) {
    try {
      const { latitude, longitude, heading, speed, accuracy, timestamp } = req.body;
      if (latitude == null || longitude == null) {
        return res.status(400).json({ error: 'latitude and longitude required' });
      }

      // last_seen is a connectivity heartbeat ("is this rider's app still
      // alive"), independent of whether this particular fix is trustworthy
      // enough to show as their location — always updated, even when the
      // coordinates below get rejected.
      await supabaseAdmin
        .from('delivery_partners')
        .update({ last_seen: new Date().toISOString() })
        .eq('user_id', req.riderId!);

      // A too-inaccurate fix (e.g. a cold GPS lock) or a stale cached one
      // (e.g. Location.getLastKnownPositionAsync() returning an hours-old
      // fix) would otherwise get shown to a customer's live tracking map as
      // current — `driver_locations.updated_at` reflects server receipt
      // time, not when the GPS fix was actually taken, so without this check
      // a stale fix looks perfectly "fresh" downstream. Skip the upsert
      // rather than erroring the request — this is a routine best-effort
      // heartbeat, not a user-initiated action worth failing loudly.
      const accuracyNum = accuracy != null ? Number(accuracy) : null;
      const tooInaccurate = accuracyNum != null && accuracyNum > MAX_ACCEPTABLE_LOCATION_ACCURACY_METERS;
      const fixTimestamp = timestamp != null ? Number(timestamp) : null;
      const tooStale = fixTimestamp != null && Date.now() - fixTimestamp > MAX_LOCATION_FIX_AGE_MS;

      if (tooInaccurate || tooStale) {
        return res.json({ success: true, locationAccepted: false, reason: tooInaccurate ? 'inaccurate' : 'stale' });
      }

      const fields: Record<string, unknown> = {
        delivery_partner_id: req.riderId!,
        latitude: Number(latitude),
        longitude: Number(longitude),
        updated_at: new Date().toISOString(),
      };
      if (heading != null) fields.heading = Number(heading);
      if (speed != null) fields.speed = Number(speed);
      if (accuracyNum != null) fields.accuracy = accuracyNum;

      await supabaseAdmin
        .from('driver_locations')
        .upsert(fields, { onConflict: 'delivery_partner_id' });

      res.json({ success: true, locationAccepted: true });

      // Throttled: if this driver just came into range of a ready order they missed, offer it to them
      if (shouldCheckDispatch(req.riderId!)) {
        dispatchReadyOrdersToDriver(req.riderId!).catch(console.error);
      }
    } catch (err) {
      console.error('updateLocation error:', err);
      res.status(500).json({ error: 'Failed to update location' });
    }
  }

  async getOrders(req: Request, res: Response) {
    try {
      const statusParam = req.query.status as string;

      // Get all store_orders for this rider
      const { data: storeOrders } = await supabaseAdmin
        .from('store_orders')
        .select('customer_order_id, store_id')
        .eq('delivery_partner_id', req.riderId!);

      if (!storeOrders?.length) {
        return res.json({ success: true, orders: [] });
      }

      const orderIds = storeOrders.map((so: any) => so.customer_order_id);
      const storeIdMap: Record<string, string> = {};
      storeOrders.forEach((so: any) => { storeIdMap[so.customer_order_id] = so.store_id; });

      // Filter by status bucket
      let dbStatuses: string[];
      if (statusParam === 'completed') {
        dbStatuses = ['order_delivered'];
      } else {
        dbStatuses = ACTIVE_DB_STATUSES;
      }

      const { data: orders } = await supabaseAdmin
        .from('customer_orders')
        .select('id, order_code, status, total_amount, delivery_address, delivery_latitude, delivery_longitude, placed_at, notes')
        .in('id', orderIds)
        .in('status', dbStatuses)
        .order('placed_at', { ascending: false });

      if (!orders?.length) {
        return res.json({ success: true, orders: [] });
      }

      // Fetch stores
      const uniqueStoreIds = [...new Set(orders.map((o: any) => storeIdMap[o.id]).filter(Boolean))];
      const { data: stores } = await supabaseAdmin
        .from('stores')
        .select('id, name, address, latitude, longitude, phone')
        .in('id', uniqueStoreIds);

      const storeById: Record<string, any> = {};
      (stores || []).forEach((s: any) => { storeById[s.id] = s; });

      // Fetch order items
      const { data: items } = await supabaseAdmin
        .from('order_items')
        .select('customer_order_id, product_name, quantity, unit')
        .in('customer_order_id', orders.map((o: any) => o.id));

      const itemsByOrder: Record<string, any[]> = {};
      (items || []).forEach((item: any) => {
        if (!itemsByOrder[item.customer_order_id]) itemsByOrder[item.customer_order_id] = [];
        itemsByOrder[item.customer_order_id].push({
          product_name: item.product_name,
          quantity: item.quantity,
          unit: item.unit,
        });
      });

      // For completed orders, fetch this rider's real payout row per order —
      // the earnings screen used to compute 15% of total_amount client-side
      // with nothing server-side backing it. payRiderForDeliveredOrder (see
      // markDelivered) writes one row per order once delivered; orders
      // delivered before that existed have no payout row (payout_amount null).
      let payoutByOrder: Record<string, number> = {};
      if (statusParam === 'completed') {
        const { data: payouts } = await supabaseAdmin
          .from('delivery_partners_payouts')
          .select('customer_order_id, amount')
          .eq('partner_user_id', req.riderId!)
          .in('customer_order_id', orders.map((o: any) => o.id));
        (payouts || []).forEach((p: any) => { payoutByOrder[p.customer_order_id] = Number(p.amount); });
      }

      const mapped = orders.map((o: any) => {
        const storeId = storeIdMap[o.id];
        const store = storeId ? storeById[storeId] : null;
        return {
          ...o,
          status: mapDbStatusToRider(o.status),
          stores: store ? {
            name: store.name,
            address: store.address,
            latitude: store.latitude,
            longitude: store.longitude,
            phone: store.phone,
          } : null,
          order_items: itemsByOrder[o.id] || [],
          payout_amount: statusParam === 'completed' ? (payoutByOrder[o.id] ?? null) : undefined,
        };
      });

      res.json({ success: true, orders: mapped });
    } catch (err) {
      console.error('getOrders error:', err);
      res.status(500).json({ error: 'Failed to fetch orders' });
    }
  }

  async getOrderById(req: Request, res: Response) {
    try {
      const { orderId } = req.params;

      // Verify this order belongs to this rider
      const { data: storeOrder } = await supabaseAdmin
        .from('store_orders')
        .select('store_id')
        .eq('customer_order_id', orderId)
        .eq('delivery_partner_id', req.riderId!)
        .maybeSingle();

      if (!storeOrder) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const { data: order } = await supabaseAdmin
        .from('customer_orders')
        .select('id, order_code, status, total_amount, delivery_address, delivery_latitude, delivery_longitude, placed_at, notes')
        .eq('id', orderId)
        .single() as { data: Record<string, any> | null };

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const { data: store } = await supabaseAdmin
        .from('stores')
        .select('id, name, address, latitude, longitude, phone')
        .eq('id', storeOrder.store_id)
        .maybeSingle();

      const { data: items } = await supabaseAdmin
        .from('order_items')
        .select('product_name, quantity, unit')
        .eq('customer_order_id', orderId);

      res.json({
        success: true,
        order: {
          ...order,
          status: mapDbStatusToRider(order.status as string),
          stores: store || null,
          order_items: items || [],
        },
      });
    } catch (err) {
      console.error('getOrderById error:', err);
      res.status(500).json({ error: 'Failed to fetch order' });
    }
  }

  async acceptOrder(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const riderId = req.riderId!;

      const { data: partner } = await supabaseAdmin
        .from('delivery_partners')
        .select('is_approved, is_online, status')
        .eq('user_id', riderId)
        .maybeSingle();
      if (!(partner as any)?.is_approved) {
        return res.status(403).json({ error: 'Your account is not yet approved by admin.' });
      }
      if (!(partner as any)?.is_online || (partner as any)?.status !== 'active') {
        return res.status(403).json({ error: 'Go online to accept orders.' });
      }

      // Atomically claim only if no rider is already assigned — prevents a rider
      // from grabbing an order another rider (or acceptOffer) already accepted.
      const { data: claimed, error: claimError } = await supabaseAdmin
        .from('store_orders')
        .update({ status: 'delivery_partner_assigned', delivery_partner_id: riderId })
        .eq('customer_order_id', orderId)
        .is('delivery_partner_id', null)
        .select('id');

      if (claimError) throw claimError;
      if (!claimed || claimed.length === 0) {
        return res.status(409).json({ error: 'Order not found or already assigned to another rider.' });
      }

      const { error } = await supabaseAdmin
        .from('customer_orders')
        .update({ status: 'delivery_partner_assigned', assigned_driver_id: riderId, updated_at: new Date().toISOString() })
        .eq('id', orderId);

      if (error) throw error;

      await supabaseAdmin.from('order_status_history').insert({
        customer_order_id: orderId,
        status: 'delivery_partner_assigned',
        notes: 'Rider accepted order',
      });

      notificationService.sendOrderNotification(orderId, 'rider_assigned').catch(console.error);

      res.json({ success: true });
    } catch (err) {
      console.error('acceptOrder error:', err);
      res.status(500).json({ error: 'Failed to accept order' });
    }
  }

  async rejectOrder(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const riderId = req.riderId!;

      if (!(await requireApprovedRider(riderId))) {
        return res.status(403).json({ error: 'Your account is not yet approved by admin.' });
      }

      // Clear delivery partner assignment and reset to ready_for_pickup so it can be reassigned.
      // Ownership-filtered: only the rider actually assigned to this order can reject it.
      const { data: released, error } = await supabaseAdmin
        .from('store_orders')
        .update({ delivery_partner_id: null, status: 'ready_for_pickup' })
        .eq('customer_order_id', orderId)
        .eq('delivery_partner_id', riderId)
        .select('id');

      if (error) throw error;
      if (!released || released.length === 0) {
        return res.status(403).json({ error: 'This order is not assigned to you.' });
      }

      await supabaseAdmin
        .from('customer_orders')
        .update({ status: 'ready_for_pickup', assigned_driver_id: null, updated_at: new Date().toISOString() })
        .eq('id', orderId)
        .eq('assigned_driver_id', riderId);

      await supabaseAdmin.from('order_status_history').insert({
        customer_order_id: orderId,
        status: 'ready_for_pickup',
        notes: 'Rider rejected order, awaiting reassignment',
      });

      res.json({ success: true });
    } catch (err) {
      console.error('rejectOrder error:', err);
      res.status(500).json({ error: 'Failed to reject order' });
    }
  }

  async markPickedUp(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const riderId = req.riderId!;

      if (!(await requireApprovedRider(riderId))) {
        return res.status(403).json({ error: 'Your account is not yet approved by admin.' });
      }

      // Ownership-filtered: only the rider assigned to this order can mark it picked up.
      const { data: updated, error } = await supabaseAdmin
        .from('customer_orders')
        .update({ status: 'order_picked_up', updated_at: new Date().toISOString() })
        .eq('id', orderId)
        .eq('assigned_driver_id', riderId)
        .select('id');

      if (error) throw error;
      if (!updated || updated.length === 0) {
        return res.status(403).json({ error: 'This order is not assigned to you.' });
      }

      await supabaseAdmin
        .from('store_orders')
        .update({ status: 'order_picked_up' })
        .eq('customer_order_id', orderId)
        .eq('delivery_partner_id', riderId);

      await supabaseAdmin.from('order_status_history').insert({
        customer_order_id: orderId,
        status: 'order_picked_up',
        notes: 'Rider picked up order from store',
      });

      notificationService.sendOrderNotification(orderId, 'order_shipped').catch(console.error);

      res.json({ success: true });
    } catch (err) {
      console.error('markPickedUp error:', err);
      res.status(500).json({ error: 'Failed to update pickup status' });
    }
  }

  async markDelivered(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const riderId = req.riderId!;

      if (!(await requireApprovedRider(riderId))) {
        return res.status(403).json({ error: 'Your account is not yet approved by admin.' });
      }

      // Ownership-filtered: only the rider assigned to this order can mark it delivered.
      const { data: updated, error } = await supabaseAdmin
        .from('customer_orders')
        .update({ status: 'order_delivered', updated_at: new Date().toISOString() })
        .eq('id', orderId)
        .eq('assigned_driver_id', riderId)
        .select('id');

      if (error) throw error;
      if (!updated || updated.length === 0) {
        return res.status(403).json({ error: 'This order is not assigned to you.' });
      }

      await supabaseAdmin
        .from('store_orders')
        .update({ status: 'order_delivered' })
        .eq('customer_order_id', orderId)
        .eq('delivery_partner_id', riderId);

      await supabaseAdmin.from('order_status_history').insert({
        customer_order_id: orderId,
        status: 'order_delivered',
        notes: 'Order delivered to customer',
      });

      // Notify customer (best-effort)
      try {
        const { data: order } = await supabaseAdmin
          .from('customer_orders')
          .select('customer_id, order_code, tip_amount')
          .eq('id', orderId)
          .single();
        if (order) {
          await notificationService.sendOrderNotification(orderId, 'order_delivered');
          await payRiderForDeliveredOrder(orderId, riderId, order.customer_id, order.tip_amount);
        }
      } catch { /* non-critical */ }

      res.json({ success: true });
    } catch (err) {
      console.error('markDelivered error:', err);
      res.status(500).json({ error: 'Failed to update delivery status' });
    }
  }

  // POST /delivery-partner/orders/:orderId/verify-delivery-otp
  // Body: { otp: "1234" }
  // Rider enters the OTP the customer reads aloud to confirm the right order is being handed over.
  async verifyDeliveryOTP(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const { otp } = req.body as { otp?: string };

      if (!otp || !/^\d{4}$/.test(otp)) {
        return res.status(400).json({ error: 'A 4-digit OTP is required' });
      }

      const { data: order } = await supabaseAdmin
        .from('customer_orders')
        .select('id, delivery_otp, status')
        .eq('id', orderId)
        .eq('assigned_driver_id', req.riderId!)
        .maybeSingle();

      if (!order) return res.status(403).json({ error: 'Not authorized for this order' });
      if ((order as any).status === 'order_delivered') {
        return res.json({ success: true, already_done: true });
      }

      if ((order as any).delivery_otp !== otp) {
        return res.status(400).json({ success: false, error: 'Incorrect OTP. Ask customer to check their app.' });
      }

      res.json({ success: true });
    } catch (err) {
      console.error('verifyDeliveryOTP error:', err);
      res.status(500).json({ error: 'Failed to verify OTP' });
    }
  }

  /**
   * Get the caller's current pending profile-change request, if any — so the
   * profile screen can show a "pending review" banner across sessions
   * instead of only right after submitting.
   */
  async getProfileChangeRequest(req: Request, res: Response) {
    try {
      const { data, error } = await supabaseAdmin
        .from('rider_profile_change_requests')
        .select('*')
        .eq('rider_id', req.riderId!)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('❌ getProfileChangeRequest error:', error);
        return res.status(500).json({ success: false, error: error.message });
      }

      res.json({ success: true, request: data ?? null });
    } catch (err: any) {
      console.error('❌ getProfileChangeRequest error:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to fetch change request' });
    }
  }

  /**
   * Submit a change to name/email/address for admin review — does NOT apply
   * anything directly. name lives on app_users, email/address on
   * delivery_partners, so the diff is built against both. Resubmitting
   * while a request is still pending replaces it in place (one open request
   * per rider, enforced by a partial unique index) rather than stacking
   * duplicates.
   */
  async requestProfileChange(req: Request, res: Response) {
    try {
      const riderId = req.riderId!;
      const { data: user } = await supabaseAdmin
        .from('app_users').select('name').eq('id', riderId).maybeSingle();
      const { data: partner } = await supabaseAdmin
        .from('delivery_partners').select('email, address').eq('user_id', riderId).maybeSingle();

      if (!user || !partner) {
        return res.status(404).json({ success: false, error: 'Rider not found' });
      }

      const body = req.body as { name?: string; email?: string; address?: string };
      const current: Record<string, string> = {
        name: user.name ?? '',
        email: partner.email ?? '',
        address: partner.address ?? '',
      };
      const changes: Record<string, { old: string | null; new: string }> = {};
      for (const field of ['name', 'email', 'address'] as const) {
        const val = body[field];
        if (typeof val === 'string' && val.trim() !== '' && val.trim() !== current[field]) {
          changes[field] = { old: current[field] || null, new: val.trim() };
        }
      }

      if (Object.keys(changes).length === 0) {
        return res.status(400).json({ success: false, error: 'No changes to submit' });
      }

      const now = new Date().toISOString();
      const { data: updatedExisting, error: updateErr } = await supabaseAdmin
        .from('rider_profile_change_requests')
        .update({ changes, created_at: now })
        .eq('rider_id', riderId)
        .eq('status', 'pending')
        .select()
        .maybeSingle();
      if (updateErr) throw updateErr;

      let saved = updatedExisting;
      if (!saved) {
        const { data: inserted, error: insertErr } = await supabaseAdmin
          .from('rider_profile_change_requests')
          .insert({ rider_id: riderId, changes })
          .select()
          .single();

        if (insertErr) {
          if (insertErr.code === '23505') {
            const { data: retried, error: retryErr } = await supabaseAdmin
              .from('rider_profile_change_requests')
              .update({ changes, created_at: now })
              .eq('rider_id', riderId)
              .eq('status', 'pending')
              .select()
              .single();
            if (retryErr) throw retryErr;
            saved = retried;
          } else {
            throw insertErr;
          }
        } else {
          saved = inserted;
        }
      }

      const fieldList = Object.keys(changes).join(', ');
      await notifyAdminsOfRiderDocs(
        'profile_change_request',
        'Rider Profile Change Requested',
        `${user.name || 'A rider'} requested a change to: ${fieldList}`,
        { riderId, requestId: saved.id, changes }
      );

      res.json({ success: true, request: saved });
    } catch (err: any) {
      console.error('❌ requestProfileChange error:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to submit change request' });
    }
  }

  /**
   * Legacy base64-to-backend profile-photo upload. The live app has since
   * moved to a direct-to-Storage upload (lib/storage.ts -> delivery_partner_image,
   * followed by PATCH /photo-urls) for consistency with the shopkeeper build,
   * but this route is kept live (not removed) with a real bucket backing it —
   * restored 2026-07-27 after the rider-avatars bucket was confirmed created.
   */
  async updateProfileImage(req: Request, res: Response) {
    try {
      const { image_base64, mime_type } = req.body as { image_base64?: string; mime_type?: string };
      if (!image_base64) {
        return res.status(400).json({ error: 'image_base64 required' });
      }

      const contentType = mime_type || 'image/jpeg';
      const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
      const path = `${req.riderId!}.${ext}`;
      const buffer = Buffer.from(image_base64, 'base64');

      const { error: uploadError } = await supabaseAdmin.storage
        .from('rider-avatars')
        .upload(path, buffer, { contentType, upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabaseAdmin.storage.from('rider-avatars').getPublicUrl(path);

      // Bust cache with a version query param
      const profile_image_url = `${publicUrl}?v=${Date.now()}`;

      await supabaseAdmin.from('delivery_partners')
        .update({ profile_image_url })
        .eq('user_id', req.riderId!);

      res.json({ success: true, profile_image_url });
    } catch (err) {
      console.error('updateProfileImage error:', err);
      res.status(500).json({ error: 'Failed to upload profile image' });
    }
  }

  /**
   * Sets the rider's vehicle_type, which drives whether vehicle_registration
   * is a required verification document (not required for cycle/e-bike).
   */
  async updateVehicleType(req: Request, res: Response) {
    try {
      const { vehicle_type } = req.body as { vehicle_type?: string };
      if (!isVehicleType(vehicle_type)) {
        return res.status(400).json({ success: false, error: `vehicle_type must be one of ${VEHICLE_TYPES.join(', ')}` });
      }
      await supabaseAdmin
        .from('delivery_partners')
        .update({ vehicle_type, updated_at: new Date().toISOString() })
        .eq('user_id', req.riderId!);
      res.json({ success: true, vehicle_type });
    } catch (err) {
      console.error('updateVehicleType error:', err);
      res.status(500).json({ success: false, error: 'Failed to update vehicle type' });
    }
  }

  /**
   * Persists the public URL of a photo already uploaded directly to Storage
   * by the app (anon-direct upload to delivery_partner_image/
   * delivery_partner_vehicle — see lib/storage.ts in the rider app), mirroring
   * how the shopkeeper app's patchStore({ image_url, owner_image_url }) works.
   */
  async updatePhotoUrls(req: Request, res: Response) {
    try {
      const { profile_image_url, vehicle_image_url } = req.body as {
        profile_image_url?: string;
        vehicle_image_url?: string;
      };
      const updates: Record<string, unknown> = {};
      if (profile_image_url !== undefined) updates.profile_image_url = profile_image_url;
      if (vehicle_image_url !== undefined) updates.vehicle_image_url = vehicle_image_url;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, error: 'No valid fields to update' });
      }

      updates.updated_at = new Date().toISOString();
      await supabaseAdmin.from('delivery_partners').update(updates).eq('user_id', req.riderId!);
      res.json({ success: true });
    } catch (err) {
      console.error('updatePhotoUrls error:', err);
      res.status(500).json({ success: false, error: 'Failed to update photo URLs' });
    }
  }

  /**
   * Get the caller's billing info — name and profile photo are read straight
   * from existing columns (app_users.name, delivery_partners.profile_image_url),
   * not duplicated into new fields; only upi_id is new.
   */
  async getBillingInfo(req: Request, res: Response) {
    try {
      const { data: user } = await supabaseAdmin
        .from('app_users')
        .select('name')
        .eq('id', req.riderId!)
        .maybeSingle();

      const { data: profile } = await supabaseAdmin
        .from('delivery_partners')
        .select('profile_image_url, upi_id')
        .eq('user_id', req.riderId!)
        .maybeSingle();

      res.json({
        success: true,
        billingInfo: {
          name: user?.name ?? null,
          profileImageUrl: profile?.profile_image_url ?? null,
          upiId: profile?.upi_id ?? null,
        },
      });
    } catch (err) {
      console.error('getBillingInfo error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch billing info' });
    }
  }

  /** Freely re-editable — no submitted-once lock, same as other profile fields. */
  async saveBillingInfo(req: Request, res: Response) {
    try {
      const upiId = typeof req.body?.upi_id === 'string' ? req.body.upi_id.trim() : undefined;
      if (upiId !== undefined && upiId && !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,64}$/.test(upiId)) {
        return res.status(400).json({ success: false, error: 'Invalid UPI ID — expected format e.g. name@bank' });
      }
      if (upiId === undefined) {
        return res.status(400).json({ success: false, error: 'No valid fields to update' });
      }

      await supabaseAdmin
        .from('delivery_partners')
        .update({ upi_id: upiId || null, updated_at: new Date().toISOString() })
        .eq('user_id', req.riderId!);

      res.json({ success: true });
    } catch (err) {
      console.error('saveBillingInfo error:', err);
      res.status(500).json({ success: false, error: 'Failed to save billing info' });
    }
  }

  /**
   * List the required verification documents for the caller (rider), each
   * with a freshly signed URL (never a stored permanent one — the bucket is
   * private). vehicle_registration is included in the list regardless of
   * vehicle_type (the app greys it out / marks it not-required client-side
   * for cycle/e-bike), matching how the completeness check treats it as
   * simply not counted toward the required total for those riders.
   */
  async getVerificationDocuments(req: Request, res: Response) {
    try {
      const riderId = req.riderId!;

      const { data: rows, error } = await supabaseAdmin
        .from('delivery_partner_verification_documents')
        .select('*')
        .eq('partner_id', riderId);

      if (error) {
        console.error('❌ getVerificationDocuments (rider) error:', error);
        return res.status(500).json({ success: false, error: error.message });
      }

      const byType = new Map((rows ?? []).map((r) => [r.doc_type, r]));

      const documents = await Promise.all(
        DOC_TYPES.map(async (docType) => {
          const row = byType.get(docType);
          let url: string | null = null;
          if (row?.storage_path) {
            const { data: signed } = await supabaseAdmin.storage
              .from(VERIFICATION_DOCS_BUCKET)
              .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);
            url = signed?.signedUrl ?? null;
          }
          return {
            doc_type: docType,
            number: row?.number ?? null,
            url,
            status: row?.status ?? null,
            rejection_reason: row?.rejection_reason ?? null,
            uploaded_at: row?.uploaded_at ?? null,
            reviewed_at: row?.reviewed_at ?? null,
            approved_at: row?.approved_at ?? null,
            file_size: row?.file_size ?? null,
          };
        })
      );

      res.json({ success: true, documents });
    } catch (error: any) {
      console.error('❌ getVerificationDocuments (rider) error:', error);
      res.status(500).json({ success: false, error: error?.message || 'Failed to fetch verification documents' });
    }
  }

  /**
   * Save one verification document — proxies the file upload through this
   * server (service-role Storage write) instead of letting the app write to
   * Storage directly, same reasoning as the shopkeeper version. Always resets
   * status to 'pending' so a re-upload after a rejection goes back into review.
   */
  async saveVerificationDocument(req: Request, res: Response) {
    try {
      const riderId = req.riderId!;
      const { docType } = req.params;
      if (!isDocType(docType)) {
        return res.status(400).json({ success: false, error: 'Invalid document type' });
      }

      const number = typeof req.body?.number === 'string' ? req.body.number.trim().toUpperCase() : '';
      const file = (req as Request & { file?: UploadedFile }).file;

      if (!number && !file) {
        return res.status(400).json({ success: false, error: 'Provide a document number and/or file' });
      }

      if (number && !validateDocNumber(docType, number)) {
        return res.status(400).json({ success: false, error: docNumberErrorMessage(docType) });
      }

      const { data: existing } = await supabaseAdmin
        .from('delivery_partner_verification_documents')
        .select('number, storage_path, file_size, approved_at, approved_by')
        .eq('partner_id', riderId)
        .eq('doc_type', docType)
        .maybeSingle();

      let storagePath: string | undefined;
      if (file) {
        const ext = ALLOWED_DOC_MIME_TYPES[file.mimetype];
        if (!ext) {
          return res.status(400).json({ success: false, error: 'Unsupported file type' });
        }
        if (file.size > MAX_DOC_SIZE_BYTES) {
          return res.status(400).json({
            success: false,
            error: `File exceeds ${MAX_DOC_SIZE_BYTES / (1024 * 1024)}MB limit`,
          });
        }
        storagePath = `${riderId}/${docType}.${ext}`;
        const { error: uploadError } = await supabaseAdmin.storage
          .from(VERIFICATION_DOCS_BUCKET)
          .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: true });
        if (uploadError) {
          console.error('❌ saveVerificationDocument (rider) upload error:', uploadError);
          return res.status(500).json({ success: false, error: uploadError.message });
        }

        if (existing?.storage_path && existing.storage_path !== storagePath) {
          const { error: removeError } = await supabaseAdmin.storage
            .from(VERIFICATION_DOCS_BUCKET)
            .remove([existing.storage_path]);
          if (removeError) {
            console.error('❌ saveVerificationDocument (rider) old-file cleanup error:', removeError);
          }
        }
      }

      const { data, error } = await supabaseAdmin
        .from('delivery_partner_verification_documents')
        .upsert(
          {
            partner_id: riderId,
            doc_type: docType,
            number: number || existing?.number || null,
            storage_path: storagePath || existing?.storage_path || null,
            file_size: file ? formatFileSize(file.size) : existing?.file_size ?? null,
            status: 'pending',
            rejection_reason: null,
            reviewed_by: null,
            reviewed_at: null,
            approved_at: existing?.approved_at ?? null,
            approved_by: existing?.approved_by ?? null,
            uploaded_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'partner_id,doc_type' }
        )
        .select()
        .single();

      if (error) {
        console.error('❌ saveVerificationDocument (rider) upsert error:', error);
        return res.status(500).json({ success: false, error: error.message });
      }

      // The Vehicle Registration (RC) document's own number field IS the
      // rider's vehicle registration/plate number — mirror it onto
      // delivery_partners.vehicle_number so it shows up on the profile page
      // without a separate, duplicate input anywhere else.
      if (docType === 'vehicle_registration' && number) {
        await supabaseAdmin
          .from('delivery_partners')
          .update({ vehicle_number: number })
          .eq('user_id', riderId);
      }

      const { suspended: riderSuspended, name: riderName } = await suspendRiderIfApprovedAndGetName(riderId);

      const isFirstUploadForThisSlot = !!file && !existing?.storage_path;
      await notifyAdminsOfRiderDocs(
        'rider_document_uploaded',
        isFirstUploadForThisSlot ? 'Rider verification document uploaded' : 'Rider verification document updated',
        `${riderName} ${isFirstUploadForThisSlot ? 'uploaded' : 'updated'} ${DOC_LABELS[docType]}.`,
        { partner_id: riderId, doc_type: docType }
      );

      if (await markRiderVerificationSubmittedIfReady(riderId)) {
        await notifyAdminsOfRiderDocs(
          'rider_verification_submitted',
          'Rider ready for verification review',
          `${riderName} has uploaded all required documents and is ready for review.`,
          { partner_id: riderId }
        );
      }

      res.json({ success: true, document: data, riderSuspended });
    } catch (error: any) {
      console.error('❌ saveVerificationDocument (rider) error:', error);
      res.status(500).json({ success: false, error: error?.message || 'Failed to save document' });
    }
  }

  /**
   * Delete one verification document — removes both the storage object and
   * the DB row so the rider can start that document over from scratch. The
   * storage removal is best-effort: if it fails, the DB row is still deleted
   * so the rider isn't stuck unable to re-upload over a stale error.
   */
  async deleteVerificationDocument(req: Request, res: Response) {
    try {
      const riderId = req.riderId!;
      const { docType } = req.params;
      if (!isDocType(docType)) {
        return res.status(400).json({ success: false, error: 'Invalid document type' });
      }

      const { data: existing } = await supabaseAdmin
        .from('delivery_partner_verification_documents')
        .select('storage_path')
        .eq('partner_id', riderId)
        .eq('doc_type', docType)
        .maybeSingle();

      if (!existing) {
        return res.status(404).json({ success: false, error: 'No document uploaded for this type' });
      }

      if (existing.storage_path) {
        const { error: removeError } = await supabaseAdmin.storage
          .from(VERIFICATION_DOCS_BUCKET)
          .remove([existing.storage_path]);
        if (removeError) {
          console.error('❌ deleteVerificationDocument (rider) storage remove error:', removeError);
        }
      }

      const { error } = await supabaseAdmin
        .from('delivery_partner_verification_documents')
        .delete()
        .eq('partner_id', riderId)
        .eq('doc_type', docType);

      if (error) {
        console.error('❌ deleteVerificationDocument (rider) error:', error);
        return res.status(500).json({ success: false, error: error.message });
      }

      // Removing any document ends the current "submission complete" cycle —
      // clear the flag so a later re-completion fires a fresh "ready for
      // review" notification instead of staying silently suppressed.
      const partnerUpdate: Record<string, unknown> = { verification_submitted_at: null };
      // The RC document's number is the only source of vehicle_number (see
      // saveVerificationDocument) — clear it too so the profile page doesn't
      // keep showing a number whose backing document no longer exists.
      if (docType === 'vehicle_registration') partnerUpdate.vehicle_number = null;
      await supabaseAdmin
        .from('delivery_partners')
        .update(partnerUpdate)
        .eq('user_id', riderId);

      const { suspended: riderSuspended, name: riderName } = await suspendRiderIfApprovedAndGetName(riderId);

      await notifyAdminsOfRiderDocs(
        'rider_document_removed',
        'Rider verification document removed',
        `${riderName} removed ${DOC_LABELS[docType]}.`,
        { partner_id: riderId, doc_type: docType }
      );

      res.json({ success: true, riderSuspended });
    } catch (error: any) {
      console.error('❌ deleteVerificationDocument (rider) error:', error);
      res.status(500).json({ success: false, error: error?.message || 'Failed to delete document' });
    }
  }

  async updatePushToken(req: Request, res: Response) {
    try {
      const { expo_push_token } = req.body;
      if (!expo_push_token) {
        return res.status(400).json({ error: 'expo_push_token required' });
      }
      await supabaseAdmin.from('delivery_partners').update({ expo_push_token }).eq('user_id', req.riderId!);
      res.json({ success: true });
    } catch (err) {
      console.error('updatePushToken error:', err);
      res.status(500).json({ error: 'Failed to save push token' });
    }
  }

  // Server-side source of truth for the rider app's Notification Preferences
  // screen — mirrors the shopkeeper app's own preferences endpoint shape, but
  // actually read back on load (GET) rather than relying purely on
  // AsyncStorage, and actually enforced server-side (see
  // notification.service.ts's isRiderNotificationEnabled) rather than saved
  // and silently ignored.
  async getRiderNotificationPreferences(req: Request, res: Response) {
    try {
      const { data } = await supabaseAdmin
        .from('app_users')
        .select('notification_preferences')
        .eq('id', req.riderId!)
        .maybeSingle();
      const stored = (data as { notification_preferences?: Record<string, unknown> } | null)?.notification_preferences;
      res.json({
        success: true,
        preferences: {
          newOrders: true,
          profileUpdates: true,
          ...stored,
        },
      });
    } catch (err) {
      console.error('getRiderNotificationPreferences error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch notification preferences' });
    }
  }

  async updateRiderNotificationPreferences(req: Request, res: Response) {
    try {
      const preferences = req.body as Record<string, unknown>;
      const { error } = await supabaseAdmin
        .from('app_users')
        .update({ notification_preferences: preferences })
        .eq('id', req.riderId!)
        .eq('role', 'delivery_partner');
      if (error) throw error;
      res.json({ success: true });
    } catch (err) {
      console.error('updateRiderNotificationPreferences error:', err);
      res.status(500).json({ success: false, error: 'Failed to update notification preferences' });
    }
  }

  async getNotifications(req: Request, res: Response) {
    try {
      const { unreadOnly } = req.query;
      const notifications = await databaseService.getUserNotifications('rider', req.riderId!, unreadOnly === 'true');
      res.json(notifications);
    } catch (err) {
      console.error('getNotifications error:', err);
      res.status(500).json({ error: 'Failed to fetch notifications' });
    }
  }

  async markNotificationRead(req: Request, res: Response) {
    try {
      const { notificationId } = req.params;
      const result = await databaseService.markNotificationAsRead(notificationId, 'rider', req.riderId!);
      res.json(result);
    } catch (err) {
      console.error('markNotificationRead error:', err);
      res.status(500).json({ error: 'Failed to mark notification as read' });
    }
  }

  async markAllNotificationsRead(req: Request, res: Response) {
    try {
      const result = await databaseService.markAllNotificationsAsRead('rider', req.riderId!);
      res.json(result);
    } catch (err) {
      console.error('markAllNotificationsRead error:', err);
      res.status(500).json({ error: 'Failed to mark all notifications as read' });
    }
  }

  // ── New dispatch endpoints ────────────────────────────────────────────────────

  // GET /delivery-partner/available-orders
  // Returns pending offer rows for this driver (the "new order requests" screen)
  async getAvailableOrders(req: Request, res: Response) {
    try {
      const { data: offers, error } = await supabaseAdmin
        .from('driver_order_offers')
        .select('id, order_id, status, created_at')
        .eq('driver_id', req.riderId!)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!offers?.length) return res.json({ success: true, offers: [] });

      const orderIds = offers.map((o: any) => o.order_id);

      const [{ data: orders }, { data: allocations }] = await Promise.all([
        supabaseAdmin.from('customer_orders')
          .select('id, order_code, status, total_amount, delivery_address, delivery_latitude, delivery_longitude, placed_at')
          .in('id', orderIds),
        supabaseAdmin.from('order_store_allocations')
          .select('order_id, store_id, sequence_number')
          .in('order_id', orderIds)
          .in('status', ['pending_acceptance', 'accepted', 'picked_up'])
          .order('sequence_number', { ascending: true }),
      ]);

      const orderMap: Record<string, any> = {};
      (orders || []).forEach((o: any) => { orderMap[o.id] = o; });

      const storeIds = [...new Set((allocations || []).map((a: any) => a.store_id))];
      const { data: stores } = storeIds.length
        ? await supabaseAdmin.from('stores').select('id, name, address, latitude, longitude').in('id', storeIds)
        : { data: [] };
      const storeMap: Record<string, any> = {};
      (stores || []).forEach((s: any) => { storeMap[s.id] = s; });

      const allocsByOrder: Record<string, any[]> = {};
      (allocations || []).forEach((a: any) => {
        if (!allocsByOrder[a.order_id]) allocsByOrder[a.order_id] = [];
        allocsByOrder[a.order_id].push(a);
      });

      const result = offers.map((offer: any) => {
        const order = orderMap[offer.order_id] || {};
        const orderAllocs = allocsByOrder[offer.order_id] || [];
        return {
          offer_id: offer.id,
          order_id: offer.order_id,
          order_code: order.order_code,
          total_amount: order.total_amount,
          delivery_address: order.delivery_address,
          customer_lat: order.delivery_latitude,
          customer_lng: order.delivery_longitude,
          placed_at: offer.created_at,
          store_count: orderAllocs.length,
          stores: orderAllocs.map((a: any) => ({
            store_id: a.store_id,
            sequence_number: a.sequence_number,
            name: storeMap[a.store_id]?.name,
            address: storeMap[a.store_id]?.address,
            latitude: storeMap[a.store_id]?.latitude,
            longitude: storeMap[a.store_id]?.longitude,
          })),
        };
      });

      res.json({ success: true, offers: result });
    } catch (err) {
      console.error('getAvailableOrders error:', err);
      res.status(500).json({ error: 'Failed to fetch available orders' });
    }
  }

  // POST /delivery-partner/offers/:offerId/accept
  // Atomic via DB function — only one driver wins per order
  async acceptOffer(req: Request, res: Response) {
    try {
      const { offerId } = req.params;

      const { data: partner } = await supabaseAdmin
        .from('delivery_partners')
        .select('is_approved, is_online, status')
        .eq('user_id', req.riderId!)
        .maybeSingle();
      if (!(partner as any)?.is_approved) {
        return res.status(403).json({ error: 'Your account is not yet approved by admin.' });
      }
      if (!(partner as any)?.is_online || (partner as any)?.status !== 'active') {
        return res.status(403).json({ error: 'Go online to accept orders.' });
      }

      // Final authority is the DB function (SELECT ... FOR UPDATE, re-checks eligibility
      // atomically at accept time) — the check above is just a fast, friendly failure.
      const { data: result, error } = await supabaseAdmin
        .rpc('accept_driver_offer', { p_offer_id: offerId, p_driver_id: req.riderId! });

      if (error) throw error;

      if (result === 'accepted') {
        // accept_driver_offer() already sets assigned_driver_id/status on
        // customer_orders and delivery_partner_id/status/assigned_at on every
        // store_orders row for this order, inside the same row-locked
        // transaction that decided this driver won — no follow-up writes
        // needed here. (An earlier version of this code duplicated those
        // writes here as two separate, unguarded statements, which really was
        // a race — a crash between them could leave customer_orders and
        // store_orders disagreeing about who's assigned. That's now
        // impossible: both tables are written atomically inside the RPC.)
        const { data: offer } = await supabaseAdmin
          .from('driver_order_offers').select('order_id').eq('id', offerId).single();
        const orderId = offer?.order_id;

        if (orderId) {
          notificationService.sendOrderNotification(orderId, 'rider_assigned').catch(console.error);
        }

        return res.json({ success: true, result: 'accepted', order_id: orderId });
      }
      if (result === 'already_taken') {
        return res.status(409).json({ success: false, result: 'already_taken', error: 'Another driver accepted first' });
      }
      if (result === 'driver_not_eligible') {
        return res.status(403).json({ success: false, result, error: 'Go online to accept orders.' });
      }
      return res.status(400).json({ success: false, result, error: result });
    } catch (err) {
      console.error('acceptOffer error:', err);
      res.status(500).json({ error: 'Failed to accept offer' });
    }
  }

  // GET /delivery-partner/orders/:orderId/pickup-sequence
  // Full multi-store route with items per stop — shown on driver's active order screen
  async getPickupSequence(req: Request, res: Response) {
    try {
      const { orderId } = req.params;

      const { data: order } = await supabaseAdmin
        .from('customer_orders')
        .select('id, order_code, status, total_amount, delivery_address, delivery_latitude, delivery_longitude, assigned_driver_id, receiver_name, receiver_phone, receiver_address')
        .eq('id', orderId)
        .eq('assigned_driver_id', req.riderId!)
        .maybeSingle();

      if (!order) return res.status(404).json({ error: 'Order not found or not assigned to you' });

      const { data: allocations } = await supabaseAdmin
        .from('order_store_allocations')
        .select('id, store_id, sequence_number, status, pickup_code, accepted_item_ids, accepted_at, picked_up_at')
        .eq('order_id', orderId)
        .order('sequence_number', { ascending: true });

      const storeIds = (allocations || []).map((a: any) => a.store_id);
      const [{ data: stores }, { data: items }] = await Promise.all([
        storeIds.length
          ? supabaseAdmin.from('stores').select('id, name, address, latitude, longitude, phone').in('id', storeIds)
          : Promise.resolve({ data: [] }),
        supabaseAdmin.from('order_items')
          .select('id, product_name, quantity, unit, unit_price, assigned_store_id, item_status')
          .eq('customer_order_id', orderId),
      ]);

      const storeMap: Record<string, any> = {};
      (stores || []).forEach((s: any) => { storeMap[s.id] = s; });

      const itemsByStore: Record<string, any[]> = {};
      (items || []).forEach((item: any) => {
        const sid = item.assigned_store_id;
        if (!sid) return;
        if (!itemsByStore[sid]) itemsByStore[sid] = [];
        itemsByStore[sid].push(item);
      });

      const o = order as any;
      const stops = (allocations || []).map((a: any) => ({
        allocation_id: a.id,
        sequence_number: a.sequence_number,
        status: a.status,
        picked_up: a.status === 'picked_up',
        pickup_code_required: a.status === 'accepted',
        picked_up_at: a.picked_up_at,
        store: {
          id: a.store_id,
          name: storeMap[a.store_id]?.name,
          address: storeMap[a.store_id]?.address,
          latitude: storeMap[a.store_id]?.latitude,
          longitude: storeMap[a.store_id]?.longitude,
          phone: storeMap[a.store_id]?.phone,
        },
        items: (itemsByStore[a.store_id] || []).filter((i: any) =>
          !a.accepted_item_ids?.length || a.accepted_item_ids.includes(i.id)
        ),
      }));

      const all_picked_up = stops.every((s: any) => s.picked_up);

      res.json({
        success: true,
        order: {
          id: o.id, order_code: o.order_code, status: o.status, total_amount: o.total_amount,
          customer_address: o.delivery_address,
          customer_lat: o.delivery_latitude, customer_lng: o.delivery_longitude,
          total_stores: stops.length, all_picked_up,
          receiver_name: o.receiver_name || null,
          receiver_phone: o.receiver_phone || null,
          receiver_address: o.receiver_address || null,
        },
        stops,
      });
    } catch (err) {
      console.error('getPickupSequence error:', err);
      res.status(500).json({ error: 'Failed to fetch pickup sequence' });
    }
  }

  // POST /delivery-partner/orders/:orderId/stores/:allocationId/verify-code
  // Body: { code: "1234" }
  async verifyPickupCode(req: Request, res: Response) {
    try {
      const { orderId, allocationId } = req.params;
      const { code } = req.body as { code?: string };

      if (!code || !/^\d{4}$/.test(code)) {
        return res.status(400).json({ error: 'A 4-digit code is required' });
      }

      const { data: orderRow } = await supabaseAdmin
        .from('customer_orders').select('id').eq('id', orderId).eq('assigned_driver_id', req.riderId!).maybeSingle();
      if (!orderRow) return res.status(403).json({ error: 'Not authorized for this order' });

      const { data: alloc } = await supabaseAdmin
        .from('order_store_allocations')
        .select('id, pickup_code, status')
        .eq('id', allocationId).eq('order_id', orderId).maybeSingle();

      if (!alloc) return res.status(404).json({ error: 'Allocation not found' });
      if ((alloc as any).status === 'picked_up') return res.json({ success: true, already_done: true });
      if ((alloc as any).status !== 'accepted') {
        return res.status(409).json({ error: `Cannot verify — status is ${(alloc as any).status}` });
      }

      if ((alloc as any).pickup_code !== code) {
        return res.status(400).json({ success: false, error: 'Incorrect code. Try again.' });
      }

      await supabaseAdmin.from('order_store_allocations').update({
        status: 'picked_up', picked_up_at: new Date().toISOString(),
      }).eq('id', allocationId);

      // Check remaining (not yet picked up) allocations, ordered by sequence so we know what's next
      const { data: remaining } = await supabaseAdmin
        .from('order_store_allocations')
        .select('id, store_id, sequence_number')
        .eq('order_id', orderId)
        .not('status', 'eq', 'picked_up')
        .order('sequence_number', { ascending: true });

      if (!remaining?.length) {
        // All stores done — driver heading to customer
        await Promise.all([
          supabaseAdmin.from('customer_orders').update({ status: 'order_picked_up' }).eq('id', orderId),
          supabaseAdmin.from('store_orders').update({ status: 'order_picked_up', picked_up_at: new Date().toISOString() }).eq('customer_order_id', orderId),
          supabaseAdmin.from('order_status_history').insert({ customer_order_id: orderId, status: 'order_picked_up', notes: 'All stores picked up — driver en route to customer' }),
        ]);
        notificationService.sendOrderNotification(orderId, 'order_shipped').catch(console.error);
      } else {
        // Partial pickup — driver has more stops to visit
        const nextStoreId = (remaining[0] as any).store_id;
        const [{ data: nextStore }, { data: allAllocs }] = await Promise.all([
          supabaseAdmin.from('stores').select('name').eq('id', nextStoreId).maybeSingle(),
          supabaseAdmin.from('order_store_allocations').select('id').eq('order_id', orderId),
        ]);
        const totalStores = allAllocs?.length ?? 0;
        const doneCount = totalStores - remaining.length;
        const nextStoreName = (nextStore as any)?.name || 'next stop';
        await Promise.all([
          supabaseAdmin.from('customer_orders').update({ status: 'picking_up' }).eq('id', orderId),
          supabaseAdmin.from('order_status_history').insert({
            customer_order_id: orderId,
            status: 'picking_up',
            notes: `Picked up from stop ${doneCount} of ${totalStores} · heading to ${nextStoreName}`,
          }),
        ]);
      }

      res.json({ success: true, all_stores_done: !remaining?.length });
    } catch (err) {
      console.error('verifyPickupCode error:', err);
      res.status(500).json({ error: 'Failed to verify code' });
    }
  }
}
