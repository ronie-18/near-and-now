import { Request, Response } from 'express';
import { databaseService } from '../services/database.service.js';
import { notificationService } from '../services/notification.service.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class CustomersController {
  /**
   * Resolves the authenticated customer's saved addresses, merging in any
   * app_users/customers/customer_saved_addresses rows that share their own
   * phone number (handles accounts split across phone formats).
   *
   * IMPORTANT: the userId/phone hints are now derived solely from the
   * authenticated session (req.customerId), never from client-supplied query
   * params. Previously this route was unauthenticated AND accepted
   * client-supplied `phone`/`customerPhone` query params that were merged in
   * verbatim — passing a stranger's phone number pulled in *their* saved
   * addresses too. getCustomerSavedAddressesResolved already looks up the
   * caller's own phone (via app_users/customers) server-side, so no
   * client-supplied phone hints are needed.
   */
  async getResolvedAddresses(req: Request, res: Response) {
    try {
      const userId = req.customerId!;
      const addresses = await databaseService.getCustomerSavedAddressesResolved(userId, []);
      res.json(addresses);
    } catch (error) {
      console.error('Error fetching resolved addresses:', error);
      res.status(500).json({ error: 'Failed to fetch addresses' });
    }
  }

  async getAddresses(req: Request, res: Response) {
    try {
      const { customerId } = req.params;
      if (customerId !== req.customerId) {
        return res.status(403).json({ error: 'Not authorized to view these addresses' });
      }
      const addresses = await databaseService.getCustomerSavedAddresses(customerId);
      res.json(addresses);
    } catch (error) {
      console.error('Error fetching addresses:', error);
      res.status(500).json({ error: 'Failed to fetch addresses' });
    }
  }

  async createAddress(req: Request, res: Response) {
    try {
      const { customerId } = req.params;
      if (customerId !== req.customerId) {
        return res.status(403).json({ error: 'Not authorized to create an address for this customer' });
      }
      const addressData = {
        ...req.body,
        customer_id: customerId
      };

      const address = await databaseService.createCustomerSavedAddress(addressData);
      res.status(201).json(address);
    } catch (error) {
      console.error('Error creating address:', error);
      res.status(500).json({ error: 'Failed to create address' });
    }
  }

  async updateAddress(req: Request, res: Response) {
    try {
      const { addressId } = req.params;
      const customerId = req.customerId!;

      const allowed = [
        'label', 'address', 'city', 'state', 'pincode', 'country',
        'latitude', 'longitude', 'google_place_id', 'google_formatted_address',
        'google_place_data', 'contact_name', 'contact_phone', 'landmark',
        'delivery_instructions', 'is_default',
      ] as const;

      const updates: Record<string, unknown> = {};
      for (const key of allowed) {
        if (key in req.body) updates[key] = req.body[key];
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }

      const address = await databaseService.updateCustomerSavedAddress(addressId, customerId, updates);
      res.json(address);
    } catch (error: any) {
      console.error('Error updating address:', error);
      if (error.message?.includes('not found')) return res.status(404).json({ error: error.message });
      res.status(500).json({ error: 'Failed to update address' });
    }
  }

  async deleteAddress(req: Request, res: Response) {
    try {
      const { addressId } = req.params;
      const customerId = req.customerId!;
      await databaseService.deleteCustomerSavedAddress(addressId, customerId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting address:', error);
      res.status(500).json({ error: 'Failed to delete address' });
    }
  }

  /**
   * Registers the authenticated customer's Expo push token so order-status
   * notifications (order confirmed / shipped / delivered / cancelled) can
   * reach their device. The token is taken from the body, but the customer
   * identity always comes from the authenticated session (req.customerId),
   * never from a client-supplied id.
   */
  async registerPushToken(req: Request, res: Response) {
    try {
      const customerId = req.customerId!;
      const { token } = req.body as { token?: string };
      if (!token) {
        return res.status(400).json({ error: 'token required' });
      }
      await databaseService.updateCustomerPushToken(customerId, token);
      res.json({ success: true });
    } catch (error) {
      console.error('Error registering push token:', error);
      res.status(500).json({ error: 'Failed to register push token' });
    }
  }

  /**
   * Sets the customer's email (first time) or stages a new one (change flow)
   * and emails a 4-digit verification code. Does not require the code to be
   * confirmed immediately — verification is enforced later, at checkout.
   */
  async changeEmail(req: Request, res: Response) {
    try {
      const customerId = req.customerId!;
      const { email } = req.body as { email?: string };
      if (!email || !EMAIL_REGEX.test(email.trim())) {
        return res.status(400).json({ error: 'A valid email address is required' });
      }

      const { code } = await databaseService.setOrChangeCustomerEmail(customerId, email.trim());
      notificationService.sendEmailVerificationCode(email.trim(), code).catch((err) => {
        console.error('[changeEmail] verification email send failed (non-fatal)', err);
      });

      res.json({ success: true, message: 'Verification code sent' });
    } catch (error) {
      console.error('Error changing email:', error);
      res.status(500).json({ error: 'Failed to update email' });
    }
  }

  async resendEmailVerification(req: Request, res: Response) {
    try {
      const customerId = req.customerId!;
      const { code, email } = await databaseService.resendCustomerEmailVerification(customerId);
      notificationService.sendEmailVerificationCode(email, code).catch((err) => {
        console.error('[resendEmailVerification] send failed (non-fatal)', err);
      });
      res.json({ success: true, message: 'Verification code sent' });
    } catch (error: any) {
      console.error('Error resending email verification:', error);
      if (error.message?.includes('already verified')) {
        return res.status(400).json({ error: error.message });
      }
      res.status(500).json({ error: 'Failed to resend verification code' });
    }
  }

  async verifyEmail(req: Request, res: Response) {
    try {
      const customerId = req.customerId!;
      const { code } = req.body as { code?: string };
      if (!code) {
        return res.status(400).json({ error: 'Verification code required' });
      }
      const { email } = await databaseService.verifyCustomerEmailCode(customerId, code.trim());
      res.json({ success: true, email, email_verified: true });
    } catch (error: any) {
      console.error('Error verifying email:', error);
      const msg = error?.message || 'Failed to verify email';
      const status = msg.includes('Invalid') || msg.includes('expired') ? 400 : 500;
      res.status(status).json({ error: msg });
    }
  }
}
