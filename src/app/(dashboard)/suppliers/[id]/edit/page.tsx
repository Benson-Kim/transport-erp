/**
 * Edit Supplier Page (#29)
 */

import { notFound, redirect } from 'next/navigation';

import { getSupplierById } from '@/actions/supplier-actions';
import { SupplierForm } from '@/components/features/suppliers/SupplierForm';
import { Breadcrumbs, PageHeader } from '@/components/ui';
import { getServerAuth } from '@/lib/auth';
import { hasPermission, RESOURCES, ACTIONS } from '@/lib/permissions';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Edit Supplier | Dashboard',
};

interface PageProps {
  params: Promise<{ id: string }>;
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
      <SupplierForm mode="edit" supplier={result.data} />
    </div>
  );
}
