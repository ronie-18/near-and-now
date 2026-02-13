import * as React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { NotificationProvider, useNotification } from './context/NotificationContext';
import { GoogleMapsProvider } from './context/GoogleMapsContext';
import Layout from './components/layout/Layout';
import AdminLoginPage from './pages/admin/AdminLoginPage';
import ErrorBoundary from './components/ErrorBoundary';

// Import actual page components
import HomePage from './pages/HomePage';
import ShopPage from './pages/ShopPage';
import CategoryPage from './pages/CategoryPage';
import ProductDetailPage from './pages/ProductDetailPage';
import CheckoutPage from './pages/CheckoutPage';
import ThankYouPage from './pages/ThankYouPage';
import LoginPage from './pages/LoginPage';
import SearchPage from './pages/SearchPage';
import ProfilePage from './pages/ProfilePage';
import OrdersPage from './pages/OrdersPage';
import OrderTrackingPage from './pages/OrderTrackingPage';
import AddressesPage from './pages/AddressesPage';
import CartPage from './pages/CartPage';
import AboutPage from './pages/AboutPage';
import HelpPage from './pages/HelpPage';
import TestPage from './pages/TestPage';

// Policy pages
import TermsOfServicePage from './pages/policies/TermsOfServicePage';
import ShippingPolicyPage from './pages/policies/ShippingPolicyPage';
import PrivacyPolicyPage from './pages/policies/PrivacyPolicyPage';
import RefundPolicyPage from './pages/policies/RefundPolicyPage';

// Admin routes
import AdminRoutes from './routes/AdminRoutes';

// AppContent component to access context values
const AppContent: React.FC = () => {
  const { notifications, removeNotification } = useNotification();

  React.useEffect(() => {
    console.log('📦 App content loaded successfully');
  }, []);

  return (
    <Routes>
      {/* Admin Routes - Outside of main Layout */}
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin/*" element={<AdminRoutes />} />

      {/* Test Route - No Layout */}
      <Route path="/test" element={<TestPage />} />

      {/* Frontend Routes - With Layout */}
      <Route path="/*" element={
        <Layout notifications={notifications} removeNotification={removeNotification}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/shop" element={<ShopPage />} />
            <Route path="/category/:categoryId" element={<CategoryPage />} />
            <Route path="/product/:productId" element={<ProductDetailPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/thank-you" element={<ThankYouPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/track" element={<OrderTrackingPage />} />
            <Route path="/track/:orderId" element={<OrderTrackingPage />} />
            <Route path="/addresses" element={<AddressesPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/help" element={<HelpPage />} />
            {/* Policy Pages */}
            <Route path="/terms" element={<TermsOfServicePage />} />
            <Route path="/shipping" element={<ShippingPolicyPage />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/refund" element={<RefundPolicyPage />} />
          </Routes>
        </Layout>
      } />
    </Routes>
  );
};

function App() {
  console.log('✅ [APP.TSX] App component rendering');

  React.useEffect(() => {
    console.log('✅ [APP.TSX] App mounted successfully');
    console.log('📍 URL:', window.location.href);
    console.log('🌍 Mode:', import.meta.env.MODE);
  }, []);

  return (
    <ErrorBoundary>
      <Router basename="/">
        <AuthProvider>
          <CartProvider>
            <NotificationProvider>
              <GoogleMapsProvider>
                <AppContent />
              </GoogleMapsProvider>
            </NotificationProvider>
          </CartProvider>
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
