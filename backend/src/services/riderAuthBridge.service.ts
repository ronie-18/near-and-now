import { createServiceRoleClient } from '../config/database.js';

// Supabase Realtime's postgres_changes RLS check only ever evaluates auth.uid()
// from a real Supabase Auth session — it can't be scoped using this app's
// actual auth model (custom phone-OTP + our own session_token column). To let
// a rider subscribe to their own delivery_partners row (and only their own)
// via Realtime, this mints them a real, narrowly-scoped Supabase Auth session
// in parallel with their normal login. It's used solely to satisfy auth.uid()
// for the partner_own_record RLS policy — never for the app's own API auth,
// which stays entirely on the existing session_token scheme untouched by this.
//
// The synthetic email below is never sent anywhere; it exists only as a
// stable identity key inside auth.users, one per delivery_partners row, so no
// real phone number or other PII is duplicated into auth.users.
function riderAuthEmail(deliveryPartnerUserId: string): string {
  return `rider-${deliveryPartnerUserId}@riders.nearandnow.internal`;
}

export async function mintRiderRealtimeSession(
  deliveryPartnerUserId: string
): Promise<{ access_token: string; refresh_token: string } | null> {
  // A throwaway client, never the shared `supabaseAdmin` singleton — see
  // createServiceRoleClient's doc comment. `auth.verifyOtp` below logs
  // whichever client instance it's called on into a real session, and that
  // must not leak into the app-wide admin client every other request reuses.
  const supabaseAdmin = createServiceRoleClient();
  try {
    const { data: partner, error: fetchError } = await supabaseAdmin
      .from('delivery_partners')
      .select('auth_user_id')
      .eq('user_id', deliveryPartnerUserId)
      .maybeSingle();
    if (fetchError) throw fetchError;

    let authUserId: string | null | undefined = (partner as { auth_user_id?: string | null } | null)?.auth_user_id;
    const email = riderAuthEmail(deliveryPartnerUserId);

    if (!authUserId) {
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { purpose: 'delivery_partner_realtime_bridge', delivery_partner_user_id: deliveryPartnerUserId },
      });

      if (createError || !created?.user) {
        // Most likely cause: a concurrent login for the same rider already
        // created this auth user (createUser races on the unique email).
        // Re-check the column instead of trying to recover the id another way.
        const { data: recheck } = await supabaseAdmin
          .from('delivery_partners')
          .select('auth_user_id')
          .eq('user_id', deliveryPartnerUserId)
          .maybeSingle();
        authUserId = (recheck as { auth_user_id?: string | null } | null)?.auth_user_id;
        if (!authUserId) throw createError ?? new Error('createUser returned no user');
      } else {
        authUserId = created.user.id;
        await supabaseAdmin
          .from('delivery_partners')
          .update({ auth_user_id: authUserId })
          .eq('user_id', deliveryPartnerUserId);
      }
    }

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (linkError) throw linkError;

    const hashedToken = linkData?.properties?.hashed_token;
    if (!hashedToken) throw new Error('generateLink returned no hashed_token');

    const { data: verifyData, error: verifyError } = await supabaseAdmin.auth.verifyOtp({
      type: 'magiclink',
      token_hash: hashedToken,
    });
    if (verifyError) throw verifyError;
    if (!verifyData.session) throw new Error('verifyOtp returned no session');

    return {
      access_token: verifyData.session.access_token,
      refresh_token: verifyData.session.refresh_token,
    };
  } catch (err) {
    // Non-fatal by design: the rider still logs in and uses the app
    // normally via the existing session_token scheme regardless of this.
    // Losing this only means home.tsx/pending-verification.tsx fall back
    // to their existing 10s poll instead of getting realtime push.
    console.error('mintRiderRealtimeSession failed (non-fatal):', err);
    return null;
  }
}
