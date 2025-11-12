// components/layout/TopBar.tsx
'use client';

import { useRouter } from 'next/navigation';
import { Menu, User, LogOut, ChevronDown, Settings, HelpCircle } from 'lucide-react';
import { Button, DropdownMenu } from '@/components/ui';
import { useLayout } from './MainLayout';

interface TopBarProps {
    user: {
        name: string;
        email: string;
        role: string;
        avatar?: string;
    };
    companyName: string;
    showHamburger: boolean;
}

export function TopBar({ user, companyName, showHamburger }: TopBarProps) {
    const router = useRouter();
    const { toggleSidebar, toggleSidebarCollapse } = useLayout();
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 767;

    const handleLogout = () => {
        // Handle logout logic
        router.push('/login');
    };

    const userMenuItems = [
        {
            id: 'profile',
            label: 'Profile',
            icon: <User className="h-4 w-4" />,
            onClick: () => router.push('/profile'),
        },
        {
            id: 'settings',
            label: 'Settings',
            icon: <Settings className="h-4 w-4" />,
            onClick: () => router.push('/settings'),
        },
        {
            id: 'help',
            label: 'Help & Support',
            icon: <HelpCircle className="h-4 w-4" />,
            onClick: () => router.push('/help'),
        },
        { id: 'divider', divider: true },
        {
            id: 'logout',
            label: 'Logout',
            icon: <LogOut className="h-4 w-4" />,
            onClick: handleLogout,
            danger: true,
        },
    ];

    // On mobile, include logout in dropdown
    const mobileMenuItems = userMenuItems;

    // On desktop/tablet, remove logout from dropdown
    const desktopMenuItems = userMenuItems.filter(item => item.id !== 'logout');

    return (
        <header className="sticky top-0 z-30 h-16 border-b bg-background">
            <div className="flex h-full items-center justify-between px-4 md:px-6">
                {/* Left Side */}
                <div className="flex items-center gap-3">
                    {showHamburger && (
                        <button
                            onClick={isMobile ? toggleSidebar : toggleSidebarCollapse}
                            className="p-2 rounded-lg hover:bg-accent md:hidden xl:hidden"
                        >
                            <Menu className="h-5 w-5" />
                        </button>
                    )}

                    <span className="font-semibold text-lg hidden md:inline-block">
                        {companyName}
                    </span>
                    <span className="font-semibold text-lg md:hidden">
                        {companyName.split(' ')[0]}
                    </span>
                </div>

                {/* Right Side */}
                <div className="flex items-center gap-2">
                    {/* User Menu */}
                    <DropdownMenu
                        trigger={
                            <Button
                                variant="ghost"
                                size="sm"
                                className="gap-2"
                            >
                                <div className="h-7 w-7 rounded-full bg-primary" />
                                <span className="hidden md:inline-block">{user.name}</span>
                                <ChevronDown className="h-4 w-4 hidden md:inline-block" />
                            </Button>
                        }
                        align="right"
                        items={isMobile ? mobileMenuItems as any : desktopMenuItems as any}
                    />

                    {/* Logout Button - Desktop/Tablet only */}
                    {!isMobile && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleLogout}
                            className="gap-2"
                        >
                            <LogOut className="h-4 w-4" />
                            <span className="hidden md:inline-block">Logout</span>
                        </Button>
                    )}
                </div>
            </div>
        </header>
    );
}