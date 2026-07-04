/**
 * New Invoice Page (#30, ADR 0001)
 *
 * Two-step create flow:
 * 1. Choose direction (SALES / PURCHASE) and party.
 * 2. Select services and confirm totals.
 * The form is a client component; this page is a server shell that gates
 * access and passes the initial party options.
 */

import { redirect } from 'next/navigation';

import { getInvoiceParties } from '@/actions/invoice-actions';
import { NewInvoiceForm } from '@/components/features/invoices/NewInvoiceForm';
import { Alert, Breadcrumbs, PageHeader } from '@/components/ui';
import { getServerAuth } from '@/lib/auth';
import { hasPermission, RESOURCES, ACTIONS } from '@/lib/permissions';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'New Invoice | Dashboard',
  description: 'Create a sales or purchase invoice',
};

export default async function NewInvoicePage() {
  const session = await getServerAuth();

  if (!hasPermission(session?.user?.role, RESOURCES.INVOICES, ACTIONS.CREATE)) {
    redirect('/invoices');
  }

  // Pre-load both party lists so the form can switch direction without a
  // round-trip. Capped at 100 live rows each (#47 replaces with async
  // combobox once the scalability phase lands).
  const [clientsResult, suppliersResult] = await Promise.all([
    getInvoiceParties('SALES'),
    getInvoiceParties('PURCHASE'),
  ]);

  if (!clientsResult.success || !suppliersResult.success) {
    return (
      <div className="space-y-6">
        <Breadcrumbs />
        <PageHeader title="New Invoice" description="Create a sales or purchase invoice" />
        <Alert variant="error" title="Failed to load parties">
          Could not load clients or suppliers. Please try again.
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs />
      <PageHeader
        title="New Invoice"
        description="Issue a sales invoice to a client (INV) or register a purchase invoice from a supplier (RINV)"
      />
      <NewInvoiceForm
        clients={clientsResult.data ?? []}
        suppliers={suppliersResult.data ?? []}
      />
    </div>
  );
}
