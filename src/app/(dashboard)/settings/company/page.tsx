// /app/(dashboard)/settings/company/page.tsx
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { UserRole } from '@/app/generated/prisma';
import { hasPermission, RESOURCES, ACTIONS, canAccessRoute } from '@/lib/permissions';
import { CompanyForm } from '@/components/features/settings/CompanyForm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { getCompanySettings } from '@/actions/settings-actions';

export const metadata: Metadata = {
  title: 'Company Settings | Transport Management System',
  description: 'Manage company information and details',
};

/**
 * Company settings page
 * Allows viewing and editing company information
 */
export default async function CompanySettingsPage() {
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  const userRole = session.user?.role ?? UserRole.VIEWER;

  if (!canAccessRoute(userRole, '/settings/company')) {
    redirect('/settings/profile');
  }

  const canView = hasPermission(userRole, RESOURCES.COMPANIES, ACTIONS.VIEW);
  const canEdit = hasPermission(userRole, RESOURCES.COMPANIES, ACTIONS.EDIT);

  if (!canView) {
    redirect('/settings/profile');
  }

  const result = await getCompanySettings();
  const companyData = result.success ? result.data : null;

  return (
    <div className="space-y-6 -mt-2">
      <PageHeader
        title="Company Information"
        description="Manage your company details and branding"
      />

      {canView && !canEdit && (
        <Alert variant="info">
          You have view-only access to company settings. Contact an administrator to make changes.
        </Alert>
      )}

      <CompanyForm initialData={companyData} canEdit={canEdit} />
    </div>
  );
}
