import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma/prisma';
import { checkRateLimit } from '@/lib/rate-limiter';
import { DeliveryStatus } from '@/app/generated/prisma';

/**
 * Proof of Delivery Verification API
 * POST /api/tracking/[token]/proof
 *
 * Verifies the recipient's identity (last 4 digits of phone)
 * before returning signed proof-of-delivery URLs.
 *
 * This prevents PII (photos, signatures) from being accessible
 * on the public tracking page without verification.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const resolvedParams = await params;

  // Rate limit: 5 verification attempts per 15 minutes per IP
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  const rl = await checkRateLimit(`proof:${ip}`, 5, 15 * 60);
  if (!rl.allowed) {
    return Response.json(
      { error: 'Too many attempts. Please try again later.', retryAfterMs: rl.retryAfterMs },
      { status: 429 }
    );
  }

  // Parse body
  let body: { lastFourDigits?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { lastFourDigits } = body;
  if (!lastFourDigits || typeof lastFourDigits !== 'string' || lastFourDigits.length !== 4) {
    return Response.json(
      { error: 'Please provide exactly 4 digits' },
      { status: 400 }
    );
  }

  // Lookup shipment
  const shipment = await prisma.shipment.findUnique({
    where: { trackingToken: resolvedParams.token },
    select: {
      status: true,
      recipientPhone: true,
      proofPhotoUrl: true,
      signatureUrl: true,
    },
  });

  if (!shipment) {
    return Response.json({ error: 'Shipment not found' }, { status: 404 });
  }

  // Only allow for delivered shipments
  if (shipment.status !== DeliveryStatus.DELIVERED) {
    return Response.json({ error: 'Proof not available' }, { status: 400 });
  }

  // Verify last 4 digits of phone number
  const phone = shipment.recipientPhone ?? '';
  const phoneLast4 = phone.replace(/\D/g, '').slice(-4);

  if (phoneLast4.length < 4 || lastFourDigits !== phoneLast4) {
    return Response.json({ error: 'Verification failed' }, { status: 403 });
  }

  // Return proof URLs only after successful verification
  return Response.json({
    verified: true,
    proofPhotoUrl: shipment.proofPhotoUrl ?? null,
    signatureUrl: shipment.signatureUrl ?? null,
  });
}
