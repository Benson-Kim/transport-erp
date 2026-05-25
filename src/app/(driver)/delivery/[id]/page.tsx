import { notFound } from 'next/navigation';
import DeliveryForm from '@/components/features/driver/DeliveryForm';
import prisma from '@/lib/prisma/prisma';

export default async function DeliveryDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;

  const shipment = await prisma.shipment.findUnique({
    where: { id: resolvedParams.id },
  });

  if (!shipment) notFound();

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">{shipment.recipientName}</h2>
        <p className="text-gray-600">{shipment.streetType} {shipment.streetName} {shipment.streetNumber}</p>
        <p className="text-gray-600">
          {shipment.escalera && `Esc: ${shipment.escalera}`} {shipment.piso && `Piso: ${shipment.piso}`} {shipment.puerta && `Pta: ${shipment.puerta}`}
        </p>
        <p className="text-gray-600">{shipment.codigoPostal} {shipment.ciudad}, {shipment.provincia}</p>
      </div>

      <DeliveryForm
        shipmentId={shipment.id}
        deliveryLat={shipment.deliveryLat}
        deliveryLng={shipment.deliveryLng}
      />
    </div>
  );
}
