// components/features/services/ServicesMobileView.tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { UserRole } from '@/app/generated/prisma';
import { ServiceData } from '@/types/service';
import { Card, CardBody, Button, Pagination, Checkbox } from '@/components/ui';
import { ServiceStatusBadge } from './ServiceStatusBadge';
import { BulkActions } from './BulkActions';
import {
  Calendar,
  MapPin,
  DollarSign,
  MoreVertical,
  Users,
  Building2,
  ArrowRight,
} from 'lucide-react';
import { format } from 'date-fns';
import { formatCurrency, formatPercentage } from '@/lib/utils/formatting';
import { cn } from '@/lib/utils/cn';

interface ServicesMobileViewProps {
  services: ServiceData[];
  total: number;
  currentPage: number;
  pageSize: number;
  userRole: UserRole;
}

export function ServicesMobileView({
  services,
  total,
  currentPage,
  pageSize,
  userRole,
}: ServicesMobileViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());

  const totalPages = Math.ceil(total / pageSize);

  const handleSelect = (serviceId: string) => {
    const newSelected = new Set(selectedServices);
    if (newSelected.has(serviceId)) {
      newSelected.delete(serviceId);
    } else {
      newSelected.add(serviceId);
    }
    setSelectedServices(newSelected);
  };

  return (
    <div className="space-y-4">
      {/* Bulk Actions */}
      {selectedServices.size > 0 && (
        <BulkActions
          selectedCount={selectedServices.size}
          selectedIds={Array.from(selectedServices)}
          onClear={() => setSelectedServices(new Set())}
          userRole={userRole}
        />
      )}

      {/* Service Cards */}
      <div className="space-y-3">
        {services.map((service) => {
          const marginPercent =
            service.saleAmount > 0 ? (service.margin / service.saleAmount) * 100 : 0;

          return (
            <Card
              key={service.id}
              className={cn(
                'cursor-pointer transition-all',
                selectedServices.has(service.id) && 'ring-2 ring-primary'
              )}
              onClick={() => router.push(`/services/${service.id}`)}
            >
              <CardBody className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3">
                    <div onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedServices.has(service.id)}
                        onCheckedChange={() => handleSelect(service.id)}
                      />
                    </div>
                    <div>
                      <p className="font-semibold text-primary">{service.serviceNumber}</p>
                      <ServiceStatusBadge status={service.status} size="sm" />
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Handle actions menu
                    }}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3 w-3 text-muted-foreground" />
                    <span>{format(new Date(service.date), 'dd MMM yyyy')}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Users className="h-3 w-3 text-muted-foreground" />
                    <span>{service.clientName}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Building2 className="h-3 w-3 text-muted-foreground" />
                    <span>{service.supplierName}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <MapPin className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs flex items-center gap-1">
                      {service.origin} <ArrowRight className="w-3 h-3" /> {service.destination}
                    </span>
                  </div>

                  <div className="pt-2 border-t flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{formatCurrency(service.saleAmount)}</span>
                    </div>
                    <span
                      className={cn(
                        'text-xs font-medium',
                        service.margin >= 0 ? 'text-green-600' : 'text-red-600'
                      )}
                    >
                      {formatPercentage(marginPercent)} margin
                    </span>
                  </div>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(page) => {
          const params = new URLSearchParams(searchParams.toString());
          params.set('page', page.toString());
          router.push(`/services?${params.toString()}`);
        }}
      />
    </div>
  );
}
