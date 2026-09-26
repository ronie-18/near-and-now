import { Request, Response } from 'express';
import { databaseService } from '../services/database.service.js';
import { sendError } from '../utils/httpError.js';

export class CouponsController {
  // Get all coupons
  async getCoupons(_req: Request, res: Response) {
    try {
      const coupons = await databaseService.getCoupons();
      res.json(coupons);
    } catch (error) {
      return sendError(res, 'CouponsController.getCoupons', 'Could not load the coupons', error);
    }
  }

  // Get single coupon by ID
  async getCouponById(req: Request, res: Response) {
    try {
      const { couponId } = req.params;
      const coupon = await databaseService.getCouponById(couponId);
      res.json(coupon);
    } catch (error) {
      return sendError(res, 'CouponsController.getCouponById', 'Could not load coupon', error);
    }
  }

  // Create coupon
  async createCoupon(req: Request, res: Response) {
    try {
      const coupon = await databaseService.createCoupon(req.body);
      res.status(201).json(coupon);
    } catch (error) {
      return sendError(res, 'CouponsController.createCoupon', 'Could not create the coupon', error);
    }
  }

  // Update coupon
  async updateCoupon(req: Request, res: Response) {
    try {
      const { couponId } = req.params;
      const coupon = await databaseService.updateCoupon(couponId, req.body);
      res.json(coupon);
    } catch (error) {
      return sendError(res, 'CouponsController.updateCoupon', 'Could not update the coupon', error);
    }
  }

  // Delete coupon
  async deleteCoupon(req: Request, res: Response) {
    try {
      const { couponId } = req.params;
      const result = await databaseService.deleteCoupon(couponId);
      res.json(result);
    } catch (error) {
      return sendError(res, 'CouponsController.deleteCoupon', 'Could not delete coupon', error);
    }
  }

  async validateCoupon(req: Request, res: Response) {
    try {
      const { code, customerId, orderTotal } = req.body;

      if (!code || !customerId) {
        return res.status(400).json({ error: 'Code and customerId are required' });
      }

      const coupon = await databaseService.validateCoupon(
        code,
        customerId,
        orderTotal != null ? Number(orderTotal) : undefined
      );
      res.json(coupon);
    } catch (error) {
      // Business-rule rejections are thrown as plain Errors (expired, minimum order, already used…):
      // show them verbatim as 400. Database failures fall through to sendError's status inference.
      const isBusinessRule = error instanceof Error && !(error as { code?: unknown }).code;
      return sendError(
        res,
        'CouponsController.validateCoupon',
        isBusinessRule ? error.message : 'Could not validate the coupon',
        error,
        isBusinessRule ? 400 : undefined
      );
    }
  }

  async getActiveCoupons(_req: Request, res: Response) {
    try {
      const coupons = await databaseService.getActiveCoupons();
      res.json(coupons);
    } catch (error) {
      return sendError(res, 'CouponsController.getActiveCoupons', 'Could not load active coupons', error);
    }
  }
}
