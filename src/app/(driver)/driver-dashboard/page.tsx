import prisma from '@/lib/prisma/prisma';
import { requireAuth } from '@/lib/auth';
import Link from 'next/link';
import { DeliveryStatus } from '@/app/generated/prisma';

export default async function DriverDashboardPage() {
  const session = await requireAuth();

  const driver = (await prisma.driver.findUnique({
    where: { userId: session.user.id },
    include: {
      routes: {
        where: { date: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
        include: {
          shipments: {
            where: { status: { notIn: [DeliveryStatus.DELIVERED, DeliveryStatus.FAILED, DeliveryStatus.AT_PUDO] } },
          }
        }
      }
    }
  })) as any;

  if (!driver) {
    return <div className="p-4 text-center">Driver profile not found.</div>;
  }

  const activeRoute = driver.routes[0];

  return (
    <div>
      <h2 className="text-xl font-bold mb-4 text-gray-800">Your Active Route</h2>

      {!activeRoute ? (
        <div className="bg-orange-50 text-orange-800 p-4 rounded-lg">
          You have no active routes assigned for today.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-gray-100 p-4 rounded-lg mb-4">
            <p className="text-sm font-semibold text-gray-600">Route #{activeRoute.routeNumber}</p>
            <p className="text-2xl font-bold text-gray-800">{activeRoute.shipments.length} Pending Stops</p>
          </div>

          <h3 className="font-semibold text-gray-800">Next Deliveries</h3>

          <ul className="space-y-3">
            {activeRoute.shipments.map((shipment: any) => (
              <li key={shipment.id} className="border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                <Link href={`/delivery/${shipment.id}`} className="block">
                  <div className="flex justify-between items-start mb-2">
                    <span className="bg-orange-100 text-orange-800 text-xs font-medium px-2.5 py-0.5 rounded">
                      {shipment.status.replace(/_/g, ' ')}
                    </span>
                    <span className="text-gray-500 text-sm font-mono">{shipment.shipmentNumber}</span>
                  </div>
                  <h4 className="font-bold text-gray-900">{shipment.recipientName}</h4>
                  <p className="text-gray-600 text-sm mt-1 truncate">
                    {shipment.streetType} {shipment.streetName} {shipment.streetNumber}, {shipment.ciudad}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
