import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';

/* ─────────────────────────────────────────────
   Styles
───────────────────────────────────────────── */
const globalStyles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap');

  .pp-root * { box-sizing: border-box; }

  @keyframes pp-fade-up {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes pp-shimmer {
    0%   { background-position: -500px 0; }
    100% { background-position: 500px 0; }
  }
  @keyframes pp-spin {
    to { transform: rotate(360deg); }
  }
  @keyframes pp-scale-in {
    from { opacity: 0; transform: scale(0.95); }
    to   { opacity: 1; transform: scale(1); }
  }

  .pp-fade-up  { animation: pp-fade-up  0.5s cubic-bezier(.22,.68,0,1.2) both; }
  .pp-scale-in { animation: pp-scale-in 0.35s cubic-bezier(.22,.68,0,1.2) both; }

  /* Avatar */
  .pp-avatar {
    width: 72px; height: 72px; border-radius: 50%;
    background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
    display: flex; align-items: center; justify-content: center;
    font-family: 'DM Serif Display', serif;
    font-size: 28px; color: #4f46e5;
    flex-shrink: 0;
    box-shadow: 0 0 0 4px #fff, 0 0 0 6px #e0e7ff;
  }

  /* Card */
  .pp-card {
    background: #fff;
    border-radius: 24px;
    border: 1px solid #f0f0f0;
    box-shadow: 0 4px 24px -4px rgba(0,0,0,.07);
    overflow: hidden;
  }

  /* Input */
  .pp-field { display: flex; flex-direction: column; gap: 6px; }
  .pp-label {
    font-size: 12px; font-weight: 600; color: #9ca3af;
    text-transform: uppercase; letter-spacing: .06em;
  }
  .pp-input {
    width: 100%; padding: 12px 16px;
    border: 1.5px solid #e5e7eb; border-radius: 12px;
    font-family: 'DM Sans', sans-serif; font-size: 15px; color: #1a1a2e;
    outline: none; transition: border-color .2s, box-shadow .2s;
    background: #fff;
  }
  .pp-input:focus { border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79,70,229,.1); }
  .pp-input:disabled {
    background: #f9fafb; color: #9ca3af; cursor: not-allowed; border-color: #f0f0f0;
  }
  .pp-hint { font-size: 12px; color: #b0b7c3; margin-top: 2px; }

  /* Buttons */
  .pp-btn-save {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    background: #1a1a2e; color: #fff;
    border: none; border-radius: 12px; padding: 13px 28px;
    font-family: 'DM Sans', sans-serif; font-size: 15px; font-weight: 500;
    cursor: pointer; transition: background .2s, box-shadow .2s, transform .15s;
    letter-spacing: .01em; min-width: 140px;
  }
  .pp-btn-save:hover:not(:disabled) { background: #16213e; box-shadow: 0 8px 24px rgba(26,26,46,.2); transform: translateY(-1px); }
  .pp-btn-save:active:not(:disabled) { transform: translateY(0); box-shadow: none; }
  .pp-btn-save:disabled { opacity: .6; cursor: not-allowed; }

  .pp-btn-logout {
    display: inline-flex; align-items: center; gap: 6px;
    background: transparent; color: #ef4444;
    border: 1.5px solid #fee2e2; border-radius: 12px; padding: 13px 24px;
    font-family: 'DM Sans', sans-serif; font-size: 15px; font-weight: 500;
    cursor: pointer; transition: background .2s, border-color .2s, transform .15s;
  }
  .pp-btn-logout:hover { background: #fef2f2; border-color: #fca5a5; transform: translateY(-1px); }
  .pp-btn-logout:active { transform: translateY(0); }

  /* Nav items */
  .pp-nav-item {
    display: flex; align-items: center; gap: 14px;
    padding: 14px 20px; border-radius: 14px;
    background: none; border: none; width: 100%; text-align: left;
    cursor: pointer; transition: background .2s, transform .15s;
    color: #374151;
  }
  .pp-nav-item:hover { background: #f5f5ff; transform: translateX(4px); }
  .pp-nav-item-icon {
    width: 38px; height: 38px; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; transition: background .2s;
  }
  .pp-nav-item:hover .pp-nav-item-icon { background: #e0e7ff; }
  .pp-nav-item-label { font-size: 15px; font-weight: 500; color: #1a1a2e; }
  .pp-nav-item-sub { font-size: 12px; color: #9ca3af; margin-top: 1px; }
  .pp-nav-item-arrow { margin-left: auto; color: #d1d5db; transition: color .2s, transform .2s; }
  .pp-nav-item:hover .pp-nav-item-arrow { color: #4f46e5; transform: translateX(3px); }

  /* Spinner */
  .pp-spinner {
    width: 16px; height: 16px; border-radius: 50%;
    border: 2px solid rgba(255,255,255,.4);
    border-top-color: #fff;
    animation: pp-spin .65s linear infinite;
  }

  /* Skeleton */
  .pp-skeleton {
    background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
    background-size: 500px 100%;
    animation: pp-shimmer 1.4s infinite linear;
    border-radius: 10px;
  }

  /* Divider */
  .pp-divider { height: 1px; background: #f3f4f6; }

  /* Section heading */
  .pp-section-heading {
    font-family: 'DM Serif Display', serif;
    font-size: 16px; color: #1a1a2e;
    margin: 0;
  }
`;

/* ─────────────────────────────────────────────
   Component
───────────────────────────────────────────── */
const ProfilePage = () => {
  const { user, isAuthenticated, isLoading, updateUserProfile, logoutUser, changeEmail, verifyEmailCode, resendEmailCode } = useAuth();
  const { showNotification } = useNotification();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({ name: '', phone: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Email is verified separately from name/phone — changing it requires
  // confirming a 4-digit code before it takes effect.
  const [emailInput, setEmailInput] = useState('');
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [showEmailCodeStep, setShowEmailCodeStep] = useState(false);
  const [emailCode, setEmailCode] = useState('');
  const [isEmailSubmitting, setIsEmailSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate('/login');
  }, [isAuthenticated, isLoading, navigate]);

  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        phone: user.phone || ''
      });
      setEmailInput(user.email || '');
      setIsEmailVerified(!!user.email_verified_at);
      setShowEmailCodeStep(false);
    }
  }, [user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      await updateUserProfile({ name: formData.name });
      showNotification('Profile updated successfully', 'success');
    } catch (error) {
      console.error('Error updating profile:', error);
      showNotification('Failed to update profile. Please try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const handleSendEmailCode = async () => {
    if (!EMAIL_REGEX.test(emailInput.trim())) {
      showNotification('Please enter a valid email address', 'error');
      return;
    }
    try {
      setIsEmailSubmitting(true);
      await changeEmail(emailInput.trim());
      setShowEmailCodeStep(true);
      showNotification('Verification code sent to your email', 'success');
    } catch (error: any) {
      showNotification(error?.message || 'Failed to send verification code', 'error');
    } finally {
      setIsEmailSubmitting(false);
    }
  };

  const handleVerifyEmail = async () => {
    if (emailCode.length !== 4) {
      showNotification('Enter the 4-digit code', 'error');
      return;
    }
    try {
      setIsEmailSubmitting(true);
      await verifyEmailCode(emailCode.trim());
      setIsEmailVerified(true);
      setShowEmailCodeStep(false);
      setEmailCode('');
      showNotification('Email verified!', 'success');
    } catch (error: any) {
      showNotification(error?.message || 'Invalid or expired code', 'error');
    } finally {
      setIsEmailSubmitting(false);
    }
  };

  const handleResendEmailCode = async () => {
    try {
      setIsEmailSubmitting(true);
      await resendEmailCode();
      showNotification('Verification code resent', 'success');
    } catch (error: any) {
      showNotification(error?.message || 'Failed to resend code', 'error');
    } finally {
      setIsEmailSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
      navigate('/');
      showNotification('Logged out successfully', 'success');
    } catch (error) {
      console.error('Error logging out:', error);
      showNotification('Failed to log out. Please try again.', 'error');
    }
  };

  /* initials for avatar */
  const initials = formData.name
    ? formData.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  /* ── Loading skeleton ── */
  if (isLoading) {
    return (
      <div className="pp-root" style={{ fontFamily: "'DM Sans', sans-serif", background: '#fafafa', minHeight: '100vh' }}>
        <style>{globalStyles}</style>
        <div style={{ maxWidth: 520, margin: '0 auto', padding: '48px 24px' }}>
          <div className="pp-card" style={{ padding: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
              <div className="pp-skeleton" style={{ width: 72, height: 72, borderRadius: '50%' }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="pp-skeleton" style={{ height: 18, width: '55%' }} />
                <div className="pp-skeleton" style={{ height: 14, width: '40%' }} />
              </div>
            </div>
            {[1,2,3].map(i => (
              <div key={i} style={{ marginBottom: 20 }}>
                <div className="pp-skeleton" style={{ height: 12, width: 80, marginBottom: 8 }} />
                <div className="pp-skeleton" style={{ height: 46, width: '100%' }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <div className="pp-skeleton" style={{ height: 46, width: 140, borderRadius: 12 }} />
              <div className="pp-skeleton" style={{ height: 46, width: 110, borderRadius: 12 }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Main render ── */
  return (
    <div className="pp-root" style={{ fontFamily: "'DM Sans', sans-serif", background: '#fafafa', minHeight: '100vh' }}>
      <style>{globalStyles}</style>

      <div style={{ maxWidth: 520, margin: '0 auto', padding: '48px 24px 72px' }}>

        {/* Profile card */}
        <div className="pp-card pp-fade-up">

          {/* Header */}
          <div style={{ padding: '28px 32px 24px', display: 'flex', alignItems: 'center', gap: 18 }}>
            <div className="pp-avatar">{initials}</div>
            <div>
              <h1 style={{
                fontFamily: "'DM Serif Display', serif",
                fontSize: 22, color: '#1a1a2e', margin: '0 0 3px 0'
              }}>
                {formData.name || 'Your Profile'}
              </h1>
              {formData.phone && (
                <p style={{ fontSize: 14, color: '#9ca3af', margin: 0 }}>{formData.phone}</p>
              )}
            </div>
          </div>

          <div className="pp-divider" />

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ padding: '28px 32px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 28 }}>

              {/* Full Name */}
              <div className="pp-field">
                <label className="pp-label" htmlFor="name">Full Name</label>
                <input
                  className="pp-input"
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Your full name"
                />
              </div>

              {/* Phone */}
              <div className="pp-field">
                <label className="pp-label" htmlFor="phone">Phone Number</label>
                <input
                  className="pp-input"
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  disabled
                />
                <span className="pp-hint">Phone number cannot be changed</span>
              </div>

            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <button type="submit" className="pp-btn-save" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <span className="pp-spinner" />
                    Saving…
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M5 13l4 4L19 7" />
                    </svg>
                    Save Changes
                  </>
                )}
              </button>

              <button type="button" className="pp-btn-logout" onClick={handleLogout}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Log out
              </button>
            </div>
          </form>

          <div className="pp-divider" />

          {/* Email — verified separately; changing it requires confirming a new code */}
          <div style={{ padding: '24px 32px' }}>
            <div className="pp-field" style={{ marginBottom: showEmailCodeStep ? 16 : 0 }}>
              <label className="pp-label" htmlFor="email">
                Email Address
                {isEmailVerified && !showEmailCodeStep && (
                  <span style={{ color: '#16a34a', fontWeight: 600, marginLeft: 8 }}>✓ Verified</span>
                )}
                {!isEmailVerified && !showEmailCodeStep && (
                  <span style={{ color: '#d97706', fontWeight: 600, marginLeft: 8 }}>Unverified</span>
                )}
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="pp-input"
                  type="email"
                  id="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="you@example.com"
                  disabled={showEmailCodeStep}
                />
                <button
                  type="button"
                  className="pp-btn-save"
                  disabled={isEmailSubmitting || showEmailCodeStep || emailInput.trim() === (user?.email || '')}
                  onClick={handleSendEmailCode}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {emailInput.trim() === (user?.email || '') && isEmailVerified ? 'Verified' : 'Send Code'}
                </button>
              </div>
              {!isEmailVerified && !showEmailCodeStep && (
                <span className="pp-hint">Verify your email before you can place an order.</span>
              )}
            </div>

            {showEmailCodeStep && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div className="pp-field" style={{ flex: 1 }}>
                  <label className="pp-label" htmlFor="emailCode">4-Digit Code</label>
                  <input
                    className="pp-input"
                    type="text"
                    id="emailCode"
                    value={emailCode}
                    onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ''))}
                    maxLength={4}
                    placeholder="Enter code"
                  />
                </div>
                <button type="button" className="pp-btn-save" disabled={isEmailSubmitting} onClick={handleVerifyEmail}>
                  Verify
                </button>
                <button
                  type="button"
                  className="pp-btn-logout"
                  disabled={isEmailSubmitting}
                  onClick={handleResendEmailCode}
                >
                  Resend
                </button>
              </div>
            )}
          </div>

          <div className="pp-divider" />

          {/* Account settings */}
          <div style={{ padding: '24px 32px 28px' }}>
            <p className="pp-section-heading" style={{ marginBottom: 16 }}>Account Settings</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>

              {/* My Orders */}
              <button className="pp-nav-item" onClick={() => navigate('/orders')}>
                <div className="pp-nav-item-icon" style={{ background: '#f0fdf4' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2">
                    <path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                </div>
                <div>
                  <div className="pp-nav-item-label">My Orders</div>
                  <div className="pp-nav-item-sub">Track and manage your orders</div>
                </div>
                <svg className="pp-nav-item-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>

              {/* Saved Addresses */}
              <button className="pp-nav-item" onClick={() => navigate('/addresses')}>
                <div className="pp-nav-item-icon" style={{ background: '#eff6ff' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                    <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <div className="pp-nav-item-label">Saved Addresses</div>
                  <div className="pp-nav-item-sub">Manage delivery addresses</div>
                </div>
                <svg className="pp-nav-item-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default ProfilePage;