/**
 * Recent Services Component
 * Table showing recent service activity
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  Truck,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface Service {
  id: string;
  serviceNumber: string;
  date: string;
  clientName: string;
  origin: string;
  destination: string;
  status: 'DRAFT' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  amount: number;
  currency: string;
}

interface RecentServicesProps {
  services: Service[];
  isLoading?: boolean;
}

export function RecentServices({ services, isLoading = false }: RecentServicesProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const getStatusIcon = (status: Service['status']) => {
    switch (status) {
      case 'DRAFT':
        return <Clock className="h-3 w-3" />;
      case 'CONFIRMED':
        return <AlertCircle className="h-3 w-3" />;
      case 'IN_PROGRESS':
        return <Truck className="h-3 w-3" />;
      case 'COMPLETED':
        return <CheckCircle className="h-3 w-3" />;
      case 'CANCELLED':
        return <XCircle className="h-3 w-3" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: Service['status']) => {
    switch (status) {
      case 'DRAFT':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
      case 'CONFIRMED':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'IN_PROGRESS':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'COMPLETED':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'CANCELLED':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Trigger data refresh via client-side fetch
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsRefreshing(false);
    // In real implementation, this would call a refresh function
  };

  if (services.length === 0 && !isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Services</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Truck className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No services yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create your first service to get started
            </p>
            <Link href="/services/new">
              <Button className="mt-4" size="sm">
                Create Service
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Recent Services</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Your latest service activity
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="h-8"
          >
            <RefreshCw
              className={cn(
                'h-3 w-3 mr-1',
                isRefreshing && 'animate-spin'
              )}
            />
            Refresh
          </Button>
          <Link href="/services">
            <Button size="sm" variant="outline" className="h-8">
              View All
              <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Service #
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Client
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Route
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {services.map((service, index) => (
                <tr
                  key={service.id}
                  className={cn(
                    'border-b transition-colors hover:bg-muted/50',
                    index === services.length - 1 && 'border-b-0'
                  )}
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/services/${service.id}`}
                      className="font-medium text-sm hover:text-primary transition-colors"
                    >
                      {service.serviceNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {format(new Date(service.date), 'MMM d, yyyy')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium">{service.clientName}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-muted-foreground">
                      <span>{service.origin}</span>
                      <ArrowRight className="inline h-3 w-3 mx-1" />
                      <span>{service.destination}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="secondary"
                      className={cn('gap-1', getStatusColor(service.status))}
                    >
                      {getStatusIcon(service.status)}
                      {service.status.replace('_', ' ')}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-medium">
                      {service.currency === 'EUR' ? '€' : service.currency}
                      {service.amount.toLocaleString()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}