import { Request, Response } from 'express';
import { databaseService } from '../services/database.service.js';

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
      void req.params.addressId;
      res.status(501).json({ error: 'Not implemented yet' });
    } catch (error) {
      console.error('Error updating address:', error);
      res.status(500).json({ error: 'Failed to update address' });
    }
  }

  async deleteAddress(req: Request, res: Response) {
    try {
      void req.params.addressId;
      res.status(501).json({ error: 'Not implemented yet' });
    } catch (error) {
      console.error('Error deleting address:', error);
      res.status(500).json({ error: 'Failed to delete address' });
    }
  }
}
