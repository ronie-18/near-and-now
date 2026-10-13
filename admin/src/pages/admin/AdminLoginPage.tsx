import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, Building2, Eye, EyeOff, Lock } from 'lucide-react';
import { authenticateAdmin } from '../../services/adminAuthService';
import { setAdminSession } from '../../services/adminSession';
import { isAdminAuthenticated } from '../../services/secureAdminAuth';
import { Alert, Badge, Button, Checkbox, FormField, IconButton, Input } from '../../components/ui';
import {
  allowedDomainsHint,
  emailPlaceholder,
  isAllowedAdminEmail,
  parseAllowedDomains,
} from '../../utils/adminDomains';
// Was the repo-root near_now_image.png (781KB, 1315x1196px) displayed at
// 64x64px — a properly-sized/compressed copy (9KB) is used instead. Found
// 2026-08-13 during an optimization pass.
import logoUrl from '../../assets/login-logo.png';

/**
 * Only an in-app path may be the post-login destination. AdminAuthGuard sets
 * `state.from` from location.pathname, but a crafted link such as
 * https://admin.host//evil.example/ yields a pathname of "//evil.example/",
 * and react-router falls back to window.location.assign() when pushState
 * rejects a cross-origin URL — an open redirect right after sign-in. Anything
 * that is not a single-slash-rooted path falls back to the dashboard.
 */
const safeReturnPath = (value: unknown): string =>
  typeof value === 'string' && /^\/(?!\/)/.test(value) ? value : '/';

/**
 * Organisation domains that may sign in. Read once at module load: the value
 * is baked into the bundle by Vite, so it cannot change at runtime anyway.
 * Empty = no restriction (see utils/adminDomains.ts for why that is the
 * default).
 */
const ALLOWED_DOMAINS = parseAllowedDomains(import.meta.env.VITE_ADMIN_ALLOWED_DOMAINS as string | undefined);

/**
 * Standalone sign-in page. Mounted at /login in App.tsx, outside
 * AdminRoutes/AdminLayout, so it must stay a full-page layout with no shell.
 *
 * Layout (2026-10-13): a dark top band with the wordmark, a single centred
 * card on the grey canvas, and a legal notice under it — the restrained
 * enterprise pattern rather than the marketing split-screen. The one brand
 * colour stays on the primary button and the focus rings.
 */
const AdminLoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // AdminAuthGuard redirects here with `state.from` (path + search) when a
  // deep link or an expired session bounced the admin, so they land back on
  // the page they wanted instead of always on the dashboard.
  const from = safeReturnPath((location.state as { from?: unknown } | null)?.from);

  // The mount-time session check is kept in a ref so handleSubmit can await
  // it: while a stored token is still being validated against admin_sessions
  // the form is fully interactive, and a submit in that window used to open a
  // second session row for an admin who was about to be redirected anyway.
  const sessionCheckRef = useRef<Promise<boolean>>(Promise.resolve(false));

  // Previously only redirected post-submit — an already-logged-in admin
  // navigating back here (browser back, stale tab, bookmark) saw the login
  // form again instead of being bounced to the dashboard.
  useEffect(() => {
    let cancelled = false;
    // isAdminAuthenticated() fails open on Supabase errors; the catch only
    // covers a storage-access exception so it can neither surface as an
    // unhandled rejection nor leave handleSubmit waiting forever.
    const check = isAdminAuthenticated().catch(() => false);
    sessionCheckRef.current = check;
    check.then((authed) => {
      if (authed && !cancelled) navigate(from, { replace: true });
    });
    return () => { cancelled = true; };
  }, [navigate, from]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setEmailError('');

    // Organisation-account gate. Checked before the network call so a
    // personal or mistyped address never counts against the server-side
    // rate limit (10 attempts per email per 15 minutes).
    if (!isAllowedAdminEmail(email.trim(), ALLOWED_DOMAINS)) {
      setEmailError(
        ALLOWED_DOMAINS.length === 1
          ? `Sign-in is limited to organisation accounts on ${ALLOWED_DOMAINS[0]}.`
          : `Sign-in is limited to organisation accounts on ${ALLOWED_DOMAINS.join(', ')}.`,
      );
      return;
    }

    setLoading(true);

    try {
      // A live session found by the mount-time check means the redirect above
      // is already in flight — do not stack a second admin_sessions row on it.
      if (await sessionCheckRef.current) {
        navigate(from, { replace: true });
        return;
      }

      // Rate limiting (including "too many attempts") is enforced server-side
      // (express-rate-limit on POST /api/admin/login) — a client-side-only
      // check here was trivially bypassed by a page refresh and gave a false
      // sense of protection. authenticateAdmin now throws with the server's
      // real message (including its rate-limit message) on any non-2xx
      // response, caught below; a `null` result here means an actual network
      // failure, not a login failure.
      const result = await authenticateAdmin(email, password);

      if (!result) {
        setError('Could not reach the server. Please check your connection and try again.');
        return;
      }

      // Store admin data and token — localStorage if "Keep me signed in" is
      // checked (survives tab/browser close), sessionStorage otherwise.
      setAdminSession(result.admin, result.token, Date.now() + 12 * 60 * 60 * 1000, rememberMe);

      // `replace` so Back after signing in does not return to /login (which
      // would run the session check and bounce forward again with a flash).
      navigate(from, { replace: true });
    } catch (err: unknown) {
      // Full error (message/stack/email) only ever goes to the dev console —
      // was previously logged unconditionally on every login attempt/failure,
      // in production too.
      if (import.meta.env.DEV) {
        console.error('Login error:', err);
      }
      const message = err instanceof Error ? err.message : '';
      setError(message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Top band: wordmark left, connection notice right. Plain text, not a
          heading — the page's one heading is the "Sign in" h1 in the card. */}
      <header className="border-b border-gray-800 bg-gray-900">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-white p-1">
              <img src={logoUrl} alt="" className="h-full w-full object-contain" />
            </span>
            <span className="truncate text-sm font-semibold text-white">Near &amp; Now</span>
            <span className="hidden h-4 w-px bg-gray-700 sm:block" aria-hidden="true" />
            <span className="hidden text-xs font-medium text-gray-300 sm:block">Enterprise Console</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Secure sign-in</span>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-md">
          <div className="rounded-md border border-gray-200 bg-white shadow-card">
            <div className="border-b border-gray-200 px-6 py-5 sm:px-8">
              <h1 className="text-xl font-semibold text-gray-900">Sign in</h1>
              <p className="mt-1 text-sm text-gray-500">Use your organisation account to continue.</p>
            </div>

            <div className="px-6 py-6 sm:px-8">
              {error ? (
                <Alert tone="danger" className="mb-5">
                  {error}
                </Alert>
              ) : null}

              <form onSubmit={handleSubmit} noValidate className="space-y-5">
                <FormField
                  label="Work email"
                  htmlFor="email"
                  hint={allowedDomainsHint(ALLOWED_DOMAINS)}
                  error={emailError || undefined}
                >
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) setEmailError('');
                    }}
                    required
                    invalid={Boolean(emailError)}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    autoFocus
                    placeholder={emailPlaceholder(ALLOWED_DOMAINS)}
                    leftIcon={<Building2 aria-hidden="true" />}
                  />
                </FormField>

                {/* Show/hide follows the APG toggle-button pattern: a fixed name
                    plus aria-pressed. A name that flips with the state would read
                    as "Hide password, pressed", which contradicts itself. */}
                <FormField label="Password" htmlFor="password">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="pr-11"
                    rightElement={
                      <IconButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label="Show password"
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                      </IconButton>
                    }
                  />
                </FormField>

                <Checkbox
                  id="rememberMe"
                  name="rememberMe"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  label="Keep me signed in on this device"
                />

                <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
                  Sign in
                </Button>
              </form>
            </div>

            {/* Environment notice. Inactive by design: it is a status panel,
                not a control, so it is not focusable and carries aria-disabled
                for assistive tech. */}
            <div className="border-t border-gray-200 bg-gray-50 px-6 py-4 sm:px-8">
              <div
                aria-disabled="true"
                className="flex cursor-not-allowed select-none items-start gap-3 rounded-md border border-dashed border-gray-300 bg-white px-4 py-3 opacity-60"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-gray-600" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-gray-800">Stage lockdown</p>
                    <Badge tone="neutral" size="sm">
                      Inactive
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Staging access is locked. Production sign-in only.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-6 text-center text-xs leading-5 text-gray-500">
            This system is restricted to authorised Near &amp; Now personnel. Activity is monitored and
            logged. Unauthorised access or use is prohibited and may be subject to legal action.
          </p>
          <p className="mt-2 text-center text-xs text-gray-400">
            © {year} Near &amp; Now Digital Commerce · Need access? Contact your administrator.
          </p>
        </div>
      </main>
    </div>
  );
};

export default AdminLoginPage;
