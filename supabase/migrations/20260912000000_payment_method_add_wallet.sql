-- =============================================================================
-- Severe gap caught during deep-dive: customer_orders.payment_method is a real
-- Postgres ENUM type with only 'razorpay' and 'cod' as valid values. The
-- wallet feature (migrations 20260910000000/20260911000000) added a real
-- 'wallet' payment path end-to-end, but nothing ever added 'wallet' to this
-- enum — so pay_order_with_wallet()'s `UPDATE customer_orders SET
-- payment_method = 'wallet'` (and any order creation that tried to insert
-- payment_method: 'wallet' directly, e.g. the mobile app's createOrder path)
-- would have failed outright with a Postgres enum-violation error, never
-- caught by tsc or the mocked unit tests, only by an actual live write.
--
-- ALTER TYPE ... ADD VALUE cannot run inside a multi-statement transaction
-- alongside other DDL/DML in the same call — this migration intentionally
-- contains ONLY this one statement.
-- =============================================================================

ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'wallet';
