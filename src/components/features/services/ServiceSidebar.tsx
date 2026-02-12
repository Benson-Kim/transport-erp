// components/features/services/ServiceSidebar.tsx
'use client';

import { format } from 'date-fns';
import { UserRole, ServiceStatus } from '@/app/generated/prisma';
import { Card, CardBody, Badge } from '@/components/ui';
// import { RelatedDocuments } from './RelatedDocuments';
import { Info, Calendar, Building2, Phone, Mail, ExternalLink } from 'lucide-react';
import { hasPermission } from '@/lib/permissions';
import { SERVICE_STATUS_CONFIG } from '@/lib/service-helpers';
import { ServiceStatusBadge } from './ServiceStatusBadge';

interface ServiceSidebarProps {
  service: any;
  userRole: UserRole;
}

export function ServiceSidebar({ service, userRole }: Readonly<ServiceSidebarProps>) {
  const canViewInternal = hasPermission(userRole, 'services', 'view');
  const config = SERVICE_STATUS_CONFIG[service.status as ServiceStatus];

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card>
        <CardBody>
          <h3 className="font-semibold mb-4 flex items-center">
            <Info className="h-4 w-4 mr-2" />
            Status
          </h3>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Current Status</span>
              <Badge variant={config?.variant ?? 'default'}>
                {service.status.replaceAll('_', ' ')}
              </Badge>
            </div>

            {service.completedAt && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Completed Date</span>
                <span className="text-sm font-medium">
                  {format(new Date(service.completedAt), 'dd MMM yyyy')}
                </span>
              </div>
            )}

            {service.invoice && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Invoice</span>
                <a
                  href={`/invoices/${service.invoice.id}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  #{service.invoice.invoiceNumber}
                </a>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <ServiceStatusBadge status={service.status} size="sm" />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Quick Stats Card */}
      {canViewInternal && (
        <Card>
          <CardBody>
            <h3 className="font-semibold mb-4 flex items-center">
              <Calendar className="h-4 w-4 mr-2" />
              Audit Trail
            </h3>

            <dl className="space-y-3 text-sm">
              <div className="flex items-start justify-between">
                <dt className="text-muted-foreground">Created</dt>
                <dd className="text-right">
                  <div className="font-medium">
                    {format(new Date(service.createdAt), 'dd MMM yyyy HH:mm')}
                  </div>
                  {service.createdBy && (
                    <div className="text-xs text-muted-foreground">by {service.createdBy.name}</div>
                  )}
                </dd>
              </div>

              {service.updatedAt !== service.createdAt && (
                <div className="flex items-start justify-between">
                  <dt className="text-muted-foreground">Last Modified</dt>
                  <dd className="text-right">
                    <div className="font-medium">
                      {format(new Date(service.updatedAt), 'dd MMM yyyy HH:mm')}
                    </div>
                    {service.assignedTo && (
                      <div className="text-xs text-muted-foreground">
                        by {service.assignedTo.name}
                      </div>
                    )}
                  </dd>
                </div>
              )}

              <div className="flex justify-between">
                <dt className="text-muted-foreground">Edit Count</dt>
                <dd className="font-medium">{service.editCount || 0}</dd>
              </div>

              <div className="flex justify-between">
                <dt className="text-muted-foreground">Days Active</dt>
                <dd className="font-medium">
                  {Math.floor(
                    (Date.now() - new Date(service.createdAt).getTime()) / (1000 * 60 * 60 * 24)
                  )}
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      )}

      {/* Related Documents */}
      {/* <RelatedDocuments
                serviceId={service.id}
                documents={service.documents || []}
            /> */}

      {/* Client Quick Info */}
      <Card>
        <CardBody>
          <h3 className="font-semibold mb-4 flex items-center">
            <Building2 className="h-4 w-4 mr-2" />
            Client Information
          </h3>

          <div className="space-y-3">
            <div>
              <p className="font-medium">{service.client.name}</p>
              {service.client.vatNumber && (
                <p className="text-xs text-muted-foreground">VAT: {service.client.vatNumber}</p>
              )}
            </div>

            {service.client.billingEmail && (
              <a
                href={`mailto:${service.client.billingEmail}`}
                className="flex items-center text-sm text-muted-foreground hover:text-primary"
              >
                <Mail className="h-4 w-4 mr-2" />
                {service.client.billingEmail}
              </a>
            )}

            {service.client.contactPhone && (
              <a
                href={`tel:${service.client.contactPhone}`}
                className="flex items-center text-sm text-muted-foreground hover:text-primary"
              >
                <Phone className="h-4 w-4 mr-2" />
                {service.client.contactPhone}
              </a>
            )}

            <a
              href={`/clients/${service.clientId}`}
              className="flex items-center text-sm font-medium text-primary hover:underline"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View Full Details
            </a>
          </div>
        </CardBody>
      </Card>

      {/* Supplier Quick Info */}
      <Card>
        <CardBody>
          <h3 className="font-semibold mb-4 flex items-center">
            <Building2 className="h-4 w-4 mr-2" />
            Supplier Information
          </h3>

          <div className="space-y-3">
            <div>
              <p className="font-medium">{service.supplier.name}</p>
              {service.supplier.vatNumber && (
                <p className="text-xs text-muted-foreground">VAT: {service.supplier.vatNumber}</p>
              )}
            </div>

            {service.supplier.email && (
              <a
                href={`mailto:${service.supplier.email}`}
                className="flex items-center text-sm text-muted-foreground hover:text-primary"
              >
                <Mail className="h-4 w-4 mr-2" />
                {service.supplier.email}
              </a>
            )}

            {service.supplier.phone && (
              <a
                href={`tel:${service.supplier.phone}`}
                className="flex items-center text-sm text-muted-foreground hover:text-primary"
              >
                <Phone className="h-4 w-4 mr-2" />
                {service.supplier.phone}
              </a>
            )}

            <a
              href={`/suppliers/${service.supplierId}`}
              className="flex items-center text-sm font-medium text-primary hover:underline"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View Full Details
            </a>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
