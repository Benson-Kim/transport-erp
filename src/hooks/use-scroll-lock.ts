/**
 * Scroll Lock Hook
 * Prevents body scroll when active
 */

import { useEffect } from 'react';

export function useScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) return;

    const originalStyle = globalThis.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, [isLocked]);
}
