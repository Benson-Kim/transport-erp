'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { markDelivered, markFailed } from '@/actions/delivery-actions';
import { FailedDeliveryReason } from '@/app/generated/prisma';

export default function DeliveryForm({ 
  shipmentId, 
  deliveryLat, 
  deliveryLng 
}: { 
  shipmentId: string, 
  deliveryLat: number, 
  deliveryLng: number 
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelivery = async (status: 'SUCCESS' | 'FAILED') => {
    setLoading(true);
    setError(null);
    try {
      // In a real PWA, use geolocation API. Mocking here.
      const driverLat = deliveryLat + 0.0001; // Mocking driver is close
      const driverLng = deliveryLng + 0.0001;
      
      // Mocking photo upload
      const photoUrl = 'https://example.com/mock-photo.jpg';

      if (status === 'SUCCESS') {
        await markDelivered({
          shipmentId,
          driverLat,
          driverLng,
          photoUrl,
        });
      } else {
        await markFailed({
          shipmentId,
          reason: FailedDeliveryReason.AUSENTE,
          driverLat,
          driverLng,
          photoUrl
        });
      }
      
      router.push('/driver-dashboard');
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && <div className="p-3 bg-red-100 text-red-800 rounded">{error}</div>}

      <div className="grid grid-cols-2 gap-4">
        <button 
          onClick={() => handleDelivery('SUCCESS')}
          disabled={loading}
          className="bg-green-600 text-white font-bold py-4 rounded-xl shadow-sm hover:bg-green-700 active:bg-green-800 transition-colors"
        >
          {loading ? 'Processing...' : 'Mark Delivered'}
        </button>
        <button 
          onClick={() => handleDelivery('FAILED')}
          disabled={loading}
          className="bg-red-100 text-red-700 font-bold py-4 rounded-xl shadow-sm hover:bg-red-200 active:bg-red-300 transition-colors"
        >
          Attempt Failed
        </button>
      </div>
    </div>
  );
}
