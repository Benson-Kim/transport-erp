// components/layout/Sidebar.tsx
'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import {
    LayoutDashboard,
    Truck,
    Users,
    Building2,
    FileText,
    BarChart3,
    Settings,
    ChevronRight,
    Menu,
} from 'lucide-react';
import { useLayout } from './MainLayout';
import { Tooltip } from '@/components/ui';

interface NavItem {
    id: string;
    label: string;
    href: string;
    icon: React.ElementType;
    children?: NavItem[];
    badge?: number;
}

const navigation: NavItem[] = [
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
        badge: 5,
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
            { id: 'invoices', label: 'Invoices', href: '/documents/invoices', icon: FileText },
            { id: 'loading-orders', label: 'Loading Orders', href: '/documents/loading-orders', icon: FileText },
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

interface SidebarProps {
    variant: 'desktop' | 'tablet';
    collapsed?: boolean;
    companyName: string;
    user: {
        name: string;
        email: string;
        role: string;
        avatar?: string;
    };
}

export function Sidebar({ variant, collapsed = false, companyName, user }: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { toggleSidebarCollapse } = useLayout();
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

    const toggleExpanded = (id: string) => {
        const newExpanded = new Set(expandedItems);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedItems(newExpanded);
    };

    const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

    const renderNavItem = (item: NavItem, depth = 0) => {
        const hasChildren = item.children && item.children.length > 0;
        const isExpanded = expandedItems.has(item.id);
        const active = isActive(item.href);
        const Icon = item.icon;

        const content = (
            <button
                onClick={() => {
                    if (hasChildren) {
                        toggleExpanded(item.id);
                    } else {
                        router.push(item.href);
                    }
                }}
                className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group",
                    "hover:bg-accent hover:text-accent-foreground",
                    active && "bg-accent text-accent-foreground font-medium",
                    depth > 0 && "pl-9",
                    collapsed && variant === 'tablet' && "justify-center"
                )}
            >
                <Icon className={cn("h-5 w-5 flex-shrink-0", collapsed && variant === 'tablet' && "h-6 w-6")} />

                {(!collapsed || variant === 'desktop') && (
                    <>
                        <span className="flex-1 text-left">{item.label}</span>

                        {item.badge && (
                            <span className="px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground rounded-full">
                                {item.badge}
                            </span>
                        )}

                        {hasChildren && (
                            <ChevronRight
                                className={cn(
                                    "h-4 w-4 transition-transform",
                                    isExpanded && "rotate-90"
                                )}
                            />
                        )}
                    </>
                )}
            </button>
        );

        return (
            <li key={item.id}>
                {collapsed && variant === 'tablet' ? (
                    <Tooltip content={item.label} position="right">
                        {content}
                    </Tooltip>
                ) : (
                    content
                )}

                {hasChildren && isExpanded && (!collapsed || variant === 'desktop') && (
                    <ul className="mt-1 space-y-1">
                        {item.children!.map(child => renderNavItem(child, depth + 1))}
                    </ul>
                )}
            </li>
        );
    };

    return (
        <aside
            className={cn(
                "fixed left-0 top-0 z-40 h-screen bg-card border-r transition-all duration-300",
                variant === 'desktop' && "w-60",
                variant === 'tablet' && (collapsed ? "w-[60px]" : "w-60"),
            )}
        >
            <div className="flex h-full flex-col">
                {/* Header */}
                <div className="flex h-16 items-center justify-between border-b px-4">
                    {variant === 'tablet' && (
                        <button
                            onClick={toggleSidebarCollapse}
                            className="p-1.5 rounded-lg hover:bg-accent"
                        >
                            <Menu className="h-5 w-5" />
                        </button>
                    )}

                    {(!collapsed || variant === 'desktop') && (
                        <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg bg-primary" />
                            <span className="font-semibold">{companyName}</span>
                        </div>
                    )}
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto p-3">
                    <ul className="space-y-1">
                        {navigation.map(item => renderNavItem(item))}
                    </ul>
                </nav>

                {/* User Section */}
                {(!collapsed || variant === 'desktop') && (
                    <div className="border-t p-3">
                        <div className="flex items-center gap-3 px-3 py-2">
                            <div className="h-8 w-8 rounded-full bg-primary" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{user.name}</p>
                                <p className="text-xs text-muted-foreground truncate">{user.role}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </aside>
    );
}