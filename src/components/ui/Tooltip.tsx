/**
 * Tooltip Component
 * Hoverable tooltip with positioning
 */

'use client'
import { ReactNode, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils/cn';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  className?: string;
}

export function Tooltip({
  content,
  children,
  position = 'top',
  delay = 200,
  className,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);


  const calculatePosition = () => {
    if (!triggerRef.current) return { x: 0, y: 0 };

    const rect = triggerRef.current.getBoundingClientRect();
    const spacing = 8;

    switch (position) {
      case 'top':
        return {
          x: rect.left + rect.width / 2,
          y: rect.top - spacing,
        };
      case 'bottom':
        return {
          x: rect.left + rect.width / 2,
          y: rect.bottom + spacing,
        };
      case 'left':
        return {
          x: rect.left - spacing,
          y: rect.top + rect.height / 2,
        };
      case 'right':
        return {
          x: rect.right + spacing,
          y: rect.top + rect.height / 2,
        };
      default:
        return { x: 0, y: 0 };
    }
  };

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      setCoords(calculatePosition());
      setIsVisible(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const positionClasses = {
    top: '-translate-x-1/2 -translate-y-full',
    bottom: '-translate-x-1/2',
    left: '-translate-x-full -translate-y-1/2',
    right: '-translate-y-1/2',
  };

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="inline-block"
      >
        {children}
      </div>
      
      {isVisible && content && createPortal(
        <div
          role="tooltip"
          className={cn(
            'fixed z-50 px-2 py-1 text-xs font-medium text-white bg-neutral-900 rounded',
            'pointer-events-none whitespace-nowrap',
            'animate-in fade-in-0 zoom-in-95 duration-100',
            positionClasses[position],
            className
          )}
          style={{
            left: `${coords.x}px`,
            top: `${coords.y}px`,
          }}
        >
          {content}
          <div
            className={cn(
              'absolute w-2 h-2 bg-neutral-900 transform rotate-45',
              position === 'top' && 'bottom-[-4px] left-1/2 -translate-x-1/2',
              position === 'bottom' && 'top-[-4px] left-1/2 -translate-x-1/2',
              position === 'left' && 'right-[-4px] top-1/2 -translate-y-1/2',
              position === 'right' && 'left-[-4px] top-1/2 -translate-y-1/2'
            )}
          />
        </div>,
        document.body
      )}
    </>
  );
}