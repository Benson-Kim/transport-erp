/**
 * #29 - supplier validation schema.
 */

import { describe, expect, it } from '@jest/globals';

import { supplierSchema, supplierFilterSchema } from '@/lib/validations/supplier-schema';

const validMinimal = {
  name: 'Transportes García SL',
  addressLine1: 'Calle Mayor 1',
  city: 'Madrid',
  postalCode: '28001',
  email: 'ops@garcia.es',
};

describe('supplierSchema', () => {
  it('accepts a minimal supplier and applies defaults', () => {
    const parsed = supplierSchema.parse(validMinimal);
    expect(parsed.country).toBe('ES');
    expect(parsed.vatRate).toBe(21);
    expect(parsed.paymentTerms).toBe(30);
    expect(parsed.currency).toBe('EUR');
    expect(parsed.isActive).toBe(true);
    expect(parsed.autoApprove).toBe(false);
    expect(parsed.requirePO).toBe(false);
    expect(parsed.tags).toEqual([]);
  });

  it('uppercases the VAT number', () => {
    const parsed = supplierSchema.parse({ ...validMinimal, vatNumber: 'esb12345678' });
    expect(parsed.vatNumber).toBe('ESB12345678');
  });

  it('rejects an invalid email', () => {
    expect(() => supplierSchema.parse({ ...validMinimal, email: 'not-an-email' })).toThrow();
  });

  it('rejects IRPF outside [0, 100]', () => {
    expect(() => supplierSchema.parse({ ...validMinimal, irpfRate: -1 })).toThrow();
    expect(() => supplierSchema.parse({ ...validMinimal, irpfRate: 101 })).toThrow();
    expect(supplierSchema.parse({ ...validMinimal, irpfRate: 15 }).irpfRate).toBe(15);
  });

  it('rejects VAT rate outside [0, 100] and coerces string input', () => {
    expect(() => supplierSchema.parse({ ...validMinimal, vatRate: 120 })).toThrow();
    expect(supplierSchema.parse({ ...validMinimal, vatRate: '10' }).vatRate).toBe(10);
  });

  it('rejects unknown payment methods', () => {
    expect(() => supplierSchema.parse({ ...validMinimal, paymentMethod: 'BARTER' })).toThrow();
    expect(
      supplierSchema.parse({ ...validMinimal, paymentMethod: 'TRANSFER' }).paymentMethod
    ).toBe('TRANSFER');
  });

  it('rejects payment terms beyond 365 days', () => {
    expect(() => supplierSchema.parse({ ...validMinimal, paymentTerms: 366 })).toThrow();
  });
});

describe('supplierFilterSchema', () => {
  it('applies pagination defaults and caps the limit', () => {
    const parsed = supplierFilterSchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(50);
    expect(parsed.sortBy).toBe('name');
    expect(parsed.sortOrder).toBe('asc');
    expect(() => supplierFilterSchema.parse({ limit: 200 })).toThrow();
  });
});
