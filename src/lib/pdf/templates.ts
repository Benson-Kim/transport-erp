/**
 * PDF HTML templates (#34).
 *
 * Pure string builders: no DB access, no 'use server', fully unit-testable
 * (tests/unit/pdf-templates.test.ts). Callers preformat dates and money;
 * templates only lay out strings. EVERY interpolated value passes through
 * escapeHtml, so record data (descriptions, notes, names, routes) can never
 * inject markup into the rendered document.
 *
 * The loading-order template is CARRIER-FACING: no pricing and no client
 * identity cross this boundary. In a brokerage the artifact handed to the
 * carrier must never leak the margin or the client relationship (the same
 * doctrine as src/lib/loading-orders.ts).
 *
 * Branding is assembled by the caller from the DEFAULT Company row and the
 * SettingKey.PDF system setting (paper size, logo, footer) - the settings
 * the PDF tab configures finally feed a pipeline that runs.
 */

import type { LogoPosition } from '@/types/settings';

export interface PdfBranding {
  companyName: string;
  vatNumber: string;
  addressLines: readonly string[];
  phone: string;
  email: string;
  logoUrl: string | null;
  includeLogo: boolean;
  logoPosition: LogoPosition;
  footerText: string;
}

export interface LoadingOrderPdfLine {
  position: number;
  serviceNumber: string;
  /** Preformatted date string. */
  date: string;
  origin: string;
  destination: string;
  vehiclePlate: string | null;
  driverName: string | null;
}

export interface LoadingOrderPdfData {
  orderNumber: string;
  /** Preformatted date string. */
  generatedAt: string;
  notes: string | null;
  services: readonly LoadingOrderPdfLine[];
}

export interface InvoicePdfLine {
  description: string;
  /** Preformatted quantity string. */
  quantity: string;
  /** Preformatted money string. */
  unitPrice: string;
  /** Preformatted money string. */
  amount: string;
}

export interface InvoicePdfData {
  /** 'Invoice' (SALES) or 'Registered supplier invoice' (PURCHASE). */
  title: string;
  invoiceNumber: string;
  /** Supplier's own number on PURCHASE invoices; null on SALES. */
  externalReference: string | null;
  /** Preformatted date strings. */
  invoiceDate: string;
  dueDate: string;
  /** 'Bill to' (SALES) or 'Supplier' (PURCHASE). */
  partyLabel: string;
  partyName: string;
  partyVatNumber: string | null;
  items: readonly InvoicePdfLine[];
  /** Preformatted money strings. */
  subtotal: string;
  taxLabel: string;
  taxAmount: string;
  irpfLabel: string | null;
  irpfAmount: string | null;
  totalAmount: string;
  notes: string | null;
  termsConditions: string | null;
}

/** Escape a value for safe interpolation into HTML text or attributes. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const BASE_CSS = `
* { box-sizing: border-box; }
body { font-family: Helvetica, Arial, sans-serif; font-size: 11px; color: #111; margin: 0; }
.header { display: flex; gap: 16px; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 16px; }
.header-center { flex-direction: column; align-items: center; text-align: center; }
.header-right { flex-direction: row-reverse; text-align: right; }
.logo { max-height: 60px; max-width: 200px; }
.company-name { font-size: 14px; font-weight: 700; }
.company-meta { color: #444; }
h1 { font-size: 16px; margin: 0 0 4px; }
.doc-meta { color: #444; margin-bottom: 16px; }
.doc-meta div { margin-top: 2px; }
table { width: 100%; border-collapse: collapse; margin-top: 8px; }
th { text-align: left; border-bottom: 1px solid #111; padding: 6px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
td { border-bottom: 1px solid #ddd; padding: 6px 8px; vertical-align: top; }
.num { text-align: right; white-space: nowrap; }
.totals { margin-top: 12px; margin-left: auto; width: 45%; }
.totals td { border-bottom: none; padding: 3px 8px; }
.totals .grand td { border-top: 1px solid #111; font-weight: 700; }
.notes { margin-top: 16px; white-space: pre-wrap; }
.notes-title { font-weight: 700; margin-bottom: 2px; }
footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #ddd; color: #666; font-size: 9px; text-align: center; }
`;

/** Shared page shell: branding header, title, body, optional footer. */
export function documentShell(branding: PdfBranding, title: string, bodyHtml: string): string {
  const logo =
    branding.includeLogo && branding.logoUrl
      ? `<img class="logo" src="${escapeHtml(branding.logoUrl)}" alt="">`
      : '';
  const address = branding.addressLines.map((line) => escapeHtml(line)).join(' · ');
  const contact = [branding.phone, branding.email]
    .filter(Boolean)
    .map((value) => escapeHtml(value))
    .join(' · ');
  const footer = branding.footerText
    ? `<footer>${escapeHtml(branding.footerText)}</footer>`
    : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>${BASE_CSS}</style></head>
<body>
  <header class="header header-${branding.logoPosition}">
    ${logo}
    <div class="company">
      <div class="company-name">${escapeHtml(branding.companyName)}</div>
      <div class="company-meta">${escapeHtml(branding.vatNumber)}</div>
      <div class="company-meta">${address}</div>
      <div class="company-meta">${contact}</div>
    </div>
  </header>
  <h1>${escapeHtml(title)}</h1>
  ${bodyHtml}
  ${footer}
</body>
</html>`;
}

function notesBlock(label: string, text: string | null): string {
  if (!text) return '';
  return `<div class="notes"><div class="notes-title">${escapeHtml(label)}</div>${escapeHtml(text)}</div>`;
}

/**
 * Carrier instruction (orden de carga). Positions, routes, vehicle and
 * driver only - deliberately NO pricing and NO client identity.
 */
export function loadingOrderHtml(data: LoadingOrderPdfData, branding: PdfBranding): string {
  const rows = data.services
    .map(
      (line) => `<tr>
        <td class="num">${line.position}</td>
        <td>${escapeHtml(line.serviceNumber)}</td>
        <td>${escapeHtml(line.date)}</td>
        <td>${escapeHtml(line.origin)} → ${escapeHtml(line.destination)}</td>
        <td>${escapeHtml(line.vehiclePlate ?? '-')}</td>
        <td>${escapeHtml(line.driverName ?? '-')}</td>
      </tr>`
    )
    .join('\n');

  const body = `
  <div class="doc-meta">
    <div>Order number: <strong>${escapeHtml(data.orderNumber)}</strong></div>
    <div>Generated: ${escapeHtml(data.generatedAt)}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th class="num">#</th>
        <th>Service</th>
        <th>Date</th>
        <th>Route</th>
        <th>Vehicle</th>
        <th>Driver</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  ${notesBlock('Notes', data.notes)}`;

  return documentShell(branding, `Loading Order ${data.orderNumber}`, body);
}

/** Invoice document (SALES issued / PURCHASE registered, ADR 0001). */
export function invoiceHtml(data: InvoicePdfData, branding: PdfBranding): string {
  const rows = data.items
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.description)}</td>
        <td class="num">${escapeHtml(item.quantity)}</td>
        <td class="num">${escapeHtml(item.unitPrice)}</td>
        <td class="num">${escapeHtml(item.amount)}</td>
      </tr>`
    )
    .join('\n');

  const externalReference = data.externalReference
    ? `<div>Supplier reference: ${escapeHtml(data.externalReference)}</div>`
    : '';
  const partyVat = data.partyVatNumber
    ? `<div>VAT: ${escapeHtml(data.partyVatNumber)}</div>`
    : '';
  const irpfRow =
    data.irpfLabel && data.irpfAmount
      ? `<tr><td>${escapeHtml(data.irpfLabel)}</td><td class="num">-${escapeHtml(data.irpfAmount)}</td></tr>`
      : '';

  const body = `
  <div class="doc-meta">
    <div>Number: <strong>${escapeHtml(data.invoiceNumber)}</strong></div>
    ${externalReference}
    <div>Date: ${escapeHtml(data.invoiceDate)} · Due: ${escapeHtml(data.dueDate)}</div>
    <div>${escapeHtml(data.partyLabel)}: <strong>${escapeHtml(data.partyName)}</strong></div>
    ${partyVat}
  </div>
  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="num">Qty</th>
        <th class="num">Unit price</th>
        <th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <table class="totals">
    <tbody>
      <tr><td>Subtotal</td><td class="num">${escapeHtml(data.subtotal)}</td></tr>
      <tr><td>${escapeHtml(data.taxLabel)}</td><td class="num">${escapeHtml(data.taxAmount)}</td></tr>
      ${irpfRow}
      <tr class="grand"><td>Total</td><td class="num">${escapeHtml(data.totalAmount)}</td></tr>
    </tbody>
  </table>
  ${notesBlock('Notes', data.notes)}
  ${notesBlock('Terms & conditions', data.termsConditions)}`;

  return documentShell(branding, data.title, body);
}
