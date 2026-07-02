/**
 * Invoice Detail Page (#30/#31)
 */

import { Suspense } from 'react';

import { notFound } from 'next/navigation';

import { getInvoiceById } from '@/actions/invoice-actions';
import { InvoiceDetail } from '@/components/features/invoices/InvoiceDetail';
import { Breadcrumbs, Skeleton } from '@/components/ui';
import { getServerAuth } from '@/lib/auth';
import { hasPermission, RESOURCES, ACTIONS } from '@/lib/permissions';

import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const result = await getInvoiceById(id);
  if (!result.success || !result.data) {
    return { title: 'Invoice | Dashboard' };
  }
  return { title: `${result.data.invoiceNumber} | Invoices` };
}

function InvoiceDetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading invoice">
      <Skeleton className="h-8 w-64" />
      <div className="card p-6 space-y-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="card p-6 space-y-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-1/2" />
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

  return (
    <InvoiceDetail
      invoice={result.data}
      canRecordPayment={hasPermission(userRole, RESOURCES.PAYMENTS, ACTIONS.CREATE)}
      canVoidPayment={hasPermission(userRole, RESOURCES.PAYMENTS, ACTIONS.DELETE)}
      canSend={hasPermission(userRole, RESOURCES.INVOICES, ACTIONS.SEND)}
      canCancel={hasPermission(userRole, RESOURCES.INVOICES, ACTIONS.DELETE)}
    />
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
