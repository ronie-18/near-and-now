import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import { getWalletBalance, createWalletTopupOrder, verifyWalletTopup } from '../services/walletService';
import { openRazorpayCheckoutForOrder } from '../services/paymentGateway';

const QUICK_AMOUNTS = [100, 250, 500, 1000];

type TopupPhase = 'idle' | 'preparing' | 'awaiting_gateway' | 'verifying';

const PHASE_LABEL: Record<Exclude<TopupPhase, 'idle'>, string> = {
  preparing: 'Setting up…',
  awaiting_gateway: 'Waiting for payment…',
  verifying: 'Verifying…',
};

const globalStyles = `
  .wp-root * { box-sizing: border-box; }
  .wp-card {
    background: #fff;
    border-radius: 24px;
    border: 1px solid #f0f0f0;
    box-shadow: 0 4px 24px -4px rgba(0,0,0,.07);
    overflow: hidden;
  }
  .wp-balance {
    background: linear-gradient(135deg, #3DA668 0%, #2D7A4F 100%);
    padding: 32px;
    text-align: center;
    color: #fff;
  }
  .wp-quick-grid { display: flex; gap: 10px; flex-wrap: wrap; }
  .wp-quick-btn {
    flex: 1; min-width: 90px; padding: 12px; border-radius: 12px;
    background: #f8f8f6; border: 1.5px solid rgba(60,47,30,.08);
    font-size: 14px; font-weight: 700; color: #6B5744; cursor: pointer;
  }
  .wp-quick-btn.active { background: #EAF6EE; border-color: #2D7A4F; color: #2D7A4F; }
  .wp-input {
    flex: 1; padding: 12px 14px; border-radius: 12px;
    border: 1.5px solid rgba(60,47,30,.08); font-size: 16px; font-weight: 600;
    outline: none;
  }
  .wp-add-btn {
    width: 100%; padding: 14px; border-radius: 12px; border: none;
    background: #2D7A4F; color: #fff; font-size: 15px; font-weight: 700;
    cursor: pointer; margin-top: 16px;
  }
  .wp-add-btn:disabled { background: #d1d5db; color: #9ca3af; cursor: not-allowed; }
`;

const WalletPage = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { showNotification } = useNotification();
  const navigate = useNavigate();

  const [balance, setBalance] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [custom, setCustom] = useState('');
  const [phase, setPhase] = useState<TopupPhase>('idle');
  const inFlight = useRef(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate('/login');
  }, [isAuthenticated, isLoading, navigate]);

  useEffect(() => {
    if (!isAuthenticated) return;
    getWalletBalance()
      .then(setBalance)
      .catch(() => { /* leave null -> renders "—" instead of a misleading ₹0.00 */ })
      .finally(() => setLoadingBalance(false));
  }, [isAuthenticated]);

  const finalAmount = custom.trim() !== '' ? Number(custom) : selected;
  const isValid = finalAmount != null && finalAmount > 0 && Number.isFinite(finalAmount);

  const handleAddMoney = async () => {
    if (!isValid || inFlight.current) return;
    inFlight.current = true;
    setPhase('preparing');
    try {
      const order = await createWalletTopupOrder(finalAmount!);

      setPhase('awaiting_gateway');
      const response = await openRazorpayCheckoutForOrder(order, {
        name: 'Near & Now Wallet',
        description: order.razorpay_mode === 'test' ? 'Test top-up (Razorpay sandbox)' : 'Wallet top-up',
        customerName: user?.name || 'Customer',
        customerEmail: user?.email || undefined,
        customerPhone: user?.phone || undefined,
      });

      setPhase('verifying');
      const newBalance = await verifyWalletTopup({
        paymentId: response.razorpay_payment_id,
        razorpayOrderId: response.razorpay_order_id,
        signature: response.razorpay_signature,
        amount: finalAmount!,
      });
      setBalance(newBalance);
      setSelected(null);
      setCustom('');
      showNotification(`₹${finalAmount} added to your wallet`, 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      if (message !== 'Payment cancelled') {
        showNotification(message, 'error');
      }
    } finally {
      inFlight.current = false;
      setPhase('idle');
    }
  };

  return (
    <div className="wp-root" style={{ fontFamily: "'DM Sans', sans-serif", background: '#fafafa', minHeight: '100vh' }}>
      <style>{globalStyles}</style>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '48px 24px 72px' }}>
        <button
          onClick={() => navigate('/profile')}
          style={{ background: 'none', border: 'none', color: '#6B5744', fontSize: 14, cursor: 'pointer', marginBottom: 20, padding: 0 }}
        >
          ← Back to profile
        </button>

        <div className="wp-card">
          <div className="wp-balance">
            <div style={{ fontSize: 13, opacity: 0.85, fontWeight: 600, letterSpacing: '.03em', marginBottom: 6 }}>
              AVAILABLE BALANCE
            </div>
            {loadingBalance ? (
              <div style={{ fontSize: 32, fontWeight: 900 }}>…</div>
            ) : (
              <div style={{ fontSize: 40, fontWeight: 900, letterSpacing: '-1px' }}>
                {balance == null ? '—' : `₹${balance.toFixed(2)}`}
              </div>
            )}
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Near &amp; Now Wallet</div>
          </div>

          <div style={{ padding: 28 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px 0', color: '#1a1a2e' }}>Add Money</h2>
            <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 16px 0' }}>Choose a quick amount or enter custom</p>

            <div className="wp-quick-grid">
              {QUICK_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  className={`wp-quick-btn${selected === amt && custom === '' ? ' active' : ''}`}
                  onClick={() => { setSelected(amt); setCustom(''); }}
                >
                  ₹{amt}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
              <input
                className="wp-input"
                type="text"
                inputMode="numeric"
                placeholder="Enter custom amount"
                value={custom}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, '');
                  setCustom(v);
                  if (v) setSelected(null);
                }}
                maxLength={6}
              />
            </div>

            <button
              className="wp-add-btn"
              onClick={handleAddMoney}
              disabled={!isValid || phase !== 'idle'}
            >
              {phase !== 'idle' ? PHASE_LABEL[phase] : isValid ? `Add ₹${finalAmount}` : 'Add Money'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WalletPage;
