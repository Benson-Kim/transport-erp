// app/(dashboard)/services/[id]/edit/page.tsx
import { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getService, getClientsAndSuppliers } from '@/actions/service-actions';
import { ServiceForm } from '@/components/features/services/ServiceForm';
import { PageHeader, Alert, Badge } from '@/components/ui';
import { ServiceStatus } from '@prisma/client';
import { AlertCircle } from 'lucide-react';
import { hasPermission } from '@/lib/permissions';

export const metadata: Metadata = {
  title: 'Edit Service | Enterprise Dashboard',
  description: 'Edit service details',
};

interface EditServicePageProps {
  params: Promise<{ id: string }>;
}

export default async function EditServicePage({ params }: EditServicePageProps) {
  const { id } = await params;
  const session = await auth();
  
  if (!session?.user) redirect('/login');

  // Check permissions
  if (!hasPermission(session.user.role, 'services', 'edit')) {
    redirect('/services');
  }

  // Fetch service and related data
  const [service, { clients, suppliers }] = await Promise.all([
    getService(id),
    getClientsAndSuppliers(),
  ]);

  if (!service) {
    notFound();
  }

  // Check if completed service can be edited
  const isCompleted = service.status === ServiceStatus.COMPLETED;
  const canEditCompleted = hasPermission(session.user.role, 'services', 'edit_completed');

  if (isCompleted && !canEditCompleted) {
    return (
      <div className="flex-1 space-y-6 p-4 md:p-6 lg:p-8">
        <div>
          {/* <Breadcrumb
            items={[
              { label: 'Dashboard', href: '/dashboard' },
              { label: 'Services', href: '/services' },
              { label: service.serviceNumber, href: `/services/${service.id}` },
              { label: 'Edit' },
            ]}
          /> */}
          <PageHeader
            title="Cannot Edit Completed Service"
            description="This service has been completed and cannot be edited"
          />
        </div>

        <Alert variant="error" icon={<AlertCircle className="h-4 w-4" />}>
          <div>
            <p className="font-medium">Service {service.serviceNumber} is completed</p>
            <p className="text-sm mt-1">
              Only administrators can edit completed services. Please contact your administrator if changes are needed.
            </p>
          </div>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-4 md:p-6 lg:p-8">
      <div>
        {/* <Breadcrumb
          items={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Services', href: '/services' },
            { label: service.serviceNumber, href: `/services/${service.id}` },
            { label: 'Edit' },
          ]}
        /> */}
        <div className="flex items-center justify-between">
          <PageHeader
            title={`Edit Service ${service.serviceNumber}`}
            description="Update service details below"
          />
          <Badge 
            variant={service.status === ServiceStatus.COMPLETED ? 'completed' : 'active'}
          >
            {service.status}
          </Badge>
        </div>
      </div>

      {/* Warning for completed services */}
      {isCompleted && (
        <Alert variant="warning" icon={<AlertCircle className="h-4 w-4" />}>
          <p className="font-medium">Editing Completed Service</p>
          <p className="text-sm mt-1">
            This service is marked as completed. Any changes will be logged for audit purposes.
          </p>
        </Alert>
      )}

      <ServiceForm
        mode="edit"
        service={service}
        clients={clients}
        suppliers={suppliers}
        userRole={session.user.role}
      />
    </div>
  );
}