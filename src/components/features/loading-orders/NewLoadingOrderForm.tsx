// components/features/loading-orders/NewLoadingOrderForm.tsx
'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { ArrowDown, ArrowUp } from 'lucide-react';

import { createLoadingOrder } from '@/actions/loading-order-actions';
import { ServiceStatusBadge } from '@/components/features/services/ServiceStatusBadge';
import { Button, Card, CardBody, Spinner, Textarea } from '@/components/ui';
import { toast } from '@/lib/toast';
import { formatDate } from '@/lib/utils/date-formats';
import type { LoadingOrderCandidateService } from '@/types/loading-order';

interface NewLoadingOrderFormProps {
  services: LoadingOrderCandidateService[];
}

/**
 * Selection review for a new loading order (#32). Positions are
 * carrier-visible, so the group can be reordered before creation. The
 * server action re-validates and re-authorizes every member - this form is
 * presentation, not a gate.
 */
export function NewLoadingOrderForm({ services }: Readonly<NewLoadingOrderFormProps>) {
  const router = useRouter();
  const [ordered, setOrdered] = useState(services);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const move = (index: number, delta: -1 | 1) => {
    setOrdered((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const item = next[index];
      const other = next[target];
      if (!item || !other) return prev;
      next[index] = other;
      next[target] = item;
      return next;
    });
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const result = await createLoadingOrder({
        serviceIds: ordered.map((service) => service.id),
        notes: notes.trim() ? notes.trim() : undefined,
      });

      if (!result.success || !result.data) {
        toast.error(result.error ?? 'Failed to create loading order');
        return;
      }

      toast.success(`Loading order ${result.data.orderNumber} created`);
      router.push(`/documents/loading-orders/${result.data.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <CardBody>
          <h3 className="font-semibold mb-4">Services ({ordered.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th scope="col" className="p-3 w-12">
                    #
                  </th>
                  <th scope="col" className="p-3">
                    Service
                  </th>
                  <th scope="col" className="p-3">
                    Date
                  </th>
                  <th scope="col" className="p-3">
                    Client
                  </th>
                  <th scope="col" className="p-3">
                    Supplier
                  </th>
                  <th scope="col" className="p-3">
                    Route
                  </th>
                  <th scope="col" className="p-3">
                    Status
                  </th>
                  <th scope="col" className="p-3 w-24">
                    <span className="sr-only">Reorder</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((service, index) => (
                  <tr key={service.id} className="border-b">
                    <td className="p-3 tabular-nums">{index + 1}</td>
                    <td className="p-3 font-medium">{service.serviceNumber}</td>
                    <td className="p-3">{formatDate.dayMonth(service.date)}</td>
                    <td className="p-3">{service.clientName}</td>
                    <td className="p-3">{service.supplierName}</td>
                    <td className="p-3">
                      {service.origin} → {service.destination}
                    </td>
                    <td className="p-3">
                      <ServiceStatusBadge status={service.status} size="sm" />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => move(index, -1)}
                          disabled={index === 0 || isSubmitting}
                          aria-label={`Move ${service.serviceNumber} up`}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => move(index, 1)}
                          disabled={index === ordered.length - 1 || isSubmitting}
                          aria-label={`Move ${service.serviceNumber} down`}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <label htmlFor="loading-order-notes" className="block text-sm font-medium mb-2">
            Notes (optional)
          </label>
          <Textarea
            id="loading-order-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Instructions for the carrier, references, ..."
            maxCharacters={2000}
            showCharacterCount
            disabled={isSubmitting}
          />
        </CardBody>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting || ordered.length === 0}>
          {isSubmitting && <Spinner className="mr-2" />}
          Create Loading Order
        </Button>
      </div>
    </div>
  );
}
