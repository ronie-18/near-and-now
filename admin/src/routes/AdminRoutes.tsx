import { useState, useEffect, Suspense, lazy } from 'react';
import { Route, Routes, Navigate, Outlet, useLocation } from 'react-router-dom';
import { isAdminAuthenticated } from '../services/secureAdminAuth';
import PageLoadingFallback from '../components/PageLoadingFallback';
import AdminLayout from '../components/admin/layout/AdminLayout';
import { PageLoader } from '../components/ui';
// AdminDashboardPage stays a static import — mounted at "/", the most
// common landing page after login, so it renders with no Suspense flash.
// Every other page is lazy: previously all 30 admin pages were bundled into
// one ~470KB (87KB gzip) JS chunk downloaded on every login regardless of
// which page was actually visited. Found 2026-08-13 during an optimization
// pass (same fix already applied to the website's App.tsx).
import AdminDashboardPage from '../pages/admin/AdminDashboardPage';
const ProductsPage = lazy(() => import('../pages/admin/ProductsPage'));
const AddProductPage = lazy(() => import('../pages/admin/AddProductPage'));
const EditProductPage = lazy(() => import('../pages/admin/EditProductPage'));
const OrdersPage = lazy(() => import('../pages/admin/OrdersPage'));
const OrderDetailPage = lazy(() => import('../pages/admin/OrderDetailPage'));
const CustomersPage = lazy(() => import('../pages/admin/CustomersPage'));
const CustomerDetailPage = lazy(() => import('../pages/admin/CustomerDetailPage'));
const CategoriesPage = lazy(() => import('../pages/admin/CategoriesPage'));
const AddCategoryPage = lazy(() => import('../pages/admin/AddCategoryPage'));
const EditCategoryPage = lazy(() => import('../pages/admin/EditCategoryPage'));
const ReportsPage = lazy(() => import('../pages/admin/ReportsPage'));
const AdminManagementPage = lazy(() => import('../pages/admin/AdminManagementPage'));
const CreateAdminPage = lazy(() => import('../pages/admin/CreateAdminPage'));
const EditAdminPage = lazy(() => import('../pages/admin/EditAdminPage'));
const DeliveryPage = lazy(() => import('../pages/admin/DeliveryPage'));
const OffersPage = lazy(() => import('../pages/admin/OffersPage'));
const SettingsPage = lazy(() => import('../pages/admin/SettingsPage'));
const ProfilePage = lazy(() => import('../pages/admin/ProfilePage'));
const HelpPage = lazy(() => import('../pages/admin/HelpPage'));
const NotificationsPage = lazy(() => import('../pages/admin/NotificationsPage'));
const StoresPage = lazy(() => import('../pages/admin/StoresPage'));
const StoreProductsPage = lazy(() => import('../pages/admin/StoreProductsPage'));
const StoreProfileChangeRequestsPage = lazy(() => import('../pages/admin/StoreProfileChangeRequestsPage'));
const RiderProfileChangeRequestsPage = lazy(() => import('../pages/admin/RiderProfileChangeRequestsPage'));
const ProductSubmissionsPage = lazy(() => import('../pages/admin/ProductSubmissionsPage'));
const ReviewsPage = lazy(() => import('../pages/admin/ReviewsPage'));
const ActivityLogPage = lazy(() => import('../pages/admin/ActivityLogPage'));
const SupportMessagesPage = lazy(() => import('../pages/admin/SupportMessagesPage'));
const RiderPayoutsPage = lazy(() => import('../pages/admin/RiderPayoutsPage'));
const SecurityLogPage = lazy(() => import('../pages/admin/SecurityLogPage'));

/**
 * Secure admin authentication guard.
 *
 * Mounted ONCE on the persistent layout route below, so the session check
 * runs once per shell mount instead of on every navigation (that per-route
 * remount was the "Verifying authentication…" flash). isAdminAuthenticated()
 * keeps its fail-open semantics on transient errors; the check is re-run
 * cheaply when the tab becomes visible again so a session that expired or
 * was logged out elsewhere still bounces to /login without a reload — and
 * without flashing the loader (isAuth is never reset to null).
 */
const AdminAuthGuard = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const [isAuth, setIsAuth] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = () => {
      isAdminAuthenticated().then((ok) => {
        if (!cancelled) setIsAuth(ok);
      });
    };

    check();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  if (isAuth === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <PageLoader label="Checking your session…" />
      </div>
    );
  }

  if (!isAuth) {
    // Remember where the admin was heading so AdminLoginPage can return
    // them there (it reads `state.from`) instead of always landing on "/".
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
};

/**
 * One persistent layout route: the guard, the shell (sidebar + header) and
 * the Suspense boundary all live here and stay mounted while page chunks
 * load and routes change. Pages render into <Outlet/> and no longer wrap
 * themselves in <AdminLayout>.
 */
const AdminShell = () => (
  <AdminAuthGuard>
    <AdminLayout>
      <Suspense fallback={<PageLoadingFallback />}>
        <Outlet />
      </Suspense>
    </AdminLayout>
  </AdminAuthGuard>
);

const AdminRoutes = () => {
  return (
    <Routes>
      <Route element={<AdminShell />}>
        <Route path="/" element={<AdminDashboardPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/add" element={<AddProductPage />} />
        <Route path="/products/edit/:id" element={<EditProductPage />} />
        <Route path="/products/submissions" element={<ProductSubmissionsPage />} />
        <Route path="/products/reviews" element={<ReviewsPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/:id" element={<CustomerDetailPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/categories/add" element={<AddCategoryPage />} />
        <Route path="/categories/edit/:id" element={<EditCategoryPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/admins" element={<AdminManagementPage />} />
        <Route path="/admins/create" element={<CreateAdminPage />} />
        <Route path="/admins/edit/:id" element={<EditAdminPage />} />
        <Route path="/delivery" element={<DeliveryPage />} />
        <Route path="/offers" element={<OffersPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/stores" element={<StoresPage />} />
        <Route path="/stores/products" element={<StoreProductsPage />} />
        <Route path="/stores/:storeId/products" element={<StoreProductsPage />} />
        <Route path="/stores/profile-change-requests" element={<StoreProfileChangeRequestsPage />} />
        <Route path="/delivery/profile-change-requests" element={<RiderProfileChangeRequestsPage />} />
        <Route path="/activity-log" element={<ActivityLogPage />} />
        <Route path="/support-messages/:id?" element={<SupportMessagesPage />} />
        <Route path="/rider-payouts" element={<RiderPayoutsPage />} />
        <Route path="/security-log" element={<SecurityLogPage />} />
        {/* Unmatched path (typo, stale bookmark, removed route) — previously
            rendered nothing at all, not even the AdminLayout shell. Redirect
            to the dashboard; AdminAuthGuard on this layout route still
            handles an unauthenticated admin by bouncing to /login. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
};

export default AdminRoutes;
