// app/(dashboard)/services/[id]/page.tsx
import { notFound, redirect } from 'next/navigation';


import {
  ServiceDetail,
  ServiceHeader,
  ServiceTimeline,
  ServiceSidebar,
} from '@/components/features/services';
import { ErrorState } from '@/components/ui/ErrorState';
import { auth } from '@/lib/auth';
import { getServiceWithDetails } from '@/lib/data/service-data';

import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  // getServiceWithDetails is gated (auth + ownership). Never leak service
  // data via <title> to callers who cannot access it: fall back to generic.
  try {
    const service = await getServiceWithDetails(id);
    return {
      title: service ? `Service ${service.serviceNumber}` : 'Service Not Found',
      description: service ? `Details for service ${service.serviceNumber}` : '',
    };
  } catch {
    return { title: 'Service' };
  }
}

export default async function ServiceDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;

  // getServiceWithDetails enforces auth + services:view + ownership and
  // throws when access is denied. Render a scoped access-denied state
  // instead of leaking whether the service exists.
  let service: Awaited<ReturnType<typeof getServiceWithDetails>>;
  try {
    service = await getServiceWithDetails(id);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      redirect('/login');
    }
    return (
      <ErrorState
        variant="full"
        title="Access Denied"
        description="You don't have permission to view this service"
      />
    );
  }

  if (!service) notFound();

  const session = await auth();
  if (!session) redirect('/login');

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
