import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, ShoppingCart, Loader2, WifiOff, ArrowLeft } from 'lucide-react';
import { getAuthHeaders, authedFetch } from '../utils/authHeader';
import { useCart } from '../context/CartContext';
import { Product } from '../services/supabase';
import { parseGstRatePercent, priceWithGst } from '../utils/priceGst';

interface WishlistItem {
  wishlistItemId: string;
  productId: string;
  name: string;
  category: string;
  imageUrl: string | null;
  basePrice: number;
  discountedPrice: number;
  unit: string;
  isLoose: boolean;
  gstRate: number | null;
  isActive: boolean;
}

// Same GST-inclusive pricing as services/supabase.ts's product mapper — the
// wishlist API returns pre-tax base/discounted prices (like every other
// master_products read), so GST is applied client-side here too.
function withGst(item: WishlistItem): { price: number; originalPrice?: number } {
  const gstRate = item.isLoose ? 0 : parseGstRatePercent(item.gstRate);
  const price = priceWithGst(item.discountedPrice, gstRate);
  const originalPrice = item.basePrice > 0 ? priceWithGst(item.basePrice, gstRate) : undefined;
  return { price, originalPrice };
}

function toCartProduct(item: WishlistItem): Product {
  const { price, originalPrice } = withGst(item);
  return {
    id: item.productId,
    name: item.name,
    price,
    original_price: originalPrice,
    image_url: item.imageUrl ?? undefined,
    category: item.category,
    in_stock: item.isActive,
    unit: item.unit,
    isLoose: item.isLoose,
  };
}

const apiBase = () => (import.meta.env.VITE_API_URL || window.location.origin).replace(/\/$/, '');

const WishlistPage = () => {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await authedFetch(`${apiBase()}/api/wishlist`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to load wishlist');
      setItems(data.items ?? []);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (productId: string) => {
    setRemovingId(productId);
    const previous = items;
    setItems((prev) => prev.filter((it) => it.productId !== productId));
    try {
      const res = await authedFetch(`${apiBase()}/api/wishlist/${productId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to remove');
    } catch {
      setItems(previous);
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">My Wishlist</h1>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <WifiOff className="w-10 h-10 text-amber-500" />
          <p className="font-bold text-gray-800">Couldn't load your wishlist</p>
          <button type="button" onClick={load} className="bg-primary text-white rounded-xl px-5 py-2.5 text-sm font-bold">
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <Heart className="w-10 h-10 text-gray-300" />
          <p className="font-bold text-gray-800">Your wishlist is empty</p>
          <p className="text-sm text-gray-500">Tap the heart on any product to save it here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <div key={item.wishlistItemId} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex items-center gap-4">
              <button
                type="button"
                onClick={() => navigate(`/product/${item.productId}`)}
                className="flex items-center gap-4 flex-1 text-left"
              >
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="w-16 h-16 rounded-xl object-cover bg-gray-50 flex-shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-gray-50 flex-shrink-0" />
                )}
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{item.name}</p>
                  {!item.isActive ? (
                    <p className="text-xs text-gray-400 italic mt-1">No longer available</p>
                  ) : (() => {
                    const { price, originalPrice } = withGst(item);
                    return (
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-primary font-bold">₹{price.toFixed(2)}</span>
                        {originalPrice !== undefined && originalPrice > price && (
                          <span className="text-gray-400 text-xs line-through">₹{originalPrice.toFixed(2)}</span>
                        )}
                        <span className="text-gray-400 text-xs">/ {item.unit}</span>
                      </div>
                    );
                  })()}
                </div>
              </button>
              <div className="flex items-center gap-2 flex-shrink-0">
                {item.isActive && (
                  <button
                    type="button"
                    onClick={() => addToCart(toCartProduct(item), 1, item.isLoose)}
                    className="w-9 h-9 rounded-lg bg-primary text-white flex items-center justify-center"
                    aria-label="Add to cart"
                  >
                    <ShoppingCart className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(item.productId)}
                  disabled={removingId === item.productId}
                  className="w-9 h-9 rounded-lg bg-red-50 text-red-500 flex items-center justify-center disabled:opacity-50"
                  aria-label="Remove from wishlist"
                >
                  <Heart className="w-4 h-4 fill-red-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WishlistPage;
