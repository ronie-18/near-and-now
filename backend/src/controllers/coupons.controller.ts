import { Request, Response } from 'express';
import { databaseService } from '../services/database.service.js';

export class CouponsController {
  // Get all coupons
  async getCoupons(req: Request, res: Response) {
    try {
      const coupons = await databaseService.getCoupons();
      res.json(coupons);
    } catch (error) {
      console.error('Error fetching coupons:', error);
      res.status(500).json({ error: 'Failed to fetch coupons' });
    }
  }

  // Get single coupon by ID
  async getCouponById(req: Request, res: Response) {
    try {
      const { couponId } = req.params;
      const coupon = await databaseService.getCouponById(couponId);
      res.json(coupon);
    } catch (error) {
      console.error('Error fetching coupon:', error);
      res.status(500).json({ error: 'Failed to fetch coupon' });
    }
  }

  // Create coupon
  async createCoupon(req: Request, res: Response) {
    try {
      const coupon = await databaseService.createCoupon(req.body);
      res.status(201).json(coupon);
    } catch (error: any) {
      console.error('Error creating coupon:', error);
      res.status(500).json({ error: error.message || 'Failed to create coupon' });
    }
  }

  // Update coupon
  async updateCoupon(req: Request, res: Response) {
    try {
      const { couponId } = req.params;
      const coupon = await databaseService.updateCoupon(couponId, req.body);
      res.json(coupon);
    } catch (error: any) {
      console.error('Error updating coupon:', error);
      res.status(500).json({ error: error.message || 'Failed to update coupon' });
    }
  }

  // Delete coupon
  async deleteCoupon(req: Request, res: Response) {
    try {
      const { couponId } = req.params;
      const result = await databaseService.deleteCoupon(couponId);
      res.json(result);
    } catch (error) {
      console.error('Error deleting coupon:', error);
      res.status(500).json({ error: 'Failed to delete coupon' });
    }
  }

  async validateCoupon(req: Request, res: Response) {
    try {
      const { code, customerId } = req.body;
      
      if (!code || !customerId) {
        return res.status(400).json({ error: 'Code and customerId are required' });
      }
      
      const coupon = await databaseService.validateCoupon(code, customerId);
      res.json(coupon);
    } catch (error: any) {
      console.error('Error validating coupon:', error);
      res.status(400).json({ error: error.message || 'Failed to validate coupon' });
    }
  }

  async getActiveCoupons(req: Request, res: Response) {
    try {
      const coupons = await databaseService.getActiveCoupons();
      res.json(coupons);
    } catch (error) {
      console.error('Error fetching active coupons:', error);
      res.status(500).json({ error: 'Failed to fetch active coupons' });
    }
  }
}
