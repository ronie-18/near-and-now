import { useState, useEffect, useCallback } from 'react';
import { getAdminToken } from '../../services/adminSession';
import AdminLayout from '../../components/admin/layout/AdminLayout';
import { Star, CheckCircle, Trash2, Loader2, AlertCircle, RefreshCw, BadgeCheck } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '';

// Ratings are on a 0.5-increment scale (1, 1.5, 2, ..., 5) — lucide-react has
// no built-in half-star icon, so a half-filled star is a full amber Star
// clipped to 50% width, layered over a full gray Star underneath.
function StarRow({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = rating >= n;
        const half = !filled && rating >= n - 0.5;
        return (
          <div key={n} className="relative w-[15px] h-[15px]">
            <Star size={15} className="absolute inset-0 text-gray-300" />
            {(filled || half) && (
              <div className="absolute inset-0 overflow-hidden" style={{ width: filled ? '100%' : '50%' }}>
                <Star size={15} className="text-amber-400 fill-amber-400" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function adminAuthHeaders(): Record<string, string> {
  const token = getAdminToken() || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface Review {
  id: string;
  productId: string;
  productName: string | null;
  customerName: string;
  rating: number;
  title: string | null;
  reviewText: string | null;
  isApproved: boolean;
  isVerified: boolean;
  createdAt: string;
}

type Tab = 'pending' | 'approved' | 'all';
const TABS: { key: Tab; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'all', label: 'All' },
];

const ReviewsPage = () => {
  const [tab, setTab] = useState<Tab>('pending');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async (status: Tab) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/reviews?status=${status}`, {
        headers: adminAuthHeaders(),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to load reviews');
      setReviews(json.reviews);
    } catch (err: any) {
      setError(err.message || 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(tab); }, [load, tab]);

  const approve = async (id: string) => {
    setActingId(id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/reviews/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
        body: JSON.stringify({ approve: true }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to approve review');
      if (tab === 'pending') {
        setReviews((prev) => prev.filter((r) => r.id !== id));
      } else {
        setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, isApproved: true } : r)));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to approve review');
    } finally {
      setActingId(null);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this review permanently? This cannot be undone.')) return;
    setActingId(id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/admin/reviews/${id}`, {
        method: 'DELETE',
        headers: adminAuthHeaders(),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to delete review');
      setReviews((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete review');
    } finally {
      setActingId(null);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Product Reviews</h1>
            <p className="text-gray-500 mt-1">Customer reviews submitted from delivered orders — approve to make them public and count toward a product's rating</p>
          </div>
          <button
            onClick={() => load(tab)}
            className="inline-flex items-center px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors shadow-sm font-medium"
          >
            <RefreshCw size={18} className="mr-2" />
            Refresh
          </button>
        </div>

        <div className="flex gap-1 border-b border-gray-200">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-xl flex items-center">
            <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center">
            <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
            <p className="text-gray-500">Loading reviews...</p>
          </div>
        ) : reviews.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Star className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-1">
              {tab === 'pending' ? 'No pending reviews' : `No ${tab === 'all' ? '' : tab} reviews`}
            </h3>
            <p className="text-gray-500">
              {tab === 'pending'
                ? 'Reviews submitted by customers after delivery will appear here for approval.'
                : 'Reviews will show up here once submitted.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {reviews.map((r) => (
              <div key={r.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-gray-900">{r.productName || 'Unknown product'}</h3>
                      {r.isVerified && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                          <BadgeCheck size={13} /> Verified purchase
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <StarRow rating={r.rating} />
                      <span className="text-xs text-gray-400 ml-2">{r.rating.toFixed(1).replace('.0', '')} · by {r.customerName}</span>
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold flex-shrink-0 ${
                      r.isApproved ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {r.isApproved ? 'Approved' : 'Pending'}
                  </span>
                </div>

                {r.title && <p className="text-sm font-semibold text-gray-800 mt-2">{r.title}</p>}
                {r.reviewText && <p className="text-sm text-gray-600 mt-1 max-w-2xl">{r.reviewText}</p>}
                <p className="text-xs text-gray-400 mt-2">Submitted {new Date(r.createdAt).toLocaleString('en-IN')}</p>

                <div className="flex gap-2 mt-4">
                  {!r.isApproved && (
                    <button
                      disabled={actingId === r.id}
                      onClick={() => approve(r.id)}
                      className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-xl font-semibold disabled:opacity-50 hover:bg-emerald-700"
                    >
                      <CheckCircle size={16} className="mr-1.5" />
                      Approve
                    </button>
                  )}
                  <button
                    disabled={actingId === r.id}
                    onClick={() => remove(r.id)}
                    className="inline-flex items-center px-4 py-2 bg-white border-2 border-red-200 text-red-600 rounded-xl font-semibold disabled:opacity-50 hover:bg-red-50"
                  >
                    <Trash2 size={16} className="mr-1.5" />
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default ReviewsPage;
