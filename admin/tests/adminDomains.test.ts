/**
 * Organisation-account rules on the admin sign-in page.
 *
 *   npx vitest run --root admin tests
 */
import { describe, it, expect } from 'vitest';
import {
  parseAllowedDomains,
  emailDomain,
  isAllowedAdminEmail,
  allowedDomainsHint,
  emailPlaceholder,
  validateAdminLogin,
} from '../src/utils/adminDomains';

describe('parseAllowedDomains', () => {
  it('returns no domains when the variable is unset or blank', () => {
    expect(parseAllowedDomains(undefined)).toEqual([]);
    expect(parseAllowedDomains(null)).toEqual([]);
    expect(parseAllowedDomains('')).toEqual([]);
    expect(parseAllowedDomains('  , ')).toEqual([]);
  });

  it('splits on commas, semicolons and whitespace, lower-cases and de-duplicates', () => {
    expect(parseAllowedDomains('NearAndNow.in, ops.nearandnow.in;nearandnow.in')).toEqual([
      'nearandnow.in',
      'ops.nearandnow.in',
    ]);
  });

  it('tolerates a leading @ in the list', () => {
    expect(parseAllowedDomains('@nearandnow.in')).toEqual(['nearandnow.in']);
  });
});

describe('emailDomain', () => {
  it('reads the part after the last @', () => {
    expect(emailDomain('Jane.Doe@NearAndNow.in')).toBe('nearandnow.in');
    expect(emailDomain('odd"@"quoted@example.org')).toBe('example.org');
  });

  it('is null without a domain', () => {
    expect(emailDomain('jane')).toBeNull();
    expect(emailDomain('jane@')).toBeNull();
    expect(emailDomain('')).toBeNull();
  });
});

describe('isAllowedAdminEmail', () => {
  const allowed = ['nearandnow.in'];

  it('passes everything when no domains are configured', () => {
    expect(isAllowedAdminEmail('someone@gmail.com', [])).toBe(true);
    expect(isAllowedAdminEmail('not-an-email', [])).toBe(true);
  });

  it('accepts the allowed domain and its sub-domains, case-insensitively', () => {
    expect(isAllowedAdminEmail('jane@nearandnow.in', allowed)).toBe(true);
    expect(isAllowedAdminEmail('Jane@NEARANDNOW.IN', allowed)).toBe(true);
    expect(isAllowedAdminEmail('jane@ops.nearandnow.in', allowed)).toBe(true);
  });

  it('rejects other domains, look-alikes and addresses without a domain', () => {
    expect(isAllowedAdminEmail('jane@gmail.com', allowed)).toBe(false);
    expect(isAllowedAdminEmail('jane@nearandnow.in.evil.com', allowed)).toBe(false);
    expect(isAllowedAdminEmail('jane@notnearandnow.in', allowed)).toBe(false);
    expect(isAllowedAdminEmail('jane', allowed)).toBe(false);
  });
});

describe('copy helpers', () => {
  it('names the configured domains in the hint', () => {
    expect(allowedDomainsHint([])).toBe('Use your organisation email address.');
    expect(allowedDomainsHint(['nearandnow.in'])).toBe('Accounts on nearandnow.in only.');
    expect(allowedDomainsHint(['nearandnow.in', 'nearandnow.com'])).toBe(
      'Accounts on nearandnow.in or nearandnow.com only.',
    );
    expect(allowedDomainsHint(['a.in', 'b.in', 'c.in'])).toBe('Accounts on a.in, b.in or c.in only.');
  });

  it('builds the placeholder from the primary domain', () => {
    expect(emailPlaceholder(['nearandnow.in', 'other.in'])).toBe('firstname.lastname@nearandnow.in');
    expect(emailPlaceholder([])).toBe('firstname.lastname@yourcompany.com');
  });
});

// 2026-10-26: the form became noValidate in 5c628fd, so the browser stopped
// blocking empty / malformed submits and each one spent a rate-limited attempt.
describe('validateAdminLogin', () => {
  it('passes a complete sign-in', () => {
    expect(validateAdminLogin('admin@gmail.com', 'secret', [])).toEqual({});
    expect(validateAdminLogin('  ops@nearandnow.in ', 'secret', ['nearandnow.in'])).toEqual({});
  });

  it('asks for both fields when they are empty', () => {
    expect(validateAdminLogin('', '', [])).toEqual({ email: 'Enter your work email.', password: 'Enter your password.' });
    expect(validateAdminLogin('   ', 'x', ['nearandnow.in'])).toEqual({ email: 'Enter your work email.' });
  });

  it('rejects a malformed address before the domain rule', () => {
    expect(validateAdminLogin('admin', 'x', [])).toEqual({ email: 'Enter a valid email address.' });
    expect(validateAdminLogin('ad min@gmail.com', 'x', ['nearandnow.in'])).toEqual({ email: 'Enter a valid email address.' });
    // Same shape the browser's type="email" accepted: no dot needed after the @.
    expect(validateAdminLogin('admin@localhost', 'x', [])).toEqual({});
  });

  it('keeps the organisation-domain message', () => {
    expect(validateAdminLogin('me@gmail.com', 'x', ['nearandnow.in'])).toEqual({
      email: 'Sign-in is limited to organisation accounts on nearandnow.in.',
    });
    expect(validateAdminLogin('me@gmail.com', '', ['a.in', 'b.in'])).toEqual({
      email: 'Sign-in is limited to organisation accounts on a.in, b.in.',
      password: 'Enter your password.',
    });
  });
});
