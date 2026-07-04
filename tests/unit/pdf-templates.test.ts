/**
 * PDF template unit tests (#34).
 *
 * Pins the two invariants that matter:
 * - Record data can never inject markup (everything passes escapeHtml).
 * - The loading-order template is carrier-facing: no pricing markers and
 *   no client identity in the rendered document.
 */

import { describe, expect, it } from '@jest/globals';

import type { InvoicePdfData, LoadingOrderPdfData, PdfBranding } from '@/lib/pdf/templates';
import { escapeHtml, invoiceHtml, loadingOrderHtml } from '@/lib/pdf/templates';

const branding: PdfBranding = {
  companyName: 'Transportes Prueba S.L.',
  vatNumber: 'ESB12345678',
  addressLines: ['Calle Mayor 1', '28001 Madrid', 'ES'],
  phone: '+34600000000',
  email: 'info@example.com',
  logoUrl: null,
  includeLogo: false,
  logoPosition: 'left',
  footerText: 'Registro Mercantil de Madrid',
};

const loadingOrder: LoadingOrderPdfData = {
  orderNumber: 'LO-2026-00007',
  generatedAt: '03/07/2026',
  notes: 'Fragile <cargo> & "handle with care"',
  services: [
    {
      position: 1,
      serviceNumber: 'SRV-2026-00001',
      date: '01/07/2026',
      origin: 'Madrid <b>hack</b>',
      destination: 'París',
      vehiclePlate: '1234-ABC',
      driverName: null,
    },
    {
      position: 2,
      serviceNumber: 'SRV-2026-00002',
      date: '02/07/2026',
      origin: 'Valencia',
      destination: 'Lyon',
      vehiclePlate: null,
      driverName: "O'Brien",
    },
  ],
};

describe('escapeHtml', () => {
  it('escapes all five HTML-significant characters', () => {
    expect(escapeHtml('<a href="x">&\'</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;'
    );
  });
});

describe('loadingOrderHtml', () => {
  const html = loadingOrderHtml(loadingOrder, branding);

  it('renders the order number, positions and routes', () => {
    expect(html).toContain('LO-2026-00007');
    expect(html).toContain('SRV-2026-00001');
    expect(html).toContain('SRV-2026-00002');
    expect(html).toContain('Valencia');
    expect(html).toContain('Lyon');
  });

  it('escapes record data - injected markup never survives', () => {
    expect(html).not.toContain('<b>hack</b>');
    expect(html).toContain('Madrid &lt;b&gt;hack&lt;/b&gt;');
    expect(html).toContain('Fragile &lt;cargo&gt; &amp; &quot;handle with care&quot;');
    expect(html).toContain('O&#39;Brien');
  });

  it('is carrier-facing: no pricing markers', () => {
    // CSS layout properties (margin, margin-top, ...) are not pricing
    // markers - the invariant is about document content, so strip the
    // stylesheet before asserting.
    const content = html.replace(/<style>[\s\S]*?<\/style>/, '');
    expect(content).not.toMatch(/€/);
    expect(content).not.toMatch(/margin/i);
    expect(content).not.toMatch(/amount/i);
    expect(content).not.toMatch(/price/i);
  });

  it('renders the branding header and footer', () => {
    expect(html).toContain('Transportes Prueba S.L.');
    expect(html).toContain('ESB12345678');
    expect(html).toContain('Registro Mercantil de Madrid');
  });

  it('omits the logo when includeLogo is false or no logoUrl exists', () => {
    expect(html).not.toContain('<img');
    const withLogo = loadingOrderHtml(loadingOrder, {
      ...branding,
      includeLogo: true,
      logoUrl: 'https://cdn.example.com/logo.png',
    });
    expect(withLogo).toContain('https://cdn.example.com/logo.png');
  });
});

describe('invoiceHtml', () => {
  const base: InvoicePdfData = {
    title: 'Invoice',
    invoiceNumber: 'INV-2026-00001',
    externalReference: null,
    invoiceDate: '01/07/2026',
    dueDate: '31/07/2026',
    partyLabel: 'Bill to',
    partyName: 'Cliente <script>alert(1)</script> S.A.',
    partyVatNumber: 'ESA00000000',
    items: [
      { description: 'Transport Madrid → París', quantity: '1', unitPrice: '1.000,00 €', amount: '1.000,00 €' },
    ],
    subtotal: '1.000,00 €',
    taxLabel: 'VAT (21%)',
    taxAmount: '210,00 €',
    irpfLabel: null,
    irpfAmount: null,
    totalAmount: '1.210,00 €',
    notes: null,
    termsConditions: null,
  };

  it('renders number, party and totals', () => {
    const html = invoiceHtml(base, branding);
    expect(html).toContain('INV-2026-00001');
    expect(html).toContain('VAT (21%)');
    expect(html).toContain('1.210,00 €');
  });

  it('escapes the party name', () => {
    const html = invoiceHtml(base, branding);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('omits the IRPF row when no retention applies', () => {
    const html = invoiceHtml(base, branding);
    expect(html).not.toContain('IRPF');
  });

  it('renders the IRPF row and supplier reference on PURCHASE invoices', () => {
    const html = invoiceHtml(
      {
        ...base,
        title: 'Registered supplier invoice',
        externalReference: 'SUP-889',
        partyLabel: 'Supplier',
        irpfLabel: 'IRPF (15%)',
        irpfAmount: '150,00 €',
      },
      branding
    );
    expect(html).toContain('IRPF (15%)');
    expect(html).toContain('-150,00 €');
    expect(html).toContain('SUP-889');
  });
});
