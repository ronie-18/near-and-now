-- Several tables already have Supabase Realtime subscription code written
-- against them in the apps, but were never actually added to the
-- supabase_realtime publication — so those subscriptions have been silently
-- doing nothing, falling back entirely on whatever manual refetch/polling
-- exists alongside them:
--
--   stores                        - near-now-store_owner app/(tabs)/home.tsx:240
--                                    (the shopkeeper's is_approved gate itself)
--   products                      - near-now-store_owner app/(tabs)/home.tsx:233
--   customer_orders               - frontend hooks/useOrderTrackingRealtime.ts
--   store_orders                  - frontend hooks/useOrderTrackingRealtime.ts
--   order_status_history          - frontend hooks/useOrderTrackingRealtime.ts
--   admin_notifications           - admin AdminHeader.tsx + NotificationsPage.tsx
--
-- Also adding store_verification_documents (new, 2026-07-17 feature) so a
-- shopkeeper sees an admin's approve/reject the instant it happens instead
-- of waiting up to 30s for the next poll, and so multiple admin sessions /
-- the Stores table's "Updated On" column stay in sync live.

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE stores;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE products;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE customer_orders;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE store_orders;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE order_status_history;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE admin_notifications;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE store_verification_documents;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;
