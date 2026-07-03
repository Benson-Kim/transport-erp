/**
 * Invoice Detail Page (#30, ADR 0001)
 *
 * Full invoice view: header, line items, payment history, status controls
 * and the PDF panel (#34). Pure server component; Suspense streaming.
 * force-dynamic: paidAmount and status must never be stale.
 */

import { Suspense } from 'react';

import { notFound } from 'next/navigation';

import { getInvoiceById } from '@/actions/invoice-actions';
import { InvoiceDetail } from '@/components/features/invoices/InvoiceDetail';
import { InvoicePdfPanel } from '@/components/features/invoices/InvoicePdfPanel';
import { Breadcrumbs, Skeleton } from '@/components/ui';
import { getServerAuth } from '@/lib/auth';
import { hasPermission, RESOURCES, ACTIONS } from '@/lib/permissions';

import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const result = await getInvoiceById(id);
  if (!result.success || !result.data) {
    return { title: 'Invoice | Dashboard' };
  }
  const inv = result.data;
  return {
    title: `${inv.invoiceNumber} | Invoices`,
    description: `${inv.direction === 'SALES' ? 'Sales' : 'Purchase'} invoice — ${inv.party.name}`,
  };
}

function InvoiceDetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading invoice">
      <Skeleton className="h-8 w-64" />
      <div className="card p-6 space-y-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="card p-6 space-y-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}

async function InvoiceContent({ id }: { id: string }) {
  const session = await getServerAuth();
  const userRole = session?.user?.role;

  const result = await getInvoiceById(id);
  if (!result.success || !result.data) {
    notFound();
  }

  const canEdit = hasPermission(userRole, RESOURCES.INVOICES, ACTIONS.EDIT);
  const canDelete = hasPermission(userRole, RESOURCES.INVOICES, ACTIONS.DELETE);
  const canSend = hasPermission(userRole, RESOURCES.INVOICES, ACTIONS.SEND);
  // PDF generation needs documents:create on top of the page's invoices:view
  // gate; the server action enforces both again (#34).
  const canGeneratePdf = hasPermission(userRole, RESOURCES.DOCUMENTS, ACTIONS.CREATE);

  return (
    <>
      <InvoiceDetail
        invoice={result.data}
        canEdit={canEdit}
        canDelete={canDelete}
        canSend={canSend}
      />
      <InvoicePdfPanel
        invoiceId={result.data.id}
        pdfDocumentId={result.data.pdfDocumentId}
        canGenerate={canGeneratePdf}
      />
    </>
  );
}

export default async function InvoiceDetailPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <Breadcrumbs />
      <Suspense fallback={<InvoiceDetailSkeleton />}>
        <InvoiceContent id={id} />
      </Suspense>
    </div>
  );
}
