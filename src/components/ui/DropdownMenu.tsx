/**
 * DropdownMenu Component
 * Accessible dropdown menu with keyboard navigation
 */

'use client'
import {  ReactNode, useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils/cn';
import { useEscapeKey } from '@/hooks';

export interface DropdownMenuItem {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  divider?: boolean;
}

export interface DropdownMenuProps {
  trigger: ReactNode;
  items: DropdownMenuItem[];
  align?: 'left' | 'right';
  className?: string;
}

export function DropdownMenu({
  trigger,
  items,
  align = 'left',
  className,
}: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEscapeKey(() => {
    if (isOpen) {
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  });

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const enabledItems = items.filter(item => !item.disabled && !item.divider);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => 
          prev < enabledItems.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => 
          prev > 0 ? prev - 1 : enabledItems.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0) {
          enabledItems[focusedIndex]?.onClick?.();
          setIsOpen(false);
        }
        break;
      case 'Tab':
        setIsOpen(false);
        break;
    }
  };

  return (
    <div className="relative inline-block text-left">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'inline-flex items-center justify-center gap-2',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
        )}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        {trigger}
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          className={cn(
            'absolute z-50 mt-2 min-w-[200px] origin-top-right',
            'bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5',
            'animate-in slide-in-from-top-2 duration-200',
            align === 'right' ? 'right-0' : 'left-0',
            className
          )}
          onKeyDown={handleKeyDown}
        >
          <div className="py-1">
            {items.map((item, index) => {
              if (item.divider) {
                return (
                  <div
                    key={item.id}
                    className="my-1 h-px bg-neutral-200"
                    role="separator"
                  />
                );
              }

              const enabledIndex = items
                .slice(0, index)
                .filter(i => !i.disabled && !i.divider).length;

              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    item.onClick?.();
                    setIsOpen(false);
                  }}
                  disabled={item.disabled}
                  className={cn(
                    'flex w-full items-center gap-2 px-4 py-2 text-sm text-left',
                    'transition-colors',
                    item.disabled
                      ? 'text-neutral-400 cursor-not-allowed'
                      : item.danger
                      ? 'text-red-600 hover:bg-red-50'
                      : 'text-neutral-700 hover:bg-neutral-100',
                    focusedIndex === enabledIndex && 'bg-neutral-100'
                  )}
                  onFocus={() => setFocusedIndex(enabledIndex)}
                >
                  {item.icon && <span className="w-4">{item.icon}</span>}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}