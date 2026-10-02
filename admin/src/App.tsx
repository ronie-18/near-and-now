import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminRoutes from './routes/AdminRoutes';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './context/ToastContext';
import { Toasts } from './components/Toasts';
function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<AdminLoginPage />} />
            <Route path="/*" element={<AdminRoutes />} />
          </Routes>
        </Router>
        <Toasts />
      </ToastProvider>
    </ErrorBoundary>
  );
}
export default App;
