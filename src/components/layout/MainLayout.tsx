// components/layout/MainLayout.tsx
'use client';

import { useState, useEffect, createContext, useContext } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { useMediaQuery } from '@/hooks';
import { Sidebar, MobileMenu, TopBar } from '@/components/layout';

interface LayoutContextValue {
    isSidebarOpen: boolean;
    isSidebarCollapsed: boolean;
    toggleSidebar: () => void;
    toggleSidebarCollapse: () => void;
    closeSidebar: () => void;
}

const LayoutContext = createContext<LayoutContextValue | null>(null);

export const useLayout = () => {
    const context = useContext(LayoutContext);
    if (!context) {
        throw new Error('useLayout must be used within LayoutProvider');
    }
    return context;
};

interface MainLayoutProps {
    children: React.ReactNode;
    user: {
        name: string;
        email: string;
        role: string;
        avatar?: string;
    };
    companyName: string;
}

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
        setIsSidebarOpen(!isSidebarOpen);
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
            <div className="min-h-screen bg-background">
                {/* Desktop Sidebar - Always visible */}
                {isDesktop && (
                    <Sidebar
                        variant="desktop"
                        companyName={companyName}
                        user={user}
                    />
                )}

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
                        "min-h-screen transition-all duration-300",
                        // Desktop: Fixed margin for sidebar
                        isDesktop && "xl:ml-60",
                        // Tablet: Dynamic margin based on collapsed state
                        isTablet && (isSidebarCollapsed ? "md:ml-[60px]" : "md:ml-60"),
                        // Mobile: Full width
                        isMobile && "w-full"
                    )}
                >
                    {/* Top Bar */}
                    <TopBar
                        user={user}
                        companyName={companyName}
                        showHamburger={!isDesktop}
                    />

                    {/* Page Content */}
                    <main className="px-4 py-6 md:px-6 lg:px-8">
                        <div className="mx-auto max-w-[1400px]">
                            {children}
                        </div>
                    </main>
                </div>
            </div>
        </LayoutContext.Provider>
    );
}