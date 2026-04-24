import { Request, Response, NextFunction } from 'express';
import { invoiceService } from '../services/invoice.service.js';
import { supabaseAdmin } from '../config/database.js';

// ---------------------------------------------------------------------------
// Type extensions
// ---------------------------------------------------------------------------

declare module 'express' {
  interface Request {
    customerId?: string;
    shopkeeperId?: string;
    adminId?: string;
  }
}

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

/**
 * Validates a customer by looking up their user_id via app_users.
 * Customers pass their user_id via Authorization: Bearer <user_id> or
 * ?user_id= query param (consistent with existing getSavedMethods pattern).
 */
export async function requireCustomer(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  const userId = auth?.startsWith('Bearer ')
    ? auth.slice(7)
    : String(req.query.user_id || '');

  if (!userId) {
    return res.status(401).json({ error: 'Missing user_id or Bearer token' });
  }

  const { data: user, error } = await supabaseAdmin
    .from('app_users')
    .select('id, role')
    .eq('id', userId)
    .eq('role', 'customer')
    .maybeSingle();

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or unauthorized user' });
  }

  req.customerId = (user as any).id;
  next();
}

/**
 * Validates a shopkeeper via their session token stored in app_users.
 * Uses the same Bearer token pattern as delivery partners.
 */
export async function requireShopkeeper(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' });
  }
  const token = auth.slice(7);

  // Shopkeepers authenticate with their user_id as token (per existing pattern)
  const { data: user, error } = await supabaseAdmin
    .from('app_users')
    .select('id, role')
    .eq('id', token)
    .eq('role', 'shopkeeper')
    .maybeSingle();

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or unauthorized shopkeeper token' });
  }

  req.shopkeeperId = (user as any).id;
  next();
}

/**
 * Admin auth: accepts either an admin user_id or a superadmin bypass header.
 * For simplicity this mirrors the existing admin pattern (password-based
 * in Edge Function). Here we validate against the admins table.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing admin token' });
  }
  const token = auth.slice(7);

  const { data: admin, error } = await supabaseAdmin
    .from('admins')
    .select('id, status')
    .eq('id', token)
    .eq('status', 'active')
    .maybeSingle();

  if (error || !admin) {
    return res.status(401).json({ error: 'Invalid or unauthorized admin token' });
  }

  req.adminId = (admin as any).id;
  next();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function verifyOrderBelongsToCustomer(orderId: string, customerId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('customer_orders')
    .select('id')
    .eq('id', orderId)
    .eq('customer_id', customerId)
    .maybeSingle();
  return Boolean(data);
}

async function verifyOrderBelongsToShopkeeper(orderId: string, shopkeeperId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('store_orders')
    .select('stores!inner(owner_id)')
    .eq('customer_order_id', orderId)
    .eq('stores.owner_id', shopkeeperId)
    .maybeSingle();
  return Boolean(data);
}

async function verifyOrderBelongsToRider(orderId: string, riderId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('store_orders')
    .select('id')
    .eq('customer_order_id', orderId)
    .eq('delivery_partner_id', riderId)
    .maybeSingle();
  return Boolean(data);
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export class InvoiceController {

  // GET /api/invoices/order/:orderId/customer
  async getCustomerInvoice(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const customerId = req.customerId!;

      const owns = await verifyOrderBelongsToCustomer(orderId, customerId);
      if (!owns) {
        return res.status(403).json({ error: 'Access denied: order does not belong to this customer' });
      }

      let signedUrl = await invoiceService.getSignedUrl(orderId, 'customer');
      if (!signedUrl) {
        // Auto-generate on first access
        await invoiceService.generateForOrder(orderId);
        signedUrl = await invoiceService.getSignedUrl(orderId, 'customer');
      }

      if (!signedUrl) {
        return res.status(500).json({ error: 'Failed to generate invoice' });
      }

      const record = await invoiceService.getDocumentRecord(orderId, 'customer');
      res.json({
        success: true,
        url: signedUrl,
        expires_in: 3600,
        invoice_number: (record?.invoice as any)?.invoice_number,
        invoice_date: (record?.invoice as any)?.invoice_date,
        grand_total: (record?.invoice as any)?.grand_total,
      });
    } catch (err) {
      console.error('[INVOICE] getCustomerInvoice error:', err);
      res.status(500).json({ error: 'Failed to retrieve invoice' });
    }
  }

  // GET /api/invoices/order/:orderId/store
  async getStoreInvoice(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const shopkeeperId = req.shopkeeperId!;

      const owns = await verifyOrderBelongsToShopkeeper(orderId, shopkeeperId);
      if (!owns) {
        return res.status(403).json({ error: 'Access denied: order does not belong to this store' });
      }

      let signedUrl = await invoiceService.getSignedUrl(orderId, 'store');
      if (!signedUrl) {
        await invoiceService.generateForOrder(orderId);
        signedUrl = await invoiceService.getSignedUrl(orderId, 'store');
      }

      if (!signedUrl) {
        return res.status(500).json({ error: 'Failed to generate store invoice' });
      }

      const record = await invoiceService.getDocumentRecord(orderId, 'store');
      res.json({
        success: true,
        url: signedUrl,
        expires_in: 3600,
        invoice_number: (record?.invoice as any)?.invoice_number,
        invoice_date: (record?.invoice as any)?.invoice_date,
        grand_total: (record?.invoice as any)?.grand_total,
      });
    } catch (err) {
      console.error('[INVOICE] getStoreInvoice error:', err);
      res.status(500).json({ error: 'Failed to retrieve store invoice' });
    }
  }

  // GET /api/invoices/order/:orderId/delivery  (uses requireRider)
  async getDeliveryInvoice(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const riderId = req.riderId!;

      const owns = await verifyOrderBelongsToRider(orderId, riderId);
      if (!owns) {
        return res.status(403).json({ error: 'Access denied: order not assigned to this delivery partner' });
      }

      let signedUrl = await invoiceService.getSignedUrl(orderId, 'delivery');
      if (!signedUrl) {
        await invoiceService.generateForOrder(orderId);
        signedUrl = await invoiceService.getSignedUrl(orderId, 'delivery');
      }

      if (!signedUrl) {
        return res.status(500).json({ error: 'Failed to generate delivery slip' });
      }

      const record = await invoiceService.getDocumentRecord(orderId, 'delivery');
      res.json({
        success: true,
        url: signedUrl,
        expires_in: 3600,
        invoice_number: (record?.invoice as any)?.invoice_number,
        invoice_date: (record?.invoice as any)?.invoice_date,
        grand_total: (record?.invoice as any)?.grand_total,
      });
    } catch (err) {
      console.error('[INVOICE] getDeliveryInvoice error:', err);
      res.status(500).json({ error: 'Failed to retrieve delivery slip' });
    }
  }

  // GET /api/invoices/order/:orderId/admin/:docType  (admin: all 3 types)
  async getAdminInvoice(req: Request, res: Response) {
    try {
      const { orderId, docType } = req.params;
      if (!['customer', 'store', 'delivery'].includes(docType)) {
        return res.status(400).json({ error: 'docType must be customer | store | delivery' });
      }

      let signedUrl = await invoiceService.getSignedUrl(orderId, docType as any);
      if (!signedUrl) {
        await invoiceService.generateForOrder(orderId);
        signedUrl = await invoiceService.getSignedUrl(orderId, docType as any);
      }

      if (!signedUrl) {
        return res.status(500).json({ error: 'Failed to generate invoice' });
      }

      const record = await invoiceService.getDocumentRecord(orderId, docType as any);
      res.json({
        success: true,
        url: signedUrl,
        expires_in: 3600,
        invoice_number: (record?.invoice as any)?.invoice_number,
        invoice_date: (record?.invoice as any)?.invoice_date,
        grand_total: (record?.invoice as any)?.grand_total,
      });
    } catch (err) {
      console.error('[INVOICE] getAdminInvoice error:', err);
      res.status(500).json({ error: 'Failed to retrieve invoice' });
    }
  }

  // POST /api/invoices/regenerate/:orderId  (admin only)
  async regenerateInvoice(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const result = await invoiceService.regenerateForOrder(orderId);
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[INVOICE] regenerateInvoice error:', err);
      res.status(500).json({ error: 'Failed to regenerate invoice' });
    }
  }

  // POST /api/invoices/generate/:orderId  (internal / webhook trigger)
  async generateInvoice(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const result = await invoiceService.generateForOrder(orderId);
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[INVOICE] generateInvoice error:', err);
      res.status(500).json({ error: 'Failed to generate invoice' });
    }
  }
}
