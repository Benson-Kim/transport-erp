'use client';

import { DeliveryEvent, DeliveryStatus } from '@/app/generated/prisma';

export default function TrackingTimeline({ events }: { events: DeliveryEvent[] }) {
  if (!events || events.length === 0) {
    return <p className="text-gray-500">No tracking history available yet.</p>;
  }

  return (
    <div className="relative border-l border-gray-200 ml-3">
      {events.map((event, index) => (
        <div key={event.id} className="mb-8 ml-6">
          <span className="absolute flex items-center justify-center w-6 h-6 bg-blue-100 rounded-full -left-3 ring-8 ring-white">
            <div className={`w-3 h-3 rounded-full ${event.status === DeliveryStatus.DELIVERED ? 'bg-green-500' : event.status === DeliveryStatus.FAILED ? 'bg-red-500' : 'bg-blue-600'}`} />
          </span>
          <h3 className="flex items-center mb-1 text-md font-semibold text-gray-900">
            {event.status.replace(/_/g, ' ')}
            {event.status === DeliveryStatus.DELIVERED && index === 0 && (
              <span className="bg-green-100 text-green-800 text-xs font-medium mr-2 px-2.5 py-0.5 rounded ml-3">Latest</span>
            )}
          </h3>
          <time className="block mb-2 text-sm font-normal leading-none text-gray-400">
            {new Date(event.occurredAt).toLocaleString()}
          </time>
          {event.notes && <p className="mb-4 text-base font-normal text-gray-500">{event.notes}</p>}
          {event.failedReason && <p className="mb-4 text-sm font-medium text-red-500">Reason: {event.failedReason}</p>}
        </div>
      ))}
    </div>
  );
}
