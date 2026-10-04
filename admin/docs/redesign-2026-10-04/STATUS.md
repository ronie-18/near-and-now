# Admin portal redesign — 2026-10-04

The admin portal (admin/) was rebuilt as a classic, professional dashboard in
aqua green + white. Every page and the app shell were restyled onto a shared
component library, and the bugs surfaced by a page-by-page audit were fixed in
the pages, the admin services and the backend.

## What shipped

- **Design system** — `DESIGN_SYSTEM.md` (spec), tokens in `admin/tailwind.config.js`
  (`brand-*` aqua scale, Inter, `shadow-card/popover/modal`), base styles in
  `admin/src/index.css`, favicon in `admin/public/favicon.svg`.
- **Shared primitives** — `admin/src/components/ui/*` (Button, IconButton, LinkButton,
  Input/Select/Textarea/Checkbox/SearchInput, Toggle, Badge, StatusBadge, Card,
  PageHeader, StatCard/StatGrid, Table*, Pagination, Modal, ConfirmDialog, Alert,
  EmptyState, Spinner/PageLoader/Skeleton, Tabs/SegmentedControl, Dropdown,
  Tooltip, Avatar, DescriptionList, FilterBar). API reference: `UI_API.md`.
  Helpers: `utils/cn.ts`, `utils/format.ts`, `utils/statusMeta.ts`,
  `context/ConfirmContext.tsx` (`useConfirm` replaces `window.confirm`).
- **Shell** — one persistent layout route (`routes/AdminRoutes.tsx`: auth guard >
  layout > Suspense > Outlet) so the shell no longer remounts and re-checks the
  session on every navigation; `routes/routeMeta.ts` drives breadcrumbs and
  `document.title` for every route (no raw UUIDs); `hooks/useCurrentAdmin.ts`
  shares session state between header and sidebar; dead header search removed;
  broken `/Logo.png` replaced; exact unread count on the bell; mobile drawer
  fixed (matchMedia, closes on navigation/Escape, scroll lock); collapsed rail
  with tooltips; login page redirects back to the page the admin was heading to.
- **Pages** — all 33 page files rebuilt on the primitives; no page wraps itself
  in `AdminLayout` any more. Every `window.confirm`/`alert` replaced; hover-only
  row actions made visible; icon buttons labelled; stale-response guards added
  to every list that lacked one; pagination clamped; fetch errors surfaced with
  Retry instead of misleading empty states; fabricated metrics removed.

## Bugs fixed (highlights)

- Order search failed on every non-empty term (`ilike` on a uuid column).
- "Confirmed" order status was dead end-to-end; now mapped from `store_accepted`.
- Clearing optional fields on edit (product, category, coupon) never persisted.
- Category "colour" field wrote to a non-existent column; removed everywhere.
- Product multi-image UI only ever saved one image; `size` silently reset `unit`
  to "piece". Both now match the schema.
- Dashboard top-product links pointed at the wrong table (always "not found").
- Dashboard/Reports charts skipped the most recent days and summed sampled points.
- Customer totals and revenue included cancelled orders.
- Order details could not show coupon discounts, so lines did not add up.
- Category delete could cascade-delete products when the count query failed.
- Status changes discarded the refreshed order row (stale payment/rider columns).
- Create/edit admin success messages were silently dropped.
- Customer detail kept showing the previous customer while navigating.
- Push broadcast judged success by HTTP status and sent >100 tokens per request;
  now a backend endpoint with batching and per-device failure reporting.
- Activity log listed never-reviewed storefront photos as approvals dated 1970.
- Support messages list had no limit; now paginated server-side.
- Store change requests now show the pending passbook photo via a signed URL.

## Deploy notes

- **Backend changes require an API deploy** (coupons routes/schema, activity log
  controller, notifications broadcast endpoint, support messages paging,
  store change-request signed URLs, admin password-change session revocation).
  Deploy the API together with (or before) the admin build.
- **No database migration is required.** One is recommended (category FK
  `ON DELETE RESTRICT`, optional rating default) — see `OPEN_ITEMS.md`.

## Verification

    cd admin && npx tsc --noEmit -p tsconfig.json && npx vite build
    npx tsc --noEmit -p backend/tsconfig.json && npx vitest run --root backend

All green at commit time (288 backend tests). A headless-Chrome screenshot pass
against a mocked backend confirmed every route renders the new shell; the
screenshots and the per-page audit reports were left outside the repo on the
Desktop (`near-and-now-admin-screenshots/`).

## Follow-ups

See `OPEN_ITEMS.md` for everything deliberately deferred (server-side pagination
for several lists, keyset pagination for reviews, admin name charset rule,
coupon code on order details, etc.).
