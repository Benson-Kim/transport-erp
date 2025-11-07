'use client';

/**
 * Form Component
 * React Hook Form wrapper with built-in validation
 */

import { ReactNode } from 'react';
import {
  useForm,
  FormProvider,
  UseFormProps,
  FieldValues,
  SubmitHandler,
  UseFormReturn,
  useFormContext,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

interface FormProps<TFieldValues extends FieldValues = FieldValues> {
  children: ReactNode | ((methods: UseFormReturn<TFieldValues>) => ReactNode);
  onSubmit: SubmitHandler<TFieldValues>;
  schema?: z.ZodSchema<TFieldValues>;
  options?: UseFormProps<TFieldValues>;
  className?: string;
  id?: string;
  disabled?: boolean;
}

export function Form<TFieldValues extends FieldValues = FieldValues>({
  children,
  onSubmit,
  schema,
  options = {},
  className,
  id,
  disabled = false,
}: FormProps<TFieldValues>) {
  const methods = useForm<TFieldValues>({
    ...options,
    resolver: schema ? zodResolver(schema) : undefined,
  });

  const handleSubmit = methods.handleSubmit(async (data) => {
    if (!disabled) {
      await onSubmit(data);
    }
  });

  return (
    <FormProvider {...methods}>
      <form
        id={id}
        className={className}
        onSubmit={handleSubmit}
        noValidate
      >
        <fieldset disabled={disabled} style={{ border: 'none', padding: 0, margin: 0 }}>
          {typeof children === 'function' ? children(methods) : children}
        </fieldset>
      </form>
    </FormProvider>
  );
}

// Export convenience hooks and types
export { useFormContext };
export type { UseFormReturn, FieldValues, SubmitHandler };