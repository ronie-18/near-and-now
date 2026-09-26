// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadCustomerInvoice, downloadShopkeeperInvoice } from './invoice';

describe('invoice downloads', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers(); // the blob URL is revoked in a setTimeout after the click
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('downloads customer invoice as html file', () => {
    const clickSpy = vi.fn();
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(() => {
      return {
        href: '',
        download: '',
        click: clickSpy,
        remove: vi.fn()
      } as unknown as HTMLAnchorElement;
    });

    const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node: any) => node);
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:invoice-url');

    downloadCustomerInvoice({
      id: 'order-1',
      createdAt: new Date().toISOString(),
      total: 100,
      items: [{ name: 'Apple', quantity: 2, price: 50 }]
    });

    expect(createElementSpy).toHaveBeenCalled();
    expect(appendSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeSpy).toHaveBeenCalled();
  });

  it('downloads shopkeeper invoice as html file', () => {
    const clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      return {
        href: '',
        download: '',
        click: clickSpy,
        remove: vi.fn()
      } as unknown as HTMLAnchorElement;
    });

    vi.spyOn(document.body, 'appendChild').mockImplementation((node: any) => node);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:invoice-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    downloadShopkeeperInvoice({
      id: 'order-2',
      createdAt: new Date().toISOString(),
      total: 200,
      items: [{ name: 'Milk', quantity: 4, price: 50 }]
    });

    expect(clickSpy).toHaveBeenCalled();
  });
});

