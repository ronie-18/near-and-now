type InvoiceItem = {
  name: string;
  quantity: number;
  price: number;
};

type InvoiceOrder = {
  id: string;
  orderNumber?: string;
  createdAt: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  shippingAddress?: string;
  subtotal?: number;
  deliveryFee?: number;
  total: number;
  items: InvoiceItem[];
};

type InvoiceAudience = 'customer' | 'shopkeeper';

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatRupees(value: number | undefined): string {
  return `Rs ${Math.round(value || 0).toLocaleString('en-IN')}`;
}

function buildInvoiceHtml(order: InvoiceOrder, audience: InvoiceAudience): string {
  const orderNumber = order.orderNumber || order.id.slice(0, 8);
  const title = audience === 'customer' ? 'Customer Invoice' : 'Shopkeeper Invoice';
  const created = new Date(order.createdAt).toLocaleString('en-IN');

  const rows = order.items
    .map((item, index) => {
      const lineTotal = Math.round(item.quantity * item.price);
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.name)}</td>
          <td>${item.quantity}</td>
          <td>${formatRupees(item.price)}</td>
          <td>${formatRupees(lineTotal)}</td>
        </tr>
      `;
    })
    .join('');

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)} - ${escapeHtml(orderNumber)}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
      h1 { margin-bottom: 8px; }
      .meta { margin-bottom: 20px; font-size: 14px; color: #374151; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 13px; text-align: left; }
      th { background: #f9fafb; }
      .totals { margin-top: 16px; width: 340px; margin-left: auto; }
      .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
      .totals .grand { font-weight: 700; font-size: 16px; border-top: 1px solid #e5e7eb; margin-top: 6px; padding-top: 8px; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">
      <div><strong>Order:</strong> ${escapeHtml(orderNumber)}</div>
      <div><strong>Generated:</strong> ${escapeHtml(created)}</div>
      <div><strong>Customer:</strong> ${escapeHtml(order.customerName || 'N/A')}</div>
      <div><strong>Email:</strong> ${escapeHtml(order.customerEmail || 'N/A')}</div>
      <div><strong>Phone:</strong> ${escapeHtml(order.customerPhone || 'N/A')}</div>
      <div><strong>Payment:</strong> ${escapeHtml(order.paymentMethod || 'N/A')} (${escapeHtml(order.paymentStatus || 'pending')})</div>
      <div><strong>Address:</strong> ${escapeHtml(order.shippingAddress || 'N/A')}</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Item</th>
          <th>Qty</th>
          <th>Unit Price</th>
          <th>Line Total</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    <div class="totals">
      <div><span>Subtotal</span><span>${formatRupees(order.subtotal)}</span></div>
      <div><span>Delivery Fee</span><span>${formatRupees(order.deliveryFee)}</span></div>
      <div class="grand"><span>Total</span><span>${formatRupees(order.total)}</span></div>
    </div>
  </body>
</html>`;
}

function downloadHtml(filename: string, html: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCustomerInvoice(order: InvoiceOrder): void {
  const orderNumber = order.orderNumber || order.id.slice(0, 8);
  const html = buildInvoiceHtml(order, 'customer');
  downloadHtml(`customer-invoice-${orderNumber}.html`, html);
}

export function downloadShopkeeperInvoice(order: InvoiceOrder): void {
  const orderNumber = order.orderNumber || order.id.slice(0, 8);
  const html = buildInvoiceHtml(order, 'shopkeeper');
  downloadHtml(`shopkeeper-invoice-${orderNumber}.html`, html);
}

