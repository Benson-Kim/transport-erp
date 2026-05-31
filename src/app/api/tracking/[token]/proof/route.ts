import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma/prisma';
import { checkRateLimit } from '@/lib/rate-limiter';
import { DeliveryStatus } from '@/app/generated/prisma';
import { storageService } from '@/lib/storage/service';

/**
 * Proof of Delivery Verification API
 * POST /api/tracking/[token]/proof
 *
 * Verifies the recipient's identity (last 4 digits of phone)
 * before returning short-lived presigned proof-of-delivery URLs.
 *
 * This prevents PII (photos, signatures) from being accessible
 * on the public tracking page without verification.
 */

/** Presigned URL lifetime in seconds (5 minutes). */
const PROOF_URL_EXPIRY_SECONDS = 300;

/**
 * Converts a stored URL or object key into a short-lived presigned
 * download URL.  Returns null when the input is empty/null.
 */
async function toPresignedUrl(urlOrKey: string | null): Promise<string | null> {
  if (!urlOrKey) return null;

  // Extract the object key from the URL
  // Handles both full URLs (https://cdn.../path/file.jpg) and bare keys (path/file.jpg)
  let key = urlOrKey;
  try {
    const parsed = new URL(urlOrKey);
    key = parsed.pathname.replace(/^\//, '');
  } catch {
    // urlOrKey is already a bare key
  }

  try {
    return await storageService.getPresignedDownloadUrl(key, PROOF_URL_EXPIRY_SECONDS);
  } catch {
    // If presigning fails (e.g. object deleted by data-retention), return null
    return null;
  }
}

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

  // Return short-lived presigned URLs (5 min) instead of raw S3 URLs
  const [proofPhotoUrl, signatureUrl] = await Promise.all([
    toPresignedUrl(shipment.proofPhotoUrl),
    toPresignedUrl(shipment.signatureUrl),
  ]);

  return Response.json({
    verified: true,
    proofPhotoUrl,
    signatureUrl,
    expiresInSeconds: PROOF_URL_EXPIRY_SECONDS,
  });
}
