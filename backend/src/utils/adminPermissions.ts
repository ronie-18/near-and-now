export type AdminRole = 'super_admin' | 'admin' | 'manager' | 'viewer';

/**
 * Mirrors admin/src/services/adminAuthService.ts's ROLE_PERMISSIONS — keep both
 * in sync when adding a new resource category. This is the backend's
 * authoritative copy: server-side enforcement always computes permissions
 * from role here, live, rather than trusting the `admins.permissions` column.
 * That column is only ever populated once at admin-creation time (from
 * whichever version of this taxonomy existed then) and silently drifts as new
 * resource categories are added later — exactly what happened when coupons/
 * delivery_partners/store_verification/invoices/notifications/payments were
 * added here: every already-existing admin's stored `permissions` predates
 * them. Computing from role avoids needing a backfill migration to stay correct.
 */
export const ROLE_PERMISSIONS: Record<AdminRole, string[]> = {
  super_admin: ['*'],
  admin: [
    'products.*',
    'orders.*',
    'categories.*',
    'customers.view',
    'customers.edit',
    'reports.view',
    'dashboard.view',
    'coupons.*',
    'delivery_partners.*',
    'store_verification.*',
    'invoices.*',
    'notifications.*',
    'payments.*',
    'store_products.*',
  ],
  manager: [
    'products.view',
    'products.edit',
    'orders.*',
    'categories.view',
    'customers.view',
    'reports.view',
    'dashboard.view',
    'coupons.view',
    'delivery_partners.view',
    'store_verification.view',
    'invoices.view',
    'notifications.view',
    'payments.view',
  ],
  viewer: [
    'products.view',
    'orders.view',
    'categories.view',
    'customers.view',
    'reports.view',
    'dashboard.view',
    'coupons.view',
    'delivery_partners.view',
    'store_verification.view',
    'invoices.view',
    'notifications.view',
    'payments.view',
  ],
};

export function hasPermission(role: string, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role as AdminRole] ?? [];
  if (perms.includes('*')) return true;
  if (perms.includes(permission)) return true;
  const [resource] = permission.split('.');
  return perms.includes(`${resource}.*`);
}
