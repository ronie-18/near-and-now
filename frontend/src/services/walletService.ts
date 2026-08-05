import { apiUrl } from '../utils/apiBase';
import { getAuthHeaders, authedFetch } from '../utils/authHeader';

/**
 * Website client for the customer wallet — same backend as the mobile app's
 * lib/walletService.ts (near-and-now/backend/src/{controllers,routes}/wallet.*.ts).
 * A customer's balance is shared across both surfaces (keyed by app_users.id),
 * this is just a second UI on top of the same account.
 */

export interface WalletTopupOrder {
  razorpay_order_id: string;
  amount: number; // paise
  currency: string;
  key_id: string;
  razorpay_mode?: 'test' | 'live';
}

async function walletFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authedFetch(apiUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || 'Wallet request failed');
  }
  return data as T;
}

export async function getWalletBalance(): Promise<number> {
  const res = await walletFetch<{ balance: number }>('/api/wallet');
  return Number(res?.balance ?? 0);
}

export interface WalletTransaction {
  id: string;
  type: 'credit' | 'debit';
  reason: 'topup' | 'order_payment' | 'refund';
  amount: number;
  balance_after: number;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
}

export async function getWalletTransactions(limit = 20, offset = 0): Promise<WalletTransaction[]> {
  const res = await walletFetch<{ transactions: WalletTransaction[] }>(
    `/api/wallet/transactions?limit=${limit}&offset=${offset}`,
  );
  return res?.transactions ?? [];
}

export async function createWalletTopupOrder(amountRupees: number): Promise<WalletTopupOrder> {
  return walletFetch<WalletTopupOrder>('/api/wallet/topup/create', {
    method: 'POST',
    body: JSON.stringify({ amount: amountRupees }),
  });
}

export async function verifyWalletTopup(payload: {
  paymentId: string;
  razorpayOrderId: string;
  signature: string;
  amount: number;
}): Promise<number> {
  const res = await walletFetch<{ balance: number }>('/api/wallet/topup/verify', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return Number(res?.balance ?? 0);
}

export async function payOrderWithWallet(orderId: string): Promise<number> {
  const res = await walletFetch<{ balance: number }>('/api/wallet/pay-order', {
    method: 'POST',
    body: JSON.stringify({ orderId }),
  });
  return Number(res?.balance ?? 0);
}
