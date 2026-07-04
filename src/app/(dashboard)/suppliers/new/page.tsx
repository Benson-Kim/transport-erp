/**
 * New Supplier Page (#29)
 * SupplierSelector's "Create New Supplier" lands here (previously a 404).
 * Honors a validated `returnTo` search param so supplier creation started
 * mid-service returns to the flow it interrupted (#64).
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

interface NewSupplierPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function NewSupplierPage({ searchParams }: Readonly<NewSupplierPageProps>) {
  const session = await getServerAuth();

  if (!hasPermission(session?.user?.role, RESOURCES.SUPPLIERS, ACTIONS.CREATE)) {
    redirect('/suppliers');
  }

  const { returnTo } = await searchParams;

  return (
    <div className="space-y-6">
      <Breadcrumbs />
      <PageHeader title="New Supplier" description="Register a new supplier (cost side)" />
      <SupplierForm mode="create" returnTo={typeof returnTo === 'string' ? returnTo : undefined} />
    </div>
  );
}
