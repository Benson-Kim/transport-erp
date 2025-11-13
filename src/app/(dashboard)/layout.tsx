import { MainLayout } from "@/components/layout/MainLayout";
import { requireAuth } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();
  const companyName = "Transport ERP";

  const userForLayout = {
    name: session.user.name,
    email: session.user.email,
    role: session.user.role as string,
    // avatar: session.user.avatar ?? undefined, 
  };

  return (
    <MainLayout user={userForLayout} companyName={companyName}>
      {children}
    </MainLayout>
  );
}
