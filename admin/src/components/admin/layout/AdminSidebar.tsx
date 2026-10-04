import { useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, matchPath, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Bell,
  ShoppingBag,
  ClipboardList,
  Users,
  BarChart3,
  Tag,
  Truck,
  FileText,
  Store,
  History,
  ShieldAlert,
  MessageCircle,
  Wallet,
  Shield,
  Settings,
  HelpCircle,
  LogOut,
  ChevronDown,
  X,
} from 'lucide-react';
import logoUrl from '../../../assets/login-logo.png';
import { Avatar, roleMeta } from '../../ui';
import { cn } from '../../../utils/cn';
import { useCurrentAdmin, useLogout } from '../../../hooks/useCurrentAdmin';

interface AdminSidebarProps {
  /** DOM id referenced by the header toggle's aria-controls. */
  id: string;
  /** Desktop rail mode (icon-only, w-16). Ignored below md: the drawer is always expanded. */
  collapsed: boolean;
  /** Mobile drawer visibility. */
  mobileOpen: boolean;
  /** Current viewport is ≥ md. */
  isDesktop: boolean;
  /** Close the mobile drawer. */
  onClose: () => void;
  /** Expand the desktop rail (used when a collapsed group needs its children). */
  onExpand: () => void;
}

type NavIcon = ComponentType<{ size?: number | string; className?: string }>;

interface NavChild {
  title: string;
  path: string;
  /** Exact-only match (Dashboard lives at "/", which is a prefix of everything). */
  exact?: boolean;
  /** Extra route patterns that also belong to this entry (react-router syntax). */
  patterns?: string[];
}

interface NavLeaf extends NavChild {
  icon: NavIcon;
}

interface NavGroup {
  title: string;
  path: string;
  icon: NavIcon;
  children: NavChild[];
}

type NavEntry = NavLeaf | NavGroup;

interface NavSection {
  label: string;
  items: NavEntry[];
}

const isGroup = (entry: NavEntry): entry is NavGroup => 'children' in entry;

// Same grouping and the same links as before; only the two long Operations
// labels were shortened so they fit on one line in the 240px rail.
const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Main',
    items: [
      { title: 'Dashboard', path: '/', icon: LayoutDashboard, exact: true },
      { title: 'Notifications', path: '/notifications', icon: Bell },
    ],
  },
  {
    label: 'Catalog',
    items: [
      {
        title: 'Products',
        path: '/products',
        icon: ShoppingBag,
        children: [
          { title: 'All products', path: '/products' },
          { title: 'Add product', path: '/products/add' },
          { title: 'Categories', path: '/categories' },
          // /stores/products and /stores/:storeId/products are catalog views,
          // not the Stores list — they light this entry only.
          { title: 'Store inventory', path: '/stores/products', patterns: ['/stores/:storeId/products'] },
          { title: 'Product submissions', path: '/products/submissions' },
          { title: 'Reviews', path: '/products/reviews' },
        ],
      },
    ],
  },
  {
    label: 'Sales',
    items: [
      { title: 'Orders', path: '/orders', icon: ClipboardList },
      { title: 'Customers', path: '/customers', icon: Users },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { title: 'Reports', path: '/reports', icon: BarChart3 },
      { title: 'Offers', path: '/offers', icon: Tag },
    ],
  },
  {
    label: 'Operations',
    items: [
      { title: 'Delivery', path: '/delivery', icon: Truck },
      { title: 'Rider change requests', path: '/delivery/profile-change-requests', icon: FileText },
      { title: 'Stores', path: '/stores', icon: Store },
      { title: 'Store change requests', path: '/stores/profile-change-requests', icon: FileText },
    ],
  },
  {
    label: 'System',
    items: [
      { title: 'Activity log', path: '/activity-log', icon: History },
      { title: 'Security log', path: '/security-log', icon: ShieldAlert },
      { title: 'Support messages', path: '/support-messages', icon: MessageCircle },
      { title: 'Rider payouts', path: '/rider-payouts', icon: Wallet },
      { title: 'Admin users', path: '/admins', icon: Shield },
      { title: 'Settings', path: '/settings', icon: Settings },
      { title: 'Help', path: '/help', icon: HelpCircle },
    ],
  },
];

const ALL_LEAVES: NavChild[] = NAV_SECTIONS.flatMap((section) =>
  section.items.flatMap((item): NavChild[] => (isGroup(item) ? item.children : [item])),
);

/**
 * Length of the pathname prefix this leaf accounts for, or -1 when it does
 * not match. Segment-aware (via matchPath) so "/stores" never matches
 * "/storesX", and the Dashboard entry only matches "/" exactly.
 */
function matchLength(leaf: NavChild, pathname: string): number {
  if (leaf.exact) return pathname === leaf.path ? leaf.path.length : -1;
  let best = -1;
  for (const pattern of [leaf.path, ...(leaf.patterns ?? [])]) {
    const match = matchPath({ path: pattern, end: false }, pathname);
    if (match && match.pathnameBase.length > best) best = match.pathnameBase.length;
  }
  return best;
}

/**
 * The single active entry: the leaf with the most specific (longest) match.
 * "/stores/profile-change-requests" therefore lights only "Store change
 * requests", never "Stores" as well — the old startsWith check lit both.
 */
function resolveActivePath(pathname: string): string | null {
  let best: NavChild | null = null;
  let bestLength = -1;
  for (const leaf of ALL_LEAVES) {
    const length = matchLength(leaf, pathname);
    if (length > bestLength) {
      best = leaf;
      bestLength = length;
    }
  }
  return best?.path ?? null;
}

function initialOpenGroups(activePath: string | null): Record<string, boolean> {
  const open: Record<string, boolean> = {};
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (isGroup(item) && item.children.some((child) => child.path === activePath)) {
        open[item.title] = true;
      }
    }
  }
  return open;
}

const ROW =
  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300';
const ROW_IDLE = 'text-brand-100 hover:bg-brand-800 hover:text-white';
const ROW_ACTIVE = 'bg-brand-700 text-white';
const SUBROW_IDLE = 'text-brand-200 hover:bg-brand-800 hover:text-white';
const RAIL_ITEM =
  'flex h-9 w-9 items-center justify-center rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300';
const SECTION_LABEL = 'px-3 pt-5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-brand-400';

/**
 * Collapsed-rail label. Rendered through a portal because the <nav> must
 * scroll (overflow-y: auto), and a scroll container also clips anything
 * positioned outside it horizontally — the old inline span tooltips were
 * never visible for exactly this reason. Same look as ui/Tooltip.
 */
function RailTooltip({ label, children }: { label: string; children: ReactNode }) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const show = () => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect) setPosition({ top: rect.top + rect.height / 2, left: rect.right + 8 });
  };
  const hide = () => setPosition(null);

  // Hide while anything scrolls so the bubble never floats away from its item.
  useEffect(() => {
    if (!position) return;
    const onScroll = () => setPosition(null);
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [position]);

  return (
    <div ref={anchorRef} className="flex justify-center" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {position
        ? createPortal(
            <span
              role="tooltip"
              style={{ top: position.top, left: position.left, transform: 'translateY(-50%)' }}
              className="pointer-events-none fixed z-[60] whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-popover"
            >
              {label}
            </span>,
            document.body,
          )
        : null}
    </div>
  );
}

const AdminSidebar = ({ id, collapsed, mobileOpen, isDesktop, onClose, onExpand }: AdminSidebarProps) => {
  const { pathname } = useLocation();
  const admin = useCurrentAdmin();
  const logout = useLogout();
  const groupIdPrefix = useId();

  const activePath = resolveActivePath(pathname);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => initialOpenGroups(activePath));

  // Auto-expand a group when one of its children becomes the active route.
  useEffect(() => {
    const shouldOpen = initialOpenGroups(activePath);
    const titles = Object.keys(shouldOpen);
    if (titles.length === 0) return;
    setOpenGroups((prev) => {
      if (titles.every((title) => prev[title])) return prev;
      return { ...prev, ...shouldOpen };
    });
  }, [activePath]);

  const toggleGroup = (title: string) => setOpenGroups((prev) => ({ ...prev, [title]: !prev[title] }));

  // A collapsed group has no room for its children: expand the sidebar and
  // open the group so Add product / Categories / Store inventory / … stay
  // reachable (they were unreachable from the old collapsed rail).
  const openGroupFromRail = (title: string) => {
    setOpenGroups((prev) => ({ ...prev, [title]: true }));
    onExpand();
  };

  const displayName = admin?.full_name?.trim() || 'Admin user';
  const roleLabel = admin?.role ? roleMeta(admin.role).label : 'Administrator';
  const email = admin?.email ?? '';

  const renderChild = (child: NavChild) => {
    const active = child.path === activePath;
    return (
      <Link
        key={child.path}
        to={child.path}
        aria-current={active ? 'page' : undefined}
        className={cn(ROW, 'pl-9', active ? ROW_ACTIVE : SUBROW_IDLE)}
      >
        <span className="truncate">{child.title}</span>
      </Link>
    );
  };

  const renderLeaf = (leaf: NavLeaf) => {
    const active = leaf.path === activePath;
    const Icon = leaf.icon;

    if (collapsed) {
      return (
        <RailTooltip key={leaf.path} label={leaf.title}>
          <Link
            to={leaf.path}
            aria-label={leaf.title}
            aria-current={active ? 'page' : undefined}
            className={cn(RAIL_ITEM, active ? ROW_ACTIVE : ROW_IDLE)}
          >
            <Icon size={18} />
          </Link>
        </RailTooltip>
      );
    }

    return (
      <Link key={leaf.path} to={leaf.path} aria-current={active ? 'page' : undefined} className={cn(ROW, active ? ROW_ACTIVE : ROW_IDLE)}>
        <Icon size={18} className="shrink-0" />
        <span className="truncate">{leaf.title}</span>
      </Link>
    );
  };

  const renderGroup = (group: NavGroup) => {
    const containsActive = group.children.some((child) => child.path === activePath);
    const open = Boolean(openGroups[group.title]);
    const Icon = group.icon;
    const listId = `${groupIdPrefix}-${group.title.toLowerCase().replace(/\s+/g, '-')}`;

    if (collapsed) {
      return (
        <RailTooltip key={group.title} label={group.title}>
          <button
            type="button"
            aria-label={`${group.title} — expand sidebar to see all`}
            onClick={() => openGroupFromRail(group.title)}
            className={cn(RAIL_ITEM, containsActive ? ROW_ACTIVE : ROW_IDLE)}
          >
            <Icon size={18} />
          </button>
        </RailTooltip>
      );
    }

    return (
      <div key={group.title}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => toggleGroup(group.title)}
          className={cn(ROW, 'w-full', containsActive ? 'text-white hover:bg-brand-800' : ROW_IDLE)}
        >
          <Icon size={18} className="shrink-0" />
          <span className="flex-1 truncate text-left">{group.title}</span>
          <ChevronDown size={16} className={cn('shrink-0 text-brand-300 transition-transform', open && 'rotate-180')} />
        </button>
        {open ? (
          <div id={listId} className="mt-0.5 space-y-0.5">
            {group.children.map(renderChild)}
          </div>
        ) : null}
      </div>
    );
  };

  const hiddenOnMobile = !isDesktop && !mobileOpen;

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen ? <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-40 bg-gray-900/50 md:hidden" /> : null}

      <aside
        id={id}
        aria-label="Sidebar"
        aria-hidden={hiddenOnMobile || undefined}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-60 flex-col border-r border-brand-800 bg-brand-900 text-brand-100',
          'transition-[width,transform,visibility] duration-200 ease-in-out',
          collapsed ? 'md:w-16' : 'md:w-60',
          mobileOpen ? 'translate-x-0' : '-translate-x-full max-md:invisible md:translate-x-0',
        )}
      >
        {/* Brand */}
        <div className={cn('flex h-14 shrink-0 items-center border-b border-brand-800', collapsed ? 'justify-center px-2' : 'px-3')}>
          <Link
            to="/"
            className="flex min-w-0 items-center gap-3 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            aria-label="Near & Now Admin — Dashboard"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white p-1">
              <img src={logoUrl} alt="" className="h-full w-full object-contain" />
            </span>
            {!collapsed ? (
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold leading-tight text-white">Near &amp; Now</span>
                <span className="block text-xs leading-tight text-brand-300">Admin</span>
              </span>
            ) : null}
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-brand-200 transition-colors hover:bg-brand-800 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 md:hidden"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation — the only scroll container in the aside */}
        <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-2 py-2 scrollbar-thin scrollbar-dark">
          {NAV_SECTIONS.map((section, index) => (
            <div key={section.label}>
              {collapsed ? (
                index > 0 ? <div role="separator" className="mx-2 my-2 border-t border-brand-800" /> : <div className="h-2" />
              ) : (
                <p className={SECTION_LABEL}>{section.label}</p>
              )}
              <div className={cn(collapsed ? 'space-y-1' : 'space-y-0.5')}>
                {section.items.map((item) => (isGroup(item) ? renderGroup(item) : renderLeaf(item)))}
              </div>
            </div>
          ))}
        </nav>

        {/* Account */}
        <div className="shrink-0 border-t border-brand-800 p-2">
          {collapsed ? (
            <div className="flex flex-col items-center gap-1">
              <RailTooltip label={`My profile — ${displayName}`}>
                <Link
                  to="/profile"
                  aria-label="My profile"
                  title={email || undefined}
                  aria-current={pathname === '/profile' ? 'page' : undefined}
                  className="flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                >
                  <Avatar name={displayName} size="sm" />
                </Link>
              </RailTooltip>
              <RailTooltip label="Sign out">
                <button type="button" onClick={() => void logout()} aria-label="Sign out" className={cn(RAIL_ITEM, ROW_IDLE)}>
                  <LogOut size={18} />
                </button>
              </RailTooltip>
            </div>
          ) : (
            <>
              <Link
                to="/profile"
                title={email || undefined}
                aria-current={pathname === '/profile' ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-md px-2 py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300',
                  pathname === '/profile' ? 'bg-brand-700' : 'hover:bg-brand-800',
                )}
              >
                <Avatar name={displayName} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white">{displayName}</span>
                  <span className="block truncate text-xs text-brand-300">{roleLabel}</span>
                </span>
              </Link>
              <button type="button" onClick={() => void logout()} className={cn(ROW, 'mt-0.5 w-full', ROW_IDLE)}>
                <LogOut size={18} className="shrink-0" />
                <span>Sign out</span>
              </button>
            </>
          )}
        </div>
      </aside>
    </>
  );
};

export default AdminSidebar;
