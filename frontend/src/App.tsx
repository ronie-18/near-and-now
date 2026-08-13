import * as React from 'react';
import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { NotificationProvider, useNotification } from './context/NotificationContext';
import { GoogleMapsProvider } from './context/GoogleMapsContext';
import { LocationProvider } from './context/LocationContext';
import Layout from './components/layout/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import ScrollToTop from './components/ScrollToTop';
import PageLoadingFallback from './components/PageLoadingFallback';

// HomePage stays a static import — it's "/" , the most common landing page,
// so it should render with no Suspense flash on first paint. Every other
// route is lazy: previously all ~27 pages were bundled into one ~611KB
// (135KB gzip) JS chunk downloaded on every visit regardless of which page
// was actually requested. Found 2026-08-13 during an optimization pass.
import HomePage from './pages/HomePage';
const ShopPage = lazy(() => import('./pages/ShopPage'));
const CategoryPage = lazy(() => import('./pages/CategoryPage'));
const ProductDetailPage = lazy(() => import('./pages/ProductDetailPage'));
const CartPage = lazy(() => import('./pages/CartPage'));
const CheckoutPage = lazy(() => import('./pages/CheckoutPage'));
const ThankYouPage = lazy(() => import('./pages/ThankYouPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SignupPage = lazy(() => import('./pages/SignupPage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const WalletPage = lazy(() => import('./pages/WalletPage'));
const OrdersPage = lazy(() => import('./pages/OrdersPage'));
const OrderTrackingPage = lazy(() => import('./pages/OrderTrackingPage'));
const AddressesPage = lazy(() => import('./pages/AddressesPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const HelpPage = lazy(() => import('./pages/HelpPage'));
const DeliveryPartnerPage = lazy(() => import('./pages/DeliveryPartnerPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

// Policy pages
const TermsOfServicePage = lazy(() => import('./pages/policies/TermsOfServicePage'));
const ShippingPolicyPage = lazy(() => import('./pages/policies/ShippingPolicyPage'));
const PrivacyPolicyPage = lazy(() => import('./pages/policies/PrivacyPolicyPage'));
const RefundPolicyPage = lazy(() => import('./pages/policies/RefundPolicyPage'));
const PaymentOptionsPage = lazy(() => import('./pages/policies/PaymentOptionsPage'));

// Standalone app pages (no main Layout)
const DriverApp = lazy(() => import('./pages/DriverApp'));
const ShopkeeperApp = lazy(() => import('./pages/ShopkeeperApp'));


// AppContent component to access context values
const AppContent: React.FC = () => {
  const { notifications, removeNotification } = useNotification();

  React.useEffect(() => {
    console.log('📦 App content loaded successfully');
  }, []);

  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <Routes>
        {/* Standalone Apps - No Layout wrapper */}
        <Route path="/driver" element={<DriverApp />} />
        <Route path="/shopkeeper" element={<ShopkeeperApp />} />

        {/* Frontend Routes - With Layout */}
        <Route path="/*" element={
          <Layout notifications={notifications} removeNotification={removeNotification}>
            <Suspense fallback={<PageLoadingFallback />}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/shop" element={<ShopPage />} />
                <Route path="/category/:categoryId" element={<CategoryPage />} />
                <Route path="/product/:productId" element={<ProductDetailPage />} />
                <Route path="/cart" element={<CartPage />} />
                <Route path="/checkout" element={<CheckoutPage />} />
                <Route path="/thank-you" element={<ThankYouPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/wallet" element={<WalletPage />} />
                <Route path="/orders" element={<OrdersPage />} />
                <Route path="/track" element={<OrderTrackingPage />} />
                <Route path="/track/:orderId" element={<OrderTrackingPage />} />
                <Route path="/addresses" element={<AddressesPage />} />
                <Route path="/about" element={<AboutPage />} />
                <Route path="/contact" element={<AboutPage />} />
                <Route path="/help" element={<HelpPage />} />
                <Route path="/faq" element={<HelpPage />} />
                <Route path="/driver-legacy" element={<DeliveryPartnerPage />} />
                {/* Policy Pages */}
                <Route path="/terms" element={<TermsOfServicePage />} />
                <Route path="/shipping" element={<ShippingPolicyPage />} />
                <Route path="/delivery-info" element={<ShippingPolicyPage />} />
                <Route path="/privacy" element={<PrivacyPolicyPage />} />
                <Route path="/refund" element={<RefundPolicyPage />} />
                <Route path="/returns" element={<RefundPolicyPage />} />
                <Route path="/payment-options" element={<PaymentOptionsPage />} />
                {/* Must stay last — matches any path none of the routes above did */}
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </Layout>
        } />
      </Routes>
    </Suspense>
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
        <ScrollToTop />
        <AuthProvider>
          <LocationProvider>
            <CartProvider>
              <NotificationProvider>
                <GoogleMapsProvider>
                  <AppContent />
                </GoogleMapsProvider>
              </NotificationProvider>
            </CartProvider>
          </LocationProvider>
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
