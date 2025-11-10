/**
 * Toast Notification Manager
 * Global toast state management
 */

import { create } from 'zustand';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  addToast: (toast) => {
    const id = Math.random().toString(36).substring(7);
    const newToast = { ...toast, id };

    set((state) => ({
      toasts: [...state.toasts, newToast],
    }));

    return id;
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },

  clearToasts: () => {
    set({ toasts: [] });
  },
}));

// Convenience functions
export const toast = {
  success: (title: string, description?: string) => {
    return useToastStore.getState().addToast({
      title,
      description: description ?? "",
      variant: 'success',
    });
  },

  error: (title: string, description?: string) => {
    return useToastStore.getState().addToast({
      title,
      description: description ?? "",
      variant: 'error',
    });
  },

  warning: (title: string, description?: string) => {
    return useToastStore.getState().addToast({
      title,
      description: description ?? "",
      variant: 'warning',
    });
  },

  info: (title: string, description?: string) => {
    return useToastStore.getState().addToast({
      title,
      description: description ?? "",
      variant: 'info',
    });
  },

  custom: (toast: Omit<Toast, 'id'>) => {
    return useToastStore.getState().addToast(toast);
  },
};