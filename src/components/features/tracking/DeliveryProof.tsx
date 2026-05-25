'use client';

export default function DeliveryProof({ photoUrl, signatureUrl }: { photoUrl: string | null, signatureUrl: string | null }) {
  return (
    <div className="flex flex-col sm:flex-row gap-4">
      {photoUrl && (
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-500 mb-2">Location Photo</p>
          {/* Using img tag with styling instead of Next/Image because URL might be external/presigned */}
          <div className="aspect-video relative rounded overflow-hidden bg-gray-200 border border-gray-300">
            <img src={photoUrl} alt="Delivery location proof" className="w-full h-full object-cover" />
          </div>
        </div>
      )}
      
      {signatureUrl && (
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-500 mb-2">Recipient Signature</p>
          <div className="aspect-video relative rounded overflow-hidden bg-white border border-gray-300 flex items-center justify-center p-4">
            <img src={signatureUrl} alt="Recipient signature" className="max-w-full max-h-full" />
          </div>
        </div>
      )}
    </div>
  );
}
