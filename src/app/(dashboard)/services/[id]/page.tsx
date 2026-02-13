// app/(dashboard)/services/[id]/page.tsx
import { notFound, redirect } from 'next/navigation';
import { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { getServiceWithDetails } from '@/actions/service-actions';
import { hasPermission } from '@/lib/permissions';
import { ErrorState } from '@/components/ui/ErrorState';
import {
  ServiceDetail,
  ServiceHeader,
  ServiceTimeline,
  ServiceSidebar,
} from '@/components/features/services';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const service = await getServiceWithDetails(id);

  return {
    title: service ? `Service ${service.serviceNumber}` : 'Service Not Found',
    description: service ? `Details for service ${service.serviceNumber}` : '',
  };
}

export default async function ServiceDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const session = await auth();
  if (!session) redirect('/login');

  const { id } = await params;
  const service = await getServiceWithDetails(id);

  if (!service) notFound();

  // Check permissions
  const canView = hasPermission(session.user.role, 'services', 'view');
  if (!canView) {
    return (
      <ErrorState
        variant="full"
        title="Access Denied"
        description="You don't have permission to view this service"
      />
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 print:px-0">
      <ServiceHeader service={service} userRole={session.user.role} userId={session.user.id} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <ServiceDetail service={service} />
        </div>

        <div className="space-y-6">
          <ServiceSidebar service={service} userRole={session.user.role} />
        </div>
      </div>

      <ServiceTimeline serviceId={service.id} />
    </div>
  );
}
