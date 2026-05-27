import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import ProductGrid from '../components/products/ProductGrid';
import { getAllProducts, Product } from '../services/supabase';
import { useCart } from '../context/CartContext';
import { formatPrice, formatCategoryName } from '../utils/formatters';

/* ─────────────────────────────────────────────
   Inline styles & keyframes injected once
───────────────────────────────────────────── */
const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap');

  .pdp-root * { box-sizing: border-box; }

  @keyframes pdp-fade-up {
    from { opacity: 0; transform: translateY(22px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes pdp-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes pdp-shimmer {
    0%   { background-position: -600px 0; }
    100% { background-position: 600px 0; }
  }
  @keyframes pdp-scale-in {
    from { opacity: 0; transform: scale(0.94); }
    to   { opacity: 1; transform: scale(1); }
  }
  @keyframes pdp-cart-pop {
    0%   { transform: scale(1); }
    40%  { transform: scale(1.07); }
    100% { transform: scale(1); }
  }

  .pdp-fade-up  { animation: pdp-fade-up  0.55s cubic-bezier(.22,.68,0,1.2) both; }
  .pdp-fade-in  { animation: pdp-fade-in  0.4s ease both; }
  .pdp-scale-in { animation: pdp-scale-in 0.45s cubic-bezier(.22,.68,0,1.2) both; }

  .pdp-btn-primary {
    position: relative; overflow: hidden;
    background: #1a1a2e; color: #fff;
    border: none; border-radius: 12px;
    padding: 14px 28px;
    font-family: 'DM Sans', sans-serif; font-size: 15px; font-weight: 500;
    cursor: pointer; transition: background 0.25s, box-shadow 0.25s, transform 0.15s;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    letter-spacing: 0.01em;
  }
  .pdp-btn-primary::after {
    content: ''; position: absolute; inset: 0;
    background: radial-gradient(circle at center, rgba(255,255,255,.18) 0%, transparent 70%);
    opacity: 0; transition: opacity .3s;
  }
  .pdp-btn-primary:hover { background: #16213e; box-shadow: 0 8px 28px rgba(26,26,46,.22); transform: translateY(-1px); }
  .pdp-btn-primary:hover::after { opacity: 1; }
  .pdp-btn-primary:active { transform: translateY(0); box-shadow: none; }
  .pdp-btn-primary.cart-pop { animation: pdp-cart-pop .3s ease; }

  .pdp-btn-ghost {
    background: transparent; color: #1a1a2e;
    border: 1.5px solid #d1d5db; border-radius: 12px;
    padding: 14px 28px;
    font-family: 'DM Sans', sans-serif; font-size: 15px; font-weight: 500;
    cursor: pointer; transition: border-color .25s, background .25s, color .25s, transform .15s;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    letter-spacing: 0.01em;
  }
  .pdp-btn-ghost:hover { border-color: #1a1a2e; background: #1a1a2e; color: #fff; transform: translateY(-1px); }
  .pdp-btn-ghost:active { transform: translateY(0); }

  .pdp-qty-btn {
    width: 38px; height: 38px; border-radius: 10px;
    border: 1.5px solid #e5e7eb; background: #fff;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: border-color .2s, background .2s;
    color: #374151;
  }
  .pdp-qty-btn:hover { border-color: #1a1a2e; background: #f9fafb; }

  .pdp-img-wrap {
    position: relative; border-radius: 20px; overflow: hidden;
    background: #f5f5f0;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,.06), 0 2px 4px -2px rgba(0,0,0,.05);
    transition: box-shadow .3s;
  }
  .pdp-img-wrap:hover { box-shadow: 0 20px 48px -12px rgba(0,0,0,.14); }
  .pdp-img-wrap img {
    width: 100%; aspect-ratio: 1/1; object-fit: contain;
    transition: transform .5s cubic-bezier(.22,.68,0,1.1);
    display: block;
  }
  .pdp-img-wrap:hover img { transform: scale(1.035); }

  /* Badge */
  .pdp-cat-badge {
    display: inline-block; background: #f0f0fa; color: #4f46e5;
    border-radius: 999px; padding: 4px 12px;
    font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase;
    margin-bottom: 10px;
  }

  /* Shimmer skeleton */
  .pdp-skeleton {
    background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
    background-size: 600px 100%;
    animation: pdp-shimmer 1.4s infinite linear;
    border-radius: 10px;
  }

  /* Breadcrumb */
  .pdp-breadcrumb { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .pdp-breadcrumb a { color: #9ca3af; font-size: 13px; text-decoration: none; transition: color .2s; }
  .pdp-breadcrumb a:hover { color: #1a1a2e; }
  .pdp-breadcrumb span { color: #d1d5db; font-size: 13px; }
  .pdp-breadcrumb .pdp-bc-current { color: #374151; font-size: 13px; font-weight: 500; }

  /* Cart notice */
  .pdp-cart-notice {
    display: flex; align-items: center; gap: 8px;
    background: #f0fdf4; border: 1px solid #bbf7d0;
    border-radius: 10px; padding: 10px 14px;
    color: #15803d; font-size: 14px;
    animation: pdp-scale-in .3s ease;
  }

  /* Divider */
  .pdp-divider { height: 1px; background: #f3f4f6; margin: 20px 0; }

  /* Sticky detail card */
  .pdp-detail-card {
    background: #fff; border-radius: 20px;
    border: 1px solid #f3f4f6;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,.04), 0 2px 4px -2px rgba(0,0,0,.03);
    padding: 32px;
    position: sticky; top: 24px;
  }

  /* Related section heading */
  .pdp-section-heading {
    font-family: 'DM Serif Display', serif;
    font-size: 26px; color: #1a1a2e;
    margin: 0 0 24px 0;
    position: relative; display: inline-block;
  }
  .pdp-section-heading::after {
    content: ''; position: absolute; left: 0; bottom: -6px;
    width: 40px; height: 2.5px; background: #4f46e5; border-radius: 2px;
  }

  /* Price */
  .pdp-price {
    font-family: 'DM Serif Display', serif;
    font-size: 32px; color: #1a1a2e; line-height: 1;
  }
  .pdp-price-unit { font-family: 'DM Sans', sans-serif; font-size: 13px; color: #9ca3af; margin-left: 6px; }

  /* Product name */
  .pdp-product-name {
    font-family: 'DM Serif Display', serif;
    font-size: clamp(24px, 4vw, 34px); color: #111827;
    line-height: 1.2; margin: 0 0 12px 0;
  }

  /* Description */
  .pdp-description { color: #6b7280; font-size: 15px; line-height: 1.7; }

  /* 404 */
  .pdp-not-found {
    text-align: center; padding: 80px 24px;
    animation: pdp-fade-up .5s ease;
  }
  .pdp-not-found h1 {
    font-family: 'DM Serif Display', serif;
    font-size: 32px; color: #1a1a2e; margin-bottom: 12px;
  }
  .pdp-not-found p { color: #6b7280; margin-bottom: 28px; font-size: 16px; }
`;

/* ─────────────────────────────────────────────
   Main Component
───────────────────────────────────────────── */
const ProductDetailPage = () => {
  const { productId } = useParams<{ productId: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [cartPopped, setCartPopped] = useState(false);

  const { addToCart, cartItems } = useCart();

  const productInCart = product
    ? cartItems.find(
        item =>
          item.id === product.id &&
          (product.isLoose ? item.isLoose : !item.isLoose)
      )
    : null;
  const cartQuantity = productInCart?.quantity || 0;

  useEffect(() => {
    const fetchProductDetails = async () => {
      if (!productId) return;
      try {
        setLoading(true);
        const allProducts = await getAllProducts();
        const currentProduct = allProducts.find(p => p.id === productId) || null;
        setProduct(currentProduct);
        if (currentProduct) {
          const related = allProducts
            .filter(p => p.category === currentProduct.category && p.id !== currentProduct.id)
            .slice(0, 4);
          setRelatedProducts(related);
        }
      } catch (error) {
        console.error('Error fetching product details:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchProductDetails();
  }, [productId]);

  const incrementQuantity = () => setQuantity(prev => prev + 1);
  const decrementQuantity = () => setQuantity(prev => (prev > 1 ? prev - 1 : 1));

  const handleAddToCart = () => {
    if (!product) return;
    addToCart(product, quantity, product.isLoose ?? false);
    setCartPopped(true);
    setTimeout(() => setCartPopped(false), 400);
  };

  /* ── Loading skeleton ── */
  if (loading) {
    return (
      <div className="pdp-root" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <style>{globalStyles}</style>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
            {[80, 50, 90, 120].map((w, i) => (
              <div key={i} className="pdp-skeleton" style={{ height: 14, width: w }} />
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 40 }}>
            <div style={{ flex: '1 1 380px' }}>
              <div className="pdp-skeleton" style={{ width: '100%', aspectRatio: '1/1', borderRadius: 20 }} />
            </div>
            <div style={{ flex: '1 1 340px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="pdp-skeleton" style={{ height: 22, width: 90, borderRadius: 999 }} />
              <div className="pdp-skeleton" style={{ height: 38, width: '75%' }} />
              <div className="pdp-skeleton" style={{ height: 36, width: '40%' }} />
              <div className="pdp-skeleton" style={{ height: 80, width: '100%' }} />
              <div className="pdp-skeleton" style={{ height: 48, width: '100%', borderRadius: 12 }} />
              <div className="pdp-skeleton" style={{ height: 48, width: '100%', borderRadius: 12 }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Not found ── */
  if (!product) {
    return (
      <div className="pdp-root" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <style>{globalStyles}</style>
        <div className="pdp-not-found">
          <div style={{ fontSize: 56, marginBottom: 16 }}>🔍</div>
          <h1>Product Not Found</h1>
          <p>The product you're looking for doesn't exist or has been removed.</p>
          <Link to="/shop" className="pdp-btn-primary" style={{ display: 'inline-flex', textDecoration: 'none' }}>
            Continue Shopping
          </Link>
        </div>
      </div>
    );
  }

  /* ── Main render ── */
  return (
    <div className="pdp-root" style={{ fontFamily: "'DM Sans', sans-serif", background: '#fafafa', minHeight: '100vh' }}>
      <style>{globalStyles}</style>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px 64px' }}>

        {/* Breadcrumbs */}
        <nav className="pdp-breadcrumb pdp-fade-in" style={{ marginBottom: 32 }}>
          <Link to="/">Home</Link>
          <span>/</span>
          <Link to="/shop">Shop</Link>
          <span>/</span>
          <Link to={`/category/${product.category}`}>{formatCategoryName(product.category)}</Link>
          <span>/</span>
          <span className="pdp-bc-current" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {product.name}
          </span>
        </nav>

        {/* Main 2-col layout */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 40, marginBottom: 72, alignItems: 'flex-start' }}>

          {/* Left — Image */}
          <div
            className="pdp-img-wrap pdp-fade-up"
            style={{ flex: '1 1 380px', animationDelay: '0.05s' }}
          >
            <img
              src={product.image || 'https://via.placeholder.com/600x600?text=No+Image'}
              alt={product.name}
            />
          </div>

          {/* Right — Details */}
          <div
            className="pdp-detail-card pdp-fade-up"
            style={{ flex: '1 1 340px', animationDelay: '0.15s' }}
          >
            {/* Category badge */}
            <div className="pdp-cat-badge">{formatCategoryName(product.category)}</div>

            {/* Name */}
            <h1 className="pdp-product-name">{product.name}</h1>

            {/* Price */}
            <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 20 }}>
              <span className="pdp-price">{formatPrice(product.price)}</span>
              {(product.size || product.weight) && (
                <span className="pdp-price-unit">{product.size || product.weight}</span>
              )}
            </div>

            <div className="pdp-divider" />

            {/* Description */}
            {product.description && (
              <>
                <div style={{ marginBottom: 20 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                    About this product
                  </p>
                  <p className="pdp-description">{product.description}</p>
                </div>
                <div className="pdp-divider" />
              </>
            )}

            {/* Cart status notice */}
            {cartQuantity > 0 && (
              <div className="pdp-cart-notice" style={{ marginBottom: 20 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span><strong>{cartQuantity}</strong> already in your cart</span>
              </div>
            )}

            {/* Quantity */}
            <div style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
                Quantity
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button className="pdp-qty-btn" onClick={decrementQuantity} aria-label="Decrease quantity">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M20 12H4" />
                  </svg>
                </button>
                <span style={{
                  minWidth: 48, textAlign: 'center',
                  fontSize: 18, fontWeight: 600, color: '#1a1a2e',
                  fontFamily: "'DM Serif Display', serif"
                }}>
                  {quantity}
                </span>
                <button className="pdp-qty-btn" onClick={incrementQuantity} aria-label="Increase quantity">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button
                className={`pdp-btn-primary${cartPopped ? ' cart-pop' : ''}`}
                onClick={handleAddToCart}
                style={{ width: '100%', padding: '15px 28px' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Add to Cart
              </button>

              <button className="pdp-btn-ghost" style={{ width: '100%', padding: '15px 28px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                Add to Wishlist
              </button>
            </div>
          </div>
        </div>

        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <div className="pdp-fade-up" style={{ animationDelay: '0.25s' }}>
            <h2 className="pdp-section-heading">You might also like</h2>
            <ProductGrid products={relatedProducts} />
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductDetailPage;