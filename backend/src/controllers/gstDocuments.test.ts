/**
 * Fix 4 (2026-10-02): a shop's GST certificate number must pass the GSTIN
 * check character, both when the shopkeeper uploads it and when an admin
 * approves it — 3 of the 5 approved GST numbers on file failed it.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Request } from 'express';
import { supabaseAdmin } from '../config/database.js';
import { validateDocNumber, docNumberErrorMessage, DOC_NUMBER_FORMATS } from '../utils/verificationDocuments.js';
import { reviewStoreVerificationDocument } from './adminStores.controller.js';
import { isValidGstin } from '../utils/gstin.js';
import { installFakeSupabase, mockRes, type Result } from '../test/fakeSupabase.js';

const ok = (data: unknown): Result => ({ data, error: null });
afterEach(() => vi.restoreAllMocks());

describe('GST certificate number on upload', () => {
  it('accepts a real GSTIN', () => {
    expect(validateDocNumber('gst', '29AAHCR4320E1ZJ')).toBe(true);
  });
  it('rejects a mistyped GSTIN with the right shape (the old check accepted it)', () => {
    expect(validateDocNumber('gst', '22AAAAA0000A1Z5')).toBe(false);
    expect(validateDocNumber('gst', '29AAHCR4321E1ZJ')).toBe(false);
  });
  it('the example in the error message is itself valid', () => {
    expect(isValidGstin(DOC_NUMBER_FORMATS.gst!.example)).toBe(true);
    expect(docNumberErrorMessage('gst')).toContain(DOC_NUMBER_FORMATS.gst!.example);
  });
  it('other document types are unchanged', () => {
    expect(validateDocNumber('pan_front', 'ABCDE1234F')).toBe(true);
    expect(validateDocNumber('fssai', '12345678901234')).toBe(true);
  });
});

describe('admin approving a GST certificate', () => {
  function run(number: string, status: 'approved' | 'rejected') {
    const fake = installFakeSupabase(supabaseAdmin, (c) => {
      if (c.table === 'store_verification_documents' && c.op === 'select') return ok({ id: 'd1', number });
      if (c.table === 'store_verification_documents' && c.op === 'update') return ok({ id: 'd1', status, updated_at: '2026-10-02' });
      return ok(null);
    });
    const res = mockRes();
    const req = {
      params: { id: 's1', docType: 'gst' },
      body: status === 'rejected' ? { status, rejection_reason: 'Mistyped GSTIN' } : { status },
      adminId: 'a1',
    } as unknown as Request;
    return { fake, res, done: reviewStoreVerificationDocument(req, res as never) };
  }

  it('refuses to approve a GSTIN that fails the check, and writes nothing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { fake, res, done } = run('22AAAAA0000A1Z5', 'approved');
    await done;
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toMatch(/mistyped/);
    expect(fake.on('store_verification_documents', 'update')).toHaveLength(0);
  });

  it('still allows rejecting it (how the shopkeeper is asked to fix it)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { fake, done } = run('22AAAAA0000A1Z5', 'rejected');
    await done.catch(() => {});
    expect(fake.on('store_verification_documents', 'update')[0].payload).toMatchObject({ status: 'rejected' });
  });

  it('approves a valid GSTIN as before', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { fake, done } = run('29AAHCR4320E1ZJ', 'approved');
    await done.catch(() => {});
    expect(fake.on('store_verification_documents', 'update')[0].payload).toMatchObject({ status: 'approved' });
  });
});
