import { useEffect, ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
  loadingComponent?: ReactNode;
  unauthorizedComponent?: ReactNode;
}

function ErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <div role="alert" className="p-4 bg-red-50 rounded-lg">
      <p className="text-red-700 font-semibold">Something went wrong:</p>
      <pre className="text-red-600 mt-2">{error.message}</pre>
      <button
        onClick={resetErrorBoundary}
        className="mt-3 px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
      >
        Try again
      </button>
    </div>
  );
}

export default function ProtectedRoute({
  children,
  loadingComponent,
  unauthorizedComponent,
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate(`/login?callbackUrl=${encodeURIComponent(location.pathname)}`);
    }
  }, [isAuthenticated, isLoading, navigate, location.pathname]);

  const defaultLoading = (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
    </div>
  );

  const defaultUnauthorized = (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-gray-800">Access Denied</h2>
        <p className="mt-2 text-gray-600">You don&apos;t have permission to view this page.</p>
      </div>
    </div>
  );

  if (isLoading) {
    return <>{loadingComponent || defaultLoading}</>;
  }

  if (!isAuthenticated) {
    return <>{unauthorizedComponent || defaultUnauthorized}</>;
  }

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => window.location.reload()}
    >
      {children}
    </ErrorBoundary>
  );
}
