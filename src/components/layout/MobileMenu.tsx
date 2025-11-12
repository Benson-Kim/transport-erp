// components/layout/MobileMenu.tsx
'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils/cn';
import { X } from 'lucide-react';
import { navigation } from '@/components/layout';

interface MobileMenuProps {
    isOpen: boolean;
    onClose: () => void;
    companyName: string;
    user: {
        name: string;
        email: string;
        role: string;
        avatar?: string;
    };
}

export function MobileMenu({ isOpen, onClose, companyName, user }: MobileMenuProps) {
    const pathname = usePathname();
    const router = useRouter();

    // Lock body scroll when menu is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }

        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    // Don't render on server
    if (typeof document === 'undefined') return null;

    const content = (
        <>
            {/* Backdrop */}
            <div
                className={cn(
                    "fixed inset-0 z-50 bg-black/50 transition-opacity lg:hidden",
                    isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
                )}
                onClick={onClose}
            />

            {/* Menu Panel */}
            <div
                className={cn(
                    "fixed inset-y-0 left-0 z-50 w-full max-w-xs bg-card transition-transform lg:hidden",
                    isOpen ? "translate-x-0" : "-translate-x-full"
                )}
            >
                <div className="flex h-full flex-col">
                    {/* Header */}
                    <div className="flex h-16 items-center justify-between border-b px-4">
                        <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg bg-primary" />
                            <span className="font-semibold">{companyName}</span>
                        </div>

                        <button
                            onClick={onClose}
                            className="p-2 rounded-lg hover:bg-accent"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 overflow-y-auto p-4">
                        <ul className="space-y-1">
                            {navigation.map(item => {
                                const Icon = item.icon;
                                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

                                return (
                                    <li key={item.id}>
                                        <button
                                            onClick={() => {
                                                router.push(item.href);
                                                onClose();
                                            }}
                                            className={cn(
                                                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                                                "hover:bg-accent hover:text-accent-foreground",
                                                isActive && "bg-accent text-accent-foreground font-medium"
                                            )}
                                        >
                                            <Icon className="h-5 w-5" />
                                            <span className="flex-1 text-left">{item.label}</span>
                                            {item.badge && (
                                                <span className="px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground rounded-full">
                                                    {item.badge}
                                                </span>
                                            )}
                                        </button>

                                        {item.children && (
                                            <ul className="mt-1 ml-8 space-y-1">
                                                {item.children.map(child => (
                                                    <li key={child.id}>
                                                        <button
                                                            onClick={() => {
                                                                router.push(child.href);
                                                                onClose();
                                                            }}
                                                            className={cn(
                                                                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                                                                "hover:bg-accent hover:text-accent-foreground",
                                                                pathname === child.href && "bg-accent text-accent-foreground font-medium"
                                                            )}
                                                        >
                                                            {child.label}
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </nav>

                    {/* User Section */}
                    <div className="border-t p-4">
                        <div className="flex items-center gap-3 px-3 py-2">
                            <div className="h-10 w-10 rounded-full bg-primary" />
                            <div className="flex-1">
                                <p className="font-medium">{user.name}</p>
                                <p className="text-sm text-muted-foreground">{user.role}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );

    return createPortal(content, document.body);
}