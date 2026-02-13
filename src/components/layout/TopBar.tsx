// components/layout/TopBar.tsx
'use client';

import { useRouter } from 'next/navigation';
import { Menu, User, LogOut, ChevronDown, Settings, HelpCircle } from 'lucide-react';
import { Button, DropdownMenu } from '@/components/ui';
import { useLayout } from './MainLayout';
import { signOut } from 'next-auth/react';
import { TopBarProps } from '@/types/nav';

export function TopBar({ user, companyName, showHamburger }: Readonly<TopBarProps>) {
  const router = useRouter();
  const { toggleSidebar, toggleSidebarCollapse } = useLayout();

  const isMobile = globalThis.window !== undefined && window.innerWidth <= 767;

  const handleLogout = async () => {
    try {
      await signOut({ redirect: false });
      router.replace('/login');
    } catch (err) {
      console.error('Logout failed:', err);
      router.replace('/login');
    }
  };

  const items = [
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

  const mobileItems = items;

  const desktopItems = items.filter((i) => i.id !== 'logout');

  return (
    <header className="sticky top-0 z-30 layout-header border-b border-neutral-200 bg-neutral">
      <div className="flex h-full items-center justify-between px-4 md:px-6">
        {/* Left */}
        <div className="flex items-center gap-3">
          {showHamburger && (
            <button
              type="button"
              onClick={isMobile ? toggleSidebar : toggleSidebarCollapse}
              className="rounded-md p-2 hover:bg-neutral-50 md:hidden xl:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}

          <span className="font-semibold text-lg hidden md:inline-block">{companyName}</span>
          <span className="font-semibold text-lg md:hidden">{companyName.split(' ')[0]}</span>
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
                icon={<ChevronDown className="h-5 w-5 hidden md:inline-block" />}
                iconPosition="right"
              >
                <span className="hidden md:inline-block">{user.name}</span>
              </Button>
            }
            align="right"
            items={isMobile ? (mobileItems as any) : (desktopItems as any)}
          />

          {/* Logout Button - Desktop/Tablet only */}
          {!isMobile && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="gap-2"
              icon={<LogOut className="h-4 w-4" />}
            >
              <span className="hidden md:inline-block">Logout</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
