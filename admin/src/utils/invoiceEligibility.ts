/**
 * Whether the backend will issue a tax invoice for this order. Must mirror
 * `assertOrderInvoiceable()` in backend/src/services/invoice.service.ts —
 * the backend is the authority (it returns 409 otherwise).
 *  - Cash on delivery: available unless the order was cancelled (COD orders
 *    stay payment_status 'pending' by design).
 *  - Every other method: only once payment has settled (paid / partially or
 *    fully refunded — a refunded order still had a real transaction).
 * Accepts both the DB status ('order_cancelled') and the admin panel's mapped
 * label ('cancelled', see adminService.ts mapDbStatus).
 */
const SETTLED_PAYMENT_STATUSES = new Set(['paid', 'partially_refunded', 'refunded']);

export function isInvoiceAvailable(order: {
  order_status?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
}): boolean {
  if (String(order.payment_method || '').toLowerCase() === 'cod') {
    return order.order_status !== 'order_cancelled' && order.order_status !== 'cancelled';
  }
  return SETTLED_PAYMENT_STATUSES.has(String(order.payment_status || ''));
}
