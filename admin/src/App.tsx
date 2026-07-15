import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminRoutes from './routes/AdminRoutes';
import { ErrorBoundary } from './components/ErrorBoundary';
import { NotificationProvider } from './context/NotificationContext';
import { NotificationToasts } from './components/NotificationToasts';
function App() {
  return (
    <ErrorBoundary>
      <NotificationProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<AdminLoginPage />} />
            <Route path="/*" element={<AdminRoutes />} />
          </Routes>
        </Router>
        <NotificationToasts />
      </NotificationProvider>
    </ErrorBoundary>
  );
}
export default App;
