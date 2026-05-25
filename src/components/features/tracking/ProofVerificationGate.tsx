'use client';

import { useState } from 'react';
import DeliveryProof from '@/components/features/tracking/DeliveryProof';

interface ProofVerificationGateProps {
  trackingToken: string;
}

/**
 * Client component that gates proof-of-delivery images behind
 * recipient phone verification (last 4 digits).
 *
 * Calls POST /api/tracking/[token]/proof with the digits,
 * and only renders DeliveryProof after successful verification.
 */
export default function ProofVerificationGate({ trackingToken }: ProofVerificationGateProps) {
  const [digits, setDigits] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proof, setProof] = useState<{
    proofPhotoUrl: string | null;
    signatureUrl: string | null;
  } | null>(null);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/tracking/${trackingToken}/proof`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastFourDigits: digits }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Verification failed');
        return;
      }

      setProof({
        proofPhotoUrl: data.proofPhotoUrl,
        signatureUrl: data.signatureUrl,
      });
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // Already verified — show proof
  if (proof) {
    if (!proof.proofPhotoUrl && !proof.signatureUrl) {
      return null; // No proof available
    }
    return (
      <div className="p-6 border-b border-gray-100 bg-gray-50">
        <h3 className="font-semibold text-gray-800 mb-4">Proof of Delivery</h3>
        <DeliveryProof
          photoUrl={proof.proofPhotoUrl}
          signatureUrl={proof.signatureUrl}
        />
      </div>
    );
  }

  // Verification form
  return (
    <div className="p-6 border-b border-gray-100 bg-gray-50">
      <h3 className="font-semibold text-gray-800 mb-2">Proof of Delivery</h3>
      <p className="text-sm text-gray-600 mb-4">
        To view the delivery proof, please verify your identity by entering the last 4 digits of the recipient&apos;s phone number.
      </p>
      <form onSubmit={handleVerify} className="flex items-center gap-3">
        <input
          id="proof-verification-input"
          type="text"
          inputMode="numeric"
          maxLength={4}
          pattern="\d{4}"
          placeholder="Last 4 digits"
          value={digits}
          onChange={(e) => setDigits(e.target.value.replace(/\D/g, '').slice(0, 4))}
          className="w-32 px-3 py-2 border border-gray-300 rounded-md text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={loading}
          required
        />
        <button
          id="proof-verification-submit"
          type="submit"
          disabled={loading || digits.length !== 4}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Verifying...' : 'Verify'}
        </button>
      </form>
      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
