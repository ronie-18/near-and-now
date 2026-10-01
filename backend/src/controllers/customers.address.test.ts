/**
 * Audit #13 (2026-10-02): saved-address writes keep only allowlisted fields
 * (backlog item 10) and only a bounded, plain-object google_place_data.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Request } from 'express';
import { pickAddressFields, MAX_GOOGLE_PLACE_DATA_BYTES, CustomersController } from './customers.controller.js';
import { databaseService } from '../services/database.service.js';
import { mockRes } from '../test/fakeSupabase.js';

const realPlace = {
  place_id: 'ChIJ123',
  name: 'Park Street',
  formatted_address: 'Park Street, Kolkata, West Bengal 700016, India',
  address_components: [{ long_name: 'Kolkata', short_name: 'Kolkata', types: ['locality', 'political'] }],
  geometry: { location: { lat: 22.55, lng: 88.35 } },
};

afterEach(() => vi.restoreAllMocks());

describe('pickAddressFields', () => {
  it('keeps a realistic Google place object', () => {
    expect(pickAddressFields({ address: 'x', google_place_data: realPlace })).toEqual({ address: 'x', google_place_data: realPlace });
  });

  it('drops an oversized blob but keeps the rest of the address', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const huge = { junk: 'x'.repeat(MAX_GOOGLE_PLACE_DATA_BYTES) };
    expect(pickAddressFields({ address: 'x', city: 'Kolkata', google_place_data: huge })).toEqual({
      address: 'x', city: 'Kolkata', google_place_data: null,
    });
  });

  it.each([['an array', [1, 2, 3]], ['a string', 'not an object'], ['a number', 42]])('drops %s', (_label, value) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(pickAddressFields({ google_place_data: value }).google_place_data).toBeNull();
  });

  it('passes an explicit null through and leaves an absent field absent', () => {
    expect(pickAddressFields({ google_place_data: null })).toEqual({ google_place_data: null });
    expect('google_place_data' in pickAddressFields({ address: 'x' })).toBe(false);
  });

  it('still drops non-allowlisted fields', () => {
    expect(pickAddressFields({ address: 'x', id: 'forged', customer_id: 'other', created_at: 'then' })).toEqual({ address: 'x' });
  });
});

describe('address endpoints use it', () => {
  it('updateAddress drops an oversized google_place_data instead of storing it', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const spy = vi.spyOn(databaseService, 'updateCustomerSavedAddress').mockResolvedValue({ id: 'a1' } as never);
    const res = mockRes();
    await new CustomersController().updateAddress(
      { params: { addressId: 'a1' }, customerId: 'c1', body: { landmark: 'Near the park', google_place_data: { junk: 'x'.repeat(20_000) } } } as unknown as Request,
      res as never
    );
    expect(spy).toHaveBeenCalledWith('a1', 'c1', { landmark: 'Near the park', google_place_data: null });
  });
});
