import { Route, Routes, Navigate } from 'react-router-dom';
import AdminDashboardPage from '../pages/admin/AdminDashboardPage';
import ProductsPage from '../pages/admin/ProductsPage';
import AddProductPage from '../pages/admin/AddProductPage';
import OrdersPage from '../pages/admin/OrdersPage';
import CustomersPage from '../pages/admin/CustomersPage';
import CategoriesPage from '../pages/admin/CategoriesPage';
import AddCategoryPage from '../pages/admin/AddCategoryPage';
import ReportsPage from '../pages/admin/ReportsPage';
import AdminManagementPage from '../pages/admin/AdminManagementPage';
import CreateAdminPage from '../pages/admin/CreateAdminPage';
import EditAdminPage from '../pages/admin/EditAdminPage';

// Admin authentication guard
const AdminAuthGuard = ({ children }: { children: React.ReactNode }) => {
  const isAdminAuth = (() => {
    try {
      const flag = localStorage.getItem('adminAuth');
      if (flag !== 'true') return false;

      // Optional expiry support (if present)
      const expiresAt = localStorage.getItem('adminAuthExpiresAt');
      if (!expiresAt) return true;

      const exp = Number(expiresAt);
      if (!Number.isFinite(exp)) return true;

      if (Date.now() > exp) {
        localStorage.removeItem('adminAuth');
        localStorage.removeItem('adminAuthExpiresAt');
        return false;
      }

      return true;
    } catch {
      return false;
    }
  })();

  if (!isAdminAuth) {
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
        path="/orders"
        element={
          <AdminAuthGuard>
            <OrdersPage />
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
      {/* Add more admin routes as needed */}
    </Routes>
  );
};

export default AdminRoutes;
