import { Request, Response } from 'express';
import { databaseService } from '../services/database.service.js';

export class CustomersController {
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
      const { addressId } = req.params;
      res.status(501).json({ error: 'Not implemented yet' });
    } catch (error) {
      console.error('Error updating address:', error);
      res.status(500).json({ error: 'Failed to update address' });
    }
  }

  async deleteAddress(req: Request, res: Response) {
    try {
      const { addressId } = req.params;
      res.status(501).json({ error: 'Not implemented yet' });
    } catch (error) {
      console.error('Error deleting address:', error);
      res.status(500).json({ error: 'Failed to delete address' });
    }
  }
}
