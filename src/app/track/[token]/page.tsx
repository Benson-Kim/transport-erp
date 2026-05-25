import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import prisma from '@/lib/prisma/prisma';
import { checkRateLimit } from '@/lib/rate-limiter';
import TrackingTimeline from '@/components/features/tracking/TrackingTimeline';
import LiveMap from '@/components/features/tracking/LiveMap';
import { DeliveryStatus } from '@/app/generated/prisma';
import { Metadata } from 'next';
import ProofVerificationGate from '@/components/features/tracking/ProofVerificationGate';

export const metadata: Metadata = {
  title: 'Track Your Delivery',
  description: 'Real-time delivery tracking',
};

export default async function TrackingPage({ params }: { params: Promise<{ token: string }> }) {
  const resolvedParams = await params;

  // Rate limit by IP: 30 requests/minute per IP
  const headersList = await headers();
  const ip =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headersList.get('x-real-ip') ??
    'unknown';

  const rl = await checkRateLimit(`track:${ip}`, 30, 60);
  if (!rl.allowed) {
    // Return a simple 429 page
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Too Many Requests</h1>
          <p className="text-gray-600">Please wait a moment before refreshing.</p>
        </div>
      </div>
    );
  }

  // Privacy-safe query: select ONLY fields safe for public display.
  // Never expose: recipientName, recipientPhone, recipientDni, recipientEmail
  // Never expose event GPS coordinates (anti-stalking) or photoUrl (privacy)
  // SECURITY: proofPhotoUrl and signatureUrl are NO LONGER selected here.
  // They are gated behind recipient phone verification via /api/tracking/[token]/proof
  const shipment = await prisma.shipment.findUnique({
    where: { trackingToken: resolvedParams.token },
    select: {
      shipmentNumber: true,
      trackingToken: true,
      status: true,
      estimatedFrom: true,
      estimatedTo: true,
      ciudad: true,
      provincia: true,
      codigoPostal: true,
      deliveredAt: true,
      // proofPhotoUrl and signatureUrl intentionally omitted — served via verified API
      events: {
        orderBy: { occurredAt: 'desc' },
        select: {
          id: true,
          status: true,
          occurredAt: true,
          notes: true,
          failedReason: true,
          // Omitted: lat, lng, gpsAccuracyM, photoUrl, driverId
        },
      },
      route: {
        select: {
          driver: {
            select: {
              currentLat: true,
              currentLng: true,
              // Omitted: id, userId, licenseNumber, vehiclePlate, etc.
            },
          },
        },
      },
    },
  });

  if (!shipment) {
    notFound();
  }

  const isOutForDelivery = shipment.status === DeliveryStatus.OUT_FOR_DELIVERY;
  const isDelivered = shipment.status === DeliveryStatus.DELIVERED;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-3xl bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">

        {/* Header */}
        <div className="bg-blue-600 p-6 text-white">
          <h1 className="text-2xl font-bold mb-1">Delivery Tracking</h1>
          <p className="text-blue-100">Tracking Number: {shipment.shipmentNumber}</p>
        </div>

        {/* Status Banner */}
        <div className="p-6 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">
            Status: {shipment.status.replace(/_/g, ' ')}
          </h2>
          {shipment.estimatedFrom && shipment.estimatedTo && !isDelivered && (
            <p className="text-gray-600 mt-2">
              Estimated Delivery: {new Date(shipment.estimatedFrom).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(shipment.estimatedTo).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
          {isDelivered && shipment.deliveredAt && (
            <p className="text-green-600 mt-2">
              Delivered at: {new Date(shipment.deliveredAt).toLocaleString()}
            </p>
          )}
        </div>

        {/* Dynamic Map Component — only when driver is actively delivering */}
        {isOutForDelivery && shipment.route?.driver && (
          <div className="h-64 bg-gray-200 border-b border-gray-100">
            <LiveMap trackingToken={shipment.trackingToken} />
          </div>
        )}

        {/* Proof of Delivery — gated behind recipient phone verification */}
        {isDelivered && (
          <ProofVerificationGate trackingToken={shipment.trackingToken} />
        )}

        {/* Timeline Component */}
        <div className="p-6">
          <h3 className="font-semibold text-gray-800 mb-6">Tracking History</h3>
          <TrackingTimeline events={shipment.events as any} />
        </div>

      </div>
    </div>
  );
}
