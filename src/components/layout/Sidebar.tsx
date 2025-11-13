'use client';

import { JSX, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { ChevronRight, Menu } from 'lucide-react';
import { useLayout } from './MainLayout';
import { Tooltip } from '@/components/ui';
import { navigation } from './navigation-config';
import { NavItem } from '@/types/nav';

interface SidebarProps {
  variant: 'desktop' | 'tablet';
  collapsed?: boolean;
  companyName: string;
  user: { name: string; email: string; role: string; avatar?: string };
}

export function Sidebar({ variant, collapsed = false, companyName, user }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { toggleSidebarCollapse } = useLayout();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const renderItem = (item: NavItem, depth = 0): JSX.Element => {
    const hasChildren = !!item.children?.length;
    const open = expanded.has(item.id);
    const active = isActive(item.href);
    const Icon = item.icon;

    const base = cn(
      'nav-item',
      depth > 0 && !collapsed && 'ps-9)]',
      collapsed && variant === 'tablet' && 'justify-center',
      active && 'nav-item-active'
    );

    const content = (
      <button
        type="button"
        onClick={() => (hasChildren ? toggle(item.id) : router.push(item.href))}
        className={base}
      >
        <Icon
          className={cn(
            'icon-sm)] flex-shrink-0',
            collapsed && variant === 'tablet' && 'icon-md)]'
          )}
        />
        {(!collapsed || variant === 'desktop') && (
          <>
            <span className="flex-1 text-left font-medium">{item.label}</span>
            {item.badge !== undefined && <span className="badge badge-active">{item.badge}</span>}
            {hasChildren && (
              <ChevronRight className={cn('icon-sm)] transition-transform', open && 'rotate-90')} />
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
        {hasChildren && open && (!collapsed || variant === 'desktop') && (
          <ul className="mt-space-1)] space-y-space-1">
            {item.children!.map((c) => renderItem(c, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <aside
      data-state={collapsed ? 'collapsed' : 'open'}
      className={cn(
        'fixed inset-y-0 left-0 z-40 bg-neutral border-r border-neutral-200',
        'transition-[width] duration-300 ease-in-out',
        variant === 'desktop' && 'layout-sidebar',
        variant === 'tablet' && (collapsed ? 'layout-sidebar-collapsed' : 'layout-tablet')
      )}
    >
      <div className="flex h-full flex-col">
        {/* Header */}
        <header className="flex layout-header items-center justify-between border-b border-neutral-200 px-4">
          {variant === 'tablet' && (
            <button
              type="button"
              onClick={toggleSidebarCollapse}
              className="rounded-md p-1.5 hover:bg-row-hover"
            >
              <Menu className="size-icon-sm" />
            </button>
          )}
          {(!collapsed || variant === 'desktop') && (
            <div className="flex items-center gap-2">
              <div className="logo rounded-md bg-primary" />
              <span className="font-semibold">{companyName}</span>
            </div>
          )}
        </header>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3">
          <ul className="space-y-1">{navigation.map(renderItem)}</ul>
        </nav>

        {/* User */}
        {(!collapsed || variant === 'desktop') && (
          <footer className="border-t border-neutral-200 p-3">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="avatar rounded-full bg-primary" />
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">{user.name}</p>
                <p className="truncate text-xs text-neutral-500">{user.role}</p>
              </div>
            </div>
          </footer>
        )}
      </div>
    </aside>
  );
}
