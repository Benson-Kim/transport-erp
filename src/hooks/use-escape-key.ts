/**
 * Escape Key Hook
 * Handles escape key press
 */

import { useEffect } from 'react';

export function useEscapeKey(handler: () => void) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handler();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [handler]);
}
