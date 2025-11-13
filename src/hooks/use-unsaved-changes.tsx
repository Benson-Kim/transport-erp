// hooks/use-unsaved-changes.ts
'use client';

import { useEffect } from 'react';
// import { useRouter } from 'next/navigation';

/**
 * Hook to warn users about unsaved changes when navigating away
 * @param isDirty - Whether the form has unsaved changes
 * @param message - Custom warning message
 */
export function useUnsavedChanges(
  isDirty: boolean,
  message: string = 'You have unsaved changes. Are you sure you want to leave?'
) {
  // const router = useRouter();

  useEffect(() => {
    // Browser navigation (close tab, refresh, etc.)
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
      return undefined;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty, message]);

  // For Next.js navigation
  // useEffect(() => {
  //   if (!isDirty) return;

  //   const handleRouteChange = () => {
  //     if (isDirty && !window.confirm(message)) {
  //       // This prevents navigation in Next.js
  //       throw new Error('Route change cancelled');
  //     }
  //   };

  //   // Note: This is a simplified version. For full Next.js 13+ support,
  //   // you might need to use middleware or Route Handlers
  //   return () => {
  //     // Cleanup
  //   };
  // }, [isDirty, message, router]);
}
