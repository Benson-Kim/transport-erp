/**
 * New Supplier Page (#29)
 * SupplierSelector's "Create New Supplier" lands here (previously a 404).
 */

import { redirect } from 'next/navigation';

import { SupplierForm } from '@/components/features/suppliers/SupplierForm';
import { Breadcrumbs, PageHeader } from '@/components/ui';
import { getServerAuth } from '@/lib/auth';
import { hasPermission, RESOURCES, ACTIONS } from '@/lib/permissions';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'New Supplier | Dashboard',
  description: 'Create a new supplier',
};

export default async function NewSupplierPage() {
  const session = await getServerAuth();

  if (!hasPermission(session?.user?.role, RESOURCES.SUPPLIERS, ACTIONS.CREATE)) {
    redirect('/suppliers');
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs />
      <PageHeader title="New Supplier" description="Register a new supplier (cost side)" />
      <SupplierForm mode="create" />
    </div>
  );
}
