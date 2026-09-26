import * as React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { NotificationProvider, useNotification } from './context/NotificationContext';
import { GoogleMapsProvider } from './context/GoogleMapsContext';
import { LocationProvider } from './context/LocationContext';
import Layout from './components/layout/Layout';
import ErrorBoundary from './components/ErrorBoundary';

// The home page is the landing route, so it stays in the main bundle.
import HomePage from './pages/HomePage';

/*
 * Every other page is loaded on demand. Before this change the customer app,
 * the admin panel, the driver app and the shopkeeper app were all compiled
 * into one ~800 KB script that had to download and parse before anything
 * rendered. Now the first paint only needs the shell + home page.
 */
const lazyPage = <T extends React.ComponentType<any>>(loader: () => Promise<{ default: T }>) =>
  React.lazy(loader);

const ShopPage = lazyPage(() => import('./pages/ShopPage'));
const CategoryPage = lazyPage(() => import('./pages/CategoryPage'));
const ProductDetailPage = lazyPage(() => import('./pages/ProductDetailPage'));
const CheckoutPage = lazyPage(() => import('./pages/CheckoutPage'));
const ThankYouPage = lazyPage(() => import('./pages/ThankYouPage'));
const LoginPage = lazyPage(() => import('./pages/LoginPage'));
const SearchPage = lazyPage(() => import('./pages/SearchPage'));
const ProfilePage = lazyPage(() => import('./pages/ProfilePage'));
const OrdersPage = lazyPage(() => import('./pages/OrdersPage'));
const OrderTrackingPage = lazyPage(() => import('./pages/OrderTrackingPage'));
const AddressesPage = lazyPage(() => import('./pages/AddressesPage'));
const AboutPage = lazyPage(() => import('./pages/AboutPage'));
const HelpPage = lazyPage(() => import('./pages/HelpPage'));
const DeliveryPartnerPage = lazyPage(() => import('./pages/DeliveryPartnerPage'));

// Policy pages
const TermsOfServicePage = lazyPage(() => import('./pages/policies/TermsOfServicePage'));
const ShippingPolicyPage = lazyPage(() => import('./pages/policies/ShippingPolicyPage'));
const PrivacyPolicyPage = lazyPage(() => import('./pages/policies/PrivacyPolicyPage'));
const RefundPolicyPage = lazyPage(() => import('./pages/policies/RefundPolicyPage'));

// Standalone app pages (no main Layout)
const DriverApp = lazyPage(() => import('./pages/DriverApp'));
const ShopkeeperApp = lazyPage(() => import('./pages/ShopkeeperApp'));
const AdminRoutes = lazyPage(() => import('./routes/AdminRoutes'));
const AdminLoginPage = lazyPage(() => import('./pages/admin/AdminLoginPage'));

/** Lightweight fallback shown while a route chunk downloads. */
export const RouteFallback: React.FC = () => (
  <div className="flex items-center justify-center min-h-[40vh]" role="status" aria-live="polite">
    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    <span className="sr-only">Loading…</span>
  </div>
);

// AppContent component to access context values
const AppContent: React.FC = () => {
  const { notifications, removeNotification } = useNotification();

  return (
    <React.Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* Standalone Apps - No Layout wrapper */}
        <Route path="/driver" element={<DriverApp />} />
        <Route path="/shopkeeper" element={<ShopkeeperApp />} />
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin/*" element={<AdminRoutes />} />

        {/* Frontend Routes - With Layout */}
        <Route path="/*" element={
          <Layout notifications={notifications} removeNotification={removeNotification}>
            <React.Suspense fallback={<RouteFallback />}>
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
                <Route path="/about" element={<AboutPage />} />
                <Route path="/help" element={<HelpPage />} />
                <Route path="/driver-legacy" element={<DeliveryPartnerPage />} />
                {/* Policy Pages */}
                <Route path="/terms" element={<TermsOfServicePage />} />
                <Route path="/shipping" element={<ShippingPolicyPage />} />
                <Route path="/privacy" element={<PrivacyPolicyPage />} />
                <Route path="/refund" element={<RefundPolicyPage />} />
              </Routes>
            </React.Suspense>
          </Layout>
        } />
      </Routes>
    </React.Suspense>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <Router basename="/">
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
