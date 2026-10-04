import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { authenticateAdmin } from '../../services/adminAuthService';
import { setAdminSession } from '../../services/adminSession';
import { isAdminAuthenticated } from '../../services/secureAdminAuth';
import { Alert, Button, Checkbox, FormField, IconButton, Input } from '../../components/ui';
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
 * Standalone sign-in page. Mounted at /login in App.tsx, outside
 * AdminRoutes/AdminLayout, so it must stay a full-page layout with no shell.
 */
const AdminLoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
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

  return (
    <div className="flex min-h-screen bg-white">
      {/* Brand panel (desktop only). Plain text, not headings: the page's one
          heading is the "Sign in" h1 in the form panel. */}
      <aside className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-brand-900 p-10 text-white">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white p-1.5">
            <img src={logoUrl} alt="" className="h-full w-full object-contain" />
          </span>
          <span className="text-base font-semibold text-white">Near &amp; Now</span>
        </div>

        <div className="max-w-md">
          <p className="text-3xl font-semibold text-white">Admin console</p>
          <p className="mt-3 text-sm text-brand-200">
            Manage orders, stores, riders and the catalogue from one place.
          </p>
        </div>

        <p className="text-xs text-brand-300">Near &amp; Now Admin</p>
      </aside>

      {/* Form panel */}
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white p-1.5">
              <img src={logoUrl} alt="" className="h-full w-full object-contain" />
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">Near &amp; Now</p>
              <p className="text-xs text-gray-500">Admin console</p>
            </div>
          </div>

          <h1 className="text-2xl font-semibold text-gray-900">Sign in</h1>
          <p className="mt-1 text-sm text-gray-500">Use your administrator credentials.</p>

          {error ? (
            <Alert tone="danger" className="mt-6">
              {error}
            </Alert>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <FormField label="Email" htmlFor="email">
              <Input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                autoFocus
                placeholder="admin@example.com"
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
      </main>
    </div>
  );
};

export default AdminLoginPage;
