/**
 * Hard delete of master products (2026-10-05, migration 20261005000000):
 * once a product is deleted from the catalogue, its past order lines keep
 * their own name/price but order_items.product_id is NULL. Every reader of
 * order_items.product_id must cope with that.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { notificationService } from '../services/notification.service.js';
import { ReviewsController } from './reviews.controller.js';
import { reallocateMissingItems } from './shopkeeper.controller.js';
import { installFakeSupabase, hasFilter, mockRes, type Result } from '../test/fakeSupabase.js';

const ok = (data: unknown): Result => ({ data, error: null });

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(notificationService, 'notifyCustomerItemsUnavailable').mockResolvedValue(undefined);
  vi.spyOn(notificationService, 'sendOrderNotification').mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('reviews: a delivered order with a deleted product', () => {
  it('offers only the products that still exist, and never queries products with a null id', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'customer_orders') return ok({ id: 'o1', customer_id: 'c1', status: 'order_delivered' });
      if (c.table === 'order_items') {
        return ok([
          { product_id: 'p-live', product_name: 'Milk', image_url: null },
          { product_id: null, product_name: 'Deleted thing', image_url: null },
        ]);
      }
      if (c.table === 'products') return ok([{ id: 'p-live', store_id: 's1', master_product_id: 'm-live' }]);
      if (c.table === 'stores') return ok([{ id: 's1', name: 'Store 1' }]);
      if (c.table === 'product_reviews') return ok([]);
      return undefined;
    });
    const res = mockRes();
    await new ReviewsController().getReviewableItems({ params: { orderId: 'o1' }, customerId: 'c1' } as unknown as Request, res as never);

    expect(res.statusCode).toBe(200);
    expect((res.body as { items: Array<{ productId: string }> }).items.map((i) => i.productId)).toEqual(['m-live']);
    expect(hasFilter(fake.on('products')[0], 'in', 'id', ['p-live'])).toBe(true);
  });

  it('an order whose every product was deleted has nothing to review (no products query at all)', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'customer_orders') return ok({ id: 'o1', customer_id: 'c1', status: 'order_delivered' });
      if (c.table === 'order_items') return ok([{ product_id: null, product_name: 'Gone', image_url: null }]);
      return undefined;
    });
    const res = mockRes();
    await new ReviewsController().getReviewableItems({ params: { orderId: 'o1' }, customerId: 'c1' } as unknown as Request, res as never);
    expect((res.body as { items: unknown[] }).items).toEqual([]);
    expect(fake.on('products')).toHaveLength(0);
  });
});

describe('reallocation: an item whose product was deleted mid-order', () => {
  it('is written off for a refund instead of crashing the products lookup', async () => {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'rpc:finalize_order_if_ready') return ok(false);
      if (c.table === 'customer_orders' && c.columns?.includes('delivery_latitude')) {
        return ok({ status: 'pending_at_store', order_code: 'NN1', delivery_latitude: 22.57, delivery_longitude: 88.36 });
      }
      if (c.table === 'customer_orders' && c.op === 'select') {
        return ok({ status: 'pending_at_store', order_code: 'NN1', razorpay_payment_id: 'pay_1', payment_method: 'razorpay', payment_status: 'paid', total_amount: 100, refunded_amount: 0 });
      }
      if (c.table === 'order_items' && c.columns === 'id, product_id') return ok([{ id: 'i1', product_id: null }]);
      if (c.table === 'order_items' && c.op === 'select') return ok([{ id: 'i1' }]);
      if (c.table === 'order_items' && c.op === 'update') return ok([{ id: 'i1', product_name: 'Gone', unit_price: 20, quantity: 1 }]);
      if (c.table === 'order_store_allocations') return ok([{ store_id: 's-old', status: 'accepted', accepted_item_ids: ['i0'] }]);
      return undefined;
    });
    await reallocateMissingItems('o1', ['i1']);

    expect(fake.on('products')).toHaveLength(0); // no `.in('id', [null])`
    const writeOff = fake.on('order_items', 'update').find((u) => (u.payload as { item_status?: string }).item_status === 'unavailable');
    expect(writeOff && hasFilter(writeOff, 'in', 'id', ['i1'])).toBe(true);
    expect(fake.on('admin_notifications', 'insert')[0].payload).toMatchObject({ type: 'refund_required', data: { item_ids: ['i1'] } });
  });
});
