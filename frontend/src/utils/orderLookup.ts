/**
 * "Track by order number": the order code → the signed-in customer's order.
 *
 * It used to read customer_orders straight from Supabase with the anon key,
 * which RLS answers with no rows, so every lookup silently showed the form
 * again. Tracking itself already needs a signed-in customer, and the backend
 * returns only that customer's orders. (2026-10-27)
 */
export type OrderNumberLookup = { orderId: string } | { error: string };

export async function lookupOrderByNumber(
  code: string,
  userId: string | null | undefined,
  fetchOrders: (customerId: string) => Promise<Array<{ id: string; order_number?: string | null }>>,
): Promise<OrderNumberLookup> {
  const wanted = code.trim();
  if (!userId) return { error: 'Log in to track your order.' };
  try {
    const orders = await fetchOrders(userId);
    const match = orders.find((o) => (o.order_number ?? '').toUpperCase() === wanted.toUpperCase());
    return match ? { orderId: match.id } : { error: `We couldn't find order ${wanted} on your account.` };
  } catch {
    return { error: "Couldn't look up that order. Please try again." };
  }
}
