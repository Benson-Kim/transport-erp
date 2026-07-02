/**
 * Supplier Detail Page (#29)
 */

import { Suspense } from 'react';

import { notFound } from 'next/navigation';

import { getSupplierById, getSupplierServices } from '@/actions/supplier-actions';
import { SupplierDetail } from '@/components/features/suppliers/SupplierDetail';
import { Breadcrumbs, Skeleton } from '@/components/ui';
import { getServerAuth } from '@/lib/auth';
import { hasPermission, RESOURCES, ACTIONS } from '@/lib/permissions';

import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const result = await getSupplierById(id);
  if (!result.success || !result.data) {
    return { title: 'Supplier | Dashboard' };
  }
  return {
    title: `${result.data.name} | Suppliers`,
    description: `Supplier ${result.data.supplierCode}`,
  };
}

function SupplierDetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading supplier">
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

async function SupplierContent({ id }: { id: string }) {
  const session = await getServerAuth();
  const userRole = session?.user?.role;

  const [supplierResult, servicesResult] = await Promise.all([
    getSupplierById(id),
    getSupplierServices(id, { page: 1, limit: 20 }),
  ]);

  if (!supplierResult.success || !supplierResult.data) {
    notFound();
  }

  return (
    <SupplierDetail
      supplier={supplierResult.data}
      services={servicesResult.success ? (servicesResult.data?.data ?? []) : []}
      servicesTotal={servicesResult.success ? (servicesResult.data?.total ?? 0) : 0}
      canEdit={hasPermission(userRole, RESOURCES.SUPPLIERS, ACTIONS.EDIT)}
    />
  );
}

export default async function SupplierDetailPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <Breadcrumbs />
      <Suspense fallback={<SupplierDetailSkeleton />}>
        <SupplierContent id={id} />
      </Suspense>
    </div>
  );
}
