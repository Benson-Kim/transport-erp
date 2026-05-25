'use client';

import { useEffect, useState } from 'react';

export default function LiveMap({ trackingToken }: { trackingToken: string }) {
  const [position, setPosition] = useState<{lat: number, lng: number} | null>(null);

  useEffect(() => {
    // Phase 4.2: Connect to SSE stream
    const eventSource = new EventSource(`/api/tracking/${trackingToken}/stream`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'gps') {
        setPosition({ lat: data.lat, lng: data.lng });
      }
    };

    return () => {
      eventSource.close();
    };
  }, [trackingToken]);

  return (
    <div className="w-full h-full relative overflow-hidden bg-slate-100 flex items-center justify-center">
      {/* 
        A real implementation would mount Google Maps or Mapbox here.
        Using a placeholder for the skeleton.
      */}
      {position ? (
        <div className="text-center">
          <p className="text-sm font-medium text-slate-600 mb-2">Live Driver Location</p>
          <div className="px-4 py-2 bg-white rounded shadow-sm border border-slate-200">
            Lat: {position.lat.toFixed(4)}, Lng: {position.lng.toFixed(4)}
          </div>
        </div>
      ) : (
        <div className="text-slate-500 flex flex-col items-center">
          <svg className="animate-spin h-8 w-8 mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-sm">Connecting to driver GPS...</p>
        </div>
      )}
    </div>
  );
}
