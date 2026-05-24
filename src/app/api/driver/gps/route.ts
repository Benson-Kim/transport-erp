import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma/prisma';
import { requireAuth } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limiter';

/**
 * Driver GPS Ping Endpoint
 * POST /api/driver/gps
 *
 * Used by the driver PWA to continuously send location updates.
 * Rate limited to 1 update/second per driver (60 per minute).
 */

const driverLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(1000).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();

    // Parse & validate payload
    const body = await req.json();
    const parsed = driverLocationSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { lat, lng } = parsed.data;

    // Verify driver exists
    const driver = await prisma.driver.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!driver) {
      return Response.json({ error: 'Not authorized as a driver' }, { status: 403 });
    }

    // Rate limit: max 60 updates per 60 seconds (≈1/sec)
    const rl = await checkRateLimit(`gps:${driver.id}`, 60, 60);
    if (!rl.allowed) {
      return Response.json(
        { error: 'Too many GPS updates', retryAfterMs: rl.retryAfterMs },
        { status: 429 },
      );
    }

    // Update driver's current position
    await prisma.driver.update({
      where: { id: driver.id },
      data: {
        currentLat: lat,
        currentLng: lng,
        lastGpsAt: new Date(),
      },
    });

    return Response.json({ success: true });
  } catch (error: any) {
    console.error('GPS update failed:', error);
    if (error.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
