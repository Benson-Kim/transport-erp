/**
 * Edit Supplier Page (#29)
 * Converts Prisma Decimals to plain numbers server-side before handing
 * initial values to the client form (RSC boundary requires plain values).
 */

import { notFound, redirect } from 'next/navigation';

import { getSupplierById } from '@/actions/supplier-actions';
import {
  SupplierForm,
  type SupplierFormInitial,
} from '@/components/features/suppliers/SupplierForm';
import { Breadcrumbs, PageHeader } from '@/components/ui';
import { getServerAuth } from '@/lib/auth';
import { hasPermission, RESOURCES, ACTIONS } from '@/lib/permissions';
import { decimalToNumber } from '@/lib/pricing';
import type { SupplierWithStats } from '@/types/supplier';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Edit Supplier | Dashboard',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

function toFormInitial(supplier: SupplierWithStats): SupplierFormInitial {
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
    fax: supplier.fax,
    contactPerson: supplier.contactPerson,
    contactMobile: supplier.contactMobile,
    irpfRate: supplier.irpfRate != null ? decimalToNumber(supplier.irpfRate) : null,
    vatRate: decimalToNumber(supplier.vatRate),
    paymentTerms: supplier.paymentTerms,
    paymentMethod: supplier.paymentMethod,
    bankName: supplier.bankName,
    bankAccount: supplier.bankAccount,
    swiftCode: supplier.swiftCode,
    iban: supplier.iban,
    currency: supplier.currency,
    autoApprove: supplier.autoApprove,
    requirePO: supplier.requirePO,
    notes: supplier.notes,
    tags: supplier.tags,
    isActive: supplier.isActive,
  };
}

export default async function EditSupplierPage({ params }: PageProps) {
  const { id } = await params;
  const session = await getServerAuth();

  if (!hasPermission(session?.user?.role, RESOURCES.SUPPLIERS, ACTIONS.EDIT)) {
    redirect(`/suppliers/${id}`);
  }

  const result = await getSupplierById(id);
  if (!result.success || !result.data) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs />
      <PageHeader
        title={`Edit ${result.data.name}`}
        description={`Supplier ${result.data.supplierCode}`}
      />
      <SupplierForm mode="edit" supplier={toFormInitial(result.data)} />
    </div>
  );
}
