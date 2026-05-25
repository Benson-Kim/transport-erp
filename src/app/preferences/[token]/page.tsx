import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma/prisma';
import { revalidatePath } from 'next/cache';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Notification Preferences',
};

export default async function PreferencesPage({ params }: { params: Promise<{ token: string }> }) {
  const resolvedParams = await params;

  const shipment = await prisma.shipment.findUnique({
    where: { trackingToken: resolvedParams.token },
    select: {
      id: true,
      shipmentNumber: true,
      notifyViaSms: true,
      notifyViaWhatsapp: true,
      notifyViaEmail: true,
      recipientPhone: true,
      recipientEmail: true,
    }
  });

  if (!shipment) {
    notFound();
  }

  // Server action to update preferences
  async function updatePreferences(formData: FormData) {
    'use server';

    const notifyViaSms = formData.get('notifyViaSms') === 'on';
    const notifyViaWhatsapp = formData.get('notifyViaWhatsapp') === 'on';
    const notifyViaEmail = formData.get('notifyViaEmail') === 'on';

    await prisma.shipment.update({
      where: { id: shipment!.id },
      data: {
        notifyViaSms,
        notifyViaWhatsapp,
        notifyViaEmail
      }
    });

    revalidatePath(`/preferences/${resolvedParams.token}`);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
        <div className="bg-blue-600 p-6 text-white">
          <h1 className="text-xl font-bold">Notification Preferences</h1>
          <p className="text-blue-100 text-sm mt-1">Shipment: {shipment.shipmentNumber}</p>
        </div>

        <form action={updatePreferences} className="p-6">
          <p className="text-sm text-gray-600 mb-6">
            In compliance with RGPD/GDPR, you can choose how you want to receive updates about this delivery.
          </p>

          <div className="space-y-4">
            {/* SMS Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium text-gray-800">SMS Updates</span>
                <p className="text-xs text-gray-500">Sent to {shipment.recipientPhone.substring(0, 4)}...</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" name="notifyViaSms" defaultChecked={shipment.notifyViaSms} className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {/* WhatsApp Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium text-gray-800">WhatsApp Updates</span>
                <p className="text-xs text-gray-500">Fastest delivery updates</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" name="notifyViaWhatsapp" defaultChecked={shipment.notifyViaWhatsapp} className="sr-only peer" />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
              </label>
            </div>

            {/* Email Toggle */}
            {shipment.recipientEmail && (
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-gray-800">Email Updates</span>
                  <p className="text-xs text-gray-500">Order confirmations & receipts</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" name="notifyViaEmail" defaultChecked={shipment.notifyViaEmail} className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            )}
          </div>

          <div className="mt-8">
            <button type="submit" className="w-full bg-gray-900 text-white font-medium py-2 px-4 rounded hover:bg-gray-800 transition-colors">
              Save Preferences
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
