-- trg_notify_admin_new_user fires on every app_users insert regardless of
-- role, but notify_admin_new_user() hardcoded "New Customer Registered" —
-- so a shopkeeper or delivery-partner signup was mislabeled as a customer
-- signup in the admin notification feed. Make the title/message role-aware;
-- keep type='new_user' unchanged so the existing admin UI filter/icon
-- ("Customers" button, Users icon) keeps working without further changes.

CREATE OR REPLACE FUNCTION public.notify_admin_new_user()
RETURNS trigger
LANGUAGE plpgsql
AS $f$
DECLARE
  v_role_label TEXT;
BEGIN
  v_role_label := CASE NEW.role
    WHEN 'shopkeeper' THEN 'Store Owner'
    WHEN 'delivery_partner' THEN 'Delivery Partner'
    ELSE 'Customer'
  END;

  INSERT INTO public.admin_notifications (type, title, message, data)
  VALUES (
    'new_user',
    'New ' || v_role_label || ' Registered',
    COALESCE(NEW.name, NEW.email, NEW.phone, 'Someone') || ' just created a ' || lower(v_role_label) || ' account',
    jsonb_build_object('user_id', NEW.id, 'name', NEW.name, 'email', NEW.email, 'phone', NEW.phone, 'role', NEW.role)
  );
  RETURN NEW;
END;
$f$;
