// components/layout/navigation-config.ts
import {
    LayoutDashboard,
    Truck,
    Users,
    Building2,
    FileText,
    BarChart3,
    Settings,
    Package,
    Receipt,
    FileCheck,
} from 'lucide-react';

export interface NavItem {
    id: string;
    label: string;
    href: string;
    icon: React.ElementType;
    children?: NavItem[];
    badge?: number;
    permissions?: string[];
}

export const navigation: NavItem[] = [
    {
        id: 'dashboard',
        label: 'Dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
    },
    {
        id: 'services',
        label: 'Services',
        href: '/services',
        icon: Truck,
        badge: 5, // You can make this dynamic
    },
    {
        id: 'clients',
        label: 'Clients',
        href: '/clients',
        icon: Users,
    },
    {
        id: 'suppliers',
        label: 'Suppliers',
        href: '/suppliers',
        icon: Building2,
    },
    {
        id: 'documents',
        label: 'Documents',
        href: '/documents',
        icon: FileText,
        children: [
            {
                id: 'invoices',
                label: 'Invoices',
                href: '/documents/invoices',
                icon: Receipt,
            },
            {
                id: 'loading-orders',
                label: 'Loading Orders',
                href: '/documents/loading-orders',
                icon: FileCheck,
            },
            {
                id: 'delivery-notes',
                label: 'Delivery Notes',
                href: '/documents/delivery-notes',
                icon: Package,
            },
        ],
    },
    {
        id: 'reports',
        label: 'Reports',
        href: '/reports',
        icon: BarChart3,
    },
    {
        id: 'settings',
        label: 'Settings',
        href: '/settings',
        icon: Settings,
    },
];

// Helper function to get navigation item by href
export function getNavItemByHref(href: string): NavItem | undefined {
    for (const item of navigation) {
        if (item.href === href) {
            return item;
        }
        if (item.children) {
            const child = item.children.find(c => c.href === href);
            if (child) return child;
        }
    }
    return undefined;
}

// Helper function to get parent navigation item
export function getParentNavItem(href: string): NavItem | undefined {
    for (const item of navigation) {
        if (item.children) {
            const hasChild = item.children.some(c => c.href === href);
            if (hasChild) return item;
        }
    }
    return undefined;
}

// Helper function to get breadcrumb trail
export function getBreadcrumbs(pathname: string): Array<{ label: string; href: string }> {
    const breadcrumbs: Array<{ label: string; href: string }> = [
        { label: 'Home', href: '/' },
    ];

    const item = getNavItemByHref(pathname);
    if (item) {
        const parent = getParentNavItem(pathname);
        if (parent) {
            breadcrumbs.push({ label: parent.label, href: parent.href });
        }
        breadcrumbs.push({ label: item.label, href: item.href });
    }

    return breadcrumbs;
}

// Helper to filter navigation based on user permissions
export function filterNavigationByPermissions(
    items: NavItem[],
    userPermissions: string[]
): NavItem[] {
    return items
        .filter(item => {
            // If no permissions specified, item is accessible to all
            if (!item.permissions || item.permissions.length === 0) {
                return true;
            }
            // Check if user has any of the required permissions
            return item.permissions.some(permission =>
                userPermissions.includes(permission)
            );
        })
        .map(item => {
            // Recursively filter children
            if (item.children) {
                return {
                    ...item,
                    children: filterNavigationByPermissions(item.children, userPermissions),
                };
            }
            return item;
        });
}