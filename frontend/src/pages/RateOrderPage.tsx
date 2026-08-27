import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Star, Store, PackageX, Loader2, WifiOff, CheckCircle2 } from 'lucide-react';
import { getAuthHeaders, authedFetch } from '../utils/authHeader';

interface ReviewableItem {
  productId: string;
  productName: string;
  imageUrl: string | null;
  storeId: string;
  storeName: string;
  alreadyReviewed: boolean;
  existingReview: { rating: number; title: string | null; reviewText: string | null } | null;
}

function formatRating(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

const apiBase = () => (import.meta.env.VITE_API_URL || window.location.origin).replace(/\/$/, '');

// Tapping the left half of a star sets the .5 value below it, the right
// half sets the whole number — 1, 1.5, 2, ..., 5 from a plain row of 5 stars.
function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = value >= n;
        const half = !filled && value >= n - 0.5;
        return (
          <button
            key={n}
            type="button"
            className="relative w-7 h-7 flex items-center justify-center"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              onChange(x < rect.width / 2 ? n - 0.5 : n);
            }}
            aria-label={`Rate ${n} stars`}
          >
            <Star size={24} className="absolute text-gray-300" />
            {(filled || half) && (
              <div className="absolute inset-0 overflow-hidden" style={{ width: filled ? '100%' : '50%' }}>
                <Star size={24} className="text-amber-400 fill-amber-400" />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function ReviewItemCard({
  item,
  orderId,
  onSubmitted,
}: {
  item: ReviewableItem;
  orderId: string;
  onSubmitted: (productId: string, rating: number) => void;
}) {
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = useCallback(async () => {
    if (rating < 1) {
      setError('Please pick a star rating.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await authedFetch(`${apiBase()}/api/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          orderId,
          productId: item.productId,
          rating,
          reviewText: reviewText.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to submit review');
      onSubmitted(item.productId, rating);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit your review. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [rating, reviewText, orderId, item.productId, onSubmitted]);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.productName}
            className="w-11 h-11 rounded-lg object-cover bg-gray-50 flex-shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
          />
        ) : (
          <div className="w-11 h-11 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
            <PackageX className="w-5 h-5 text-gray-300" />
          </div>
        )}
        <p className="font-semibold text-gray-900 text-sm">{item.productName}</p>
      </div>

      {item.alreadyReviewed && item.existingReview ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <CheckCircle2 className="w-4 h-4 text-primary" />
          You rated this {formatRating(item.existingReview.rating)} / 5
        </div>
      ) : (
        <>
          <StarPicker value={rating} onChange={(n) => { setRating(n); setError(''); }} />
          <textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder="Share a few words about this product (optional)"
            maxLength={500}
            rows={2}
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:border-primary focus:ring-0 resize-none"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            className="bg-primary text-white text-sm font-bold rounded-xl py-2.5 disabled:opacity-60"
          >
            {submitting ? 'Submitting…' : 'Submit rating'}
          </button>
        </>
      )}
    </div>
  );
}

const RateOrderPage = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [items, setItems] = useState<ReviewableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [deliverable, setDeliverable] = useState(true);

  const load = useCallback(async () => {
    if (!orderId) return;
    try {
      setLoading(true);
      const res = await authedFetch(`${apiBase()}/api/reviews/orders/${orderId}/reviewable`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load');
      setDeliverable(Boolean(data.deliverable));
      setItems(data.items ?? []);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  const markSubmitted = useCallback((productId: string, rating: number) => {
    setItems((prev) =>
      prev.map((it) =>
        it.productId === productId
          ? { ...it, alreadyReviewed: true, existingReview: { rating, title: null, reviewText: null } }
          : it,
      ),
    );
  }, []);

  const groups = useMemo(() => {
    const byStore = new Map<string, { storeId: string; storeName: string; items: ReviewableItem[] }>();
    for (const item of items) {
      const existing = byStore.get(item.storeId);
      if (existing) existing.items.push(item);
      else byStore.set(item.storeId, { storeId: item.storeId, storeName: item.storeName, items: [item] });
    }
    return [...byStore.values()];
  }, [items]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => (orderId ? navigate(`/track/${orderId}`) : navigate('/orders'))}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Rate your order</h1>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <WifiOff className="w-10 h-10 text-amber-500" />
          <p className="font-bold text-gray-800">Couldn't load this order</p>
          <button type="button" onClick={load} className="bg-primary text-white rounded-xl px-5 py-2.5 text-sm font-bold">
            Try again
          </button>
        </div>
      ) : !deliverable || items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <Star className="w-10 h-10 text-gray-300" />
          <p className="font-bold text-gray-800">Nothing to rate yet</p>
          <p className="text-sm text-gray-500">You can rate products once your order is delivered.</p>
          <Link to="/orders" className="text-primary text-sm font-semibold mt-2">Back to orders</Link>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <div key={group.storeId}>
              <div className="flex items-center gap-2 mb-3 px-1">
                <Store className="w-4 h-4 text-gray-400" />
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{group.storeName}</p>
              </div>
              <div className="flex flex-col gap-3">
                {group.items.map((item) => (
                  <ReviewItemCard key={item.productId} item={item} orderId={orderId!} onSubmitted={markSubmitted} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RateOrderPage;
