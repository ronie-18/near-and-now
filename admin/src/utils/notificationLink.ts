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
    case 'low_stock':
      return '/products';
    case 'verification_submitted':
    case 'document_uploaded':
    case 'document_removed':
      return '/stores';
    case 'rider_verification_submitted':
    case 'rider_document_uploaded':
    case 'rider_document_removed':
      return '/delivery';
    default:
      return null;
  }
}
