import { Link } from 'react-router-dom';
import { MapPinOff } from 'lucide-react';

/**
 * Catch-all for any unmatched path — the nested Routes here never had one at
 * all, so a stale bookmark, an old link, or a typo'd route rendered a blank
 * page inside Layout with no way back. The admin panel got this exact fix
 * 2026-07-30; this was the one remaining gap.
 */
const NotFoundPage = () => (
  <div className="container mx-auto px-4 py-20">
    <div className="max-w-md mx-auto text-center">
      <MapPinOff className="w-16 h-16 text-primary mx-auto mb-4" />
      <h1 className="text-3xl font-bold text-gray-800 mb-2">Page Not Found</h1>
      <p className="text-gray-600 mb-8">
        The page you&apos;re looking for doesn&apos;t exist or may have moved.
      </p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 bg-primary hover:bg-secondary text-white px-6 py-3 rounded-xl font-medium transition-all duration-300"
      >
        Back to Home
      </Link>
    </div>
  </div>
);

export default NotFoundPage;
