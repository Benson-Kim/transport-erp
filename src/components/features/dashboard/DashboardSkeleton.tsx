/**
 * Dashboard Skeleton Components
 * Loading states for dashboard sections
 */

import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';

const statsCardKeys = new Array(4).fill(null).map(() => crypto.randomUUID());

const tableRowKeys = new Array(5).fill(null).map(() => crypto.randomUUID());

export const DashboardSkeleton = {
  Stats: () => (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {statsCardKeys.map((id) => (
        <Card key={id} variant="bordered">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-8 rounded-lg" />
          </CardHeader>
          <CardBody>
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-3 w-20" />
          </CardBody>
        </Card>
      ))}
    </div>
  ),

  Chart: () => (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-48 mt-1" />
      </CardHeader>
      <CardBody>
        <Skeleton className="h-[350px] w-full" />
      </CardBody>
    </Card>
  ),

  Table: () => (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-32" />
      </CardHeader>
      <CardBody className="p-0">
        <div className="space-y-2 p-4">
          {tableRowKeys.map((id) => (
            <Skeleton key={id} className="h-12 w-full" />
          ))}
        </div>
      </CardBody>
    </Card>
  ),
};
