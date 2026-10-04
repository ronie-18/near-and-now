# Near & Now Admin — Design System Spec (v1)

Target: a classic, professional, enterprise admin dashboard. Two brand colours — **aqua green** and **white** — plus a neutral grey scale for text/borders/canvas and a restrained set of semantic colours used ONLY for status/alerts/destructive actions.

Stack: Vite + React 18 + TypeScript (strict, noUnusedLocals/Parameters) + Tailwind 3 + lucide-react + react-router-dom v6. **No new runtime dependencies.**

---

## 1. Tokens (tailwind.config.js)

```js
theme: {
  extend: {
    colors: {
      brand: {
        50:  '#EDFAF8',
        100: '#D3F3EE',
        200: '#A8E7DD',
        300: '#72D4C7',
        400: '#3FBDAE',
        500: '#19A596',   // aqua green — primary
        600: '#0F8A7D',   // primary hover / default solid button
        700: '#0F6F66',
        800: '#105953',
        900: '#0D4A45',   // sidebar background
        950: '#062E2B',
      },
      // keep Tailwind gray as the neutral scale; remove the old `primary: '#6366f1'` token entirely
    },
    fontFamily: {
      sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
    },
    boxShadow: {
      card: '0 1px 2px 0 rgb(16 24 40 / 0.04)',
      popover: '0 4px 12px -2px rgb(16 24 40 / 0.12), 0 2px 4px -2px rgb(16 24 40 / 0.06)',
      modal: '0 20px 40px -12px rgb(16 24 40 / 0.25)',
    },
  },
},
```

index.html: load Inter from Google Fonts (`<link rel="preconnect" href="https://fonts.googleapis.com">`, `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`, `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">`). Title: `Near & Now Admin`.

index.css: keep the three @tailwind directives; add `html { -webkit-font-smoothing: antialiased; }`, `body { @apply bg-gray-50 text-gray-900 text-sm; }`, a `.tabular-nums` usage is from Tailwind, and a thin scrollbar rule for `.scrollbar-thin` (webkit + firefox). Nothing else.

### Colour usage rules
- **brand** (aqua green): primary buttons, active nav item, links, focus rings, selected tabs/rows, checkbox/toggle on-state, chart bars, icon accents in stat cards.
- **white**: all surfaces (cards, header, modals, inputs, table bodies).
- **gray**: canvas `bg-gray-50`, borders `border-gray-200`, headings `text-gray-900`, body `text-gray-700`, muted `text-gray-500`, placeholder `text-gray-400`.
- **semantic** (only through Badge/Alert/Button tones): success = green-600/700 on green-50, warning = amber-600/800 on amber-50, danger = red-600/700 on red-50, info = blue-600/700 on blue-50.
- **Forbidden anywhere**: violet, purple, fuchsia, pink, indigo, cyan, sky, lime, rose, orange, yellow, teal, emerald (use brand instead of emerald/teal), slate/zinc/stone (use gray).

### Shape and depth rules
- Radii: `rounded` (4px) for badges/checkboxes, `rounded-md` (6px) for buttons/inputs/cards/table containers, `rounded-lg` (8px) for modals/popovers only. **Never** `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `rounded-full` except for avatars, dots and spinners.
- Depth: cards are `bg-white border border-gray-200 rounded-md` with **no shadow** (optionally `shadow-card`). Popovers/dropdowns `shadow-popover`. Modals `shadow-modal`. **Never** `shadow-lg/xl/2xl` on cards, never `shadow-inner`.
- Motion: `transition-colors` only. **Never** `hover:-translate-y-*`, `hover:scale-*`, `animate-pulse` decorations, `animate-in`. `animate-spin` only on spinner icons.
- **Forbidden**: `bg-gradient-*`, `backdrop-blur-*`, `blur-*` decorative blobs, absolutely-positioned decorative circles, `text-[10px]`, `tracking-widest`, emoji in UI strings, uppercase label text larger than table headers.
- Typography: page title `text-xl font-semibold text-gray-900`; section/card title `text-base font-semibold text-gray-900`; body `text-sm`; helper `text-xs text-gray-500`; table header `text-xs font-semibold uppercase tracking-wide text-gray-500`; numbers in tables/stats `tabular-nums`.
- Icons: lucide-react; 16px inside buttons/table cells/inputs, 18px in sidebar nav, 20px in page-level empty states, `strokeWidth` default.

---

## 2. Shared primitives — `admin/src/components/ui/`

All components: typed props, `className?: string` merge via `cn()` (see §4), forwardRef where a DOM node is wrapped (Button, Input, Select, Textarea, Checkbox). Export everything through `admin/src/components/ui/index.ts`.

### Button.tsx
```ts
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerOutline' | 'link';
type ButtonSize = 'sm' | 'md' | 'lg';
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant; size?: ButtonSize; loading?: boolean;
  leftIcon?: React.ReactNode; rightIcon?: React.ReactNode; fullWidth?: boolean;
}
```
- Base: `inline-flex items-center justify-center gap-2 font-medium rounded-md border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap`.
- Sizes: sm `h-8 px-3 text-xs`; md `h-9 px-4 text-sm`; lg `h-10 px-5 text-sm`.
- primary `bg-brand-600 border-brand-600 text-white hover:bg-brand-700 hover:border-brand-700`; secondary `bg-white border-gray-300 text-gray-700 hover:bg-gray-50`; ghost `bg-transparent border-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900`; danger `bg-red-600 border-red-600 text-white hover:bg-red-700`; dangerOutline `bg-white border-red-300 text-red-700 hover:bg-red-50`; link `border-transparent bg-transparent text-brand-700 hover:underline h-auto px-0`.
- `loading` shows `<Loader2 className="h-4 w-4 animate-spin" />` in place of leftIcon and sets `disabled`.
- Also export `IconButton` (square: sm `h-8 w-8`, md `h-9 w-9`; requires `aria-label`; variants secondary/ghost/danger).
- Also export `LinkButton` = same look rendered as react-router `<Link>` (props: `to`, variant, size, leftIcon).

### Input.tsx (form controls)
- `FormField`: `{ label?: string; htmlFor?: string; hint?: string; error?: string; required?: boolean; children }` — renders label (`text-sm font-medium text-gray-700`), the control, hint `text-xs text-gray-500`, error `text-xs text-red-600`.
- `Input`: `React.InputHTMLAttributes` + `{ invalid?: boolean; leftIcon?: React.ReactNode; rightElement?: React.ReactNode; inputSize?: 'sm'|'md' }`. Base: `block w-full rounded-md border bg-white text-sm text-gray-900 placeholder:text-gray-400 shadow-none focus:outline-none focus:ring-1 disabled:bg-gray-50 disabled:text-gray-500`; md `h-9 px-3`, sm `h-8 px-2.5 text-xs`; normal `border-gray-300 focus:border-brand-500 focus:ring-brand-500`; invalid `border-red-500 focus:border-red-500 focus:ring-red-500`. leftIcon positions a 16px icon at left and adds `pl-9`.
- `Textarea`: same styles, `min-h-[96px] py-2`.
- `Select`: native `<select>` with the same box styles plus a lucide `ChevronDown` at right (`appearance-none pr-9`). Options passed as children.
- `Checkbox`: native input `h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500` with optional `label` and `description`.
- `Radio` optional.
- `SearchInput`: Input with `Search` leftIcon, `type="search"`, optional clear (X) button when value non-empty; props `{ value, onChange(value: string), placeholder, className, inputSize }` plus optional `onSubmit`.

### Toggle.tsx
`{ checked: boolean; onChange(next: boolean): void; disabled?: boolean; label?: string; description?: string; size?: 'sm'|'md'; 'aria-label'?: string }` — `role="switch"`, track `h-5 w-9 rounded-full` (`bg-brand-600` on, `bg-gray-300` off), thumb white, `transition-colors`.

### Badge.tsx
```ts
type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';
interface BadgeProps { tone?: BadgeTone; dot?: boolean; size?: 'sm'|'md'; className?: string; children }
```
`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap`; neutral `bg-gray-100 text-gray-700`; brand `bg-brand-50 text-brand-700`; success `bg-green-50 text-green-700`; warning `bg-amber-50 text-amber-800`; danger `bg-red-50 text-red-700`; info `bg-blue-50 text-blue-700`. `dot` renders a `h-1.5 w-1.5 rounded-full bg-current` dot.

### StatusBadge.tsx + `admin/src/utils/statusMeta.ts`
`statusMeta.ts` exports pure functions mapping domain strings to `{ label: string; tone: BadgeTone }`:
- `orderStatusMeta(status)` for: placed, confirmed, preparing, ready, assigned, picking_up, picked_up, shipped, delivered, cancelled (and unknown → neutral with humanised label).
- `paymentStatusMeta(status)` for: paid, pending, authorized, cancelled, partially_refunded, refunded, failed.
- `verificationStatusMeta(status)` for store/rider verification (pending, approved, rejected, suspended, under_review, incomplete, …).
- `genericStatusMeta(status)` for active/inactive/suspended/approved/rejected/pending/draft/published/open/closed/resolved/in_progress.
- `roleMeta(role)` for super_admin/admin/manager/viewer.
- `humanize(value)` → "picking_up" → "Picking up".
The exact value sets are to be completed from the audit's `status_vocabularies` (see AUDIT.json). Tones: delivered/paid/approved/active/resolved → success; cancelled/failed/rejected/suspended → danger; pending/preparing/authorized/under_review → warning; placed/confirmed/assigned/picking_up/picked_up/shipped/ready/in_progress → info or brand (in-flight = info); refunded/partially_refunded/inactive/closed → neutral.
`StatusBadge` props: `{ kind: 'order'|'payment'|'verification'|'generic'|'role'; value: string; size?; className? }`.

### Card.tsx
`Card` (`bg-white border border-gray-200 rounded-md`), `CardHeader` (`flex items-center justify-between gap-4 px-5 py-4 border-b border-gray-200`; props `title`, `description?`, `actions?`), `CardBody` (`p-5`, prop `padding?: 'none'|'sm'|'md'`), `CardFooter` (`px-5 py-3 border-t border-gray-200 bg-gray-50 rounded-b-md`).

### PageHeader.tsx
`{ title: string; description?: string; actions?: React.ReactNode; breadcrumbs?: {label: string; to?: string}[]; backTo?: string; children? }` — `mb-6`, title `text-xl font-semibold text-gray-900`, description `mt-1 text-sm text-gray-500`, actions right-aligned with `flex flex-wrap items-center gap-2`, optional back link (ChevronLeft + label) when `backTo` given.

### StatCard.tsx
`{ label: string; value: React.ReactNode; hint?: string; icon?: React.ComponentType<{className?: string}>; delta?: { value: string; direction: 'up'|'down'|'flat'; label?: string }; to?: string; loading?: boolean }` — white card, label `text-sm text-gray-500`, value `mt-1 text-2xl font-semibold text-gray-900 tabular-nums`, icon in a `h-9 w-9 rounded-md bg-brand-50 text-brand-600` box at the right, delta rendered with a small arrow in green/red/gray ONLY when provided by real data. `loading` shows a skeleton bar. `to` wraps in Link with `hover:border-gray-300`.
Also export `StatGrid` (`grid gap-4 sm:grid-cols-2 xl:grid-cols-4`).

### Table.tsx
- `TableContainer` (`overflow-x-auto rounded-md border border-gray-200 bg-white`), `Table` (`min-w-full divide-y divide-gray-200 text-sm`), `THead` (`bg-gray-50`), `Th` (`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 whitespace-nowrap`; prop `align?: 'left'|'right'|'center'`), `TBody` (`divide-y divide-gray-200 bg-white`), `Tr` (prop `clickable?` → `hover:bg-gray-50 cursor-pointer`; `selected?` → `bg-brand-50`), `Td` (`px-4 py-3 text-gray-700 align-middle`; props `align`, `muted?` → gray-500, `nowrap?`).
- `TableEmptyRow` `{ colSpan: number; children }` for an EmptyState inside a table.
- `TableSkeletonRows` `{ rows: number; cols: number }`.

### Pagination.tsx
`{ page: number; pageSize: number; total: number; onPageChange(page: number): void; pageSizeOptions?: number[]; onPageSizeChange?(size: number): void; className? }` — left: "Showing 1–10 of 240"; right: Prev/Next IconButtons + up to 5 numbered page buttons (secondary style, active = brand-600 solid). Rendered inside `CardFooter`-like bar (`flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-white text-sm text-gray-600`).

### Modal.tsx
`{ open: boolean; onClose(): void; title?: string; description?: string; size?: 'sm'|'md'|'lg'|'xl'|'full'; footer?: React.ReactNode; children; closeOnOverlay?: boolean (default true); initialFocusRef? }` — portal to `document.body`; overlay `fixed inset-0 z-50 bg-gray-900/50` (NO blur); panel `bg-white rounded-lg shadow-modal w-full max-h-[90vh] flex flex-col` with sizes sm `max-w-sm`, md `max-w-lg`, lg `max-w-2xl`, xl `max-w-4xl`, full `max-w-6xl`; header `px-6 py-4 border-b` with title (`text-base font-semibold`) and close IconButton (`aria-label="Close"`); body `px-6 py-5 overflow-y-auto`; footer `px-6 py-4 border-t bg-gray-50 rounded-b-lg flex justify-end gap-2`. Escape closes; body scroll locked while open; `role="dialog" aria-modal="true" aria-labelledby`.

### ConfirmDialog.tsx + `admin/src/context/ConfirmContext.tsx`
- `ConfirmDialog` props: `{ open; title; message: React.ReactNode; confirmLabel?: string (default 'Confirm'); cancelLabel?: string (default 'Cancel'); tone?: 'danger'|'primary' (default 'primary'); loading?: boolean; onConfirm(): void | Promise<void>; onCancel(): void }`. Uses Modal size sm; a `AlertTriangle` icon in `bg-red-50 text-red-600` box when tone is danger.
- `ConfirmProvider` + `useConfirm(): (opts: { title: string; message: React.ReactNode; confirmLabel?: string; cancelLabel?: string; tone?: 'danger'|'primary' }) => Promise<boolean>` — a single provider mounted in App.tsx, resolves `true` on confirm, `false` on cancel/close. Replaces every `window.confirm`.

### Alert.tsx
`{ tone: 'info'|'success'|'warning'|'danger'; title?: string; children?: React.ReactNode; onDismiss?(): void; className? }` — `flex gap-3 rounded-md border p-4 text-sm`; tones use `bg-{tone}-50 border-{tone}-200 text-{tone}-800` with matching lucide icon (Info, CheckCircle2, AlertTriangle, XCircle). Dismiss = ghost IconButton with X.

### EmptyState.tsx
`{ icon?: React.ComponentType<{className?: string}>; title: string; description?: string; action?: React.ReactNode; compact?: boolean }` — centred, icon in `h-12 w-12 rounded-full bg-gray-100 text-gray-400` (20px icon), title `text-sm font-medium text-gray-900`, description `mt-1 text-sm text-gray-500 max-w-sm`, action `mt-4`. Padding `py-16` or `py-8` when compact.

### Spinner.tsx
`Spinner` `{ size?: 'sm'|'md'|'lg'; className? }` → lucide `Loader2 animate-spin text-brand-600` (16/24/32px). `PageLoader` `{ label?: string }` → `flex items-center justify-center py-24` with md spinner and optional `text-sm text-gray-500` label. `Skeleton` `{ className }` → `animate-pulse rounded bg-gray-200` (the ONLY allowed animate-pulse).

### Tabs.tsx
`Tabs` `{ value: string; onChange(v: string): void; items: { value: string; label: string; count?: number; icon?: React.ReactNode }[]; className? }` — underline tabs: container `border-b border-gray-200 flex gap-6 overflow-x-auto`; tab `-mb-px border-b-2 px-1 py-3 text-sm font-medium whitespace-nowrap`; active `border-brand-600 text-brand-700`; inactive `border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300`; count rendered as a neutral Badge. Also export `SegmentedControl` (pill-less, bordered button group) for small toggles like 7d/30d/90d: `inline-flex rounded-md border border-gray-300 bg-white p-0.5`, active segment `bg-brand-50 text-brand-700`.

### Dropdown.tsx
`DropdownMenu` `{ trigger: React.ReactNode; align?: 'left'|'right'; children }` and `DropdownItem` `{ onSelect(): void; icon?: React.ReactNode; tone?: 'default'|'danger'; disabled?: boolean; children }`, `DropdownSeparator`. Click-outside and Escape close; menu `absolute z-40 mt-1 min-w-[180px] rounded-lg border border-gray-200 bg-white py-1 shadow-popover`; item `flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50`; danger `text-red-600 hover:bg-red-50`.

### Tooltip.tsx
`{ content: string; side?: 'top'|'right'|'bottom'|'left'; children }` — CSS group-hover tooltip: `rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-popover`, `pointer-events-none`, appears on hover/focus-within. Used for collapsed sidebar labels and icon buttons.

### Avatar.tsx
`{ name?: string; src?: string | null; size?: 'sm'|'md'|'lg' }` → initials (first letters of first two words) in `rounded-full bg-brand-100 text-brand-800 font-semibold`, or image. Sizes 28/36/48px.

### DescriptionList.tsx
`DescriptionList` `{ items: { label: string; value: React.ReactNode }[]; columns?: 1|2|3 }` — classic key/value grid (`dt text-xs font-medium uppercase tracking-wide text-gray-500`, `dd mt-1 text-sm text-gray-900`). For detail pages (order, customer, store, rider).

### FilterBar.tsx
`{ children; className? }` → `flex flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-4 py-3` (used above tables with SearchInput + Selects + action buttons).

---

## 3. App shell

### Sidebar (`AdminSidebar.tsx`) — rewrite
- Width 240px expanded (`w-60`), 64px collapsed rail (`w-16`); `bg-brand-900 text-brand-100`; `border-r border-brand-800`.
- Brand block at top (h-14): the login logo (`import logoUrl from '../../../assets/login-logo.png'`) in a white `rounded-md` 32px tile + "Near & Now" (`text-white font-semibold text-sm`) and "Admin" (`text-brand-300 text-xs`). Remove the broken `/Logo.png` reference.
- Section labels `px-4 pt-5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-brand-400` (this is the one place 11px is allowed; use `text-[11px]` not `text-[10px]`).
- Nav item: `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-brand-100 hover:bg-brand-800 hover:text-white`; active `bg-brand-700 text-white`; icon 18px. Submenu items indented (`pl-9`) with a `text-brand-200` colour and the same active style. Collapsed rail: icon-only, centred, Tooltip on hover with the title.
- Keep ALL existing routes and the current grouping (Main / Catalog / Sales / Marketing / Operations / System) but shorten the two long labels to "Rider Change Requests" and "Store Change Requests".
- Bottom block: Avatar (initials), name, role (not email – role is more useful; email in Tooltip/title), and a ghost "Sign out" item. No gradients.
- Preserve behaviours: active-route detection (`/` exact), auto-expand of parent when child active, mobile overlay + close on route change, logout flow (`secureAdminLogout` then `navigate('/login')`, fallback `clearAdminSession`).

### Header (`AdminHeader.tsx`) — rewrite
- `h-14 bg-white border-b border-gray-200 px-4 flex items-center gap-3`.
- Left: sidebar toggle IconButton (Menu/PanelLeft), then breadcrumbs. **Fix breadcrumbs**: build labels from a complete route map that covers every route in AdminRoutes.tsx (products/edit/:id → "Products / Edit product", orders/:id → "Orders / Order #<short id>" (use a generic "Order details" label; pages set their own detail titles), customers/:id → "Customer details", stores/products → "Store inventory", stores/:storeId/products → "Stores / Inventory", stores/profile-change-requests → "Store change requests", delivery/profile-change-requests → "Rider change requests", products/submissions → "Product submissions", products/reviews → "Reviews", activity-log → "Activity log", security-log → "Security log", support-messages(/:id) → "Support messages", rider-payouts → "Rider payouts", admins/create → "Admin users / Create", admins/edit/:id → "Admin users / Edit", categories/add|edit → ..., profile → "My profile", help → "Help"). Never render a raw UUID segment.
- **Remove the non-functional search box.**
- Right: notifications bell with unread dot and dropdown (restyle: `rounded-lg shadow-popover`, items plain, unread = `bg-brand-50/60` with a `bg-brand-600` dot; icon chips use tone colours via a small map limited to brand/blue/gray/green), "Mark all read" as a link-style Button, "View all" footer link. Then user DropdownMenu (Avatar + name + role; items: My profile, Settings, Help, separator, Sign out in danger tone).
- Replace `alert(err?.message …)` in markAllRead with `useToast().showToast(message, 'error')`.
- Preserve: polling guard (`if (location.pathname === '/notifications') return;` 15s interval), `read_by` semantics, `getNotificationLink` navigation, awaited RPC error handling.

### Layout (`AdminLayout.tsx`)
- `flex h-screen bg-gray-50`; sidebar fixed; content `md:pl-60` / `md:pl-16` depending on state; `<main className="flex-1 overflow-y-auto"><div className="mx-auto w-full max-w-[1400px] px-6 py-6">{children}</div></main>`. Preserve the responsive collapse logic. Add an optional `title`/`actions` props? No — pages use `PageHeader`.

### Toasts (`components/Toasts.tsx`)
White cards: `flex items-start gap-3 rounded-md border border-gray-200 border-l-4 bg-white p-4 shadow-popover`; left border + icon colour by tone (success green-600, error red-600, warning amber-500, info brand-600); text `text-sm text-gray-800`; close ghost IconButton. `role="status"`/`aria-live="polite"` on the container.

### ErrorBoundary, PageLoadingFallback, AuthGuard loader
Use `Card` + `Button` (primary) for the error boundary; `PageLoader` for the Suspense fallback and the auth-verifying state ("Checking your session…").

### Login page
Two-panel: left (hidden below `lg`) `bg-brand-900` with the logo tile, "Near & Now", "Admin console", one line of copy in `text-brand-200`; right white panel with centred `max-w-sm` form: heading "Sign in" (`text-2xl font-semibold`), sub "Use your administrator credentials.", `FormField`+`Input` (email, password with show/hide IconButton), `Checkbox` "Keep me signed in on this device", primary `Button` fullWidth with `loading`. Errors via `Alert tone="danger"`. Remove: gradient background, hover-scale card, "Note: Use your admin credentials" footer. Preserve the already-authenticated redirect, remember-me storage choice, dev-only console logging, server-side rate-limit message passthrough.

---

## 4. Utilities
- `admin/src/utils/cn.ts`: `export function cn(...parts: Array<string | false | null | undefined>) { return parts.filter(Boolean).join(' '); }`
- `admin/src/utils/format.ts`: `formatCurrency(n, { compact? })` → `₹1,23,456` using `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0|2 })`; `formatDate(iso)` → `04 Oct 2026`; `formatDateTime(iso)` → `04 Oct 2026, 14:05`; `timeAgo(iso)`; `formatNumber(n)`. Pages must use these instead of ad-hoc `toLocaleString()` scattered formatting where they currently format money/dates (keep any page-specific formatting that is intentionally different, e.g. invoice formats).

---

## 5. Page conventions (for the per-page rebuild)
1. Every page: `<AdminLayout>` → `<PageHeader title description actions />` → content. No in-page gradient hero blocks, no local StatCard/ErrorAlert/LoadingSpinner/EmptyState — import from `components/ui`.
2. Lists: optional `StatGrid` of real counts → `Card` containing `FilterBar` (SearchInput + Select filters + Refresh/Export secondary buttons) → `TableContainer/Table` → `Pagination`. Loading: `TableSkeletonRows` or `PageLoader`; errors: `Alert tone="danger"` with retry Button; empty: `EmptyState` inside `TableEmptyRow`.
3. Detail pages: `PageHeader backTo` + `DescriptionList` in Cards + tables for line items; status via `StatusBadge`.
4. Forms (add/edit): Cards with `CardHeader` sections, 2-column `grid gap-5 md:grid-cols-2` of `FormField`s, sticky-less footer with Cancel (secondary) + Save (primary, loading). Validation errors inline through `FormField error`.
5. Destructive actions: `useConfirm()` dialog with `tone="danger"`, never `window.confirm`. Feedback through `useToast()`, never `window.alert`.
6. Status/role badges only through `StatusBadge`/`Badge`. Icons only in brand/gray.
7. Keep every piece of business logic, data fetching, pagination math, comments explaining past bugs, URL params and keyboard handling exactly as-is unless the audit flagged a confirmed bug (then fix it and keep a short comment).
8. The file must compile under `strict` + `noUnusedLocals` + `noUnusedParameters`: remove now-unused imports (lucide icons, local component props).
