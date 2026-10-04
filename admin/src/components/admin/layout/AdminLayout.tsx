import { ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import AdminHeader from './AdminHeader';
import { usePageTitle } from '../../../routes/routeMeta';
import { cn } from '../../../utils/cn';

interface AdminLayoutProps {
  children: ReactNode;
}

/** localStorage key for the desktop "collapsed rail" preference. */
const COLLAPSED_KEY = 'admin.sidebar.collapsed';
const DESKTOP_QUERY = '(min-width: 768px)';
const SIDEBAR_ID = 'admin-sidebar';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

function isDesktopViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(DESKTOP_QUERY).matches;
}

/**
 * The admin shell. Mounted once by the layout route in AdminRoutes.tsx and
 * kept alive across navigations, so sidebar state survives page changes.
 *
 * Two independent sidebar states:
 * - desktop (≥ md): expanded (w-60) or collapsed rail (w-16); the choice is
 *   persisted in localStorage.
 * - mobile (< md): an off-canvas drawer, closed by default, closed again on
 *   navigation, Escape or overlay tap; body scroll is locked while open.
 *
 * The breakpoint is tracked through matchMedia `change` events (fires only
 * when the breakpoint is actually crossed) rather than `resize`, which on
 * iOS fires on every address-bar show/hide and used to snap the drawer shut
 * mid-use.
 */
const AdminLayout = ({ children }: AdminLayoutProps) => {
  usePageTitle();
  const { pathname } = useLocation();

  const mainRef = useRef<HTMLElement>(null);

  const [isDesktop, setIsDesktop] = useState<boolean>(isDesktopViewport);
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Breakpoint tracking
  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      setIsDesktop(event.matches);
      if (event.matches) setDrawerOpen(false);
    };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  // Close the mobile drawer whenever the route changes
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // <main> is the scroll container and it now survives navigation, so without
  // this a detail page opened from the bottom of a long list would render
  // already scrolled down (the per-page shell remount used to reset it for
  // free). Keyed on pathname only: URL-synced filters/pagination change the
  // search string and must not jump the page.
  useLayoutEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  // Escape closes the drawer; body scroll is locked while it is open
  useEffect(() => {
    if (!drawerOpen || isDesktop) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen, isDesktop]);

  const persistCollapsed = useCallback((next: boolean) => {
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, String(next));
    } catch {
      // Storage unavailable (private mode / quota) — the choice just does not persist.
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    if (isDesktop) {
      persistCollapsed(!collapsed);
    } else {
      setDrawerOpen((open) => !open);
    }
  }, [isDesktop, collapsed, persistCollapsed]);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const expandSidebar = useCallback(() => persistCollapsed(false), [persistCollapsed]);

  const railCollapsed = isDesktop && collapsed;
  const sidebarExpanded = isDesktop ? !collapsed : drawerOpen;

  return (
    <div className="flex h-screen bg-gray-50">
      <AdminSidebar
        id={SIDEBAR_ID}
        collapsed={railCollapsed}
        mobileOpen={drawerOpen}
        isDesktop={isDesktop}
        onClose={closeDrawer}
        onExpand={expandSidebar}
      />

      <div className={cn('flex min-w-0 flex-1 flex-col', railCollapsed ? 'md:pl-16' : 'md:pl-60')}>
        <AdminHeader onToggleSidebar={toggleSidebar} sidebarExpanded={sidebarExpanded} sidebarId={SIDEBAR_ID} />

        <main ref={mainRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] px-6 py-6">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
