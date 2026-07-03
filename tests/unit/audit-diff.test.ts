/**
 * #21 - audit field-level diffs with redaction: pure semantics.
 *
 * Acceptance pinned here: a services diff never includes internalNotes or
 * raw pricing; diffs contain changed keys only; Decimal comparison never
 * coerces through JS Number.
 */
import { describe, expect, it } from '@jest/globals';

import { Prisma } from '@/app/generated/prisma';
import { computeAuditDiff, isSensitiveAuditField, normalizeAuditValue } from '@/lib/audit-diff';

describe('computeAuditDiff - changed keys only (#21)', () => {
  it('keeps only fields whose values differ', () => {
    const diff = computeAuditDiff(
      'suppliers',
      { name: 'Trans SL', city: 'Madrid', paymentTerms: 30 },
      { name: 'Trans SL', city: 'Barcelona', paymentTerms: 30 }
    );
    expect(diff.oldValues).toEqual({ city: 'Madrid' });
    expect(diff.newValues).toEqual({ city: 'Barcelona' });
    expect(diff.changedFields).toEqual(['city']);
  });

  it('excludes createdAt/updatedAt noise', () => {
    const diff = computeAuditDiff(
      'suppliers',
      { name: 'A', updatedAt: new Date('2026-01-01'), createdAt: new Date('2025-01-01') },
      { name: 'A', updatedAt: new Date('2026-07-01'), createdAt: new Date('2025-01-01') }
    );
    expect(diff.changedFields).toEqual([]);
    expect(diff.oldValues).toEqual({});
  });

  it('CREATE: drops null fields, oldValues stays null', () => {
    const diff = computeAuditDiff('suppliers', null, {
      name: 'Trans SL',
      tradeName: null,
      city: 'Madrid',
    });
    expect(diff.oldValues).toBeNull();
    expect(diff.newValues).toEqual({ name: 'Trans SL', city: 'Madrid' });
  });

  it('DELETE: newValues stays null', () => {
    const diff = computeAuditDiff('suppliers', { isActive: true }, null);
    expect(diff.newValues).toBeNull();
    expect(diff.oldValues).toEqual({ isActive: true });
  });

  it('normalises Dates to ISO strings and Prisma.DbNull to null', () => {
    const diff = computeAuditDiff(
      'services',
      { date: new Date('2026-07-01T00:00:00Z') },
      { date: new Date('2026-07-02T00:00:00Z') }
    );
    expect(diff.newValues).toEqual({ date: '2026-07-02T00:00:00.000Z' });
    expect(normalizeAuditValue(Prisma.DbNull)).toBeNull();
    expect(normalizeAuditValue(Prisma.JsonNull)).toBeNull();
  });

  it('object key order can never fake a change', () => {
    const diff = computeAuditDiff(
      'clients',
      { billingAddress: { city: 'Madrid', line1: '1 Test St' } },
      { billingAddress: { line1: '1 Test St', city: 'Madrid' } }
    );
    expect(diff.changedFields).toEqual([]);
  });
});

describe('Decimal-aware comparison - never through JS Number (#21)', () => {
  it('Decimal vs number vs string agree on numeric identity', () => {
    const diff = computeAuditDiff(
      'suppliers',
      { vatRate: new Prisma.Decimal('21.00') },
      { vatRate: 21 }
    );
    expect(diff.changedFields).toEqual([]);
  });

  it('a genuine Decimal change is detected and stored canonically', () => {
    const diff = computeAuditDiff(
      'suppliers',
      { vatRate: new Prisma.Decimal('21.00') },
      { vatRate: new Prisma.Decimal('10.00') }
    );
    expect(diff.changedFields).toEqual(['vatRate']);
    expect(diff.oldValues).toEqual({ vatRate: '21' });
    expect(diff.newValues).toEqual({ vatRate: '10' });
  });

  it('null vs Decimal is a change; null vs null is not', () => {
    expect(
      computeAuditDiff('suppliers', { irpfRate: null }, { irpfRate: new Prisma.Decimal('15') })
        .changedFields
    ).toEqual(['irpfRate']);
    expect(
      computeAuditDiff('suppliers', { irpfRate: null }, { irpfRate: null }).changedFields
    ).toEqual([]);
  });
});

describe('redaction (#21 acceptance)', () => {
  it('a services diff NEVER includes internalNotes or raw pricing', () => {
    const diff = computeAuditDiff(
      'services',
      {
        origin: 'Madrid',
        internalNotes: 'driver owes us a favour',
        costAmount: new Prisma.Decimal('100.00'),
        saleAmount: new Prisma.Decimal('150.00'),
        margin: new Prisma.Decimal('50.00'),
      },
      {
        origin: 'Valencia',
        internalNotes: 'renegotiated',
        costAmount: new Prisma.Decimal('90.00'),
        saleAmount: new Prisma.Decimal('150.00'),
        margin: new Prisma.Decimal('60.00'),
      }
    );

    // The change is RECORDED (changedFields) but the content never stored.
    expect(diff.changedFields).toEqual(['costAmount', 'internalNotes', 'margin', 'origin']);
    expect(diff.oldValues).toEqual({ origin: 'Madrid' });
    expect(diff.newValues).toEqual({ origin: 'Valencia' });

    const serialized = JSON.stringify(diff);
    expect(serialized).not.toContain('favour');
    expect(serialized).not.toContain('100');
    expect(serialized).not.toContain('60');
  });

  it('users credential fields never enter a diff on any table', () => {
    const diff = computeAuditDiff(
      'users',
      { name: 'Ana', password: '$2a$12$oldhash', twoFactorSecret: 'JBSWY3DP' },
      { name: 'Ana Maria', password: '$2a$12$newhash', twoFactorSecret: null }
    );
    expect(diff.changedFields).toEqual(['name', 'password', 'twoFactorSecret']);
    expect(JSON.stringify(diff)).not.toContain('$2a$12');
    expect(JSON.stringify(diff)).not.toContain('JBSWY3DP');
    expect(diff.oldValues).toEqual({ name: 'Ana' });
    expect(diff.newValues).toEqual({ name: 'Ana Maria' });
  });

  it('Phase 4 tables are registered BEFORE their verticals exist', () => {
    expect(isSensitiveAuditField('invoices', 'totalAmount')).toBe(true);
    expect(isSensitiveAuditField('invoices', 'paidAmount')).toBe(true);
    expect(isSensitiveAuditField('invoice_items', 'unitPrice')).toBe(true);
    expect(isSensitiveAuditField('payments', 'amount')).toBe(true);
    expect(isSensitiveAuditField('clients', 'creditLimit')).toBe(true);
    // Non-sensitive fields stay visible - the trail must remain useful.
    expect(isSensitiveAuditField('invoices', 'status')).toBe(false);
    expect(isSensitiveAuditField('services', 'origin')).toBe(false);
  });
});
