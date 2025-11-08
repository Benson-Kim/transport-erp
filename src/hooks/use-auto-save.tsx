// // hooks/use-auto-save.ts
// import { useCallback, useEffect, useRef, useState } from 'react';
// import { useDebounce } from './use-debounce';
// // import { debounce } from 'lodash';

// interface UseAutoSaveOptions {
//   key: string;
//   delay?: number;
//   enabled?: boolean;
//   onSave?: () => void;
// }

// export function useAutoSave(
//   data: any,
//   { key, delay = 30000, enabled = true, onSave }: UseAutoSaveOptions
// ) {
//   const [savedAt, setSavedAt] = useState<Date | null>(null);
//   const saveTimeoutRef = useRef<NodeJS.Timeout>();

//   const save = useCallback(() => {
//     if (!enabled) return;
    
//     const toSave = {
//       data,
//       savedAt: new Date().toISOString(),
//     };
    
//     localStorage.setItem(key, JSON.stringify(toSave));
//     setSavedAt(new Date());
//     onSave?.();
//   }, [data, key, enabled, onSave]);

//   const debouncedSave = useRef(
//     useDebounce(save, delay)
//   ).current;

//   useEffect(() => {
//     if (enabled) {
//       debouncedSave();
//     }
    
//     return () => {
//       debouncedSave.cancel();
//     };
//   }, [data, enabled, debouncedSave]);

//   const clear = () => {
//     localStorage.removeItem(key);
//     setSavedAt(null);
//   };

//   return { savedAt, clear };
// }

import { useEffect, useState } from 'react';
import { useDebounce } from './use-debounce';

interface UseAutoSaveOptions {
  key: string;
  delay?: number;
  enabled?: boolean;
  onSave?: () => void;
}

export function useAutoSave(
  data: any,
  { key, delay = 30000, enabled = true, onSave }: UseAutoSaveOptions
) {
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  
  // Debounce the data changes
  const debouncedData = useDebounce(data, delay);

  useEffect(() => {
    if (!enabled) return;

    const toSave = {
      data: debouncedData,
      savedAt: new Date().toISOString(),
    };

    localStorage.setItem(key, JSON.stringify(toSave));
    setSavedAt(new Date());
    onSave?.();
  }, [debouncedData, key, enabled, onSave]);

  const clear = () => {
    localStorage.removeItem(key);
    setSavedAt(null);
  };

  return { savedAt, clear };
}
