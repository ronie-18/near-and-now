import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { paymentService } from '../services/payment.service.js';

const MIN_TOPUP_RUPEES = 10;
const MAX_TOPUP_RUPEES = 50_000; // anti-abuse ceiling on a single top-up

function insufficientBalance(error: unknown): boolean {
  return String((error as { message?: string })?.message || '').includes('INSUFFICIENT_BALANCE');
}

export class WalletController {
  /** GET /api/wallet — current balance for the authenticated customer. */
  async getBalance(req: Request, res: Response) {
    try {
      const userId = req.customerId;
      const { data, error } = await supabaseAdmin
        .from('app_users')
        .select('wallet_balance')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      res.json({ success: true, balance: Number(data?.wallet_balance ?? 0) });
    } catch (error: any) {
      console.error('❌ getBalance error:', error);
      res.status(500).json({ success: false, error: error?.message || 'Failed to fetch wallet balance' });
    }
  }

  /**
   * POST /api/wallet/topup/create — opens a Razorpay order for the requested
   * top-up amount. Deliberately NOT keyed to any customer_orders row (this
   * isn't an order payment) — uses its own `wallet_topup` notes marker so
   * the shared webhook handler's `internal_order_id`/`addition_order_id`
   * guards correctly skip these events (same lesson as
   * createAdditionPaymentOrder: reusing another flow's notes key would let
   * this payment's webhook events overwrite unrelated order state).
   */
  async createTopupOrder(req: Request, res: Response) {
    try {
      const userId = req.customerId;
      const amount = Number(req.body?.amount);
      if (!Number.isFinite(amount) || amount < MIN_TOPUP_RUPEES || amount > MAX_TOPUP_RUPEES) {
        return res.status(400).json({
          success: false,
          error: `Amount must be between ₹${MIN_TOPUP_RUPEES} and ₹${MAX_TOPUP_RUPEES}`,
        });
      }

      const order = await paymentService.createWalletTopupOrder(userId!, amount);
      res.json({ success: true, ...order });
    } catch (error: any) {
      console.error('❌ createTopupOrder error:', error);
      const statusCode = error?.statusCode === 400 ? 400 : 500;
      res.status(statusCode).json({ success: false, error: error?.message || 'Failed to start top-up' });
    }
  }

  /**
   * POST /api/wallet/topup/verify — same signature-verify + capture pattern
   * as the main checkout's verifyPayment, then credits the wallet. Crediting
   * is idempotent on razorpay_payment_id (credit_wallet RPC / migration
   * 20260910000000), so a retried verify call can't double-credit.
   */
  async verifyTopup(req: Request, res: Response) {
    try {
      const userId = req.customerId;
      const { paymentId, razorpayOrderId, signature, amount } = req.body;
      if (!paymentId || !razorpayOrderId || !signature || !amount) {
        return res.status(400).json({ success: false, error: 'Missing payment verification fields' });
      }

      const isValid = await paymentService.verifyPayment({ paymentId, orderId: razorpayOrderId, signature });
      if (!isValid) {
        return res.status(400).json({ success: false, error: 'Payment verification failed' });
      }

      const captureResult = await paymentService.ensurePaymentCaptured(paymentId);
      if (captureResult.status !== 'captured') {
        return res.status(400).json({ success: false, error: `Payment not captured (status: ${captureResult.status})` });
      }

      // The signature only proves paymentId/orderId/signature are internally
      // consistent — it does NOT prove this payment was ever created as a
      // wallet top-up for THIS user. Without this check, any authenticated
      // user could submit the (paymentId, razorpayOrderId, signature) of
      // ANY captured Razorpay payment anywhere in the system — including
      // their own unrelated order payment, or (if obtained) someone else's
      // — and mint free wallet credit equal to that payment's amount, since
      // the idempotency guard is only keyed on razorpay_payment_id for
      // reason='topup', which a payment used elsewhere would never collide
      // with. createWalletTopupOrder() stamps `notes.wallet_topup` and
      // `notes.user_id` on the Razorpay order at creation time specifically
      // so this can be checked against Razorpay's own trusted record, not
      // anything client-supplied — same shape as the main checkout's
      // `payment.order_id === razorpayOrderId` strict check.
      const payment = await paymentService.getPaymentDetails(paymentId) as any;
      const notes = payment?.notes || {};
      const isGenuineTopup =
        payment?.order_id === razorpayOrderId &&
        (notes.wallet_topup === true || notes.wallet_topup === 'true') &&
        notes.user_id === userId;
      if (!isGenuineTopup) {
        console.warn('[WALLET] verifyTopup: payment is not a genuine wallet top-up for this user', {
          userId, paymentId, razorpayOrderId, notes,
        });
        return res.status(400).json({ success: false, error: 'Payment verification failed' });
      }

      // Trust the captured amount from Razorpay, not the client-supplied one —
      // same "never trust the client amount" rule as everywhere else in this
      // payment flow.
      const capturedRupees = captureResult.amount / 100;

      const { data: newBalance, error: rpcErr } = await supabaseAdmin.rpc('credit_wallet', {
        p_user_id: userId,
        p_amount: capturedRupees,
        p_reason: 'topup',
        p_reference_type: null,
        p_reference_id: null,
        p_razorpay_payment_id: paymentId,
      });
      if (rpcErr) throw rpcErr;

      res.json({ success: true, balance: Number(newBalance) });
    } catch (error: any) {
      console.error('❌ verifyTopup error:', error);
      res.status(500).json({ success: false, error: error?.message || 'Failed to verify top-up' });
    }
  }

  /**
   * POST /api/wallet/pay-order — pays an already-created, still-pending
   * order out of the customer's wallet balance instead of opening a Razorpay
   * sheet. Mirrors the same "order created pending, then paid" two-step
   * shape as the online-payment flow, so it slots into the exact same
   * needsPayment/retry UI the app already has for a pending order — the
   * only difference is what pays it off.
   */
  async payOrderWithWallet(req: Request, res: Response) {
    try {
      const userId = req.customerId;
      const { orderId } = req.body;
      if (!orderId) return res.status(400).json({ success: false, error: 'orderId required' });

      // pay_order_with_wallet (migration 20260911000000) does the ownership
      // check, the not-already-paid check, the debit, and the payment_status
      // update all in one transaction under a row lock on the order itself —
      // an earlier version of this endpoint did these as separate
      // check-then-act steps, which let two concurrent calls for the same
      // order (e.g. a double-tapped retry) both pass the "not yet paid"
      // check and both debit the wallet. Fixed same-day, before this ever
      // saw real traffic.
      let newBalance: number;
      try {
        const { data, error: rpcErr } = await supabaseAdmin.rpc('pay_order_with_wallet', {
          p_user_id: userId,
          p_order_id: orderId,
        });
        if (rpcErr) throw rpcErr;
        newBalance = Number(data);
      } catch (rpcError) {
        const message = (rpcError as { message?: string })?.message || '';
        if (message.includes('ORDER_NOT_FOUND')) {
          return res.status(404).json({ success: false, error: 'Order not found' });
        }
        if (message.includes('ALREADY_PAID')) {
          return res.status(409).json({ success: false, error: 'This order is already paid.' });
        }
        if (message.includes('INVALID_AMOUNT')) {
          return res.status(400).json({ success: false, error: 'Invalid order amount' });
        }
        if (insufficientBalance(rpcError)) {
          return res.status(400).json({ success: false, error: 'Insufficient wallet balance' });
        }
        throw rpcError;
      }

      // Fire-and-forget invoice generation (idempotent) — same as the
      // Razorpay webhook's payment.captured handler.
      import('../services/invoice.service.js').then(({ invoiceService }) => {
        invoiceService.generateForOrder(orderId).catch((err: unknown) => {
          console.error('[INVOICE] Wallet-payment invoice generation failed', { orderId, err });
        });
      }).catch(() => {/* ignore dynamic import failure */});

      res.json({ success: true, balance: newBalance });
    } catch (error: any) {
      console.error('❌ payOrderWithWallet error:', error);
      res.status(500).json({ success: false, error: error?.message || 'Failed to pay with wallet' });
    }
  }
}

export const walletController = new WalletController();
