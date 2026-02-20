/**
 * Dashboard Date Range Component
 * Date range selector for filtering dashboard data
 */

'use client';

import { useState } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { Calendar } from 'lucide-react';

import { Select } from '@/components/ui';
import type { Option } from '@/types/ui';

export function DashboardDateRange() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [range, setRange] = useState(searchParams.get('range') || '30d');

  const handleRangeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const {value} = event.target;
    setRange(value);

    const params = new URLSearchParams(searchParams.toString());
    params.set('range', value);
    router.push(`/dashboard?${params.toString()}`);
  };

  const rangeOptions: Option[] = [
    { label: 'Last 7 days', value: '7d' },
    { label: 'Last 30 days', value: '30d' },
    { label: 'Last 90 days', value: '90d' },
    { label: 'Last year', value: '1y' },
    { label: 'Custom range', value: 'custom' },
  ];

  return (
    <div className="flex items-center gap-2">
      <Calendar className="h-4 w-4 text-muted-foreground" />
      <div className="w-40">
        <Select
          options={rangeOptions}
          value={range}
          onChange={handleRangeChange}
          placeholder="Select range"
          size="md"
          clearable
        />
      </div>
    </div>
  );
}
