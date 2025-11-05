/**
 * Shared UI Component Types
 * Core types and interfaces for the component library
 */

import { ReactNode, CSSProperties } from 'react';
import { FieldError, FieldValues, UseFormRegisterReturn } from 'react-hook-form';

// Component size variants
export type ComponentSize = 'sm' | 'md' | 'lg';

// Component status variants
export type ComponentStatus = 'default' | 'success' | 'warning' | 'error';

// Input types
export type InputType = 'text' | 'email' | 'tel' | 'number' | 'password' | 'url' | 'search';

// Common component props
export interface BaseComponentProps {
  className?: string;
  style?: CSSProperties;
  'data-testid'?: string;
}

// Form field common props
export interface FormFieldBaseProps extends BaseComponentProps {
  id?: string;
  name?: string;
  label?: ReactNode;
  helperText?: ReactNode;
  error?: FieldError | string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  size?: ComponentSize;
  status?: ComponentStatus;
}

// Icon position
export type IconPosition = 'left' | 'right';

// Option type for selects and radios
export interface Option<T = string> {
  value: T;
  label: string;
  disabled?: boolean;
  group?: string;
  icon?: ReactNode;
  description?: string;
}

// Date range type
export interface DateRange {
  from: Date | null;
  to: Date | null;
}

// Form registration props for React Hook Form
export interface FormRegistrationProps {
  registration?: UseFormRegisterReturn;
  error?: FieldError;
}

// Validation rules
export interface ValidationRules {
  required?: boolean | string;
  min?: number | { value: number; message: string };
  max?: number | { value: number; message: string };
  minLength?: number | { value: number; message: string };
  maxLength?: number | { value: number; message: string };
  pattern?: RegExp | { value: RegExp; message: string };
  validate?: (value: any) => boolean | string | Promise<boolean | string>;
}

// Loading state props
export interface LoadingProps {
  isLoading?: boolean;
  loadingText?: string;
}

// Async data props
export interface AsyncDataProps<T = any> {
  isLoading?: boolean;
  data?: T[];
  error?: Error | null;
  onLoadMore?: () => void;
  hasMore?: boolean;
}