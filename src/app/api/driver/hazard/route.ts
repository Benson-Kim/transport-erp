import { NextRequest } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma/prisma';
import { requireAuth } from '@/lib/auth';
import { normalizeAddress } from '@/lib/utils/normalize-address';

/**
 * Address Hazard Notes API
 *
 * POST /api/driver/hazard  — Driver reports a hazard at a delivery address
 * GET  /api/driver/hazard  — Route planner fetches hazards for upcoming stops
 *
 * The AddressHazardNote model persists access issues (locked gates, aggressive
 * dogs, no parking) that affect future deliveries to the same address.
 */

// Schemas

const createHazardSchema = z.object({
  address: z.string().min(3).max(500),
  note: z.string().min(3).max(1000),
  category: z.enum([
    'LOCKED_GATE',
    'AGGRESSIVE_ANIMAL',
    'NO_PARKING',
    'DIFFICULT_ACCESS',
    'WRONG_ADDRESS',
    'OTHER',
  ]),
});

// POST — Driver reports a hazard

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();

    // Verify caller is a driver
    const driver = await prisma.driver.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });
    if (!driver) {
      return Response.json({ error: 'Not authorized as a driver' }, { status: 403 });
    }

    const body = await req.json();
    const parsed = createHazardSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const normalizedAddr = normalizeAddress(parsed.data.address);

    const hazard = await prisma.addressHazardNote.create({
      data: {
        normalizedAddr,
        note: parsed.data.note,
        category: parsed.data.category,
        reportedById: driver.id,
      },
    });

    return Response.json({ success: true, id: hazard.id });
  } catch (error: any) {
    console.error('Hazard note creation failed:', error);
    if (error.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET — Route planner fetches hazards for upcoming stops

export async function GET(req: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(req.url);
    const addresses = searchParams.getAll('addr');

    if (addresses.length === 0) {
      return Response.json(
        { error: 'At least one "addr" query parameter is required' },
        { status: 400 },
      );
    }

    const normalizedAddresses = addresses.map(normalizeAddress);

    const hazards = await prisma.addressHazardNote.findMany({
      where: {
        normalizedAddr: { in: normalizedAddresses },
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        normalizedAddr: true,
        note: true,
        category: true,
        createdAt: true,
        reportedBy: {
          select: {
            user: {
              select: { name: true },
            },
          },
        },
      },
    });

    return Response.json({ hazards });
  } catch (error: any) {
    console.error('Hazard notes fetch failed:', error);
    if (error.message === 'Unauthorized') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
