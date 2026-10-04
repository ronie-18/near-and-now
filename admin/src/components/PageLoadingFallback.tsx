// Suspense fallback for lazy-loaded admin pages (see routes/AdminRoutes.tsx).
// Deliberately tiny — this itself must never be part of a lazy chunk, so it
// imports Spinner.tsx directly rather than the components/ui barrel.
import { PageLoader } from './ui/Spinner';

export default function PageLoadingFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <PageLoader />
    </div>
  );
}
