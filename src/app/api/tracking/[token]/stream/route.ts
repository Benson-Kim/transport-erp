import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma/prisma';
import { DeliveryStatus } from '@/app/generated/prisma';

export const dynamic = 'force-dynamic';

/**
 * Server-Sent Events (SSE) endpoint for live tracking.
 * Provides real-time updates for shipment status and driver GPS.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const resolvedParams = await params;
  
  // Verify token exists
  const shipment = await prisma.shipment.findUnique({
    where: { trackingToken: resolvedParams.token },
    select: { 
      id: true, 
      status: true,
      route: { select: { driverId: true } }
    }
  });

  if (!shipment) {
    return new Response('Not found', { status: 404 });
  }

  // Create stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection success message
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`));

      // Determine polling rate. If OUT_FOR_DELIVERY, poll GPS.
      const interval = setInterval(async () => {
        try {
          // Re-fetch state
          const currentShipment = await prisma.shipment.findUnique({
            where: { id: shipment.id },
            select: {
              status: true,
              route: {
                include: {
                  driver: {
                    select: { currentLat: true, currentLng: true, lastGpsAt: true }
                  }
                }
              }
            }
          });

          if (!currentShipment) return;

          // If delivered or failed, notify and close stream
          if (currentShipment.status === DeliveryStatus.DELIVERED || currentShipment.status === DeliveryStatus.FAILED) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'status', status: currentShipment.status })}\n\n`));
            controller.enqueue(encoder.encode(`event: close\ndata: end\n\n`));
            clearInterval(interval);
            controller.close();
            return;
          }

          // If out for delivery, send GPS updates
          if (currentShipment.status === DeliveryStatus.OUT_FOR_DELIVERY && currentShipment.route?.driver) {
            const driver = currentShipment.route.driver;
            // Only send if GPS is fresh (within last 5 mins)
            if (driver.lastGpsAt && (new Date().getTime() - driver.lastGpsAt.getTime() < 5 * 60 * 1000)) {
              if (driver.currentLat !== null && driver.currentLng !== null) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                  type: 'gps', 
                  lat: driver.currentLat, 
                  lng: driver.currentLng 
                })}\n\n`));
              }
            }
          }
        } catch (err) {
          console.error('SSE loop error:', err);
        }
      }, 5000); // Poll DB every 5s (in production, use Pub/Sub instead of DB polling)

      // Cleanup when client disconnects
      req.signal.addEventListener('abort', () => {
        clearInterval(interval);
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
