/**
 * Services List Page
 * Comprehensive service management with filtering and bulk actions
 */
import { Suspense } from 'react';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getServices, getClientsAndSuppliers } from '@/actions/service-actions';
import { ServicesFilters } from '@/components/features/services/ServicesFilters';
import { Alert, Card, CardBody, ErrorBoundary } from '@/components/ui';
import {
  ServiceSkeleton,
  ServicesTable,
  ServicesHeader,
  ServicesMobileView,
} from '@/components/features/services';
import { ServiceStatus } from '@/app/generated/prisma';

export const metadata: Metadata = {
  title: 'Services | Enterprise Dashboard',
  description: 'Manage transport and logistics services',
};

interface ServicesPageProps {
  searchParams: {
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    status?: string;
    clientId?: string;
    supplierId?: string;
    driver?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    page?: string;
    pageSize?: string;
  };
}

export default async function ServicesPage({ searchParams }: ServicesPageProps) {
  // Check authentication

  const params = await searchParams;

  const session = await auth();
  if (!session?.user) redirect('/login');

  // Parse filters from search params
  const filters = {
    search: params.search || '',
    dateFrom: params.dateFrom || '',
    dateTo: params.dateTo || '',
    status: (params.status as ServiceStatus) || '',
    clientId: params.clientId || '',
    supplierId: params.supplierId || '',
    driver: params.driver || '',
    sortBy: params.sortBy || 'date',
    sortOrder: params.sortOrder || ('desc' as const),
    page: Number(params.page) || 1,
    pageSize: Number(params.pageSize) || 50,
  };

  // Fetch data in parallel
  const [servicesData, filtersData] = await Promise.all([
    getServices(filters),
    getClientsAndSuppliers(),
  ]);

  const activeFiltersCount = Object.values(filters).filter(
    (value) => value && value !== '' && value !== 1 && value !== 50
  ).length;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Page Header */}
      <ServicesHeader description={'Manage transport and logistics services'} />

      {/* Filters */}
      <ServicesFilters
        clients={filtersData.clients}
        suppliers={filtersData.suppliers}
        currentFilters={filters}
        activeCount={activeFiltersCount}
      />

      {/* Services Table - Desktop */}
      <ErrorBoundary
        fallback={
          <Card>
            <CardBody>
              <Alert variant="error">Failed to load recent services</Alert>
            </CardBody>
          </Card>
        }
      >
        <Suspense fallback={<ServiceSkeleton.Table />}>
          {/* Services Table - Desktop */}
          <div className="hidden lg:block">
            <ServicesTable
              services={servicesData.services}
              total={servicesData.total}
              currentPage={filters.page}
              pageSize={filters.pageSize}
              sortBy={filters.sortBy}
              sortOrder={filters.sortOrder}
              userRole={session.user.role}
            />
          </div>

          {/* Services Cards - Mobile */}
          <div className="lg:hidden">
            <ServicesMobileView
              services={servicesData.services}
              total={servicesData.total}
              currentPage={filters.page}
              pageSize={filters.pageSize}
              userRole={session.user.role}
            />
          </div>
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
