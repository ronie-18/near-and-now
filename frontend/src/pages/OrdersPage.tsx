import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { formatPrice } from '../utils/formatters';
import { Order } from '../services/supabase';
import { fetchCustomerOrders } from '../services/orderService';
import { apiUrl } from '../utils/apiBase';
import { getAuthHeaders } from '../utils/authHeader';

/* ─────────────────────────────────────────────
   Styles
───────────────────────────────────────────── */
const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap');

  .op-root * { box-sizing: border-box; }

  @keyframes op-fade-up {
    from { opacity: 0; transform: translateY(18px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes op-shimmer {
    0%   { background-position: -600px 0; }
    100% { background-position: 600px 0; }
  }
  @keyframes op-expand {
    from { opacity: 0; transform: translateY(-8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes op-spin {
    to { transform: rotate(360deg); }
  }

  .op-fade-up  { animation: op-fade-up 0.5s cubic-bezier(.22,.68,0,1.2) both; }
  .op-expand   { animation: op-expand 0.3s cubic-bezier(.22,.68,0,1.2) both; }

  /* Skeleton */
  .op-skeleton {
    background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
    background-size: 600px 100%;
    animation: op-shimmer 1.4s infinite linear;
    border-radius: 10px;
  }

  /* Card */
  .op-card {
    background: #fff;
    border-radius: 20px;
    border: 1px solid #f0f0f0;
    box-shadow: 0 2px 12px -2px rgba(0,0,0,.06);
    overflow: hidden;
    transition: box-shadow .25s;
  }
  .op-card:hover { box-shadow: 0 8px 28px -4px rgba(0,0,0,.1); }

  /* Status badge */
  .op-badge {
    display: inline-flex; align-items: center; gap: 5px;
    border-radius: 999px; padding: 4px 12px;
    font-size: 12px; font-weight: 600; letter-spacing: .03em;
    text-transform: capitalize;
  }
  .op-badge-dot {
    width: 6px; height: 6px; border-radius: 50%;
  }

  /* Divider */
  .op-divider { height: 1px; background: #f3f4f6; }

  /* Toggle button */
  .op-toggle {
    width: 100%; display: flex; align-items: center; justify-content: space-between;
    padding: 12px 24px;
    background: none; border: none; cursor: pointer;
    font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 500;
    color: #4f46e5;
    transition: background .2s;
  }
  .op-toggle:hover { background: #fafafa; }
  .op-toggle-icon { transition: transform .3s cubic-bezier(.22,.68,0,1.2); }
  .op-toggle-icon.open { transform: rotate(180deg); }

  /* Expanded panel */
  .op-panel {
    padding: 0 24px 24px;
    background: #fafafa;
    border-top: 1px solid #f3f4f6;
  }

  /* Item row */
  .op-item-row {
    display: flex; justify-content: space-between; align-items: flex-start;
    padding: 12px 0; border-bottom: 1px solid #f3f4f6;
  }
  .op-item-row:last-child { border-bottom: none; }

  /* Action buttons */
  .op-btn-primary {
    display: inline-flex; align-items: center; gap: 6px;
    background: #1a1a2e; color: #fff;
    border: none; border-radius: 10px; padding: 10px 20px;
    font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500;
    cursor: pointer; text-decoration: none;
    transition: background .2s, box-shadow .2s, transform .15s;
  }
  .op-btn-primary:hover { background: #16213e; box-shadow: 0 6px 20px rgba(26,26,46,.2); transform: translateY(-1px); }
  .op-btn-primary:active { transform: translateY(0); box-shadow: none; }

  .op-btn-ghost {
    display: inline-flex; align-items: center; gap: 6px;
    background: #fff; color: #374151;
    border: 1.5px solid #e5e7eb; border-radius: 10px; padding: 10px 20px;
    font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500;
    cursor: pointer;
    transition: border-color .2s, background .2s, transform .15s;
  }
  .op-btn-ghost:hover:not(:disabled) { border-color: #1a1a2e; background: #f9fafb; transform: translateY(-1px); }
  .op-btn-ghost:disabled { opacity: .55; cursor: not-allowed; }

  /* Track link (inline small) */
  .op-track-link {
    display: inline-flex; align-items: center; gap: 5px;
    background: #1a1a2e; color: #fff;
    border-radius: 8px; padding: 7px 14px;
    font-size: 13px; font-weight: 500; text-decoration: none;
    transition: background .2s, transform .15s;
    white-space: nowrap;
  }
  .op-track-link:hover { background: #16213e; transform: translateY(-1px); }

  /* Back link */
  .op-back-link {
    display: inline-flex; align-items: center; gap: 6px;
    color: #9ca3af; font-size: 14px; text-decoration: none;
    transition: color .2s;
  }
  .op-back-link:hover { color: #1a1a2e; }

  /* Error banner */
  .op-error {
    display: flex; align-items: center; gap: 10px;
    background: #fef2f2; border: 1px solid #fecaca;
    border-radius: 12px; padding: 14px 18px;
    color: #dc2626; font-size: 14px;
    margin-bottom: 24px;
  }

  /* Empty state */
  .op-empty {
    text-align: center; padding: 60px 24px;
  }
  .op-empty-icon {
    width: 72px; height: 72px; border-radius: 50%;
    background: #f5f5ff; display: flex; align-items: center; justify-content: center;
    margin: 0 auto 20px;
  }
  .op-empty h2 {
    font-family: 'DM Serif Display', serif;
    font-size: 22px; color: #1a1a2e; margin: 0 0 8px;
  }
  .op-empty p { color: #9ca3af; font-size: 15px; margin: 0 0 24px; }

  /* Spinner */
  .op-spinner {
    width: 14px; height: 14px; border-radius: 50%;
    border: 2px solid rgba(55,65,81,.25); border-top-color: #374151;
    animation: op-spin .65s linear infinite; display: inline-block;
  }

  /* Summary row */
  .op-summary-row {
    display: flex; justify-content: space-between; align-items: center;
    font-size: 13px; padding: 5px 0;
  }
`;

/* ─────────────────────────────────────────────
   Status Badge
───────────────────────────────────────────── */
const statusConfig: Record<string, { bg: string; color: string; dot: string }> = {
  Delivered:  { bg: '#f0fdf4', color: '#15803d', dot: '#22c55e' },
  Confirmed:  { bg: '#f0fdf4', color: '#15803d', dot: '#22c55e' },
  Processing: { bg: '#eff6ff', color: '#1d4ed8', dot: '#3b82f6' },
  Shipped:    { bg: '#f5f3ff', color: '#6d28d9', dot: '#8b5cf6' },
  Placed:     { bg: '#fefce8', color: '#a16207', dot: '#eab308' },
  Cancelled:  { bg: '#fef2f2', color: '#dc2626', dot: '#ef4444' },
};

const OrderStatusBadge = ({ status }: { status: string }) => {
  const cfg = statusConfig[status] || { bg: '#f9fafb', color: '#6b7280', dot: '#9ca3af' };
  return (
    <span className="op-badge" style={{ background: cfg.bg, color: cfg.color }}>
      <span className="op-badge-dot" style={{ background: cfg.dot }} />
      {status}
    </span>
  );
};

/* ─────────────────────────────────────────────
   Main Component
───────────────────────────────────────────── */
const OrdersPage = () => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate('/login');
  }, [isAuthenticated, isLoading, navigate]);

  useEffect(() => {
    const fetchOrders = async () => {
      if (!isAuthenticated || !user?.id) { setLoading(false); return; }
      try {
        setLoading(true); setError(null);
        const userOrders = await fetchCustomerOrders(user.id);
        setOrders(userOrders);
      } catch (err: any) {
        console.error('Error fetching orders:', err);
        setError('Failed to load orders. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    if (isAuthenticated && user?.id) fetchOrders();
  }, [isAuthenticated, user?.id, user?.phone, user?.email]);

  const toggleOrderDetails = (orderId: string) =>
    setExpandedOrder(prev => (prev === orderId ? null : orderId));

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

  const getStatusDisplay = (status: string) => {
    const map: Record<string, string> = {
      placed: 'Placed', confirmed: 'Confirmed', shipped: 'Shipped',
      delivered: 'Delivered', cancelled: 'Cancelled'
    };
    return map[status] || status;
  };

  const handleCustomerInvoiceDownload = async (order: Order) => {
    if (!user?.id) return;
    setInvoiceLoading(order.id);
    try {
      const res = await fetch(apiUrl(`/api/invoices/order/${order.id}/customer`), {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to fetch invoice');
      const data = await res.json();
      if (data.url) window.open(data.url, '_blank');
    } catch {
      alert('Invoice download failed. Please try again.');
    } finally {
      setInvoiceLoading(null);
    }
  };

  /* ── Loading skeleton ── */
  if (isLoading || loading) {
    return (
      <div className="op-root" style={{ fontFamily: "'DM Sans', sans-serif", background: '#fafafa', minHeight: '100vh' }}>
        <style>{globalStyles}</style>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px' }}>
          <div className="op-skeleton" style={{ height: 32, width: 160, marginBottom: 32 }} />
          {[1, 2, 3].map(i => (
            <div key={i} className="op-card" style={{ padding: 24, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="op-skeleton" style={{ height: 12, width: 80 }} />
                  <div className="op-skeleton" style={{ height: 16, width: 130 }} />
                </div>
                <div className="op-skeleton" style={{ height: 24, width: 90, borderRadius: 999 }} />
              </div>
              <div style={{ display: 'flex', gap: 24 }}>
                <div style={{ flex: 1 }}><div className="op-skeleton" style={{ height: 12, width: 70, marginBottom: 6 }} /><div className="op-skeleton" style={{ height: 16, width: '80%' }} /></div>
                <div style={{ flex: 1 }}><div className="op-skeleton" style={{ height: 12, width: 70, marginBottom: 6 }} /><div className="op-skeleton" style={{ height: 16, width: '50%' }} /></div>
                <div className="op-skeleton" style={{ height: 34, width: 80, borderRadius: 8, alignSelf: 'center' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── Main render ── */
  return (
    <div className="op-root" style={{ fontFamily: "'DM Sans', sans-serif", background: '#fafafa', minHeight: '100vh' }}>
      <style>{globalStyles}</style>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px 72px' }}>

        {/* Header */}
        <div className="op-fade-up" style={{ marginBottom: 32 }}>
          <h1 style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: 32, color: '#1a1a2e', margin: '0 0 4px',
          }}>
            My Orders
          </h1>
          {orders.length > 0 && (
            <p style={{ fontSize: 14, color: '#9ca3af', margin: 0 }}>
              {orders.length} order{orders.length !== 1 ? 's' : ''} placed
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="op-error op-fade-up">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
            </svg>
            {error}
          </div>
        )}

        {/* Empty state */}
        {orders.length === 0 && !loading ? (
          <div className="op-card op-fade-up">
            <div className="op-empty">
              <div className="op-empty-icon">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="1.8">
                  <path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </div>
              <h2>No Orders Yet</h2>
              <p>You haven't placed any orders yet.<br />Start shopping to place your first order!</p>
              <Link to="/shop" className="op-btn-primary" style={{ textDecoration: 'none' }}>
                Browse Products
              </Link>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {orders.map((order, idx) => {
              const isOpen = expandedOrder === order.id;
              const statusLabel = getStatusDisplay(order.order_status);

              return (
                <div
                  key={order.id}
                  className="op-card op-fade-up"
                  style={{ animationDelay: `${idx * 0.06}s` }}
                >
                  {/* Order header */}
                  <div style={{ padding: '20px 24px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                      {/* Order ID */}
                      <div>
                        <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 3px' }}>
                          {order.order_number ? 'Order Number' : 'Order ID'}
                        </p>
                        <p style={{ fontSize: 16, fontWeight: 600, color: '#1a1a2e', margin: 0, fontFamily: "'DM Serif Display', serif" }}>
                          {order.order_number || order.id.substring(0, 8).toUpperCase()}
                        </p>
                      </div>
                      <OrderStatusBadge status={statusLabel} />
                    </div>

                    {/* Meta row */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginTop: 16, alignItems: 'center' }}>
                      <div>
                        <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 3px' }}>Date</p>
                        <p style={{ fontSize: 14, color: '#374151', margin: 0 }}>{formatDate(order.created_at)}</p>
                      </div>
                      <div>
                        <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 3px' }}>Total</p>
                        <p style={{ fontSize: 16, fontWeight: 600, color: '#1a1a2e', margin: 0, fontFamily: "'DM Serif Display', serif" }}>
                          {formatPrice(order.order_total)}
                        </p>
                      </div>
                      <div style={{ marginLeft: 'auto' }}>
                        <Link to={`/track/${order.id}`} className="op-track-link">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Track
                        </Link>
                      </div>
                    </div>
                  </div>

                  <div className="op-divider" />

                  {/* Toggle */}
                  <button className="op-toggle" onClick={() => toggleOrderDetails(order.id)}>
                    <span>{isOpen ? 'Hide Details' : 'View Details'}</span>
                    <svg
                      className={`op-toggle-icon ${isOpen ? 'open' : ''}`}
                      width="16" height="16" viewBox="0 0 24 24"
                      fill="none" stroke="currentColor" strokeWidth="2.2"
                    >
                      <path d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Expanded details */}
                  {isOpen && (
                    <div className="op-panel op-expand">

                      {/* Items */}
                      <div style={{ paddingTop: 20 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 12px' }}>
                          Items Ordered
                        </p>
                        {order.items && order.items.length > 0 ? (
                          <>
                            <div>
                              {order.items.map((item: any, i: number) => (
                                <div key={item.id || i} className="op-item-row">
                                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                    <div style={{
                                      width: 36, height: 36, borderRadius: 8,
                                      background: '#f0f0fa', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      flexShrink: 0, fontSize: 16
                                    }}>
                                      🛍
                                    </div>
                                    <div>
                                      <p style={{ fontSize: 14, fontWeight: 500, color: '#1a1a2e', margin: '0 0 2px' }}>{item.name}</p>
                                      <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>Qty: {item.quantity}</p>
                                    </div>
                                  </div>
                                  <p style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e', margin: 0, fontFamily: "'DM Serif Display', serif" }}>
                                    {formatPrice(item.price * item.quantity)}
                                  </p>
                                </div>
                              ))}
                            </div>

                            {/* Summary */}
                            <div style={{ marginTop: 16, padding: '14px 0 0', borderTop: '1px solid #e5e7eb' }}>
                              {order.subtotal && (
                                <div className="op-summary-row">
                                  <span style={{ color: '#6b7280' }}>Subtotal</span>
                                  <span style={{ color: '#374151' }}>{formatPrice(order.subtotal)}</span>
                                </div>
                              )}
                              {order.delivery_fee !== undefined && (
                                <div className="op-summary-row">
                                  <span style={{ color: '#6b7280' }}>Delivery</span>
                                  <span style={{ color: order.delivery_fee === 0 ? '#15803d' : '#374151', fontWeight: order.delivery_fee === 0 ? 600 : 400 }}>
                                    {order.delivery_fee === 0 ? 'FREE' : formatPrice(order.delivery_fee)}
                                  </span>
                                </div>
                              )}
                              <div className="op-summary-row" style={{ borderTop: '1px solid #e5e7eb', marginTop: 8, paddingTop: 10 }}>
                                <span style={{ fontWeight: 600, fontSize: 14, color: '#1a1a2e' }}>Total</span>
                                <span style={{ fontWeight: 700, fontSize: 16, color: '#1a1a2e', fontFamily: "'DM Serif Display', serif" }}>
                                  {formatPrice(order.order_total)}
                                </span>
                              </div>
                            </div>
                          </>
                        ) : (
                          <p style={{ color: '#9ca3af', fontSize: 14 }}>No items found for this order.</p>
                        )}
                      </div>

                      {/* Shipping address */}
                      {order.shipping_address && (
                        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #e5e7eb' }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 8px' }}>
                            Delivery Address
                          </p>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                            <div style={{
                              width: 32, height: 32, borderRadius: 8, background: '#eff6ff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                                <path d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                            </div>
                            <p style={{ fontSize: 14, color: '#374151', margin: 0, lineHeight: 1.6 }}>
                              {order.shipping_address.address}, {order.shipping_address.city},{' '}
                              {order.shipping_address.state} — {order.shipping_address.pincode}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
                        <button
                          className="op-btn-ghost"
                          onClick={() => handleCustomerInvoiceDownload(order)}
                          disabled={invoiceLoading === order.id}
                        >
                          {invoiceLoading === order.id ? (
                            <><span className="op-spinner" /> Generating…</>
                          ) : (
                            <>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a1 1 0 001 1h16a1 1 0 001-1v-3" />
                              </svg>
                              Invoice
                            </>
                          )}
                        </button>
                        <Link to={`/track/${order.id}`} className="op-btn-primary">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Track Order
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Back link */}
        <div style={{ marginTop: 40, textAlign: 'center' }}>
          <Link to="/profile" className="op-back-link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back to Profile
          </Link>
        </div>
      </div>
    </div>
  );
};

export default OrdersPage;