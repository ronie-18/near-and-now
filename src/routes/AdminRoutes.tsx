import { Route, Routes, Navigate } from 'react-router-dom';
import AdminDashboardPage from '../pages/admin/AdminDashboardPage';
import ProductsPage from '../pages/admin/ProductsPage';
import AddProductPage from '../pages/admin/AddProductPage';
import OrdersPage from '../pages/admin/OrdersPage';
import CustomersPage from '../pages/admin/CustomersPage';
import CategoriesPage from '../pages/admin/CategoriesPage';
import AddCategoryPage from '../pages/admin/AddCategoryPage';
import ReportsPage from '../pages/admin/ReportsPage';

// Admin authentication guard
const AdminAuthGuard = ({ children }: { children: React.ReactNode }) => {
  // This is a placeholder for actual authentication logic
  // In a real application, you would check if the user is authenticated and has admin privileges
  const isAdmin = true; // Replace with actual admin authentication check

  if (!isAdmin) {
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
      {/* Add more admin routes as needed */}
    </Routes>
  );
};

export default AdminRoutes;
