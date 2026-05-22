// components/features/services/ServiceSidebar.tsx
'use client';

import { Info, Calendar, Building2, Phone, Mail, ExternalLink } from 'lucide-react';

import type { UserRole, Prisma } from '@/app/generated/prisma';
import { Card, CardBody } from '@/components/ui';
import { hasPermission } from '@/lib/permissions';
import { formatDate } from '@/lib/utils/date-formats';

import { RelatedDocuments } from './RelatedDocuments';
import { ServiceStatusBadge } from './ServiceStatusBadge';

interface ServiceSidebarProps {
  service: Prisma.ServiceGetPayload<{
    include: {
      client: {
        select: {
          name: true;
          vatNumber: true;
          billingEmail: true;
          contactPhone: true;
        };
      };
      supplier: {
        select: {
          name: true;
          vatNumber: true;
          email: true;
          phone: true;
        };
      };
      createdBy: {
        select: {
          name: true;
        };
      };
      assignedTo: {
        select: {
          name: true;
        };
      };
      invoiceItems: {
        select: {
          id: true;
          invoice: {
            select: {
              id: true;
              invoiceNumber: true;
            };
          };
        }
      };
      documents: {
        select: {
          id: true;
          documentType: true;
          documentNumber: true;
          fileName: true;
          filePath: true;
          fileSize: true;
          mimeType: true;
          description: true;
          uploadedBy: true;
          uploadedAt: true;
        };
      };
    }
  }>;
  userRole: UserRole;
}

export function ServiceSidebar({ service, userRole }: Readonly<ServiceSidebarProps>) {
  const canViewInternal = hasPermission(userRole, 'services', 'view');

  const linkedInvoice = service.invoiceItems?.[0]?.invoice ?? null;
  const daysActive = Math.floor((Date.now() - new Date(service.createdAt).getTime()) / (1000 * 60 * 60 * 24));

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
              <ServiceStatusBadge status={service.status} size="sm" />
            </div>

            {service.completedAt && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Completed Date</span>
                <span className="text-sm font-medium">
                  {formatDate.compact(service.completedAt)}
                </span>
              </div>
            )}

            {linkedInvoice && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Invoice</span>
                <a
                  href={`/invoices/${linkedInvoice.id}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  #{linkedInvoice.invoiceNumber}
                </a>
              </div>
            )}

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
                  <div className="font-medium">{formatDate.dateTime(service.createdAt)}</div>
                  {service.createdBy && (
                    <div className="text-xs text-muted-foreground">by {service.createdBy.name}</div>
                  )}
                </dd>
              </div>

              {service.updatedAt.getTime() !== service.createdAt.getTime() && (
                <div className="flex items-start justify-between">
                  <dt className="text-muted-foreground">Last Modified</dt>
                  <dd className="text-right">
                    <div className="font-medium">{formatDate.dateTime(service.updatedAt)}</div>
                    {service.assignedTo && (
                      <div className="text-xs text-muted-foreground">
                        by {service.assignedTo.name}
                      </div>
                    )}
                  </dd>
                </div>
              )}

              <div className="flex justify-between">
                <dt className="text-muted-foreground">Days Active</dt>
                <dd className="font-medium">{daysActive}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      )}

      {/* Related Documents */}
      <RelatedDocuments serviceId={service.id} documents={service.documents ?? []} />

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
