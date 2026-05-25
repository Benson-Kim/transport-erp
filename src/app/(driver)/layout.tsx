import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { UserRole } from '@/app/generated/prisma';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Driver Dashboard',
};

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  // Ensure the user has the DRIVER role. If not, requireRole throws or we can handle it.
  try {
    await requireRole([UserRole.DRIVER, UserRole.SUPER_ADMIN]);
  } catch (error) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-orange-600 text-white p-4 shadow-md sticky top-0 z-10">
        <div className="flex justify-between items-center max-w-lg mx-auto">
          <h1 className="text-lg font-bold">Driver App</h1>
          {/* Menu / Logout could go here */}
        </div>
      </header>

      <main className="flex-1 w-full max-w-lg mx-auto bg-white shadow-sm p-4">
        {children}
      </main>
    </div>
  );
}
