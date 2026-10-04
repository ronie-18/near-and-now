import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminRoutes from './routes/AdminRoutes';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './context/ToastContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { Toasts } from './components/Toasts';

// Provider order matters:
// - ErrorBoundary sits ABOVE the Router (it resets with window.location, no
//   router hooks), so a routing crash still shows the recovery card.
// - ConfirmProvider sits INSIDE the Router because confirm messages may
//   contain <Link>s.
// - <Toasts/> stays inside ToastProvider (and outside the Router — it has no
//   routing needs and must survive route changes).
function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <Router>
          <ConfirmProvider>
            <Routes>
              <Route path="/login" element={<AdminLoginPage />} />
              <Route path="/*" element={<AdminRoutes />} />
            </Routes>
          </ConfirmProvider>
        </Router>
        <Toasts />
      </ToastProvider>
    </ErrorBoundary>
  );
}
export default App;
