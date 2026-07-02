/**
 * Supplier Detail Page (#29)
 * Maps Prisma Decimals to plain numbers server-side (decimalToNumber, the
 * sanctioned DTO exit) before values reach client boundaries.
 */

import { Suspense } from 'react';

import { notFound } from 'next/navigation';

import { getSupplierById, getSupplierServices } from '@/actions/supplier-actions';
import {
  SupplierDetail,
  type SupplierDetailView,
} from '@/components/features/suppliers/SupplierDetail';
import { Breadcrumbs, Skeleton } from '@/components/ui';
import { getServerAuth } from '@/lib/auth';
import { hasPermission, RESOURCES, ACTIONS } from '@/lib/permissions';
import { decimalToNumber } from '@/lib/pricing';
import type { SupplierWithStats } from '@/types/supplier';

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

function toDetailView(supplier: SupplierWithStats): SupplierDetailView {
  return {
    id: supplier.id,
    supplierCode: supplier.supplierCode,
    name: supplier.name,
    tradeName: supplier.tradeName,
    vatNumber: supplier.vatNumber,
    addressLine1: supplier.addressLine1,
    addressLine2: supplier.addressLine2,
    city: supplier.city,
    state: supplier.state,
    postalCode: supplier.postalCode,
    country: supplier.country,
    email: supplier.email,
    phone: supplier.phone,
    contactPerson: supplier.contactPerson,
    contactMobile: supplier.contactMobile,
    irpfRate: supplier.irpfRate != null ? decimalToNumber(supplier.irpfRate) : null,
    vatRate: decimalToNumber(supplier.vatRate),
    paymentTerms: supplier.paymentTerms,
    paymentMethod: supplier.paymentMethod,
    bankName: supplier.bankName,
    iban: supplier.iban,
    currency: supplier.currency,
    isActive: supplier.isActive,
    notes: supplier.notes,
    stats: supplier.stats,
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
      supplier={toDetailView(supplierResult.data)}
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
