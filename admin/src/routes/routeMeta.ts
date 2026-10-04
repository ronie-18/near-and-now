/**
 * Route metadata for the app shell: one entry per route in AdminRoutes.tsx,
 * consumed by the header breadcrumbs and `document.title`.
 *
 * Matching uses react-router's `matchPath`, so a dynamic segment (`:id`)
 * never leaks into the UI as a raw UUID — detail routes get a generic title
 * ("Order details") and the parent list as a linked crumb. Pages that know a
 * friendlier name (an order number, a customer's name) set it in their own
 * PageHeader; this table only owns the shell-level labels.
 */
import { useEffect } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { humanize } from '../utils/format';

export interface RouteMeta {
  /** react-router pattern, e.g. "/orders/:id" */
  pattern: string;
  /** Shell title: breadcrumb label and document.title */
  title: string;
  /** Pattern of the route shown as the previous (linked) crumb */
  parent?: string;
}

export const ROUTE_META: RouteMeta[] = [
  { pattern: '/', title: 'Dashboard' },

  // Catalog
  { pattern: '/products', title: 'Products' },
  { pattern: '/products/add', title: 'Add product', parent: '/products' },
  { pattern: '/products/edit/:id', title: 'Edit product', parent: '/products' },
  { pattern: '/products/submissions', title: 'Product submissions', parent: '/products' },
  { pattern: '/products/reviews', title: 'Reviews', parent: '/products' },
  { pattern: '/categories', title: 'Categories' },
  { pattern: '/categories/add', title: 'Add category', parent: '/categories' },
  { pattern: '/categories/edit/:id', title: 'Edit category', parent: '/categories' },
  { pattern: '/stores/products', title: 'Store inventory' },
  { pattern: '/stores/:storeId/products', title: 'Store inventory', parent: '/stores' },

  // Sales
  { pattern: '/orders', title: 'Orders' },
  { pattern: '/orders/:id', title: 'Order details', parent: '/orders' },
  { pattern: '/customers', title: 'Customers' },
  { pattern: '/customers/:id', title: 'Customer details', parent: '/customers' },

  // Marketing
  { pattern: '/reports', title: 'Reports' },
  { pattern: '/offers', title: 'Offers' },

  // Operations
  { pattern: '/delivery', title: 'Delivery partners' },
  { pattern: '/delivery/profile-change-requests', title: 'Rider change requests', parent: '/delivery' },
  { pattern: '/stores', title: 'Stores' },
  { pattern: '/stores/profile-change-requests', title: 'Store change requests', parent: '/stores' },

  // System
  { pattern: '/activity-log', title: 'Activity log' },
  { pattern: '/security-log', title: 'Security log' },
  { pattern: '/support-messages', title: 'Support messages' },
  // Same page with a conversation preselected — no parent, or the trail
  // would read "Support messages / Support messages".
  { pattern: '/support-messages/:id', title: 'Support messages' },
  { pattern: '/rider-payouts', title: 'Rider payouts' },
  { pattern: '/admins', title: 'Admin users' },
  { pattern: '/admins/create', title: 'Create admin', parent: '/admins' },
  { pattern: '/admins/edit/:id', title: 'Edit admin', parent: '/admins' },
  { pattern: '/settings', title: 'Settings' },
  { pattern: '/profile', title: 'My profile' },
  { pattern: '/help', title: 'Help' },
  { pattern: '/notifications', title: 'Notifications' },
];

export interface RouteCrumb {
  label: string;
  /** Absent on the current (last) crumb, which is never a link. */
  to?: string;
}

export interface ResolvedRoute {
  title: string;
  crumbs: RouteCrumb[];
}

const HOME_TITLE = 'Dashboard';
const APP_NAME = 'Near & Now Admin';

const BY_PATTERN = new Map<string, RouteMeta>(ROUTE_META.map((meta) => [meta.pattern, meta]));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Higher is more specific: static segments count first, then fewer dynamic
 * segments. "/stores/products" (2 static) beats "/stores/:storeId" (1 static).
 */
function specificity(pattern: string): [number, number] {
  const segments = pattern.split('/').filter(Boolean);
  const dynamic = segments.filter((s) => s.startsWith(':') || s === '*').length;
  return [segments.length - dynamic, -dynamic];
}

function findRouteMeta(pathname: string): RouteMeta | null {
  let best: RouteMeta | null = null;
  let bestScore: [number, number] = [-1, Number.NEGATIVE_INFINITY];

  for (const meta of ROUTE_META) {
    if (!matchPath({ path: meta.pattern, end: true }, pathname)) continue;
    const score = specificity(meta.pattern);
    if (score[0] > bestScore[0] || (score[0] === bestScore[0] && score[1] > bestScore[1])) {
      best = meta;
      bestScore = score;
    }
  }
  return best;
}

/** Unknown path: humanise the last non-id segment, never echo an id. */
function fallbackTitle(pathname: string): string {
  const segments = pathname
    .split('/')
    .filter(Boolean)
    .filter((s) => !UUID_RE.test(s) && !/^\d+$/.test(s));
  const last = segments[segments.length - 1];
  return last ? humanize(decodeURIComponent(last)) : 'Admin';
}

/**
 * Title + breadcrumb trail for a pathname. The home crumb ("Dashboard" → "/")
 * always comes first; parents are links; the current route is the final,
 * unlinked crumb. On "/" the single crumb is "Dashboard" itself.
 */
export function resolveRoute(pathname: string): ResolvedRoute {
  const meta = findRouteMeta(pathname);
  const crumbs: RouteCrumb[] = [{ label: HOME_TITLE, to: '/' }];

  if (!meta) {
    const title = fallbackTitle(pathname);
    return { title, crumbs: [...crumbs, { label: title }] };
  }

  if (meta.pattern === '/') {
    return { title: meta.title, crumbs: [{ label: meta.title }] };
  }

  // Walk the parent chain (guarding against a cycle in the table).
  const ancestors: RouteMeta[] = [];
  const seen = new Set<string>([meta.pattern]);
  let cursor = meta.parent ? BY_PATTERN.get(meta.parent) : undefined;
  while (cursor && !seen.has(cursor.pattern)) {
    seen.add(cursor.pattern);
    ancestors.unshift(cursor);
    cursor = cursor.parent ? BY_PATTERN.get(cursor.parent) : undefined;
  }

  for (const ancestor of ancestors) {
    // Parents are static list routes; a dynamic parent could not be linked.
    const linkable = !ancestor.pattern.includes(':') && ancestor.pattern !== '/';
    crumbs.push({ label: ancestor.title, to: linkable ? ancestor.pattern : undefined });
  }
  crumbs.push({ label: meta.title });

  return { title: meta.title, crumbs };
}

/** Sets `document.title` to "<title> · Near & Now Admin" on every route change. */
export function usePageTitle(): void {
  const { pathname } = useLocation();

  useEffect(() => {
    const { title } = resolveRoute(pathname);
    document.title = `${title} · ${APP_NAME}`;
  }, [pathname]);

  // The shell unmounts on logout; do not leave the last page's title on /login.
  useEffect(
    () => () => {
      document.title = APP_NAME;
    },
    [],
  );
}
