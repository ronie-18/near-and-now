import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AuthModal = ({ isOpen, onClose }: AuthModalProps) => {
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { loginWithPhone, verifyOTPCode } = useAuth();
  const { showNotification } = useNotification();
  const modalRef = useRef<HTMLDivElement>(null);

  // Reset form when modal is opened/closed
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setPhone('');
      setName('');
      setOtp('');
      setResendTimer(0);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Prevent scrolling when modal is open
      document.body.style.overflow = 'hidden';
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'auto';
    };
  }, [isOpen, onClose]);

  // Handle escape key to close
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscKey);
    
    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [isOpen, onClose]);

  // Resend timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [resendTimer]);

  // Handle phone submission
  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!phone) {
      showNotification('Please enter your phone number', 'error');
      return;
    }
    
    // Basic phone validation
    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      showNotification('Please enter a valid 10-digit phone number', 'error');
      return;
    }
    
    try {
      setIsSubmitting(true);
      await loginWithPhone('+91' + phone);
      setStep(2);
      setResendTimer(30);
      showNotification('OTP sent to your phone', 'success');
    } catch (error) {
      console.error('Error sending OTP:', error);
      showNotification('Failed to send OTP. Please try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle OTP verification
  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!otp) {
      showNotification('Please enter the OTP', 'error');
      return;
    }
    
    if (otp.length !== 6) {
      showNotification('OTP must be 6 digits', 'error');
      return;
    }
    
    try {
      setIsSubmitting(true);
      await verifyOTPCode('+91' + phone, otp);
      showNotification('Login successful!', 'success');
      onClose();
    } catch (error) {
      console.error('Error verifying OTP:', error);
      showNotification('Invalid OTP. Please try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle resend OTP
  const handleResendOtp = async () => {
    if (resendTimer > 0) return;
    
    try {
      setIsSubmitting(true);
      await loginWithPhone('+91' + phone);
      setResendTimer(30);
      showNotification('OTP resent to your phone', 'success');
    } catch (error) {
      console.error('Error resending OTP:', error);
      showNotification('Failed to resend OTP. Please try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div 
        ref={modalRef}
        className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden"
      >
        {/* Header */}
        <div className="bg-primary text-white p-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">
            {step === 1 ? 'Login / Register' : 'Verify OTP'}
          </h2>
          <button 
            onClick={onClose}
            className="text-white hover:text-gray-200 focus:outline-none"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Content */}
        <div className="p-6">
          {step === 1 ? (
            /* Step 1: Phone Number */
            <form onSubmit={handlePhoneSubmit}>
              <div className="mb-6">
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <div className="flex">
                  <span className="inline-flex items-center px-3 bg-gray-100 text-gray-500 border border-r-0 border-gray-300 rounded-l-md">
                    +91
                  </span>
                  <input
                    type="tel"
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Enter your 10-digit number"
                    className="flex-1 block w-full border border-gray-300 rounded-r-md focus:ring-primary focus:border-primary px-3 py-2"
                    maxLength={10}
                    required
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  We'll send you a one-time password (OTP)
                </p>
              </div>
              
              <div className="mb-6">
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Your Name (Optional)
                </label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  className="block w-full border border-gray-300 rounded-md focus:ring-primary focus:border-primary px-3 py-2"
                />
              </div>
              
              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full bg-primary hover:bg-secondary text-white py-3 rounded-md transition-colors ${
                  isSubmitting ? 'opacity-70 cursor-not-allowed' : ''
                }`}
              >
                {isSubmitting ? 'Sending OTP...' : 'Continue'}
              </button>
              
              <p className="text-center text-sm text-gray-500 mt-4">
                By continuing, you agree to our{' '}
                <a href="/terms" className="text-primary hover:underline">Terms of Service</a> and{' '}
                <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a>
              </p>
            </form>
          ) : (
            /* Step 2: OTP Verification */
            <form onSubmit={handleOtpSubmit}>
              <div className="text-center mb-6">
                <p className="text-gray-600">
                  Enter the 6-digit code sent to
                </p>
                <p className="font-medium text-gray-800">+91 {phone}</p>
              </div>
              
              <div className="mb-6">
                <label htmlFor="otp" className="block text-sm font-medium text-gray-700 mb-1">
                  One-Time Password (OTP)
                </label>
                <input
                  type="text"
                  id="otp"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter 6-digit OTP"
                  className="block w-full border border-gray-300 rounded-md focus:ring-primary focus:border-primary px-3 py-2 text-center text-lg tracking-widest"
                  maxLength={6}
                  required
                />
              </div>
              
              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full bg-primary hover:bg-secondary text-white py-3 rounded-md transition-colors ${
                  isSubmitting ? 'opacity-70 cursor-not-allowed' : ''
                }`}
              >
                {isSubmitting ? 'Verifying...' : 'Verify & Login'}
              </button>
              
              <div className="flex items-center justify-between mt-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-sm text-gray-600 hover:text-gray-800"
                >
                  Change Phone Number
                </button>
                
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendTimer > 0 || isSubmitting}
                  className={`text-sm ${
                    resendTimer > 0 || isSubmitting
                      ? 'text-gray-400 cursor-not-allowed'
                      : 'text-primary hover:text-secondary'
                  }`}
                >
                  {resendTimer > 0
                    ? `Resend OTP in ${resendTimer}s`
                    : 'Resend OTP'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
