/**
 * New Invoice Page (#30)
 */

import { redirect } from 'next/navigation';

import { getInvoiceParties } from '@/actions/invoice-actions';
import { InvoiceForm } from '@/components/features/invoices/InvoiceForm';
import { Alert, Breadcrumbs, PageHeader } from '@/components/ui';
import { getServerAuth } from '@/lib/auth';
import { hasPermission, RESOURCES, ACTIONS } from '@/lib/permissions';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'New Invoice | Dashboard',
};

export default async function NewInvoicePage() {
  const session = await getServerAuth();

  if (!hasPermission(session?.user?.role, RESOURCES.INVOICES, ACTIONS.CREATE)) {
    redirect('/invoices');
  }

  const partiesResult = await getInvoiceParties();

  if (!partiesResult.success || !partiesResult.data) {
    return (
      <div className="space-y-6">
        <Breadcrumbs />
        <Alert variant="error" title="Failed to load form data">
          {partiesResult.error ?? 'Please try again later.'}
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs />
      <PageHeader
        title="New Invoice"
        description="Issue a sales invoice to a client or register a purchase invoice from a supplier"
      />
      <InvoiceForm parties={partiesResult.data} />
    </div>
  );
}
