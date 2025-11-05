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
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

interface FormProps<TFieldValues extends FieldValues = FieldValues> {
  children: ReactNode | ((methods: UseFormReturn<TFieldValues>) => ReactNode);
  onSubmit: SubmitHandler<TFieldValues>;
  schema?: z.ZodObject<any>;
  options?: UseFormProps<TFieldValues>;
  className?: string;
  id?: string;
}

export function Form<TFieldValues extends FieldValues = FieldValues>({
  children,
  onSubmit,
  schema,
  options = {},
  className,
  id,
}: FormProps<TFieldValues>) {
  const methods = useForm<TFieldValues>({
    ...options,
    resolver: schema ? zodResolver(schema) : undefined,
  });

  return (
    <FormProvider {...methods}>
      <form
        id={id}
        className={className}
        onSubmit={methods.handleSubmit(onSubmit)}
        noValidate
      >
        {typeof children === 'function' ? children(methods) : children}
      </form>
    </FormProvider>
  );
}

// Export convenience hooks
export { useFormContext } from 'react-hook-form';