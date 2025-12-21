// components/layout/MainLayout.tsx
'use client';

import { useState, useEffect, createContext, useContext } from 'react';

import { usePathname } from 'next/navigation';

import { Sidebar, MobileMenu, TopBar } from '@/components/layout';
import { useMediaQuery } from '@/hooks';
import { cn } from '@/lib/utils/cn';
import type { LayoutContextValue, MainLayoutProps } from '@/types/nav';

const LayoutContext = createContext<LayoutContextValue | null>(null);

export const useLayout = () => {
  const ctx = useContext(LayoutContext);
  if (!ctx) throw new Error('useLayout must be used within LayoutProvider');
  return ctx;
};

export function MainLayout({ children, user, companyName }: MainLayoutProps) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Media queries
  const isDesktop = useMediaQuery('(min-width: 1280px)');
  const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1279px)');
  const isMobile = useMediaQuery('(max-width: 767px)');

  // Close mobile sidebar on route change
  useEffect(() => {
    if (isMobile) {
      setIsSidebarOpen(false);
    }
  }, [pathname, isMobile]);

  // Restore collapsed state from localStorage (tablet only)
  useEffect(() => {
    if (isTablet) {
      const stored = localStorage.getItem('sidebar-collapsed');
      setIsSidebarCollapsed(stored === 'true');
    }
  }, [isTablet]);

  const toggleSidebar = () => {
    setIsSidebarOpen((isSidebarOpen) => !isSidebarOpen);
  };

  const toggleSidebarCollapse = () => {
    if (isTablet) {
      const newState = !isSidebarCollapsed;
      setIsSidebarCollapsed(newState);
      localStorage.setItem('sidebar-collapsed', String(newState));
    }
  };

  const closeSidebar = () => {
    setIsSidebarOpen(false);
  };

  const contextValue: LayoutContextValue = {
    isSidebarOpen,
    isSidebarCollapsed,
    toggleSidebar,
    toggleSidebarCollapse,
    closeSidebar,
  };

  return (
    <LayoutContext.Provider value={contextValue}>
      <div className="min-h-screen bg-[var(--neutral-50)]">
        {/* Desktop Sidebar - Always visible */}
        {isDesktop && <Sidebar variant="desktop" companyName={companyName} user={user} />}

        {/* Tablet Sidebar - Collapsible */}
        {isTablet && (
          <Sidebar
            variant="tablet"
            collapsed={isSidebarCollapsed}
            companyName={companyName}
            user={user}
          />
        )}

        {/* Mobile Menu - Full screen overlay */}
        {isMobile && (
          <MobileMenu
            isOpen={isSidebarOpen}
            onClose={closeSidebar}
            companyName={companyName}
            user={user}
          />
        )}

        {/* Main Content Area */}
        <div
          className={cn(
            'min-h-screen transition-all duration-300',
            isDesktop && 'xl:ml-[var(--sidebar-desktop)]',
            isTablet &&
              (isSidebarCollapsed
                ? 'md:ml-[var(--sidebar-collapsed)]'
                : 'md:ml-[var(--sidebar-tablet)]'),
            isMobile && 'w-full'
          )}
        >
          {/* Top Bar */}
          <TopBar user={user} companyName={companyName} showHamburger={!isDesktop} />

          {/* Page Content */}
          <main className="px-[var(--space-4)] py-[var(--space-6)] md:px-[var(--space-6)] lg:px-[var(--space-8)]">
            <div className="mx-auto max-w-[1400px]">{children}</div>
          </main>
        </div>
      </div>
    </LayoutContext.Provider>
  );
}
