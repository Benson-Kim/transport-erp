'use client';
import type { ReactNode } from 'react';
import { useState, useRef, useEffect } from 'react';

import { Tooltip } from '@/components/ui';
import { useEscapeKey } from '@/hooks';
import { cn } from '@/lib/utils/cn';

export type DropdownMenuItem =
  | {
      id: string;
      label: ReactNode;
      icon?: ReactNode;
      onClick?: () => void;
      disabled?: boolean;
      danger?: boolean;
      tooltip?: string;
      submenu?: DropdownMenuItem[];
      divider?: false;
    }
  | {
      id: string;
      divider: true;
    };

export interface DropdownMenuProps {
  trigger: ReactNode;
  items: DropdownMenuItem[];
  align?: 'left' | 'right';
  position?: 'bottom' | 'left' | 'right';
  className?: string;
}

export function DropdownMenu({
  trigger,
  items,
  align = 'left',
  position = 'bottom',
  className,
}: Readonly<DropdownMenuProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const [submenuOpenId, setSubmenuOpenId] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [menuPosition, setMenuPosition] = useState<{
    vertical: 'top' | 'bottom' | 'center';
    horizontal?: 'left' | 'right';
  }>({ vertical: 'bottom' });

  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen || !triggerRef.current || !menuRef.current) return;

    const calculatePosition = () => {
      const triggerRect = triggerRef.current?.getBoundingClientRect();
      const menuRect = menuRef.current?.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;

      let vertical: 'top' | 'bottom' | 'center' = 'bottom';
      let horizontal: 'left' | 'right' = 'left';

      if (position === 'left' || position === 'right') {
        const spaceAbove = triggerRect.top;
        const spaceBelow = viewportHeight - triggerRect.bottom;
        const menuHeight = menuRect.height;
        const triggerMidpoint = triggerRect.top + triggerRect.height / 2;
        const halfMenuHeight = menuHeight / 2;

        if (
          triggerMidpoint - halfMenuHeight > 0 &&
          triggerMidpoint + halfMenuHeight < viewportHeight
        ) {
          vertical = 'center';
        } else if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
          vertical = 'top';
        } else {
          vertical = 'bottom';
        }

        if (position === 'left') {
          const spaceLeft = triggerRect.left;
          if (spaceLeft < menuRect.width) {
            horizontal = 'right';
          } else {
            horizontal = 'left';
          }
        } else {
          const spaceRight = viewportWidth - triggerRect.right;
          if (spaceRight < menuRect.width) {
            horizontal = 'left';
          } else {
            horizontal = 'right';
          }
        }
      } else {
        const spaceBelow = viewportHeight - triggerRect.bottom;
        const spaceAbove = triggerRect.top;

        if (spaceBelow < menuRect.height && spaceAbove > spaceBelow) {
          vertical = 'top';
        }
      }

      setMenuPosition({ vertical, horizontal });
    };

    calculatePosition();

    const handleRecalculate = () => calculatePosition();
    window.addEventListener('scroll', handleRecalculate, true);
    window.addEventListener('resize', handleRecalculate);

    return () => {
      window.removeEventListener('scroll', handleRecalculate, true);
      window.removeEventListener('resize', handleRecalculate);
    };
  }, [isOpen, position]);

  useEscapeKey(() => {
    if (isOpen) {
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  });

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSubmenuOpenId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const enabledItems = items.filter(
      (i): i is Exclude<DropdownMenuItem, { divider: true }> => !('divider' in i) && !i.disabled
    );

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((prev) => (prev + 1) % enabledItems.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((prev) => (prev <= 0 ? enabledItems.length - 1 : prev - 1));
        break;
      case 'Enter':
      case ' ': {
        e.preventDefault();
        const item = enabledItems[focusedIndex];
        if (item) {
          if (item.submenu) {
            setSubmenuOpenId(item.id);
          } else {
            item.onClick?.();
            setIsOpen(false);
          }
        }
        break;
      }
      case 'ArrowRight': {
        e.preventDefault();
        const rightItem = enabledItems[focusedIndex];
        if (rightItem?.submenu) {
          setSubmenuOpenId(rightItem.id);
        }
        break;
      }
      case 'ArrowLeft':
        e.preventDefault();
        if (submenuOpenId) {
          setSubmenuOpenId(null);
        } else {
          setIsOpen(false);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
      case 'Tab':
        setIsOpen(false);
        break;
      default:
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  const getPositionClasses = () => {
    const classes: string[] = ['absolute z-50'];

    if (position === 'left' || position === 'right') {
      if (menuPosition.horizontal === 'left') {
        classes.push('right-full mr-2');
      } else {
        classes.push('left-full ml-2');
      }

      if (menuPosition.vertical === 'center') {
        classes.push('top-1/2 -translate-y-1/2');
      } else if (menuPosition.vertical === 'top') {
        classes.push('bottom-0');
      } else {
        classes.push('top-0');
      }
    } else {
      if (menuPosition.vertical === 'top') {
        classes.push('bottom-full mb-2');
      } else {
        classes.push('mt-2');
      }

      if (align === 'right') {
        classes.push('right-0');
      } else {
        classes.push('left-0');
      }
    }

    return classes.join(' ');
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
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          className={cn(
            getPositionClasses(),
            'min-w-[200px] origin-center',
            'bg-white rounded-md shadow-lg',
            'animate-in fade-in-0 zoom-in-95 duration-100',
            className
          )}
        >
          <div className="py-1">
            {items.map((item) => {
              if ('divider' in item && item.divider) {
                return <div key={item.id} className="my-1 h-px bg-neutral-200" role="separator" />;
              }

              const enabledIndex = items
                .filter(
                  (i): i is Exclude<DropdownMenuItem, { divider: true }> =>
                    !('divider' in i) && !i.disabled
                )
                .findIndex((i) => i.id === item.id);

              const isFocused = enabledIndex === focusedIndex;

              const handleItemClick = () => {
                if (item.disabled) return;
                if (item.submenu) {
                  setSubmenuOpenId(submenuOpenId === item.id ? null : item.id);
                } else {
                  item.onClick?.();
                  setIsOpen(false);
                }
              };

              const ItemButton = (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={handleItemClick}
                  onMouseEnter={() => {
                    if (item.submenu) setSubmenuOpenId(item.id);
                    setFocusedIndex(enabledIndex);
                  }}
                  onMouseLeave={() => {
                    if (item.submenu) return;
                    setFocusedIndex(-1);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 px-4 py-2 text-sm text-left',
                    'transition-colors relative',
                    item.disabled && 'text-neutral-400 cursor-not-allowed',
                    item.danger
                      ? 'text-red-600 hover:bg-red-50'
                      : 'text-neutral-700 hover:bg-neutral-100',
                    isFocused && 'bg-neutral-100'
                  )}
                >
                  <div className="flex items-center gap-2">
                    {item.icon && <span className="w-4">{item.icon}</span>}
                    <span>{item.label}</span>
                  </div>
                  {item.submenu && <span className="text-xs opacity-60">›</span>}
                </button>
              );

              return (
                <div key={item.id} className="relative group">
                  {item.tooltip ? (
                    <Tooltip content={item.tooltip} position="right">
                      {ItemButton}
                    </Tooltip>
                  ) : (
                    ItemButton
                  )}

                  {/* Submenu */}
                  {item.submenu && submenuOpenId === item.id && (
                    <div
                      role="menu"
                      className={cn(
                        'absolute top-0 left-full ml-1 min-w-[180px]',
                        'bg-white rounded-md shadow-lg',
                        'animate-in fade-in duration-150'
                      )}
                    >
                      <div className="py-1">
                        {item.submenu
                          .filter(
                            (sub): sub is Exclude<DropdownMenuItem, { divider: true }> =>
                              !('divider' in sub)
                          )
                          .map((sub) => (
                            <button
                              key={sub.id}
                              type="button"
                              onClick={() => {
                                sub.onClick?.();
                                setIsOpen(false);
                              }}
                              className={cn(
                                'flex w-full items-center gap-2 px-4 py-2 text-sm text-left transition-colors',
                                sub.disabled && 'text-neutral-400 cursor-not-allowed',
                                sub.danger
                                  ? 'text-red-600 hover:bg-red-50'
                                  : 'text-neutral-700 hover:bg-neutral-100'
                              )}
                            >
                              {sub.icon && <span className="w-4">{sub.icon}</span>}
                              <span>{sub.label}</span>
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
