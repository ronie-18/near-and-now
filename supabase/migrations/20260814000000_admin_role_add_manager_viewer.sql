-- The live `admin_role` enum only had 'super_admin'/'admin', but the app's own
-- code already assumes 4 roles: admin/src/schemas/admin.schema.ts's
-- AdminRoleSchema, adminAuthService.ts's hasPermission() (with real, distinct
-- permission sets already defined for 'manager'/'viewer'), and the backend's
-- POST /api/admin/create all accept/expect 'manager' and 'viewer'. Creating an
-- admin with either role would fail at the database level with an
-- enum-constraint error. Since the permission logic for both roles is real and
-- already built (not leftover/dead code), widen the enum to match the app's
-- intent rather than narrowing the app down to 2 roles.
alter type public.admin_role add value if not exists 'manager';
alter type public.admin_role add value if not exists 'viewer';
