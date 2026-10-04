import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button, Card } from './ui';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// The admin app had no error boundary anywhere — any uncaught render error
// blanked the entire page to white with zero diagnostic info in the UI
// (only visible in the browser console). This catches that and shows the
// actual error instead.
//
// Mounted ABOVE the Router in App.tsx, so no router hooks/Links here; the
// reset is a hard navigation via window.location.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Admin panel crashed:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
          <Card className="w-full max-w-lg p-8 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-red-600">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
            <h1 className="mt-4 text-xl font-semibold text-gray-900">Something went wrong</h1>
            <p className="mt-2 break-words text-sm text-gray-600">{this.state.error.message}</p>
            <div className="mt-6">
              <Button
                variant="primary"
                onClick={() => {
                  this.setState({ error: null });
                  window.location.href = '/';
                }}
              >
                Back to dashboard
              </Button>
            </div>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
