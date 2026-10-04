/**
 * Pure mappings from domain status strings to a display label and badge tone.
 * Every vocabulary used by the admin panel is covered; anything unknown falls
 * back to a humanised label in the neutral tone so new backend values never
 * render as raw snake_case or in a misleading colour.
 *
 * Tone rules (from the design spec):
 *   success  delivered / paid / approved / active / resolved / online
 *   danger   cancelled / failed / rejected / suspended / deleted
 *   warning  pending / preparing / authorized / under review
 *   info     in-flight order states (placed → shipped), in progress
 *   neutral  refunded / inactive / closed / offline / unknown
 */
import type { BadgeTone } from '../components/ui/Badge';
import { humanize } from './format';

export { humanize };

export interface StatusMeta {
  label: string;
  tone: BadgeTone;
}

export type StatusKind =
  | 'order'
  | 'payment'
  | 'verification'
  | 'document'
  | 'generic'
  | 'role'
  | 'payout'
  | 'offer'
  | 'notification'
  | 'severity';

type StatusTable = Record<string, StatusMeta>;

function normalise(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

function lookup(table: StatusTable, value: string | null | undefined, emptyLabel = '—'): StatusMeta {
  const key = normalise(value);
  if (!key) return { label: emptyLabel, tone: 'neutral' };
  return table[key] ?? { label: humanize(key), tone: 'neutral' };
}

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

const ORDER_STATUS: StatusTable = {
  // Admin-normalised vocabulary (Order['order_status'] in adminService.ts)
  placed: { label: 'Placed', tone: 'info' },
  confirmed: { label: 'Confirmed', tone: 'info' },
  preparing: { label: 'Preparing', tone: 'warning' },
  ready: { label: 'Ready', tone: 'info' },
  assigned: { label: 'Rider assigned', tone: 'info' },
  picking_up: { label: 'Picking up', tone: 'info' },
  picked_up: { label: 'Picked up', tone: 'info' },
  shipped: { label: 'Out for delivery', tone: 'info' },
  delivered: { label: 'Delivered', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
  // Raw database vocabulary, in case a page shows the unmapped column.
  pending_at_store: { label: 'Placed', tone: 'info' },
  store_accepted: { label: 'Confirmed', tone: 'info' },
  preparing_order: { label: 'Preparing', tone: 'warning' },
  ready_for_pickup: { label: 'Ready', tone: 'info' },
  delivery_partner_assigned: { label: 'Rider assigned', tone: 'info' },
  order_picked_up: { label: 'Picked up', tone: 'info' },
  in_transit: { label: 'Out for delivery', tone: 'info' },
  order_delivered: { label: 'Delivered', tone: 'success' },
  order_cancelled: { label: 'Cancelled', tone: 'danger' },
};

/** Order lifecycle: placed … delivered / cancelled (accepts raw DB values too). */
export function orderStatusMeta(status: string | null | undefined): StatusMeta {
  return lookup(ORDER_STATUS, status);
}

/* ------------------------------------------------------------------ */
/* Payments                                                            */
/* ------------------------------------------------------------------ */

const PAYMENT_STATUS: StatusTable = {
  paid: { label: 'Paid', tone: 'success' },
  pending: { label: 'Pending', tone: 'warning' },
  authorized: { label: 'Authorized', tone: 'warning' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
  failed: { label: 'Failed', tone: 'danger' },
  refunded: { label: 'Refunded', tone: 'neutral' },
  partially_refunded: { label: 'Partially refunded', tone: 'neutral' },
  refund_required: { label: 'Refund required', tone: 'warning' },
  unpaid: { label: 'Unpaid', tone: 'warning' },
};

/** Order['payment_status'] values. */
export function paymentStatusMeta(status: string | null | undefined): StatusMeta {
  return lookup(PAYMENT_STATUS, status);
}

/* ------------------------------------------------------------------ */
/* Verification (stores, riders, product submissions, change requests) */
/* ------------------------------------------------------------------ */

const VERIFICATION_STATUS: StatusTable = {
  pending: { label: 'Pending', tone: 'warning' },
  pending_verification: { label: 'Pending verification', tone: 'warning' },
  under_review: { label: 'Under review', tone: 'warning' },
  submitted: { label: 'Submitted', tone: 'warning' },
  incomplete: { label: 'Incomplete', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  verified: { label: 'Verified', tone: 'success' },
  // Rider accounts use `active` as the post-approval state (DeliveryPage).
  active: { label: 'Active', tone: 'success' },
  inactive: { label: 'Inactive', tone: 'neutral' },
  rejected: { label: 'Rejected', tone: 'danger' },
  suspended: { label: 'Suspended', tone: 'danger' },
  offboarded: { label: 'Offboarded', tone: 'neutral' },
  deleted: { label: 'Deleted', tone: 'danger' },
};

/** Store / rider / submission / change-request review states. */
export function verificationStatusMeta(status: string | null | undefined): StatusMeta {
  return lookup(VERIFICATION_STATUS, status);
}

/* ------------------------------------------------------------------ */
/* Documents (verification uploads, store images)                      */
/* ------------------------------------------------------------------ */

const DOCUMENT_STATUS: StatusTable = {
  pending: { label: 'Pending review', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  expired: { label: 'Expired', tone: 'danger' },
  missing: { label: 'Not uploaded', tone: 'neutral' },
};

/** Per-document review state; `null`/empty means the document was never uploaded. */
export function documentStatusMeta(status: string | null | undefined): StatusMeta {
  return lookup(DOCUMENT_STATUS, status, 'Not uploaded');
}

/* ------------------------------------------------------------------ */
/* Generic entity states                                               */
/* ------------------------------------------------------------------ */

const GENERIC_STATUS: StatusTable = {
  active: { label: 'Active', tone: 'success' },
  inactive: { label: 'Inactive', tone: 'neutral' },
  suspended: { label: 'Suspended', tone: 'danger' },
  deleted: { label: 'Deleted', tone: 'danger' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  pending: { label: 'Pending', tone: 'warning' },
  draft: { label: 'Draft', tone: 'neutral' },
  published: { label: 'Published', tone: 'success' },
  open: { label: 'Open', tone: 'warning' },
  closed: { label: 'Closed', tone: 'neutral' },
  resolved: { label: 'Resolved', tone: 'success' },
  in_progress: { label: 'In progress', tone: 'info' },
  online: { label: 'Online', tone: 'success' },
  offline: { label: 'Offline', tone: 'neutral' },
  enabled: { label: 'Enabled', tone: 'success' },
  disabled: { label: 'Disabled', tone: 'neutral' },
  hidden: { label: 'Hidden', tone: 'neutral' },
  visible: { label: 'Visible', tone: 'success' },
  reactivated: { label: 'Reactivated', tone: 'success' },
  success: { label: 'Success', tone: 'success' },
  error: { label: 'Error', tone: 'danger' },
  failed: { label: 'Failed', tone: 'danger' },
  failure: { label: 'Failure', tone: 'danger' }, // SecurityLogPage audit rows
  completed: { label: 'Completed', tone: 'success' },
  paid: { label: 'Paid', tone: 'success' },
  unread: { label: 'Unread', tone: 'brand' },
  read: { label: 'Read', tone: 'neutral' },
};

/** Catch-all for active/inactive, open/resolved, online/offline and similar. */
export function genericStatusMeta(status: string | null | undefined): StatusMeta {
  return lookup(GENERIC_STATUS, status);
}

/* ------------------------------------------------------------------ */
/* Roles                                                               */
/* ------------------------------------------------------------------ */

const ROLE: StatusTable = {
  // AdminRoleSchema
  super_admin: { label: 'Super admin', tone: 'brand' },
  admin: { label: 'Admin', tone: 'info' },
  manager: { label: 'Manager', tone: 'success' },
  viewer: { label: 'Viewer', tone: 'neutral' },
  // Support-message sender roles
  customer: { label: 'Customer', tone: 'neutral' },
  shopkeeper: { label: 'Shopkeeper', tone: 'brand' },
  store: { label: 'Store', tone: 'brand' },
  rider: { label: 'Rider', tone: 'info' },
  delivery_partner: { label: 'Rider', tone: 'info' },
};

/** Admin roles (super_admin/admin/manager/viewer) and support sender roles. */
export function roleMeta(role: string | null | undefined): StatusMeta {
  return lookup(ROLE, role);
}

/* ------------------------------------------------------------------ */
/* Rider payouts                                                       */
/* ------------------------------------------------------------------ */

const PAYOUT_STATUS: StatusTable = {
  pending: { label: 'Pending', tone: 'warning' },
  processing: { label: 'Processing', tone: 'info' },
  paid: { label: 'Paid', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};

/** RiderPayoutsPage statuses. */
export function payoutStatusMeta(status: string | null | undefined): StatusMeta {
  return lookup(PAYOUT_STATUS, status);
}

/* ------------------------------------------------------------------ */
/* Offers / coupons                                                    */
/* ------------------------------------------------------------------ */

export type OfferStatus = 'active' | 'inactive' | 'scheduled' | 'expired';

const OFFER_STATUS: StatusTable = {
  active: { label: 'Active', tone: 'success' },
  inactive: { label: 'Inactive', tone: 'neutral' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  expired: { label: 'Expired', tone: 'danger' },
};

/**
 * Coupons have no status column; derive one from `is_active` and the
 * validity window so the list can show a single badge.
 */
export function deriveOfferStatus(
  isActive: boolean,
  validUntil?: string | null,
  validFrom?: string | null,
  now: number = Date.now(),
): OfferStatus {
  if (!isActive) return 'inactive';
  if (validUntil) {
    const until = new Date(validUntil).getTime();
    if (Number.isFinite(until) && until < now) return 'expired';
  }
  if (validFrom) {
    const from = new Date(validFrom).getTime();
    if (Number.isFinite(from) && from > now) return 'scheduled';
  }
  return 'active';
}

/** Derived coupon state (see `deriveOfferStatus`). */
export function offerStatusMeta(status: string | null | undefined): StatusMeta {
  return lookup(OFFER_STATUS, status);
}

/* ------------------------------------------------------------------ */
/* Admin notification types                                            */
/* ------------------------------------------------------------------ */

const NOTIFICATION_TYPE: StatusTable = {
  new_order: { label: 'New order', tone: 'brand' },
  order_delivered: { label: 'Order delivered', tone: 'success' },
  order_cancelled: { label: 'Order cancelled', tone: 'danger' },
  refund_required: { label: 'Refund required', tone: 'warning' },
  new_user: { label: 'New customer', tone: 'info' },
  product_updated: { label: 'Product updated', tone: 'neutral' },
  store_added: { label: 'Store added', tone: 'brand' },
  store_status_changed: { label: 'Store status changed', tone: 'info' },
  store_image_added: { label: 'Store image added', tone: 'neutral' },
  store_image_removed: { label: 'Store image removed', tone: 'neutral' },
  owner_photo_updated: { label: 'Owner photo updated', tone: 'neutral' },
  verification_submitted: { label: 'Store verification', tone: 'warning' },
  document_uploaded: { label: 'Document uploaded', tone: 'info' },
  document_removed: { label: 'Document removed', tone: 'neutral' },
  rider_verification_submitted: { label: 'Rider verification', tone: 'warning' },
  rider_document_uploaded: { label: 'Rider document uploaded', tone: 'info' },
  rider_document_removed: { label: 'Rider document removed', tone: 'neutral' },
  rider_status_changed: { label: 'Rider status changed', tone: 'info' },
  rider_profile_photo_updated: { label: 'Rider photo updated', tone: 'neutral' },
  rider_vehicle_photo_updated: { label: 'Vehicle photo updated', tone: 'neutral' },
  profile_change_request: { label: 'Profile change request', tone: 'warning' },
  support_message: { label: 'Support message', tone: 'info' },
  admin_review_action: { label: 'Admin review', tone: 'neutral' },
  system: { label: 'System', tone: 'neutral' },
};

/** `admin_notifications.type` values (header bell + NotificationsPage). */
export function notificationTypeMeta(type: string | null | undefined): StatusMeta {
  return lookup(NOTIFICATION_TYPE, type);
}

/* ------------------------------------------------------------------ */
/* Security event severity                                             */
/* ------------------------------------------------------------------ */

const SEVERITY: StatusTable = {
  low: { label: 'Low', tone: 'neutral' },
  medium: { label: 'Medium', tone: 'info' },
  high: { label: 'High', tone: 'warning' },
  critical: { label: 'Critical', tone: 'danger' },
};

/** `security_events.severity` (SecurityLogPage). */
export function severityMeta(severity: string | null | undefined): StatusMeta {
  return lookup(SEVERITY, severity);
}

/* ------------------------------------------------------------------ */
/* Dispatcher                                                          */
/* ------------------------------------------------------------------ */

const RESOLVERS: Record<StatusKind, (value: string | null | undefined) => StatusMeta> = {
  order: orderStatusMeta,
  payment: paymentStatusMeta,
  verification: verificationStatusMeta,
  document: documentStatusMeta,
  generic: genericStatusMeta,
  role: roleMeta,
  payout: payoutStatusMeta,
  offer: offerStatusMeta,
  notification: notificationTypeMeta,
  severity: severityMeta,
};

/** Resolve any status by kind — what `StatusBadge` uses internally. */
export function statusMetaFor(kind: StatusKind, value: string | null | undefined): StatusMeta {
  return RESOLVERS[kind](value);
}
