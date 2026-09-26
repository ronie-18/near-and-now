import { Request, Response } from 'express';
import { databaseService } from '../services/database.service.js';
import { notificationService } from '../services/notification.service.js';
import { sendError } from '../utils/httpError.js';

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
      return sendError(res, 'CustomersController.getResolvedAddresses', 'Could not load the addresses', error);
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
      return sendError(res, 'CustomersController.getAddresses', 'Could not load the addresses', error);
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
      return sendError(res, 'CustomersController.createAddress', 'Could not create the address', error);
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
    } catch (error) {
      const notFoundMsg = error instanceof Error && error.message.includes('not found');
      return sendError(res, 'CustomersController.updateAddress', notFoundMsg ? error.message : 'Could not update the address', error, notFoundMsg ? 404 : undefined);
    }
  }

  async deleteAddress(req: Request, res: Response) {
    try {
      const { addressId } = req.params;
      const customerId = req.customerId!;
      await databaseService.deleteCustomerSavedAddress(addressId, customerId);
      res.json({ success: true });
    } catch (error) {
      return sendError(res, 'CustomersController.deleteAddress', 'Could not delete the address', error);
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
      return sendError(res, 'CustomersController.registerPushToken', 'Could not register push token', error);
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
      return sendError(res, 'CustomersController.changeEmail', 'Could not update the email', error);
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
    } catch (error) {
      const alreadyVerified = error instanceof Error && error.message.includes('already verified');
      return sendError(res, 'CustomersController.resendEmailVerification', alreadyVerified ? error.message : 'Could not resend the verification code', error, alreadyVerified ? 400 : undefined);
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
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      const isUserError = msg.includes('Invalid') || msg.includes('expired');
      return sendError(res, 'CustomersController.verifyEmail', isUserError ? msg : 'Could not verify the email code', error, isUserError ? 400 : undefined);
    }
  }
}
