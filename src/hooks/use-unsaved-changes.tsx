// hooks/use-unsaved-changes.ts
'use client';

import { useEffect } from 'react';

/**
 * Hook to warn users about unsaved changes when navigating away
 * @param isDirty - Whether the form has unsaved changes
 * @param message - Custom warning message
 */
export function useUnsavedChanges(
  isDirty: boolean,
  message: string = 'You have unsaved changes. Are you sure you want to leave?'
) {
  useEffect(() => {
    // Browser navigation (close tab, refresh, etc.)
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        return '';
      }
      return undefined;
    };

    const handlePopState = () => {
      if (isDirty && !globalThis.confirm(message)) {
        globalThis.history.pushState(null, '', globalThis.location.href);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    globalThis.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      globalThis.removeEventListener('popstate', handlePopState);
    };
  }, [isDirty, message]);
}
