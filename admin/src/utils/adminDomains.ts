/**
 * Organisation-account rules for the admin sign-in page.
 *
 * `VITE_ADMIN_ALLOWED_DOMAINS` (comma-separated, e.g. `nearandnow.in`) limits
 * sign-in to accounts on those domains. When it is unset or empty nothing is
 * enforced: the three admin accounts seeded by the migrations are personal
 * Gmail addresses, so a hard-coded default would lock every existing admin out
 * on the first deploy. Set the variable once the admins have organisation
 * mailboxes.
 *
 * This is a client-side gate only: it keeps a mistyped or personal address from
 * ever reaching POST /api/admin/login, but the server does not check domains.
 */

/** Lower-cased, de-duplicated domains from a comma- or space-separated list. */
export function parseAllowedDomains(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(/[\s,;]+/)) {
    const domain = part.trim().toLowerCase().replace(/^@+/, '');
    if (domain) seen.add(domain);
  }
  return [...seen];
}

/** The part after the last `@`, lower-cased, or null when there is none. */
export function emailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase();
}

/**
 * True when `email` is on one of `allowed`, or when the list is empty (no
 * restriction configured). A sub-domain of an allowed domain also passes
 * (`ops.nearandnow.in` for `nearandnow.in`).
 */
export function isAllowedAdminEmail(email: string, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  const domain = emailDomain(email);
  if (!domain) return false;
  return allowed.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/** Helper copy under the email field: names the domains when they are known. */
export function allowedDomainsHint(allowed: string[]): string {
  if (allowed.length === 0) return 'Use your organisation email address.';
  if (allowed.length === 1) return `Accounts on ${allowed[0]} only.`;
  return `Accounts on ${allowed.slice(0, -1).join(', ')} or ${allowed[allowed.length - 1]} only.`;
}

/** Placeholder for the email field, built from the primary allowed domain. */
export function emailPlaceholder(allowed: string[]): string {
  return allowed.length > 0 ? `firstname.lastname@${allowed[0]}` : 'firstname.lastname@yourcompany.com';
}

/**
 * Inline field errors for the sign-in form, or {} when it may be submitted.
 * The form is `noValidate` (errors render inline, not as browser bubbles), so
 * this stands in for the `required` / `type="email"` checks the browser no
 * longer runs: without it an empty or malformed submit went to POST
 * /api/admin/login and spent one of the IP's 10 rate-limited attempts. The
 * email shape matches the browser's own (no dot required after the @).
 */
export function validateAdminLogin(
  email: string,
  password: string,
  allowed: string[],
): { email?: string; password?: string } {
  const errors: { email?: string; password?: string } = {};
  const trimmed = email.trim();
  if (!trimmed) {
    errors.email = 'Enter your work email.';
  } else if (!/^[^\s@]+@[^\s@]+$/.test(trimmed)) {
    errors.email = 'Enter a valid email address.';
  } else if (!isAllowedAdminEmail(trimmed, allowed)) {
    errors.email = `Sign-in is limited to organisation accounts on ${allowed.join(', ')}.`;
  }
  if (!password) errors.password = 'Enter your password.';
  return errors;
}
