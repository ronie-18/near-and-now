// Suspense fallback for lazy-loaded routes (see App.tsx). Deliberately tiny
// and dependency-free — this itself must never be part of a lazy chunk.
export default function PageLoadingFallback() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="animate-spin w-10 h-10 border-2 border-primary border-t-transparent rounded-full" />
    </div>
  );
}
