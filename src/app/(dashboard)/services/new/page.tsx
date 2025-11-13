// app/(dashboard)/services/new/page.tsx
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getClientsAndSuppliers, getService } from '@/actions/service-actions';
import { PageHeader } from '@/components/ui';
import { ServiceForm } from '@/components/features/services';

export const metadata: Metadata = {
  title: 'New Service | Enterprise Dashboard',
  description: 'Create a new transportation service',
};

interface NewServicePageProps {
  searchParams: Promise<{ duplicate?: string }>;
}

export default async function NewServicePage({ searchParams }: NewServicePageProps) {
  const params = await searchParams;
  const session = await auth();

  if (!session?.user) redirect('/login');

  const { clients, suppliers } = await getClientsAndSuppliers();

  // If duplicating, fetch the source service
  let sourceService = null;
  if (params.duplicate) {
    sourceService = await getService(params.duplicate);
  }

  return (
    <div className="flex-1 space-y-6 p-4 md:p-6 lg:p-8">
      <div>
        {/* <Breadcrumb
          items={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Services', href: '/services' },
            { label: params.duplicate ? 'Duplicate Service' : 'New Service' },
          ]}
        /> */}
        <PageHeader
          title={params.duplicate ? 'Duplicate Service' : 'New Service'}
          description="Fill in the service details below"
        />
      </div>

      <ServiceForm
        mode={params.duplicate ? 'duplicate' : 'create'}
        clients={clients}
        suppliers={suppliers}
        sourceService={sourceService}
        duplicateFrom={params.duplicate ?? ''}
        userRole={session.user.role}
      />
    </div>
  );
}
