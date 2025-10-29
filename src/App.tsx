import * as React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { NotificationProvider, useNotification } from './context/NotificationContext';
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
import AddressesPage from './pages/AddressesPage';
import CartPage from './pages/CartPage';
import AboutPage from './pages/AboutPage';

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
  const [isReady, setIsReady] = React.useState(false);

  React.useEffect(() => {
    // Small delay to ensure everything is loaded
    console.log('📦 Loading app content...');
    setIsReady(true);
  }, []);

  if (!isReady) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontFamily: 'Arial, sans-serif'
      }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ color: '#16a34a' }}>Loading Near & Now...</h2>
          <p style={{ color: '#666' }}>Digital Dukan, Local Dil Se</p>
        </div>
      </div>
    );
  }
  
  return (
    <Routes>
      {/* Admin Routes - Outside of main Layout */}
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin/*" element={<AdminRoutes />} />
      
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
            <Route path="/addresses" element={<AddressesPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/about" element={<AboutPage />} />
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
  // Log app initialization for debugging
  React.useEffect(() => {
    console.log('🚀 Near & Now App initialized');
    console.log('📍 Current URL:', window.location.href);
    console.log('🌍 Environment:', import.meta.env.MODE);
  }, []);

  return (
    <ErrorBoundary>
      <Router basename="/">
        <AuthProvider>
          <CartProvider>
            <NotificationProvider>
              <AppContent />
            </NotificationProvider>
          </CartProvider>
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
