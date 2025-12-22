/**
 * Breadcrumbs Utility Functions
 * Generates breadcrumb data from pathname
 */

export interface BreadcrumbItem {
  label: string;
  href: string;
}

/**
 * Route label mappings for prettier display
 */
const ROUTE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  clients: 'Clients',
  suppliers: 'Suppliers',
  services: 'Services',
  invoices: 'Invoices',
  reports: 'Reports',
  settings: 'Settings',
  new: 'New',
  edit: 'Edit',
  profile: 'Profile',
  company: 'Company',
  users: 'Users',
  system: 'System',
  audit: 'Audit Log',
};

/**
 * Checks if a segment is a dynamic ID (CUID, UUID, or numeric)
 */
function isDynamicSegment(segment: string): boolean {
  // CUID pattern (starts with 'c' followed by alphanumeric)
  if (/^c[a-z0-9]{20,}$/i.test(segment)) {
    return true;
  }
  // UUID pattern
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) {
    return true;
  }
  // Numeric ID
  if (/^\d+$/.test(segment)) {
    return true;
  }
  return false;
}

/**
 * Generates breadcrumb items from a pathname
 */
export function getBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const segments = pathname.replace(/^\/|\/$/g, '').split('/');

  const filteredSegments = segments.filter(Boolean);

  const breadcrumbs: BreadcrumbItem[] = [];
  let currentPath = '';

  for (const segment of filteredSegments) {
    currentPath += `/${segment}`;

    if (segment === 'dashboard' && filteredSegments.length > 1) {
      continue;
    }

    if (isDynamicSegment(segment)) {
      breadcrumbs.push({
        label: 'Details',
        href: currentPath,
      });
      continue;
    }

    const label = ROUTE_LABELS[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1);

    breadcrumbs.push({
      label,
      href: currentPath,
    });
  }

  return breadcrumbs;
}

/**
 * Creates a custom breadcrumb trail with specific labels
 */
export function createBreadcrumbs(items: Array<{ label: string; href: string }>): BreadcrumbItem[] {
  return items;
}
