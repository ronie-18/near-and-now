import { apiUrl } from '../utils/apiBase';

type CreatePaymentOrderResponse = {
  razorpay_order_id: string;
  amount: number;
  currency: string;
  status: string;
  key_id: string;
  /** Present when backend uses test keys (`rzp_test_…`) vs live keys */
  razorpay_mode?: 'test' | 'live';
};

type VerifyPaymentRequest = {
  paymentId: string;
  razorpayOrderId: string;
  signature: string;
  internalOrderId: string;
};

type RazorpaySuccessResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayCheckoutOptions = {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  theme?: { color?: string };
  modal?: { ondismiss?: () => void };
  handler: (response: RazorpaySuccessResponse) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => {
      open: () => void;
    };
  }
}

async function loadRazorpayScript(): Promise<void> {
  if (window.Razorpay) return;

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[data-razorpay-checkout="true"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Razorpay SDK')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.razorpayCheckout = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Razorpay SDK'));
    document.body.appendChild(script);
  });

  if (!window.Razorpay) {
    throw new Error('Razorpay SDK not available');
  }
}

export async function createPaymentOrder(orderId: string, amount: number): Promise<CreatePaymentOrderResponse> {
  const response = await fetch(apiUrl('/api/payment/create'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, amount, currency: 'INR' })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(errorBody || 'Failed to create payment order');
  }

  return response.json();
}

export async function verifyPayment(payload: VerifyPaymentRequest): Promise<void> {
  const response = await fetch(apiUrl('/api/payment/verify'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(errorBody || 'Payment verification failed');
  }
}

export async function openRazorpayCheckout(params: {
  orderId: string;
  amount: number;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  onSuccess: (response: RazorpaySuccessResponse) => Promise<void>;
  onDismiss?: () => void;
}): Promise<void> {
  await loadRazorpayScript();
  const paymentOrder = await createPaymentOrder(params.orderId, params.amount);

  await new Promise<void>((resolve, reject) => {
    const isTestMode =
      paymentOrder.razorpay_mode === 'test' ||
      (!paymentOrder.razorpay_mode && paymentOrder.key_id.startsWith('rzp_test_'));
    const rzp = new window.Razorpay!({
      key: paymentOrder.key_id,
      amount: paymentOrder.amount,
      currency: paymentOrder.currency,
      order_id: paymentOrder.razorpay_order_id,
      name: 'Near and Now',
      description: isTestMode
        ? 'Test payment (Razorpay sandbox)'
        : 'Order payment',
      prefill: {
        name: params.customerName,
        email: params.customerEmail,
        contact: params.customerPhone
      },
      theme: { color: '#2563eb' },
      modal: {
        ondismiss: () => {
          params.onDismiss?.();
          reject(new Error('Payment cancelled'));
        }
      },
      handler: async (response: RazorpaySuccessResponse) => {
        try {
          await params.onSuccess(response);
          resolve();
        } catch (error) {
          reject(error);
        }
      }
    });

    rzp.open();
  });
}

