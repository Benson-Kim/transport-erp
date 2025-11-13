'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils/cn';
import { X } from 'lucide-react';
import { navigation } from './navigation-config';
import { NavItem } from '@/types/nav';

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  companyName: string;
  user: { name: string; email: string; role: string; avatar?: string };
}

export function MobileMenu({ isOpen, onClose, companyName, user }: MobileMenuProps) {
  const pathname = usePathname();
  const router = useRouter();

  // lock scroll
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (typeof document === 'undefined') return null;

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const renderItem = (item: NavItem, depth = 0) => {
    const Icon = item.icon;
    const active = isActive(item.href);
    const hasChildren = !!item.children?.length;

    return (
      <li key={item.id}>
        <button
          type="button"
          onClick={() => {
            router.push(item.href);
            onClose();
          }}
          className={cn(
            'nav-item w-full',
            active && 'nav-item-active',
            depth > 0 && 'ps-9'
          )}
        >
          <Icon className="icon-sm flex-shrink-0" />
          <span className="flex-1 text-left font-medium">{item.label}</span>
          {item.badge !== undefined && <span className="badge badge-active">{item.badge}</span>}
        </button>

        {hasChildren && (
          <ul className="mt-1 space-y-1">
            {item.children!.map((c) => renderItem(c, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  const portal = (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-50 bg-black/50 transition-opacity lg:hidden',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-full max-w-xs bg-neutral transition-transform lg:hidden',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <header className="flex layout-header items-center justify-between border-b border-neutral-200 px-4">
            <div className="flex items-center gap-2">
              <div className="logo rounded-radius-md bg-primary" />
              <span className="font-semibold">{companyName}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 hover:bg-row-hover"
            >
              <X className="icon-sm" />
            </button>
          </header>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4">
            <ul className="space-y-1">{navigation.map((i) => renderItem(i))}</ul>
          </nav>

          {/* User */}
          <footer className="border-t border-neutral-200 p-4">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="avatar rounded-full bg-primary" />
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">{user.name}</p>
                <p className="truncate text-xs text-neutral-500">{user.role}</p>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </>
  );

  return createPortal(portal, document.body);
}
