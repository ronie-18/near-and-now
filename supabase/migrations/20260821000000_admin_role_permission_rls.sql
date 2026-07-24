-- =============================================================================
-- Extends admin RLS from "any authenticated admin session" to "role actually
-- has this permission" for the two tables the admin panel writes to directly
-- (master_products, categories via admin/src/services/adminService.ts's
-- getAdminClient() calls) rather than through a backend route. Every other
-- admin write action already got role-aware enforcement via the new
-- requirePermission() Express middleware (backend/src/middleware/
-- adminAuth.middleware.ts) — these two are the only ones that bypass the
-- backend entirely, so RLS is the only layer that can enforce role here.
--
-- is_admin_authenticated() only ever proved "some valid admin session, any
-- role" — a `viewer`-role admin has always been able to devtools/curl a
-- direct write to these two tables (or anything else behind that same
-- policy) even though the UI itself never lets them attempt it. This closes
-- that specific gap for products/categories; the broader "should every
-- admin-facing table's write policy be role-checked, not just
-- session-checked" question is out of scope for this pass — see
-- bug_fixes_2026-07-23.md.
-- =============================================================================

-- Mirrors backend/src/utils/adminPermissions.ts's ROLE_PERMISSIONS and
-- hasPermission() — keep all three in sync (this file, the backend copy, and
-- admin/src/services/adminAuthService.ts's frontend copy) when adding a new
-- resource category. RLS can't call out to application code, so this has to
-- be its own copy; there's no way around the duplication.
CREATE OR REPLACE FUNCTION public.admin_role_has_permission(p_role TEXT, p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_perms TEXT[];
  v_resource TEXT;
BEGIN
  v_perms := CASE p_role
    WHEN 'super_admin' THEN ARRAY['*']
    WHEN 'admin' THEN ARRAY[
      'products.*', 'orders.*', 'categories.*', 'customers.view', 'customers.edit',
      'reports.view', 'dashboard.view', 'coupons.*', 'delivery_partners.*',
      'store_verification.*', 'invoices.*', 'notifications.*', 'payments.*'
    ]
    WHEN 'manager' THEN ARRAY[
      'products.view', 'products.edit', 'orders.*', 'categories.view', 'customers.view',
      'reports.view', 'dashboard.view', 'coupons.view', 'delivery_partners.view',
      'store_verification.view', 'invoices.view', 'notifications.view', 'payments.view'
    ]
    WHEN 'viewer' THEN ARRAY[
      'products.view', 'orders.view', 'categories.view', 'customers.view',
      'reports.view', 'dashboard.view', 'coupons.view', 'delivery_partners.view',
      'store_verification.view', 'invoices.view', 'notifications.view', 'payments.view'
    ]
    ELSE ARRAY[]::TEXT[]
  END;

  IF '*' = ANY(v_perms) THEN RETURN TRUE; END IF;
  IF p_permission = ANY(v_perms) THEN RETURN TRUE; END IF;

  v_resource := split_part(p_permission, '.', 1);
  RETURN (v_resource || '.*') = ANY(v_perms);
END;
$$;

-- Same header-read pattern as is_admin_authenticated(), plus the role lookup.
CREATE OR REPLACE FUNCTION public.admin_has_permission(p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_token TEXT;
  v_role TEXT;
BEGIN
  BEGIN
    v_token := (current_setting('request.headers', true)::jsonb) ->> 'x-admin-token';
  EXCEPTION WHEN OTHERS THEN
    RETURN FALSE;
  END;

  IF v_token IS NULL OR v_token = '' THEN
    RETURN FALSE;
  END IF;

  SELECT a.role INTO v_role
  FROM public.admin_sessions s
  JOIN public.admins a ON a.id = s.admin_id
  WHERE s.session_token = v_token
    AND s.expires_at > NOW()
    AND s.logged_out_at IS NULL
  LIMIT 1;

  IF v_role IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN public.admin_role_has_permission(v_role, p_permission);
END;
$$;

-- master_products / categories: split the existing FOR ALL admin_full_access
-- into an open SELECT (every admin role can already read everything — no
-- change) and a permission-gated write. Public/anon read policies on both
-- tables are untouched (customers/shopkeepers browsing the catalog).
DROP POLICY IF EXISTS admin_full_access ON public.master_products;
CREATE POLICY "admin_read" ON public.master_products
  FOR SELECT USING (public.is_admin_authenticated());
CREATE POLICY "admin_write_requires_permission" ON public.master_products
  FOR INSERT WITH CHECK (public.admin_has_permission('products.edit'));
CREATE POLICY "admin_update_requires_permission" ON public.master_products
  FOR UPDATE USING (public.admin_has_permission('products.edit')) WITH CHECK (public.admin_has_permission('products.edit'));
CREATE POLICY "admin_delete_requires_permission" ON public.master_products
  FOR DELETE USING (public.admin_has_permission('products.edit'));

DROP POLICY IF EXISTS admin_full_access ON public.categories;
CREATE POLICY "admin_read" ON public.categories
  FOR SELECT USING (public.is_admin_authenticated());
CREATE POLICY "admin_write_requires_permission" ON public.categories
  FOR INSERT WITH CHECK (public.admin_has_permission('categories.edit'));
CREATE POLICY "admin_update_requires_permission" ON public.categories
  FOR UPDATE USING (public.admin_has_permission('categories.edit')) WITH CHECK (public.admin_has_permission('categories.edit'));
CREATE POLICY "admin_delete_requires_permission" ON public.categories
  FOR DELETE USING (public.admin_has_permission('categories.edit'));
