import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { formatPrice } from '../utils/formatters';

/* ─────────────────────────────────────────────
   Cart Page — review items before checkout.
   Previously the header's cart icon went straight to /checkout with no
   review step; this gives customers a place to adjust quantities/remove
   items and see the fee breakdown before committing.
───────────────────────────────────────────── */

const globalStyles = `
  .cart-root * { box-sizing: border-box; }
  .cart-card {
    background: #fff;
    border-radius: 16px;
    border: 1px solid #f0f0f0;
    box-shadow: 0 2px 12px -4px rgba(0,0,0,.06);
  }
  .cart-item {
    display: flex; align-items: center; gap: 14px;
    padding: 16px; border-bottom: 1px solid #f0f0f0;
  }
  .cart-item:last-child { border-bottom: none; }
  .cart-item-img {
    width: 64px; height: 64px; border-radius: 12px; object-fit: cover;
    background: #f5f5f5; flex-shrink: 0;
  }
  .cart-qty-btn {
    width: 28px; height: 28px; border-radius: 8px;
    border: 1.5px solid rgba(60,47,30,.12); background: #fafafa;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; font-weight: 700; color: #1a1a2e; cursor: pointer;
    line-height: 1;
  }
  .cart-qty-btn:hover { background: #f0f0f0; }
  .cart-remove-btn {
    background: none; border: none; color: #9ca3af; font-size: 13px;
    cursor: pointer; padding: 0; text-decoration: underline;
  }
  .cart-remove-btn:hover { color: #dc2626; }
  .cart-summary-row {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 14px; color: #6b7280; padding: 6px 0;
  }
  .cart-summary-row.total {
    font-size: 16px; font-weight: 700; color: #1a1a2e;
    border-top: 1px solid #f0f0f0; margin-top: 8px; padding-top: 14px;
  }
  .cart-checkout-btn {
    width: 100%; padding: 14px; border-radius: 12px; border: none;
    background: #2D7A4F; color: #fff; font-size: 15px; font-weight: 700;
    cursor: pointer; margin-top: 16px;
  }
  .cart-checkout-btn:hover { background: #256a43; }
`;

const CartPage = () => {
  const navigate = useNavigate();
  const {
    cartItems,
    updateCartQuantity,
    decreaseCartQuantity,
    removeFromCart,
    hasLoadedCart,
    getFeeBreakdown,
  } = useCart();

  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const fees = getFeeBreakdown();
  const total = subtotal + fees.totalFees;

  return (
    <div className="cart-root" style={{ fontFamily: "'DM Sans', sans-serif", background: '#fafafa', minHeight: '100vh' }}>
      <style>{globalStyles}</style>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '48px 24px 72px' }}>
        <h1 style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 32, color: '#1a1a2e', margin: '0 0 24px',
        }}>
          Your Cart
        </h1>

        {!hasLoadedCart ? null : cartItems.length === 0 ? (
          <div className="cart-card" style={{ textAlign: 'center', padding: '60px 24px' }}>
            <p style={{ fontSize: 16, color: '#1a1a2e', fontWeight: 600, margin: '0 0 8px' }}>Your cart is empty</p>
            <p style={{ fontSize: 14, color: '#9ca3af', margin: '0 0 24px' }}>Add some products to get started.</p>
            <Link
              to="/shop"
              style={{
                display: 'inline-block', padding: '12px 28px', borderRadius: 100,
                background: '#2D7A4F', color: '#fff', fontSize: 14, fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Browse Products
            </Link>
          </div>
        ) : (
          <>
            <div className="cart-card" style={{ marginBottom: 20 }}>
              {cartItems.map((item) => (
                <div key={`${item.id}-${item.isLoose ? 'loose' : 'unit'}`} className="cart-item">
                  {item.image ? (
                    <img src={item.image} alt={item.name} className="cart-item-img" />
                  ) : (
                    <div className="cart-item-img" />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name}
                    </p>
                    {item.size && (
                      <p style={{ fontSize: 12, color: '#9ca3af', margin: '0 0 6px' }}>{item.size}</p>
                    )}
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#2D7A4F', margin: '0 0 8px' }}>
                      {formatPrice(item.price)}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        className="cart-qty-btn"
                        onClick={() => decreaseCartQuantity(item.id, item.isLoose)}
                        aria-label="Decrease quantity"
                      >
                        −
                      </button>
                      <span style={{ fontSize: 14, fontWeight: 600, minWidth: 24, textAlign: 'center' }}>
                        {item.quantity}
                      </span>
                      <button
                        className="cart-qty-btn"
                        onClick={() => updateCartQuantity(item.id, item.quantity + (item.isLoose ? 0.25 : 1), item.isLoose)}
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                      <button
                        className="cart-remove-btn"
                        onClick={() => removeFromCart(item.id, item.isLoose)}
                        style={{ marginLeft: 8 }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a2e', whiteSpace: 'nowrap' }}>
                    {formatPrice(item.price * item.quantity)}
                  </div>
                </div>
              ))}
            </div>

            <div className="cart-card" style={{ padding: 20 }}>
              <div className="cart-summary-row">
                <span>Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <div className="cart-summary-row">
                <span>Delivery Fee</span>
                <span>{fees.deliveryFee === 0 ? 'FREE' : formatPrice(fees.deliveryFee)}</span>
              </div>
              <div className="cart-summary-row">
                <span>Platform Fee</span>
                <span>{formatPrice(fees.platformFee)}</span>
              </div>
              <div className="cart-summary-row">
                <span>Handling Fee</span>
                <span>{formatPrice(fees.handlingFee)}</span>
              </div>
              <div className="cart-summary-row total">
                <span>Total</span>
                <span>{formatPrice(total)}</span>
              </div>

              <button className="cart-checkout-btn" onClick={() => navigate('/checkout')}>
                Proceed to Checkout
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CartPage;
