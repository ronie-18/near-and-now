-- Admin hot paths found in production pg_stat_statements (2026-10-05).
--
-- 1. Admin Products page: every page sorted the whole master_products table
--    (54k rows, `select *`) to return 25 rows. Production means: 1.38 s
--    (created_at sort, 770 calls), 1.35 s / 1.13 s (name sort). Indexes on the
--    exact sort keys (incl. the `id` tie-breaker the page uses) turn each page
--    into a 25-row index read.
-- 2. Admin bell (AdminHeader polls every 15 s): newest 8 admin_notifications
--    (12,387 calls, 23 ms mean) plus an unread count. admin_notifications'
--    policies called is_admin_authenticated() / current_admin_role() /
--    admin_has_permission() once per ROW. Wrapping them in (select ...) makes
--    Postgres evaluate each once per statement (an InitPlan). The functions
--    are STABLE, SECURITY DEFINER and take no row values, so results are
--    identical; this was verified on production data in a rolled-back
--    transaction (super_admin / manager / anonymous: same visible rows, same
--    newest-8, same unread count).
--
-- Measured on production data in a rolled-back transaction, 20 runs each:
--   products newest page 62.5 -> 0.16 ms; products by name page 21 17.3 -> 0.29 ms;
--   bell newest 8 20.6 -> 0.19 ms; bell unread count 20.7 -> 0.75 ms.
--
-- Not added (checked against production): driver_order_offers(driver_id,
-- status) and customer_orders(assigned_driver_id) — 17 and 28 rows today and
-- absent from the top queries.
--
-- In production the indexes were built with CREATE INDEX CONCURRENTLY; here
-- they are plain so the file also runs inside a migration transaction.

CREATE INDEX IF NOT EXISTS idx_master_products_created_at_id
  ON public.master_products (created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_master_products_name_id
  ON public.master_products (name, id);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_created_at
  ON public.admin_notifications (created_at DESC);

ALTER POLICY admin_read ON public.admin_notifications
  USING (
    (SELECT public.is_admin_authenticated())
    AND (
      (actor_role IS NULL)
      OR (actor_role <> 'super_admin'::text)
      OR ((SELECT public.current_admin_role()) = 'super_admin'::text)
    )
  );
ALTER POLICY admin_update ON public.admin_notifications
  USING ((SELECT public.is_admin_authenticated()))
  WITH CHECK ((SELECT public.is_admin_authenticated()));
ALTER POLICY admin_insert ON public.admin_notifications
  WITH CHECK ((SELECT public.is_admin_authenticated()));
ALTER POLICY admin_delete_requires_permission ON public.admin_notifications
  USING ((SELECT public.admin_has_permission('notifications.edit'::text)));
