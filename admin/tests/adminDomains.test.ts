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
