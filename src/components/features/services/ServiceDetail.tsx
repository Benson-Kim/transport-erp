// components/features/services/ServiceDetail.tsx
'use client';

import {
  Calendar,
  Building2,
  Truck,
  User,
  Hash,
  MapPin,
  Calculator,
  FileText,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

import { Card, CardBody, Badge } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { formatCurrency, formatDistance, formatPercentage } from '@/lib/utils/formatting';
import { formatDate } from '@/lib/utils/date-formats';

interface ServiceDetailProps {
  service: any;
}

export function ServiceDetail({ service }: Readonly<ServiceDetailProps>) {
  // Calculate totals with VAT
  const costTotalWithVat = Number(service.costAmount) + Number(service.costVatAmount);
  const saleTotalWithVat = Number(service.saleAmount) + Number(service.saleVatAmount);

  // Calculate margins
  const margin = Number(service.saleAmount) - Number(service.costAmount);
  const marginPercent =
    Number(service.saleAmount) > 0 ? (margin / Number(service.saleAmount)) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Service Information Card */}
      <Card>
        <CardBody>
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <FileText className="h-5 w-5 mr-2" />
            Service Information
          </h2>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-muted-foreground flex items-center mb-1">
                <Calendar className="h-4 w-4 mr-1" />
                Date
              </dt>
              <dd className="font-medium">{formatDate.readable(service.date)}</dd>
            </div>

            <div>
              <dt className="text-sm text-muted-foreground flex items-center mb-1">
                <Building2 className="h-4 w-4 mr-1" />
                Client
              </dt>
              <dd className="font-medium">
                <a href={`/clients/${service.clientId}`} className="text-primary hover:underline">
                  {service.client.name}
                </a>
              </dd>
            </div>

            <div>
              <dt className="text-sm text-muted-foreground flex items-center mb-1">
                <Truck className="h-4 w-4 mr-1" />
                Supplier
              </dt>
              <dd className="font-medium">
                <a
                  href={`/suppliers/${service.supplierId}`}
                  className="text-primary hover:underline"
                >
                  {service.supplier.name}
                </a>
              </dd>
            </div>

            {service.driverName && (
              <div>
                <dt className="text-sm text-muted-foreground flex items-center mb-1">
                  <User className="h-4 w-4 mr-1" />
                  Driver
                </dt>
                <dd className="font-medium">{service.driverName}</dd>
              </div>
            )}

            {service.vehiclePlate && (
              <div>
                <dt className="text-sm text-muted-foreground flex items-center mb-1">
                  <Truck className="h-4 w-4 mr-1" />
                  Registration
                </dt>
                <dd className="font-medium uppercase">{service.vehiclePlate}</dd>
              </div>
            )}

            {service.reference && (
              <div>
                <dt className="text-sm text-muted-foreground flex items-center mb-1">
                  <Hash className="h-4 w-4 mr-1" />
                  Reference
                </dt>
                <dd className="font-medium">{service.reference}</dd>
              </div>
            )}

            {service.vehicleType && (
              <div>
                <dt className="text-sm text-muted-foreground flex items-center mb-1">
                  <Truck className="h-4 w-4 mr-1" />
                  Vehicle Type
                </dt>
                <dd className="font-medium">{service.vehicleType}</dd>
              </div>
            )}
          </dl>

          {service.description && (
            <div className="mt-4 pt-4 border-t">
              <dt className="text-sm text-muted-foreground mb-1">Description</dt>
              <dd className="text-sm">{service.description}</dd>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Location Details Card */}
      <Card>
        <CardBody>
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <MapPin className="h-5 w-5 mr-2" />
            Location Details
          </h2>

          <div className="space-y-4">
            <div>
              <dt className="text-sm text-muted-foreground flex items-center mb-1">
                <MapPin className="h-4 w-4 mr-1" />
                Origin / Loading Area
              </dt>
              <dd className="font-medium bg-neutral-50 p-3 rounded">{service.origin}</dd>
            </div>

            <div>
              <dt className="text-sm text-muted-foreground flex items-center mb-1">
                <MapPin className="h-4 w-4 mr-1" />
                Destination / Unloading Site
              </dt>
              <dd className="font-medium bg-neutral-50 p-3 rounded">{service.destination}</dd>
            </div>

            {service.distance && service.distance > 0 && (
              <div className="flex items-center justify-between p-3 bg-primary-50 rounded">
                <span className="text-sm font-medium">Total Distance</span>
                <span className="font-bold text-primary">{formatDistance(service.distance)}</span>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Pricing Details Card */}
      <Card>
        <CardBody>
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <Calculator className="h-5 w-5 mr-2" />
            Pricing Details
          </h2>

          <div className="space-y-4">
            {/* Cost Section */}
            <div className="p-4 bg-neutral-50 rounded">
              <h3 className="font-medium text-sm mb-3">Cost Breakdown</h3>
              <dl className="space-y-2">
                <div className="flex justify-between text-sm">
                  <dt className="text-muted-foreground">Base Amount</dt>
                  <dd>{formatCurrency(service.costAmount, service.costCurrency)}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-muted-foreground">
                    VAT ({formatPercentage(service.costVatRate)})
                  </dt>
                  <dd>{formatCurrency(service.costVatAmount, service.costCurrency)}</dd>
                </div>
                <div className="flex justify-between font-medium pt-2 border-t">
                  <dt>Total Cost</dt>
                  <dd>{formatCurrency(costTotalWithVat, service.costCurrency)}</dd>
                </div>
              </dl>
            </div>

            {/* Sale Section */}
            <div className="p-4 bg-neutral-50 rounded">
              <h3 className="font-medium text-sm mb-3">Sale Breakdown</h3>
              <dl className="space-y-2">
                <div className="flex justify-between text-sm">
                  <dt className="text-muted-foreground">Base Amount</dt>
                  <dd>{formatCurrency(service.saleAmount, service.saleCurrency)}</dd>
                </div>
                <div className="flex justify-between text-sm">
                  <dt className="text-muted-foreground">
                    VAT ({formatPercentage(service.saleVatRate)})
                  </dt>
                  <dd>{formatCurrency(service.saleVatAmount, service.saleCurrency)}</dd>
                </div>
                <div className="flex justify-between font-medium pt-2 border-t">
                  <dt>Total Sale</dt>
                  <dd>{formatCurrency(saleTotalWithVat, service.saleCurrency)}</dd>
                </div>
              </dl>
            </div>

            {/* Margin Analysis */}
            <div
              className={cn(
                'p-4 rounded-lg border-2',
                margin >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  {margin >= 0 ? (
                    <TrendingUp className="h-5 w-5 mr-2 text-green-600" />
                  ) : (
                    <TrendingDown className="h-5 w-5 mr-2 text-red-600" />
                  )}
                  <h3 className="font-medium">Margin Analysis</h3>
                </div>
                <Badge variant={margin >= 0 ? 'completed' : 'cancelled'} size="sm">
                  {formatPercentage(marginPercent)}
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Gross Margin</dt>
                  <dd
                    className={cn(
                      'font-bold text-lg',
                      margin >= 0 ? 'text-green-600' : 'text-red-600'
                    )}
                  >
                    {formatCurrency(margin, service.saleCurrency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Margin %</dt>
                  <dd
                    className={cn(
                      'font-bold text-lg',
                      marginPercent >= 20 && 'text-green-600',
                      marginPercent >= 10 ? 'text-yellow-600' : 'text-red-600'
                    )}
                  >
                    {formatPercentage(marginPercent)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Markup %</dt>
                  <dd className="font-bold text-lg">
                    {Number(service.costAmount) > 0
                      ? ((margin / Number(service.costAmount)) * 100).toFixed(2)
                      : '0.00'}
                    %
                  </dd>
                </div>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Notes Card */}
      {(service.notes || service.internalNotes) && (
        <Card>
          <CardBody>
            <h2 className="text-lg font-semibold mb-4 flex items-center">
              <FileText className="h-5 w-5 mr-2" />
              Notes
            </h2>

            {service.notes && (
              <div className="mb-4">
                <dt className="text-sm text-muted-foreground mb-1">Public Notes</dt>
                <dd className="text-sm whitespace-pre-wrap bg-neutral-50 p-3 rounded">
                  {service.notes}
                </dd>
              </div>
            )}

            {service.internalNotes && (
              <div className="print:hidden">
                <dt className="text-sm text-muted-foreground mb-1">Internal Notes</dt>
                <dd className="text-sm whitespace-pre-wrap bg-yellow-50 p-3 rounded border border-yellow-200">
                  {service.internalNotes}
                </dd>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
