import { useState, useEffect, Suspense, lazy } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { isAdminAuthenticated } from '../services/secureAdminAuth';
import PageLoadingFallback from '../components/PageLoadingFallback';
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

// Secure admin authentication guard using JWT tokens
const AdminAuthGuard = ({ children }: { children: React.ReactNode }) => {
  const [isAuth, setIsAuth] = useState<boolean | null>(null);

  useEffect(() => {
    isAdminAuthenticated().then(setIsAuth);
  }, []);

  if (isAuth === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Verifying authentication...</p>
        </div>
      </div>
    );
  }

  if (!isAuth) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const AdminRoutes = () => {
  return (
    <Suspense fallback={<PageLoadingFallback />}>
    <Routes>
      <Route
        path="/"
        element={
          <AdminAuthGuard>
            <AdminDashboardPage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/products"
        element={
          <AdminAuthGuard>
            <ProductsPage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/products/add"
        element={
          <AdminAuthGuard>
            <AddProductPage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/products/edit/:id"
        element={
          <AdminAuthGuard>
            <EditProductPage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/products/submissions"
        element={
          <AdminAuthGuard>
            <ProductSubmissionsPage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/products/reviews"
        element={
          <AdminAuthGuard>
            <ReviewsPage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/orders"
        element={
          <AdminAuthGuard>
            <OrdersPage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/orders/:id"
        element={
          <AdminAuthGuard>
            <OrderDetailPage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/customers"
        element={
          <AdminAuthGuard>
            <CustomersPage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/customers/:id"
        element={
          <AdminAuthGuard>
            <CustomerDetailPage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/categories"
        element={
          <AdminAuthGuard>
            <CategoriesPage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/categories/add"
        element={
          <AdminAuthGuard>
            <AddCategoryPage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/categories/edit/:id"
        element={
          <AdminAuthGuard>
            <EditCategoryPage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/reports"
        element={
          <AdminAuthGuard>
            <ReportsPage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/admins"
        element={
          <AdminAuthGuard>
            <AdminManagementPage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/admins/create"
        element={
          <AdminAuthGuard>
            <CreateAdminPage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/admins/edit/:id"
        element={
          <AdminAuthGuard>
            <EditAdminPage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/delivery"
        element={
          <AdminAuthGuard>
            <DeliveryPage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/offers"
        element={
          <AdminAuthGuard>
            <OffersPage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/settings"
        element={
          <AdminAuthGuard>
            <SettingsPage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/profile"
        element={
          <AdminAuthGuard>
            <ProfilePage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/help"
        element={
          <AdminAuthGuard>
            <HelpPage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/notifications"
        element={
          <AdminAuthGuard>
            <NotificationsPage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/stores"
        element={
          <AdminAuthGuard>
            <StoresPage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/stores/products"
        element={
          <AdminAuthGuard>
            <StoreProductsPage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/stores/:storeId/products"
        element={
          <AdminAuthGuard>
            <StoreProductsPage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/stores/profile-change-requests"
        element={
          <AdminAuthGuard>
            <StoreProfileChangeRequestsPage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/delivery/profile-change-requests"
        element={
          <AdminAuthGuard>
            <RiderProfileChangeRequestsPage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/activity-log"
        element={
          <AdminAuthGuard>
            <ActivityLogPage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/support-messages/:id?"
        element={
          <AdminAuthGuard>
            <SupportMessagesPage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/rider-payouts"
        element={
          <AdminAuthGuard>
            <RiderPayoutsPage />
          </AdminAuthGuard>
        }
      />
      <Route
        path="/security-log"
        element={
          <AdminAuthGuard>
            <SecurityLogPage />
          </AdminAuthGuard>
        }
      />
      {/* Unmatched path (typo, stale bookmark, removed route) — previously
          rendered nothing at all, not even the AdminLayout shell. Redirect
          to the dashboard; AdminAuthGuard there still handles an
          unauthenticated admin by bouncing to /login. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
};

export default AdminRoutes;
