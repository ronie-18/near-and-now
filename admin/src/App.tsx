import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminRoutes from './routes/AdminRoutes';
import { ErrorBoundary } from './components/ErrorBoundary';
function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          <Route path="/login" element={<AdminLoginPage />} />
          <Route path="/*" element={<AdminRoutes />} />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}
export default App;
