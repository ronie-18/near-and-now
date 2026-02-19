import { useState, useEffect } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import AdminDashboardPage from '../pages/admin/AdminDashboardPage';
import ProductsPage from '../pages/admin/ProductsPage';
import AddProductPage from '../pages/admin/AddProductPage';
import EditProductPage from '../pages/admin/EditProductPage';
import OrdersPage from '../pages/admin/OrdersPage';
import OrderDetailPage from '../pages/admin/OrderDetailPage';
import CustomersPage from '../pages/admin/CustomersPage';
import CustomerDetailPage from '../pages/admin/CustomerDetailPage';
import CategoriesPage from '../pages/admin/CategoriesPage';
import AddCategoryPage from '../pages/admin/AddCategoryPage';
import EditCategoryPage from '../pages/admin/EditCategoryPage';
import ReportsPage from '../pages/admin/ReportsPage';
import AdminManagementPage from '../pages/admin/AdminManagementPage';
import CreateAdminPage from '../pages/admin/CreateAdminPage';
import EditAdminPage from '../pages/admin/EditAdminPage';
import DeliveryPage from '../pages/admin/DeliveryPage';
import OffersPage from '../pages/admin/OffersPage';
import SettingsPage from '../pages/admin/SettingsPage';
import ProfilePage from '../pages/admin/ProfilePage';
import HelpPage from '../pages/admin/HelpPage';
import NotificationsPage from '../pages/admin/NotificationsPage';
import { isAdminAuthenticated } from '../services/secureAdminAuth';

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
    return <Navigate to="/admin/login" replace />;
  }

  return <>{children}</>;
};

const AdminRoutes = () => {
  return (
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
    </Routes>
  );
};

export default AdminRoutes;
