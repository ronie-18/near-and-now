-- order_number_counters never had its default table-level anon/authenticated
-- grants revoked, unlike every other backend-only table hardened this cycle
-- (invoice_documents, invoice_items, invoices, notifications,
-- order_addition_requests, order_store_allocations, product_submissions,
-- rider_profile_change_requests, store_profile_change_requests,
-- wallet_transactions all correctly have zero anon/authenticated grants).
-- Currently not exploitable — RLS is enabled with zero policies, so
-- default-deny blocks everything except service_role — but it's the exact
-- latent landmine this codebase has hit repeatedly: if a future migration
-- ever adds a policy here scoped too broadly (the recurring "Allow all for
-- service role" -> {public} misscoping bug class), this table becomes
-- immediately anon-writable, able to corrupt/collide daily order-number
-- sequencing, where its siblings would still be blocked at the grant layer
-- even with the same mistake. Found 2026-08-11 seventh deep-dive audit.

REVOKE ALL ON public.order_number_counters FROM anon, authenticated;
