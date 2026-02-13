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

  // Lock scroll and handle Escape key
  useEffect(() => {
    if (!isOpen) return;

    document.body.style.overflow = 'hidden';

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

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
          className={cn('nav-item w-full', active && 'nav-item-active', depth > 0 && 'ps-9')}
          aria-current={active ? 'page' : undefined}
        >
          <Icon className="icon-sm shrink-0" aria-hidden="true" />
          <span className="flex-1 text-left font-medium">{item.label}</span>
          {item.badge !== undefined && <span className="badge badge-active">{item.badge}</span>}
        </button>

        {hasChildren && (
          <ul className="mt-1 space-y-1">{item.children!.map((c) => renderItem(c, depth + 1))}</ul>
        )}
      </li>
    );
  };

  const portal = (
    <dialog
      // role="dialog"
      aria-modal="true"
      aria-label="Mobile navigation menu"
      className={cn('lg:hidden', !isOpen && 'pointer-events-none')}
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close menu"
        tabIndex={isOpen ? 0 : -1}
        className={cn(
          'fixed inset-0 z-50 bg-black/50 transition-opacity',
          isOpen ? 'opacity-100' : 'opacity-0'
        )}
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-full max-w-xs bg-neutral transition-transform',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <header className="flex layout-header items-center justify-between border-b border-neutral-200 px-4">
            <div className="flex items-center gap-2">
              <div className="logo rounded-radius-md bg-primary" aria-hidden="true" />
              <span className="font-semibold">{companyName}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 hover:bg-row-hover"
              aria-label="Close menu"
            >
              <X className="icon-sm" aria-hidden="true" />
            </button>
          </header>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4" aria-label="Main navigation">
            <ul className="space-y-1">{navigation.map((i) => renderItem(i))}</ul>
          </nav>

          {/* User */}
          <footer className="border-t border-neutral-200 p-4">
            <div className="flex items-center gap-3 px-3 py-2">
              <div className="avatar rounded-full bg-primary" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">{user.name}</p>
                <p className="truncate text-xs text-neutral-500">{user.role}</p>
              </div>
            </div>
          </footer>
        </div>
      </aside>
    </dialog>
  );

  return createPortal(portal, document.body);
}
