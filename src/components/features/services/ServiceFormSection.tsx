// components/features/services/ServiceFormSection.tsx
import { ReactNode } from 'react';
import { Card, CardBody } from '@/components/ui';

interface ServiceFormSectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function ServiceFormSection({
  title,
  description,
  children,
  className,
}: ServiceFormSectionProps) {
  return (
    <Card className={className}>
      <CardBody>
        <div className="mb-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
        </div>
        {children}
      </CardBody>
    </Card>
  );
}
