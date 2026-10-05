// @vitest-environment jsdom
/**
 * Products page (admin): clickable Total / Active / Inactive cards, the
 * discounted price and MRP columns with their change buttons, and the price
 * editor. Renders the real page with the data layer stubbed.
 *
 * Uses react-dom directly (no testing-library) so React resolves to the admin
 * app's own copy and no new dependency is needed.
 *
 *   npx vitest run --root admin tests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, useContext } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ role: 'super_admin' as string | null }));

vi.mock('../src/services/supabase', () => ({ getAdminClient: () => ({}), supabase: {}, supabaseAdmin: {} }));
vi.mock('../src/services/secureAdminAuth', () => ({
  getCurrentAdmin: () => (h.role ? { id: 'a1', full_name: 'Test Admin', role: h.role, status: 'active' } : null),
}));
vi.mock('../src/services/adminService', () => ({
  getAdminProductsPaginated: vi.fn(),
  getProductStats: vi.fn(),
  deleteProduct: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  getCategories: vi.fn(),
  notifyAdminAction: vi.fn(),
}));

import * as svc from '../src/services/adminService';
import ProductsPage from '../src/pages/admin/ProductsPage';
import IdCell from '../src/components/admin/IdCell';
import { ToastProvider, ToastContext } from '../src/context/ToastContext';
import { ConfirmProvider } from '../src/context/ConfirmContext';

const mocked = vi.mocked(svc);

const DAL = {
  id: '000200d2-4f81-418e-8654-d7e59dc6b9be',
  name: 'Toor Dal 1 kg',
  category: 'Staples',
  price: 152,
  original_price: 160,
  in_stock: true,
  image: null,
  description: null,
  unit: 'kg',
};
const SOAP = { ...DAL, id: '11111111-2222-4333-8444-555555555555', name: 'Bath Soap', price: 40, original_price: 40, in_stock: false };

// The app draws toasts in a separate container; list the provider's toasts here.
function ToastProbe() {
  const ctx = useContext(ToastContext);
  return (
    <ul data-probe="toasts">
      {ctx?.toasts.map((t) => (
        <li key={t.id}>{t.message}</li>
      ))}
    </ul>
  );
}
const toastTexts = () => [...document.querySelectorAll('[data-probe="toasts"] li')].map((li) => li.textContent);

let container: HTMLDivElement;
let root: Root;

const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

async function renderPage() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <ToastProvider>
          <ConfirmProvider>
            <ProductsPage />
          </ConfirmProvider>
          <ToastProbe />
        </ToastProvider>
      </MemoryRouter>,
    );
  });
  await flush();
}

const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const byLabel = (label: string) => q<HTMLButtonElement>(`[aria-label="${label}"]`);
const card = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find((b) => b.textContent?.startsWith(label))!;
const click = async (el: Element | null) => {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await flush();
};
const typeInto = async (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
// Visible cell text: a price cell's tooltip label ("Change MRP") is in the DOM
// too, so price cells read only the amount.
const rowCells = (i: number) =>
  [...document.querySelectorAll('tbody tr')[i].querySelectorAll('td')].map(
    (td) => (td.querySelector('.tabular-nums') ?? td).textContent?.trim(),
  );
const lastListCall = () => mocked.getAdminProductsPaginated.mock.calls.at(-1)![0];
const dialog = () => q<HTMLElement>('[role="dialog"]');
const dialogInputs = () => [...dialog()!.querySelectorAll<HTMLInputElement>('input')];
const saveButton = () => [...dialog()!.querySelectorAll('button')].find((b) => b.textContent === 'Save price')!;

beforeEach(() => {
  h.role = 'super_admin';
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocked.getAdminProductsPaginated.mockReset().mockResolvedValue({ products: [DAL, SOAP] as never, total: 2 });
  mocked.getProductStats.mockReset().mockResolvedValue({ total: 43476, inStock: 43000, outOfStock: 476 });
  mocked.getCategories.mockReset().mockResolvedValue([{ id: 'c1', name: 'Staples' }] as never);
  mocked.updateProduct.mockReset();
  mocked.notifyAdminAction.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('stat cards filter the list', () => {
  it('starts on Total with no status filter, as before', async () => {
    await renderPage();
    expect(lastListCall()).toMatchObject({ page: 1, search: '', category: 'All', status: 'all' });
    expect(card('Total products').getAttribute('aria-pressed')).toBe('true');
    expect(card('Active').getAttribute('aria-pressed')).toBe('false');
    expect(card('Inactive').getAttribute('aria-pressed')).toBe('false');
  });

  it('Active, Inactive and Total each load exactly their products', async () => {
    await renderPage();
    await click(card('Active'));
    expect(lastListCall()).toMatchObject({ page: 1, status: 'active' });
    expect(card('Active').getAttribute('aria-pressed')).toBe('true');
    expect(card('Total products').getAttribute('aria-pressed')).toBe('false');

    await click(card('Inactive'));
    expect(lastListCall()).toMatchObject({ page: 1, status: 'inactive' });
    expect(card('Inactive').getAttribute('aria-pressed')).toBe('true');

    await click(card('Total products'));
    expect(lastListCall()).toMatchObject({ page: 1, status: 'all' });
  });

  it('a card clears the search and category so the list matches its count', async () => {
    await renderPage();
    const category = q<HTMLSelectElement>('select[aria-label="Filter by category"]')!;
    await act(async () => {
      category.value = 'Staples';
      category.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    expect(lastListCall()).toMatchObject({ category: 'Staples', status: 'all' });

    await click(card('Inactive'));
    expect(lastListCall()).toMatchObject({ category: 'All', search: '', status: 'inactive', page: 1 });
    expect(category.value).toBe('All');
  });

  it('switching a product under the Active card reloads the list', async () => {
    mocked.updateProduct.mockResolvedValue({ ...DAL, in_stock: false } as never);
    await renderPage();
    await click(card('Active'));
    const before = mocked.getAdminProductsPaginated.mock.calls.length;
    await click(byLabel(`Deactivate ${DAL.name}`));
    expect(mocked.updateProduct).toHaveBeenCalledWith(DAL.id, { in_stock: false });
    expect(mocked.getAdminProductsPaginated.mock.calls.length).toBe(before + 1);
    expect(lastListCall()).toMatchObject({ status: 'active' });
  });

  it('under Total the switch updates the row in place, as before (no reload)', async () => {
    mocked.updateProduct.mockResolvedValue({ ...DAL, in_stock: false } as never);
    await renderPage();
    const before = mocked.getAdminProductsPaginated.mock.calls.length;
    await click(byLabel(`Deactivate ${DAL.name}`));
    expect(mocked.getAdminProductsPaginated.mock.calls.length).toBe(before);
  });
});

describe('discounted price and MRP columns', () => {
  it('shows both prices in their own columns', async () => {
    await renderPage();
    const headers = [...document.querySelectorAll('thead th')].map((th) => th.textContent?.trim());
    expect(headers).toEqual(['ID', 'Product', 'Category', 'Discounted price', 'MRP', 'Status', 'Actions']);
    const cells = rowCells(0);
    expect(cells[3]).toBe('₹152');
    expect(cells[4]).toBe('₹160');
  });

  for (const role of ['super_admin', 'admin']) {
    it(`${role} gets a change button on each price`, async () => {
      h.role = role;
      await renderPage();
      expect(byLabel(`Change discounted price of ${DAL.name}`)).toBeTruthy();
      expect(byLabel(`Change MRP of ${DAL.name}`)).toBeTruthy();
    });
  }

  for (const role of ['manager', 'viewer', null]) {
    it(`${role ?? 'no session'} sees the prices but no change buttons`, async () => {
      h.role = role;
      await renderPage();
      expect(document.body.textContent).toContain('₹152');
      expect(document.querySelector('[aria-label^="Change discounted price"]')).toBeNull();
      expect(document.querySelector('[aria-label^="Change MRP"]')).toBeNull();
    });
  }

  it('the ID wraps on this page; other pages keep the one-line ID', async () => {
    await renderPage();
    const idCell = document.querySelector('tbody tr td')!.firstElementChild!;
    expect(idCell.className).not.toContain('whitespace-nowrap');
    const idText = idCell.firstElementChild!;
    expect(idText.textContent).toBe(DAL.id);
    expect(idText.className).toContain('[overflow-wrap:anywhere]');
  });
});

describe('price editor', () => {
  it('opens on the clicked field with the current prices', async () => {
    await renderPage();
    await click(byLabel(`Change MRP of ${DAL.name}`));
    expect(dialog()!.textContent).toContain('Change price');
    expect(dialog()!.textContent).toContain(`${DAL.name}. The new price applies in every store.`);
    const [price, mrp] = dialogInputs();
    expect(price.value).toBe('152');
    expect(mrp.value).toBe('160');
    expect(document.activeElement).toBe(mrp);
  });

  it('saves both prices, updates the row and notifies admins', async () => {
    mocked.updateProduct.mockResolvedValue({ ...DAL, price: 170, original_price: 180 } as never);
    await renderPage();
    await click(byLabel(`Change discounted price of ${DAL.name}`));
    const [price, mrp] = dialogInputs();
    expect(document.activeElement).toBe(price);
    await typeInto(price, '170');
    await typeInto(mrp, '180');
    await click(saveButton());

    expect(mocked.updateProduct).toHaveBeenCalledTimes(1);
    expect(mocked.updateProduct).toHaveBeenCalledWith(DAL.id, { price: 170, original_price: 180 });
    expect(dialog()).toBeNull();
    const cells = rowCells(0);
    expect(cells[3]).toBe('₹170');
    expect(cells[4]).toBe('₹180');
    expect(mocked.notifyAdminAction).toHaveBeenCalledWith(
      'changed the price of',
      'Toor Dal 1 kg: ₹152 (MRP ₹160) to ₹170 (MRP ₹180)',
      { product_id: DAL.id, product_name: DAL.name, old_price: 152, new_price: 170, old_mrp: 160, new_mrp: 180 },
    );
    expect(toastTexts()).toEqual(['"Toor Dal 1 kg" now sells at ₹170 (MRP ₹180).']);
  });

  it('blank MRP saves as no discount', async () => {
    mocked.updateProduct.mockResolvedValue({ ...DAL, price: 155, original_price: 155 } as never);
    await renderPage();
    await click(byLabel(`Change discounted price of ${DAL.name}`));
    const [price, mrp] = dialogInputs();
    await typeInto(price, '155');
    await typeInto(mrp, '');
    await click(saveButton());
    expect(mocked.updateProduct).toHaveBeenCalledWith(DAL.id, { price: 155, original_price: 155 });
  });

  it('refuses a discounted price above the MRP without saving', async () => {
    await renderPage();
    await click(byLabel(`Change discounted price of ${DAL.name}`));
    const [price] = dialogInputs();
    await typeInto(price, '170');
    await click(saveButton());
    expect(mocked.updateProduct).not.toHaveBeenCalled();
    expect(dialog()!.textContent).toContain('MRP must be at least the discounted price');
  });

  it('closes without writing when nothing changed', async () => {
    await renderPage();
    await click(byLabel(`Change MRP of ${DAL.name}`));
    await click(saveButton());
    expect(mocked.updateProduct).not.toHaveBeenCalled();
    expect(mocked.notifyAdminAction).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });

  it('keeps the editor open with a readable reason when the save fails', async () => {
    mocked.updateProduct.mockRejectedValue({ code: '23514', message: 'violates check constraint "check_discounted_price"' });
    await renderPage();
    await click(byLabel(`Change MRP of ${DAL.name}`));
    const [, mrp] = dialogInputs();
    await typeInto(mrp, '170');
    await click(saveButton());
    expect(dialog()!.textContent).toContain('The discounted price cannot be higher than the MRP.');
    const cells = rowCells(0);
    expect(cells[4]).toBe('₹160');
    expect(mocked.notifyAdminAction).not.toHaveBeenCalled();
  });

  it('a price-sorted list reloads after a change', async () => {
    mocked.updateProduct.mockResolvedValue({ ...DAL, price: 150, original_price: 160 } as never);
    await renderPage();
    const sort = q<HTMLSelectElement>('select[aria-label="Sort by"]')!;
    await act(async () => {
      sort.value = 'price:asc';
      sort.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    const before = mocked.getAdminProductsPaginated.mock.calls.length;
    await click(byLabel(`Change discounted price of ${DAL.name}`));
    await typeInto(dialogInputs()[0], '150');
    await click(saveButton());
    expect(mocked.getAdminProductsPaginated.mock.calls.length).toBe(before + 1);
  });
});

describe('IdCell default (every other page)', () => {
  it('renders exactly as before', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(<IdCell id={DAL.id} prefix="#" />);
    });
    expect(container.innerHTML).toMatchSnapshot();
  });
});
