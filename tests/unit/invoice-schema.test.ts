/**
 * #30 - direction-aware invoice validation: PURCHASE registers the
 * supplier's own number; SALES is our issued series (no external
 * reference, no IRPF). Pagination stays capped.
 */
import { describe, expect, it } from '@jest/globals';

import { InvoiceDirection } from '@/app/generated/prisma';
import { createInvoiceSchema, invoiceFilterSchema } from '@/lib/validations/invoice-schema';

const base = {
  partyId: 'party-1',
  serviceIds: ['svc-1', 'svc-2'],
};

describe('createInvoiceSchema (#30)', () => {
  it('accepts a PURCHASE invoice with the supplier reference and IRPF', () => {
    const parsed = createInvoiceSchema.parse({
      ...base,
      direction: InvoiceDirection.PURCHASE,
      externalReference: 'SUP-2026-0042',
      irpfRatePoints: 15,
    });

    expect(parsed.direction).toBe(InvoiceDirection.PURCHASE);
    expect(parsed.externalReference).toBe('SUP-2026-0042');
    expect(parsed.irpfRatePoints).toBe(15);
    expect(parsed.vatRatePoints).toBe(21); // default
  });

  it('rejects a PURCHASE invoice without the supplier\u0027s own number', () => {
    expect(() =>
      createInvoiceSchema.parse({ ...base, direction: InvoiceDirection.PURCHASE })
    ).toThrow(/supplier's own invoice number/i);
  });

  it('accepts a SALES invoice without external reference or IRPF', () => {
    const parsed = createInvoiceSchema.parse({ ...base, direction: InvoiceDirection.SALES });
    expect(parsed.externalReference).toBeUndefined();
    expect(parsed.irpfRatePoints).toBeUndefined();
  });

  it('rejects external reference and IRPF on SALES invoices', () => {
    expect(() =>
      createInvoiceSchema.parse({
        ...base,
        direction: InvoiceDirection.SALES,
        externalReference: 'NOT-OURS-1',
      })
    ).toThrow(/issued series/i);

    expect(() =>
      createInvoiceSchema.parse({
        ...base,
        direction: InvoiceDirection.SALES,
        irpfRatePoints: 15,
      })
    ).toThrow(/purchase invoices only/i);
  });

  it('requires at least one service and caps the group at 100', () => {
    expect(() =>
      createInvoiceSchema.parse({
        ...base,
        serviceIds: [],
        direction: InvoiceDirection.SALES,
      })
    ).toThrow(/at least one service/i);

    expect(() =>
      createInvoiceSchema.parse({
        ...base,
        serviceIds: Array.from({ length: 101 }, (_, i) => `svc-${i}`),
        direction: InvoiceDirection.SALES,
      })
    ).toThrow(/more than 100/i);
  });

  it('rejects a due date before the invoice date', () => {
    expect(() =>
      createInvoiceSchema.parse({
        ...base,
        direction: InvoiceDirection.SALES,
        invoiceDate: '2026-07-10',
        dueDate: '2026-07-01',
      })
    ).toThrow(/before the invoice date/i);
  });

  it("maps cleared form inputs ('') to unset, never 0 or Invalid Date", () => {
    const parsed = createInvoiceSchema.parse({
      ...base,
      direction: InvoiceDirection.PURCHASE,
      externalReference: 'SUP-1',
      irpfRatePoints: '',
      invoiceDate: '',
      dueDate: '',
      notes: '',
    });

    expect(parsed.irpfRatePoints).toBeUndefined();
    expect(parsed.invoiceDate).toBeUndefined();
    expect(parsed.dueDate).toBeUndefined();
    expect(parsed.notes).toBeUndefined();
  });
});

describe('invoiceFilterSchema (#30)', () => {
  it('defaults: newest invoices first, capped page size', () => {
    const parsed = invoiceFilterSchema.parse({});
    expect(parsed).toMatchObject({
      page: 1,
      limit: 50,
      sortBy: 'invoiceDate',
      sortOrder: 'desc',
    });
  });

  it('rejects a page size above the shared 100 cap', () => {
    expect(() => invoiceFilterSchema.parse({ limit: 1000 })).toThrow();
  });

  it('rejects unknown sort columns (no orderBy injection)', () => {
    expect(() => invoiceFilterSchema.parse({ sortBy: 'paidAmount; DROP TABLE' })).toThrow();
  });
});
