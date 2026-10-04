# Admin portal redesign — open items (2026-10-04)

Everything below was identified during the redesign but deliberately NOT changed, because it needs a Supabase migration, a backend design change, or a product decision. Nothing here blocks the shipped UI.

## Recommended database migration (optional, apply any time)

```sql
-- Protect against the cascade the admin UI now guards only client-side:
ALTER TABLE public.master_products DROP CONSTRAINT master_products_category_fkey;
ALTER TABLE public.master_products ADD CONSTRAINT master_products_category_fkey
  FOREIGN KEY (category) REFERENCES public.categories(name) ON DELETE RESTRICT;
-- Optional: stop other writers from getting a fabricated 4-star default rating
ALTER TABLE public.master_products ALTER COLUMN rating SET DEFAULT 0;
```

## Backend / service follow-ups

- **Admin tsc: 3 errors in admin/src/pages/admin/CategoriesPage.tsx (line 328) and ReportsPage.tsx (lines 655, 751) — `string | null` vs `string | undefined` on Category/OrderItem fields**  
  Why deferred: Not files I own; the errors come from the concurrent admin/src/services type changes (another agent). All five pages I edited type-check clean.  
  Recommendation: The services/CategoriesPage/ReportsPage owners should widen the page-local types to `| null` (or map null to undefined) once the services pass lands.
- **Deferred: listProductSubmissions has no limit/offset/search; Approved/All tabs download the whole table**  
  Why deferred: Larger change (range + ilike across joined stores.name + response reshaping) and the page already paginates/searches client-side; not in the required items.  
  Recommendation: Add ?limit=&offset=&q= handling with select(..., { count: 'exact' }) and return { success, submissions, total }, then switch the page to server-side Pagination/SearchInput.
- **Deferred: security log endpoints only support a 500-row cap, no offset pagination or total**  
  Why deferred: Three endpoints plus a page rewrite to the shared Pagination primitive; the page already explains the cap. Out of the required scope.  
  Recommendation: Accept offset (or a created_at cursor) with .range() and count: 'exact'; return { ..., total }; then move SecurityLogPage to Pagination.
- **Deferred: reviews admin list uses offset pagination that shifts when rows change**  
  Why deferred: Keyset pagination is a design change on both ends; not required here.  
  Recommendation: Accept before=<created_at>,<id>, order by (created_at desc, id desc) and have the page send the last row's cursor.
- **Deferred: store and rider profile-change-request lists have no limit/offset**  
  Why deferred: Both pages paginate client-side today; adding server paging also changes the tab counts the pages derive from the full list.  
  Recommendation: Add ?page=&limit= (same pattern as listSupportMessages) returning { success, requests, total } and pass page/pageSize from the pages.
- **Deferred: rider payouts `total_amount` (true amount owed)**  
  Why deferred: No SUM without a Postgres RPC or PostgREST aggregates (not enabled on Supabase by default); fetching all amounts would reintroduce the unbounded query the limit was added to stop. Only `total` (count) was added.  
  Recommendation: Add a small RPC (e.g. admin_rider_payout_totals(p_status) returning count + sum(amount)) and surface total_amount from it. Migration would be apply-any-time, before deploying the API that calls it.
- **Deferred: admin name rule (letters-only regex) not mirrored/relaxed in backend createAdmin/updateAdmin; updateAdmin does not validate full_name/email format**  
  Why deferred: Needs a product decision on the accepted name charset; enforcing the current client regex server-side would reject already-saved names.  
  Recommendation: Agree on /^[\p{L}\p{M}\s.'-]+$/u, update admin/src/schemas/admin.schema.ts, and validate full_name/email in both backend handlers with the same rule.
- **Deferred: super_admin resetting ANOTHER admin's password does not end that admin's sessions**  
  Why deferred: The deferred item asked for the self-change branch only; revoking another admin's sessions is a reasonable but separate policy choice.  
  Recommendation: Extend the new revoke block to the id !== req.adminId branch (all sessions of the target admin), ideally with an explicit confirmation in EditAdminPage.
- **Deferred DB-level items: categories FK ON DELETE CASCADE -> RESTRICT; master_products.images column / rating default; categories.color column; case-insensitive categories.name unique index**  
  Why deferred: All require Supabase migrations ('none expected' for this pass) and most pair with admin/src/services changes owned by another agent.  
  Recommendation: If wanted, create migrations and apply BEFORE deploying the matching admin build; FK RESTRICT can be applied any time (current UI works either way).
- **Deferred items inside admin/src/services (order status mapping, getOrdersPaginated uuid ilike, customer totals excluding cancelled, product image persistence, etc.)**  
  Why deferred: admin/src/services is owned by another agent per the task rules.  
  Recommendation: Hand the DEFERRED_ISSUES entries whose `where` is admin/src/services/* to the services agent.
- **Frontend follow-ups enabled by this backend work (not done here, outside owned files or not required)**  
  Why deferred: ActivityLogPage can now pass &source=<tab> per tab; RiderPayoutsPage can show 'Showing N of total' from `total`; ProductSubmissionsPage can drop its store_name merge workaround; SettingsPage footer note about other sessions is now stale.  
  Recommendation: Small per-page follow-ups once the API is deployed.
- **Coupon code on OrderDetailPage (item 9, optional part)**  
  Why deferred: The coupons table grants SELECT only to service_role (migration 20260718000002); an embed from the admin anon-key client would fail the entire customer_orders query. Only coupon_id is exposed.  
  Recommendation: Either add a column-scoped `GRANT SELECT (id, code) ON public.coupons TO anon, authenticated` plus an admin read RLS policy, or have the backend orders endpoint return the coupon code; then add `coupons:coupon_id(code)` to ORDER_SELECT.
- **Dashboard/Reports master_product_id on order items (item 11 alternative, deferred ReportsPage/AdminDashboardPage items)**  
  Why deferred: Adding `products:product_id(master_product_id)` to ORDER_SELECT could not be verified safe: `products` has RLS with no explicit anon/authenticated grant in the migrations, and a failing embed would break every orders fetch. Rows stay unlinked (already the page's state).  
  Recommendation: Verify live that the admin client can select products.master_product_id (or add an admin read policy + grant), then add the embed and expose master_product_id on OrderItem; AdminDashboardPage/ReportsPage can then link/lookup by it.
- **getOrdersByCustomerId has no server-side pagination (deferred CustomerDetailPage item)**  
  Why deferred: Out of the listed scope and the page already paginates client-side; changing the signature touches a page the harness asked to edit only surgically.  
  Recommendation: Add `{ page, pageSize }` with `.range()` and `{ count: 'exact' }` returning `{ orders, total }`, then switch CustomerDetailPage's Pagination to server-side.
- **Customer search by ID in getCustomersPaginated (deferred)**  
  Why deferred: Needs a text cast or RPC; not possible with the PostgREST filter syntax on a uuid column beyond an exact match.  
  Recommendation: If wanted, add `id.eq.<term>` when the term is a full UUID (same UUID_RE pattern now used for orders/products).
- **master_products_category_fkey is ON DELETE CASCADE (deferred CategoriesPage item)**  
  Why deferred: Requires a Supabase migration; the UI guard (counts + live head:true re-check) is only a client-side safeguard.  
  Recommendation: Apply the migration listed in db_migrations_needed; the current UI works with either FK behaviour.
- **OffersPage clearing optional coupon fields (backend zod schema)**  
  Why deferred: Fix lives in backend/src/routes/coupons.routes.ts, owned by the backend agent.  
  Recommendation: Make max_discount_amount / applies_to_first_n_orders / usage_limit / valid_until `.nullable().optional()` in couponBaseSchema, then have OffersPage send null for cleared optionals.

## Per-page items raised by the review pass

### ProductSubmissionsPage.tsx
- Backend listProductSubmissions has no limit/offset, so pagination and search are client-side over the full result set (audit-flagged); a server-side ?limit/offset/search would be a separate backend change.
- Product decision: whether Reject row icons should drop the red ghost override project-wide to satisfy 'icons only in brand/gray' — this page follows the current 8-page convention.
- Client-side permission gating (hasPermission on the stored admin) is UX only; the backend requirePermission('product_submissions.edit') remains the real enforcement, as the code comment states.

### ReviewsPage.tsx
- 401 handling: the page now shows "Your session has expired. Please sign in again." but does not redirect to /login or clear the session; there is no shared helper for fetch-based admin pages to do this (secureAdminAuth only clears on its own calls), so a central interceptor or convention is needed across the 13 pages that call /api/admin/* directly.
- Backend error bodies carry a `requestId` and `where` (httpError.ts) that the UI discards; surfacing the requestId in load-error Alerts would let support match a screenshot to a log line — a product/UX decision.
- Offset pagination still skips rows when reviews are inserted or approved between pages (the client-side de-dup only prevents duplicates); the real fix is cursor pagination (created_at, id) in reviews.controller.ts adminListReviews.
- Refresh re-requests at most 100 rows because adminListReviews clamps `limit` to 100; an admin who paged past 100 loses that progress on Refresh — needs a backend change or acceptance.
- Tabs show no Pending/Approved/All counts because GET /api/admin/reviews returns `total` only for the requested status; a counts endpoint (or a `counts` field on the list response) would be needed to show them without fabricating numbers.

### OrderDetailPage.tsx
- Order summary 'Adjustments (not itemised)' is a derived remainder because getOrderById does not map customer_orders handling_charge / gst_amount into Order (the fields exist on the type); itemising them is a service change.
- Coupon code cannot be shown next to the discount row: coupons grants SELECT only to service_role, so the admin client cannot embed coupons:coupon_id(code). Needs a backend endpoint or a view.
- Audit's speculative enhancement still open: customer_orders.notes, delivered_at, cancelled_at, delivery_otp_verified_at and per-store store_orders.status are not mapped by getOrderById, so Order information cannot show them and Fulfillment cannot show per-store progress on split orders.
- Product decision: a successful background poll deliberately does not clear an error banner (preserved original semantics so a 409 message from a status change is never wiped by the next tick); the side effect is that if the initial load failed and a later poll recovers the order, the stale load-error banner stays until dismissed.
- Rebuild summary's removed_controls entry for the 'Confirmed' option is stale relative to the code and to adminService (which now round-trips store_accepted <-> 'confirmed'); update the notes, no code change.

### EditProductPage.tsx
- adminService.getProductById swallows query/RLS/network errors and returns null, identical to 'no row', so the page can only say 'Product not found' for a failed fetch; distinguishing not-found from load failure needs the service to rethrow (the page already maps a thrown error to 'Failed to load product. Please try again.').
- Toggle is used inside a saved form for 'Active in catalog'; UI_API.md prefers Checkbox in saved forms. Kept for parity with AddProductPage (same control) – a product/design decision to apply to both pages at once.
- rating, rating_count, min_quantity and max_quantity are now required with range validation (previously a blank meant 'leave unchanged'). The rebuild's rationale (they always load with DB defaults and NULL could break the customer app) is sound but it is a behaviour change worth a product sign-off.
- If multiple product images are ever wanted, that is a product_images read/write in adminService plus the existing table – a service/DB change, not something for this page; the single-image UI is correct against master_products.image_url today.
- Rebuild note claims the unit field 'falls back to product.size'; Product (services/supabase.ts) has no `size` field and the page reads only `product.unit`, so the note is inaccurate but the code is right.
- AddProductPage still carries `unit: formData.unit.trim() || 'piece'`; that is allowed on create (the service comment says the create path defaults unit) but the two forms should keep their validation rules aligned by whoever owns that file.

### ProductsPage.tsx
- Shared IconButton has only secondary/ghost/danger (solid red) variants; the row Delete action relies on a className override (text-red-600 hover:bg-red-50) on the ghost variant. A ghost/outline danger IconButton variant in components/ui/Button.tsx would remove the override here and on sibling pages.
- Quick Add uses Toggle for `in_stock` inside a saved form; UI_API prefers Checkbox in saved forms. Kept because the rebuilt AddProductPage also uses Toggle for the same field — a product/design decision to change both together.
- Changing sort does not reset to page 1 (original behaviour, not flagged by the audit); most list UIs reset — product decision.
- REBUILD_SUMMARIES.json for ProductsPage says the placeholder was changed to "Search by name or description"; the code (correctly) still advertises ID search because the service matches full UUIDs — documentation-only mismatch.

### AdminDashboardPage.tsx
- Heading hierarchy skips a level: shared PageHeader renders <h1> and shared CardHeader renders <h3> with no <h2> in between — a components/ui/Card.tsx decision, not fixable in this page.
- When orders have never loaded and the fetch fails, the page shows four identical Retry buttons (the Alert plus the EmptyState in the chart, Recent orders and Top products). Functionally correct; whether the in-section Retry actions should be dropped is a product/design call.
- Chart values are hover-only tooltips (mitigated by the sr-only data table and aria-hidden visual); keyboard-focusable bars would need a shared chart primitive, which the design system does not yet provide and the audit's bundle-size note argues against importing a chart library here.

### AddProductPage.tsx
- REBUILD_SUMMARIES.json 'AddProductPage' notes_for_reviewer/summary still describe a multi-image gallery with an info Alert and an `images` payload key; the file is single-image. Refresh the summary so later reviewers are not misled.
- Multi-image persistence remains a product/backend decision: it needs either a `master_products.images` column (Supabase migration, apply before deploy) or real wiring of `public.product_images` plus `toMasterProduct`/`updateProduct` changes. The page now promises exactly what is stored.
- AdminSidebar.tsx still lists 'Add product' (/products/add) for viewer/manager roles, who land on the not-permitted state; hide the item for roles without the permission (outside this file).
- New products are created with rating 0 / rating_count 0; the storefront should render 'No reviews yet' when rating_count is 0 rather than 0 stars (frontend, outside admin).
- Toggle vs Checkbox for 'Active in catalog' in a saved form: UI_API recommends Checkbox inside saved forms, the task rule says switches use Toggle; kept Toggle to match EditProductPage. Design decision for the owner, applies to both product forms together.
- The 'Tax split does not add up' Alert uses role=alert (shared Alert warning tone) and updates live while CGST/SGST are typed; acceptable but could be chatty for screen-reader users — would need an Alert prop to render as status.

### OrdersPage.tsx
- adminService.getOrdersPaginated search: the customer-name/email lookup runs an unbounded app_users .or(ilike) query first and then passes every matching id into customer_id.in(...); a common name fragment could produce a very long URL filter. Service/backend concern, not fixable in the page.
- payment_method is rendered raw (e.g. 'cod', 'razorpay') under the payment badge, as in the original; a shared paymentMethodLabel helper (or service-side label) would be the right place to humanise it rather than per page.
- Product decision: 'Export Page CSV' exports only the loaded page by design (label/tooltip kept per the audit's risk notes). A server-side 'export all matching' endpoint would be needed for a full export.

### CustomerDetailPage.tsx
- When a silent Refresh fails on getCustomerById (not the orders call) the error renders inside the Order history card under the title "Couldn't load order history"; the message is still shown with Retry, but the title is slightly mislabelled for that one path. Cosmetic; a product decision whether to split customer-load and orders-load errors into two states.
- Pagination is rendered only when the customer has more than 10 orders, so the 'Showing a–b of N' summary is absent for small histories. CustomersPage renders Pagination unconditionally; decide whether detail-page sub-tables should too.
- Customer.location is still hard-coded '' in adminService (audit-confirmed dead field); the page dropped the block as the rebuild notes say. Populating it (e.g. latest delivery address) is a service change, no migration needed.
- REBUILD_SUMMARIES.json notes for this page are stale on two points: stat-card labels (file correctly uses 'Total orders' / 'Total spent' with 'Excludes cancelled orders' hints) and the claim that network/RLS failures still render 'Customer not found' (getCustomerById now rethrows, so they render the danger Alert).

### AddCategoryPage.tsx
- DB: categories_name_key UNIQUE (name) is case-sensitive, so 'Fruits' and 'fruits' both insert. If case-insensitive uniqueness is wanted it needs a Supabase migration (e.g. CREATE UNIQUE INDEX categories_name_lower_key ON public.categories (lower(name))) applied BEFORE deploying any admin pre-check; the page already maps 23505 to a friendly message so it will work with such an index unchanged.
- Product/storefront: nothing in frontend/src or supabase/ orders categories by display_order (admin getCategories orders by name). Either the storefront should sort by display_order or the field/hint should be reconsidered; the hint copy was softened in the meantime.
- Product decision: no unsaved-changes confirm on Cancel/Back (audit low, optional). PageHeader's backTo is a plain <Link>, so a consistent guard would need a PageHeader prop (onBack) or a blocker hook, which is outside this file.
- Shared extraction: the category form (fields + payload builder) still exists in AddCategoryPage, EditCategoryPage and the inline sub-forms in AddProductPage/EditProductPage; a shared CategoryFormFields component would be a cross-file change.

### AdminManagementPage.tsx
- The no-search empty state copy "Create your first admin to get started." can only appear when getAdmins() returns [] — with real data that means the current super_admin's own row is missing (RLS/service problem), so a product decision is needed on whether to reword it as a load problem.
- deleteAdmin() (adminAuthService.ts:288-312) swallows the backend error body and returns false, so the page can only toast a generic "Failed to delete admin"; surfacing the server reason needs a service change.
- getCurrentAdmin() returns `any` from cached storage; the synchronous super_admin gate and self-delete guard depend on the cached role/id (audit low, UI-only, server/RLS enforce) — out of scope for this file.
- IconButton has no dangerOutline/ghost-danger variant, so the row Delete uses variant=ghost plus red utility classes (same as CategoriesPage); a shared variant in components/ui/Button.tsx would keep semantic colour inside Button tones as §1 asks.

### CategoriesPage.tsx
- Supabase migration (apply BEFORE deploying this UI): change master_products_category_fkey from ON DELETE CASCADE to ON DELETE RESTRICT so the database refuses deleting a non-empty category regardless of UI state. The page's guard (counts status + live head:true re-check) narrows the window but cannot close it; deleteCategory() already rethrows so the FK violation message will surface in the toast once the migration lands.
- Product decision: Delete stays ENABLED for categories that have products (click yields an explanatory toast; tooltip says 'Cannot delete: category has products'). The audit's alternative was to disable it with a tooltip. Kept as the rebuild chose, for keyboard/touch discoverability; flagging for a UX call.
- EditCategoryPage.tsx still drops a display_order of 0 via `|| ''` (audit low-severity note) — outside this file.
- The Edit row action needs `className="w-8 !px-0"` on LinkButton because the sm size's px-3 wins in CSS order; a cleaner fix is a kit-level icon-sized LinkButton (e.g. an `IconLinkButton` or `size="icon"`) in components/ui/Button.tsx, which is not mine to edit.
- Search placeholder was shortened to 'Search categories…' with the field list ('name, description or ID') moved into aria-label only; sighted users lose the hint that ID/description are searchable. Minor copy choice left for the owner.

### EditCategoryPage.tsx
- Product/copy decision: the display-order hint says 'Lower numbers appear first on the homepage', but the storefront (frontend/src/services/adminService.ts getCategories and HomePage.tsx) orders categories by name and never reads display_order. Either sort by display_order on the storefront or reword the hint on both category pages; kept the inherited wording for now.
- Consistency between the two category forms: Edit validates image_url as http(s)-only (isHttpUrl) and treats blank display_order as null (clear), while AddCategoryPage accepts any scheme `new URL()` parses and treats blank display_order as 'omit, DB default 0'. The storefront CategorySchema uses z.string().url() (any scheme). Both behaviours are defensible; pick one and align AddCategoryPage (not owned here).
- Maintainability item from the audit (low): Add and Edit still duplicate the field set, validation and preview; a shared CategoryForm would stop fixes having to land twice. Out of scope for a single-file review.
- frontend/src/schemas/category.schema.ts still declares a `color` field although the categories table has no such column and the admin forms no longer send it; harmless but worth dropping when the schema is next touched.

### ReportsPage.tsx
- Category and product attribution (audit issue 6, 'likely'): order_items.product_id references public.products.id (store inventory row) while getAdminProducts() keys by master_products.id, so the id lookup almost never matches and everything falls through to lowercase-name equality or 'Uncategorized'. Needs a service change (resolve master_product_id or store category on order_items) — not fixable in the page.
- Export is JSON only; an admin 'Export report' is usually CSV/XLSX — product decision.
- AdminDashboardPage and ReportsPage each hand-roll a near-identical bar chart (buckets, nice ticks, hover tooltip, sr-only table) and each define their own isPaymentReady/isCountable copies; extracting a shared BarChart primitive and a shared order-countability helper (as the audit suggested) is cross-file work outside this page.

### CustomersPage.tsx
- getCustomerStats failures are only console.error'd (as in the original): the cards show '—' with no inline retry other than the Refresh button. Surfacing a toast/alert for stats failures is a product/UX decision.
- 'Total revenue' is gross non-cancelled order value (sum of customer_orders.total_amount), not platform revenue; relabelling (e.g. 'Gross order value') is a product decision and the audit flagged it as speculative.
- Tooltip primitive: any top-centred tooltip in the last table column is clipped by TableContainer's overflow-x-auto on every list page. Worked around here with side="left"; a primitive-level fix (portal or auto-flip) belongs in components/ui/Tooltip.tsx, which I do not own.
- Behavioural delta kept from the rebuild (deliberate, documented in notes_for_reviewer): while one suspend/reactivate is in flight the toggle buttons on other rows are also disabled, whereas the original only disabled the toggled row. Reasonable (closes a race with the silent refetch) but worth a product confirmation.
- Searching by customer ID is not supported server-side (getCustomersPaginated only ilikes name/email/phone; comment explains the dropped uuid cast). Placeholder is now honest; reintroducing ID search needs a service change.

### CreateAdminPage.tsx
- Behaviour change worth a product decision: full_name is now validated client-side against CreateAdminSchema (admin/src/schemas/admin.schema.ts) whose regex /^[a-zA-Z\s]+$/ rejects apostrophes, hyphens, dots and accented letters ("D'Souza", "Jean-Luc", "María"). The backend (backend/src/controllers/admin.controller.ts createAdmin) only checks presence + password strength, so names that were previously accepted end-to-end are now blocked in the UI. The audit explicitly asked for this validation and said to loosen the rule in the schema rather than skip it; recommend changing the schema regex to something like /^[\p{L}\p{M}' .-]+$/u and mirroring it server-side. Not fixable in CreateAdminPage.tsx.
- Backend createAdmin does not validate email format or name min/max; the client now does via zod. Consider enforcing the same CreateAdminSchema rules in admin.controller.ts so the API cannot be bypassed (backend change).
- App-wide a11y convention: the show/hide password IconButton pattern (aria-pressed + alternating aria-label) is shared with AdminLoginPage; pick one approach (static label + aria-pressed, or alternating label without aria-pressed) and apply it in both files.

### EditAdminPage.tsx
- Product decision: the self-edit flow deliberately hides the password fields and locks role/status (matching backend rules). If product wants in-place self password change, a Current password field plus `oldPassword` in UpdateAdminData would be needed here instead of the Settings link.
- Backend: a super_admin cannot set another admin's role to super_admin and later be locked out only if they are the sole super_admin; there is no 'last super_admin' guard for deactivating/demoting OTHER super_admins in admin.controller.ts updateAdmin (only self-protection exists). Out of this file's scope.
- Consistency outside this file: getRoleDisplayName() returns 'Super Admin' while statusMeta.roleMeta renders 'Super admin' (used by StatusBadge in the header and sidebar), so the page shows both spellings. Fixing requires changing adminAuthService or statusMeta, which this reviewer does not own.

### SettingsPage.tsx
- Notification preferences are still inert server-side: nothing in admin/src or backend/src reads admins.notification_preferences (audit high-severity). The card copy now says so honestly; wiring the bell/feed filter (AdminHeader / NotificationsPage) or the backend inserts is outside this file.
- Password change does not invalidate other admin_sessions (backend admin.controller.ts updateAdmin never touches that table); the UI now states this in the footer note, but a 'sign out other devices' action needs a backend endpoint.
- Current device cannot be identified in Recent sign-ins without selecting session_token (deliberately not done); a backend endpoint returning the current session id would be needed to mark 'This device'.
- Optional: expose the app version via a Vite `define` (e.g. __APP_VERSION__) in vite.config.ts instead of importing package.json into client code.

### RiderProfileChangeRequestsPage.tsx
- Audit's structural suggestion not taken by the rebuild: this page is still a ~95% duplicate of StoreProfileChangeRequestsPage.tsx (types, TABS, load/review flow, render tree) and `adminAuthHeaders()` is still copy-pasted per page; extracting a shared ProfileChangeRequestsView and moving the header helper into services/adminSession.ts is a cross-file refactor outside this file's ownership.
- Pagination and search are client-side over an unbounded `?status=all` fetch (the backend list query has no limit/range); a server-side limit/offset needs a backend change in delivery.controller.ts listRiderProfileChangeRequests.
- The read-only path (`canView && !canReview` info Alert, hidden Approve/Reject) is currently unreachable because every role with profile_change_requests.view also holds .edit via `profile_change_requests.*`; whether a view-only role should exist is a product decision.

### ProfilePage.tsx
- Security/backend: to mark 'This device' the page now selects `session_token` for every active session of the admin into the browser (tokens are reduced to a boolean before setState, but they still cross the wire). The `admin_full_access` RLS policy on admin_sessions is `USING (is_admin_authenticated())` with no admin_id restriction, so any authenticated admin can in fact read every admin's live session tokens — a pre-existing exposure this page now depends on. Recommend a SECURITY DEFINER RPC (e.g. `my_admin_sessions()` returning the rows with an `is_current` boolean and no token) plus a column-level or per-admin tightening of the policy; both are new Supabase migrations to apply BEFORE deploying a page that calls the RPC.
- Service copy: adminAuthService.getRoleDisplayName() returns Title Case ('Super Admin') and getRoleDescription() strings lack terminal punctuation; the page now sources the role name from roleMeta instead, but other callers of getRoleDisplayName (AdminHeader, EditAdminPage, etc.) still get Title Case. Normalising the service is outside this file.
- Product decision: there is no 'Sign out this session / all other devices' action on the sessions table; adding one needs a backend endpoint that sets logged_out_at for the chosen rows (not a client-side admin_sessions UPDATE).

### OffersPage.tsx
- Backend companion change must ship WITH or BEFORE this page: backend/src/routes/coupons.routes.ts (uncommitted) makes max_discount_amount / applies_to_first_n_orders / usage_limit / valid_until `.nullable()`; the page now sends `null` to clear those fields on edit and the old zod schema would reject the body with a 400. Deploy order: backend first.
- Product decision: on a refresh failure with data already loaded the page shows both a toast and a persistent titled Alert with Retry (same as CustomersPage); if that is considered noisy, drop the toast in fetchCoupons.
- Legacy coupons whose valid_until was stored at 00:00Z (old midnight-UTC bug) still show the same calendar day in IST and are extended to end-of-day only on their next save; a one-off data migration would be needed to fix them without re-saving (not a page change).

### DeliveryPage.tsx
- Shared StatCard: label wrapping at 6 columns misaligns value baselines across the row (affects StoresPage identically). Product/design decision: shorten 'Total partners'/'Pending approval' on both pages, or give StatCard a fixed two-line label height.
- Shared Table/TableEmptyRow: the EmptyState centres on the overflowing table width rather than the visible container, so it reads off-centre on wide tables; would need a sticky/viewport-width wrapper in the shared primitive.
- Pending-UPI chip still opens the document-review modal (behaviour preserved from the original); the audit's ui_needs suggested additionally linking to /delivery/profile-change-requests. Product decision, not a bug.

### HelpPage.tsx
- Support address: the page now uses SUPPORT_EMAIL = 'support@nearnow.com' to match the customer site, but the real mailbox cannot be confirmed from the codebase; the audit's suggestion to centralise it in one shared constant/env for both apps is a product/infra decision.
- Cross-page wording: FAQ says "Go to Delivery partners" (DeliveryPage PageHeader title) while the sidebar item is labelled "Delivery"; similarly "Offers & coupons" vs sidebar "Offers". Aligning sidebar labels with page titles is a product decision outside this file.
- StoreProductsPage PageHeader title is "Store Inventory" and ActivityLogPage title is "Activity Log" (Title Case, contrary to the sentence-case route titles "Store inventory"/"Activity log"); the HelpPage FAQ uses the sentence-case forms. Those pages' owners should fix their headers.
- The FAQ claim that approved riders accept ready orders from the rider app (backend acceptOrder) could not be verified from the admin codebase; it rests on the rebuild agent's backend check.
- Shared CardHeader has no flex-wrap, so a SearchInput placed in its actions shares a row with the title at phone widths (affects every page that does this, not just Help).

### NotificationsPage.tsx
- Rebuild notes (REBUILD_SUMMARIES.json) still describe a client-side Expo broadcast (RPC token fetch, 100-message chunking, 15 s AbortController, page-side admin_notifications insert); the committed page actually POSTs to /api/notifications/broadcast and the backend does the chunking/logging. The summary text is stale and should be corrected so later reviewers do not look for code that is not there — not something I can change from this file.
- The backend only writes the admin_notifications log row when result.sent > 0 (notifications.controller.ts:140), so a broadcast where every ticket failed leaves no trace in the inbox beyond the admin's own Alert. If an audit trail of failed broadcasts is wanted that is a backend/product decision.
- fetchCounts now runs three exact head-count queries (total, today, unread) on every 15 s poll instead of one. Cheap on PostgREST but worth a product call if the table grows large; moving counts to a single RPC would need a migration (flagging per the memory rule: no migration is needed for the page as shipped).

### ActivityLogPage.tsx
- Backend (not this file): the endpoint has no `source` query param, so the category filter remains client-side over the server-capped merged list; a quiet category can appear empty while older rows exist beyond 500. The page now explains this in its filtered-empty state, but server-side filtering would be the real fix (audit functional_issue #2).
- AdminSidebar.tsx (not this file): the /activity-log nav link is still shown to every admin regardless of hasPermission(admin, 'activity_log.view'). Moot today because admin/manager/viewer all hold activity_log.view in adminAuthService.ts, but the sidebar should gate on it if that ever changes.
- Cross-file refactor (audit 'duplicated-local-component'): API_BASE + adminAuthHeaders() are still re-declared locally (same as SecurityLogPage and ~12 other pages) instead of a shared adminApi helper built on utils/apiBase.ts apiUrl(). Deliberately left in place per the rebuild notes; worth one shared helper later.
- Note for the record: the audit's medium backend finding (never-reviewed store_images rows surfacing as 1970-dated 'Approved' actions) is already fixed in adminActivityLog.controller.ts (.not('reviewed_at','is',null) / .not('reviewed_by','is',null) on all six queries), so the page's nullable reviewed_at handling is purely defensive — no action needed.

### SupportMessagesPage.tsx
- Backend dependency: the page now relies on GET /api/admin/support-messages?page=&limit= returning `total`, and on POST /api/admin/support-messages/:id/reopen. Both exist only as UNCOMMITTED working-tree changes (backend/src/controllers/adminSupportMessages.controller.ts, backend/src/routes/adminSupportMessages.routes.ts, new adminSupportMessages.paging.test.ts). Deploy the backend before or with the admin build; against the old backend the list silently shows every message on one page and Reopen toasts 'Failed to reopen message'. No DB migration is needed (status CHECK already allows open|resolved).
- REBUILD_SUMMARIES.json entry for SupportMessagesPage is stale: it describes client-side pagination over the unpaged list and says 'no reopen endpoint', but the file does server-side paging and has a Reopen action. Worth refreshing so the next reviewer is not misled.
- Product decision: after reply/resolve under the Open tab the row stays on screen (now showing Resolved) until the next load and `total` / 'Showing a–b of N' is not decremented; likewise a fallback-prepended deep-link target makes the page show pageSize+1 rows while the footer says pageSize. Both are deliberate per the rebuild notes (keep scroll position, 'Linked message' badge explains the extra row) but could be tightened if the team prefers exact counts.
- Confirm dialog for Mark resolved uses tone 'primary' (reversible via Reopen); switch to 'danger' if the team wants it to read as a stronger action.

### StoresPage.tsx
- Shared StatCard: when the label wraps (e.g. 'Pending approval' at 6 columns) the value row misaligns across cards; fix belongs in components/ui/StatCard.tsx (single-line label or min-height on the label), not in this page.
- components/ui/Button.tsx IconButton has no ghost-danger variant, so StoresPage (and DeliveryPage) style the Remove button with raw red utility classes; add a `dangerGhost`/`dangerOutline` IconButton variant and switch both pages.
- Product decision: soft-deleted rows still show an amber 'Pending' approval badge (data-accurate since delete forces is_approved=false and tells the admin the store returns unapproved on restore); could be shown as '—' in the Deleted view if that reads as noise.
- Pre-existing backend/infra uncertainty kept from the original comments: whether Supabase Realtime honours the x-admin-token RLS policy over the websocket for this non-Supabase-Auth client is unconfirmed; the 3-minute visibility-aware poll remains the safety net.

### StoreProfileChangeRequestsPage.tsx
- Backend dependency is uncommitted: `pending_passbook_url`/`current_passbook_url` and signStoragePaths() exist only in the working tree of backend/src/controllers/adminStores.controller.ts (listProfileChangeRequests), not in HEAD. The page tolerates either API build (falls back to GET /api/admin/stores/:id/billing-info for the pending photo), so deploy order is free, but the backend change must be committed and deployed for inline/current photos to appear.
- Pagination is client-side only; GET /api/admin/stores/profile-change-requests still returns every row for the tab. Server-side limit/offset (and the Tabs count for non-active tabs) needs a backend change.
- The billing-info fallback requires store_verification.view (adminStores.routes). Every role that holds profile_change_requests.view today also holds it, but if ROLE_PERMISSIONS ever grants profile_change_requests.* without store_verification.view the 'View pending photo' fallback will 403 — a permissions/product decision.
- Signed photo URLs expire after SIGNED_URL_TTL_SECONDS; a tab left open past the TTL shows a broken thumbnail until Refresh. Whether to auto-refresh or show an 'expired, refresh' hint is a product decision.
- The twin RiderProfileChangeRequestsPage is outside my ownership; I aligned this page's no-access and read-only alerts to it, but did not verify its remaining copy matches this page's.

### SecurityLogPage.tsx
- AdminSidebar.tsx (not owned here) still lists "Security log" for every role with no hasPermission filtering (grep finds no `permission` reference in the file), so manager/viewer admins see the link and land on this page's "No permission" card. The audit flagged this; it needs a sidebar change (filter nav items by a `permission` field via hasPermission(getCurrentAdmin(), 'security_log.view')).
- Backend data gap for the new IP address column: admin.controller.ts writes `ip_address`/`user_agent` only on the LOGIN audit row and the failed_login_attempts row; the FAILED_LOGIN security_events insert (lines 141-146) omits ip_address, and the LOGOUT audit row and ADMIN_LOGOUT event (lines 164-174) omit both. Those rows will show "—" for IP until the controller passes req.ip / user agent through.
- The three list endpoints support only a row cap (Math.min(limit, 500)), not offset pagination, so entries older than the most recent 500 are unreachable from the UI; the footer states this. Adding offset/cursor pagination to adminSecurityLog.controller.ts is a backend change.
- The mock screenshot shows "Failed to load admin actions" with no HTTP status, which means the mock returned a 200 whose body was not `{success:true,…}` JSON (likely non-JSON or `success` absent). Re-shoot against a mock that returns `{"success":true,"logs":[]}` / `events` / `attempts` (or the stated `{"success":true,"data":[]}`, which the page tolerates as empty) to see the real empty state.

### StoreProductsPage.tsx
- routeMeta.ts gives '/stores/:storeId/products' parent '/stores' (breadcrumb 'Stores / Store inventory') while the page's backTo goes to '/stores/products' (the picker); consider parent '/stores/products' so the crumb and the Back link agree (not my file).
- SearchInput merges containerClassName onto 'w-full sm:w-64', so the modal's full-width override 'sm:w-full' only wins by Tailwind CSS ordering; a `fullWidth` prop on SearchInput (components/ui/Input.tsx) would be more robust.
- SearchInput does not forward a ref; forwardRef would let Modal consumers pass it straight to initialFocusRef instead of the id lookup now used here.
- adminApiFetch (services/adminService.ts) does not validate response shape; getStoreProducts/addStoreProduct can resolve to undefined on a 2xx with an unexpected body. Page-side guards were added, but the service could throw there itself.
- Client gate allows only super_admin/admin while the backend gates on store_products.view/edit permission flags (a manager with view permission is blocked client-side) — product decision, flagged speculative in the audit.

### RiderPayoutsPage.tsx
- Backend deploy-order note: the page now reads `total` from GET /api/admin/rider-payouts, which is an UNCOMMITTED change in backend/src/controllers/adminRiderPayouts.controller.ts (count:'exact'). The page degrades gracefully when the field is absent, but the backend should ship with or before this admin build for the exact counts to appear.
- 'Amount owed' is still a client-side sum over the loaded rows (hinted 'Across the loaded rows only' until every pending row is loaded) because the controller returns a row count but no summed amount. Returning `total_amount` for the status filter from listRiderPayouts would make it exact — backend change.
- Product decision: 'Riders to pay' (distinct partner_user_id among loaded pending rows) is a new derived metric the rebuild added to fill a 3-up StatGrid; drop it (StatGrid columns={2}) if only the two original figures are wanted.
- Network failures surface the browser's raw message ('Failed to fetch') in the Alert — pre-existing behaviour shared with the sibling log pages; a friendlier mapping would belong in a shared fetch helper, not this page.
- Audit's duplication note (adminAuthHeaders/API_BASE copied across 14 pages) is intentionally left: centralising it is a cross-file services change outside this file's ownership.

### AdminLoginPage.tsx
- Client still hard-codes a 12h token expiry (Date.now() + 12h) while the backend returns `expiresAt` in the login response and `authenticateAdmin` discards it (admin/src/services/adminAuthService.ts:158 destructures only { admin, token }). Service change: return expiresAt and pass new Date(expiresAt).getTime() here, falling back to 12h.
- 'Keep me signed in on this device' only switches localStorage vs sessionStorage; the server admin_sessions row and the client expiry both still end after 12h, so a remembered login does not outlive 12h. Product decision: longer remembered sessions server-side, or add hint copy such as 'up to 12 hours'.
- adminAuthService.ts still logs with emoji-prefixed console.error (lines 135 and 146, DEV-gated). Outside the owned file; part of the emoji sweep flagged by the audit.
- Native browser validation (required / type=email tooltips) is kept per the audit's 'do not drop required' guidance; switching to noValidate + FormField error is a styling-consistency decision, not a bug.

### DeliveryDocumentReviewModal.tsx
- Backend: reviewDeliveryPartnerVerificationDocument (backend/src/controllers/adminDeliveryDocuments.controller.ts) does not clear approved_at/approved_by when rejecting a previously approved document; the UI now labels the stale approval '(before rejection)', but a product/backend decision is needed on whether rejection should clear the approval columns.
- adminAuthHeaders() remains a module-local copy (audit: duplicated across ~10 pages). Consolidating it into services/adminSession is a cross-file change outside this file's ownership.
- DOC_LABELS still duplicates utils/docLabels.DOC_TYPE_LABELS by design (its key set drives DeliveryPage.approvalReadiness); exporting a rider-specific key list from utils/docLabels would need a coordinated change in DeliveryPage.tsx.
- Non-JSON error responses (e.g. a 502 HTML page) still surface as a JSON parse error message, exactly as in the original; a shared fetch/JSON helper would be a cross-cutting change.

### IdCell.tsx
- services/supabase.ts `getAdminClient()` performs a synchronous side-effecting hard redirect (clearAdminSession + window.location.href='/login') from inside a data helper. The shell now avoids triggering it, but any page with its own interval/poll that fires after logout can still cause a full reload racing the SPA navigation; consider making the redirect the route guard's job (service change, not a shell file).
- Product decision: the sidebar label is "Delivery" while the route title and DeliveryPage's PageHeader are "Delivery partners" (breadcrumb shows "Delivery partners"). Rename one of them if strict label parity between nav and page title is wanted.
- UI kit: ui/Tooltip could gain a `portal` option so AdminSidebar's local RailTooltip can be deleted; and Badge could gain a solid variant for the bell unread count (currently pale brand-50 on white).
- Minor a11y left open (low severity): header toggle wording on mobile ("Open/Close menu"), no focus trap / initial focus for the mobile drawer and the notifications dialog.

