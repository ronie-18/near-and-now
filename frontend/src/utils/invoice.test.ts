// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadCustomerInvoice, downloadShopkeeperInvoice } from './invoice';

describe('invoice downloads', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('downloads customer invoice as html file', () => {
    vi.useFakeTimers();
    const clickSpy = vi.fn();
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(() => {
      return {
        href: '',
        download: '',
        click: clickSpy,
        remove: vi.fn()
      } as unknown as HTMLAnchorElement;
    });

    const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(<T extends Node>(node: T) => node);
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

    // revokeObjectURL is deferred via setTimeout (see invoice.ts) to avoid a
    // React DOM conflict — advance the fake clock past that delay before
    // asserting, instead of checking immediately (which always ran before
    // the callback fired, failing regardless of whether cleanup actually
    // happens correctly in real usage).
    vi.advanceTimersByTime(200);
    expect(revokeSpy).toHaveBeenCalled();

    vi.useRealTimers();
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

    vi.spyOn(document.body, 'appendChild').mockImplementation(<T extends Node>(node: T) => node);
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

