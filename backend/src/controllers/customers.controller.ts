import { Request, Response } from 'express';
import { databaseService } from '../services/database.service.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class CustomersController {
  /** Query: userId (required), phone, customerPhone — merges all app_users / customers rows sharing those phones. */
  async getResolvedAddresses(req: Request, res: Response) {
    try {
      const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : '';
      const phone = typeof req.query.phone === 'string' ? req.query.phone.trim() : '';
      const customerPhone =
        typeof req.query.customerPhone === 'string' ? req.query.customerPhone.trim() : '';

      if (!userId || !UUID_RE.test(userId)) {
        return res.status(400).json({ error: 'Valid userId is required' });
      }

      const hints = [phone, customerPhone].filter(Boolean);
      const addresses = await databaseService.getCustomerSavedAddressesResolved(userId, hints);
      res.json(addresses);
    } catch (error) {
      console.error('Error fetching resolved addresses:', error);
      res.status(500).json({ error: 'Failed to fetch addresses' });
    }
  }

  async getAddresses(req: Request, res: Response) {
    try {
      const { customerId } = req.params;
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
      const addressData = {
        customer_id: customerId,
        ...req.body
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
