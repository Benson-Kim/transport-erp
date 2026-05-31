import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma/prisma';
import { checkRateLimit } from '@/lib/rate-limiter';
import { DeliveryStatus } from '@/app/generated/prisma';

export const dynamic = 'force-dynamic';

// Circuit breaker: cap concurrent SSE connections
let activeConnections = 0;
const MAX_SSE_CONNECTIONS = 500;

/**
 * Gets a dedicated Redis subscriber for this SSE connection.
 * Returns null if Redis is unavailable (falls back to DB polling).
 */
async function getRedisSubscriber() {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  try {
    // Dynamic import to avoid bundling issues when Redis isn't available
    const { default: Redis } = await import('ioredis');
    const sub = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
    await sub.connect();
    return sub;
  } catch {
    console.warn('[SSE] Redis subscriber unavailable — falling back to DB polling.');
    return null;
  }
}

/**
 * Server-Sent Events (SSE) endpoint for live tracking.
 *
 * When Redis is available, subscribes to a per-shipment Pub/Sub channel
 * for instant updates. Falls back to 5-second DB polling otherwise.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const resolvedParams = await params;

  // Rate limit SSE connections per IP
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  const rl = await checkRateLimit(`sse:${ip}`, 10, 60);
  if (!rl.allowed) {
    return new Response('Too many connections', { status: 429 });
  }

  // Circuit breaker
  if (activeConnections >= MAX_SSE_CONNECTIONS) {
    return new Response('Service temporarily at capacity', { status: 503 });
  }

  // Verify token exists
  const shipment = await prisma.shipment.findUnique({
    where: { trackingToken: resolvedParams.token },
    select: {
      id: true,
      status: true,
      route: { select: { driverId: true } },
    },
  });

  if (!shipment) {
    return new Response('Not found', { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      activeConnections++;
      let closed = false;

      const send = (data: object) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Stream closed by client — trigger cleanup
          if (!closed) {
            closed = true;
            cleanup();
          }
        }
      };

      send({ type: 'connected' });

      // Try Redis Pub/Sub first, fall back to DB polling
      const redisSub = await getRedisSubscriber();
      const channel = `tracking:${shipment.id}`;
      let interval: ReturnType<typeof setInterval> | null = null;

      const cleanup = () => {
        if (closed) return; // Prevent double-cleanup
        closed = true;
        activeConnections--;
        if (interval) clearInterval(interval);
        if (redisSub) {
          redisSub.unsubscribe(channel).catch(() => { });
          redisSub.disconnect();
        }
      };

      if (redisSub) {
        // Redis Pub/Sub mode — instant updates, no DB polling
        await redisSub.subscribe(channel);

        redisSub.on('message', (_ch: string, message: string) => {
          try {
            const data = JSON.parse(message);
            send(data);

            if (data.status === DeliveryStatus.DELIVERED || data.status === DeliveryStatus.FAILED) {
              send({ type: 'status', status: data.status });
              if (!closed) {
                try { controller.enqueue(encoder.encode(`event: close\ndata: end\n\n`)); } catch { /* already closed */ }
                cleanup();
                try { controller.close(); } catch { /* already closed */ }
              }
            }
          } catch {
            // Malformed message — skip
          }
        });
      } else {
        // DB polling fallback — 5 second interval
        interval = setInterval(async () => {
          try {
            const currentShipment = await prisma.shipment.findUnique({
              where: { id: shipment.id },
              select: {
                status: true,
                route: {
                  include: {
                    driver: {
                      select: { currentLat: true, currentLng: true, lastGpsAt: true },
                    },
                  },
                },
              },
            });

            if (!currentShipment) return;

            // Terminal status — notify and close
            if (
              currentShipment.status === DeliveryStatus.DELIVERED ||
              currentShipment.status === DeliveryStatus.FAILED
            ) {
              send({ type: 'status', status: currentShipment.status });
              if (!closed) {
                try { controller.enqueue(encoder.encode(`event: close\ndata: end\n\n`)); } catch { /* already closed */ }
                cleanup();
                try { controller.close(); } catch { /* already closed */ }
              }
              return;
            }

            // GPS updates when out for delivery
            if (
              currentShipment.status === DeliveryStatus.OUT_FOR_DELIVERY &&
              currentShipment.route?.driver
            ) {
              const driver = currentShipment.route.driver;
              const isFresh =
                driver.lastGpsAt &&
                new Date().getTime() - driver.lastGpsAt.getTime() < 5 * 60 * 1000;

              if (isFresh && driver.currentLat !== null && driver.currentLng !== null) {
                send({
                  type: 'gps',
                  lat: driver.currentLat,
                  lng: driver.currentLng,
                });
              }
            }
          } catch (err) {
            console.error('[SSE] Poll error:', err);
          }
        }, 5000);
      }

      // Cleanup when client disconnects
      req.signal.addEventListener('abort', () => {
        cleanup();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
