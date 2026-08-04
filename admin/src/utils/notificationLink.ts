/**
 * Where clicking a given admin_notifications row should navigate. Only
 * covers types with an unambiguous, existing detail route — store/rider
 * verification types have no per-record detail page in the admin panel today
 * (StoresPage/DeliveryPage are list-only), so they route to the list instead
 * of a specific record. Returns null for types with no sensible destination
 * (e.g. `system`), in which case a click should just mark the row read.
 */
export function getNotificationLink(type: string, data: Record<string, any> | null | undefined): string | null {
  const d = data || {};
  switch (type) {
    case 'new_order':
    case 'refund_required':
      return d.order_id ? `/orders/${d.order_id}` : '/orders';
    case 'new_user':
      return d.user_id ? `/customers/${d.user_id}` : '/customers';
    case 'product_updated':
      return d.product_id ? `/products/edit/${d.product_id}` : '/products';
    case 'verification_submitted':
    case 'document_uploaded':
    case 'document_removed':
    case 'owner_photo_updated':
    case 'store_image_added':
    case 'store_image_removed':
      return '/stores';
    case 'rider_verification_submitted':
    case 'rider_document_uploaded':
    case 'rider_document_removed':
    case 'rider_profile_photo_updated':
    case 'rider_vehicle_photo_updated':
      return '/delivery';
    // Store's requestProfileChange() and the rider's equivalent both fire
    // this same type string (found 2026-07-27, during a deep-dive review —
    // this case was simply missing, so both silently fell into `default:
    // null` and clicking either notification just marked it read with no
    // navigation at all). The two are disambiguated by which id is present
    // on `data`, not by type.
    case 'profile_change_request':
      if (d.storeId) return '/stores/profile-change-requests';
      if (d.riderId) return '/delivery/profile-change-requests';
      return null;
    // Broadcast of another admin's review action (adminActivityLog.controller.ts /
    // notification.service.ts's notifyAdminsOfReviewAction) — route to the
    // unified log rather than trying to guess a specific record's page.
    case 'admin_review_action':
      return '/activity-log';
    // Broadcast of an admin toggling a store/rider online/offline (StoresPage/
    // DeliveryPage) — same list-only routing as the verification types above.
    case 'store_status_changed':
      return '/stores';
    case 'rider_status_changed':
      return '/delivery';
    default:
      return null;
  }
}
