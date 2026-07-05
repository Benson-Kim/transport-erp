import type { Metadata } from 'next';

import '../styles/globals.css';
import { SessionProvider } from 'next-auth/react';
import { ThemeProvider } from 'next-themes';

// #58: one brand. The tab previously announced "Create Next App". Section
// titles come from nested layouts/pages; the settings-driven companyName
// feeds the in-app chrome (Sidebar/TopBar).
export const metadata: Metadata = {
  title: {
    default: 'Transport ERP',
    template: '%s | Transport ERP',
  },
  description: 'Freight brokerage ERP: services, clients, suppliers, invoicing and margins.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: next-themes mutates <html> class before
    // hydration by design.
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        {/* #58: ThemeProvider makes the existing dark: classes and
            useTheme() consumers real. Default light, explicit toggle only
            (no system surprise for an ERP used on shared machines). The
            unused Geist wiring is gone - typography is driven by
            --font-sans in globals.css. */}
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          <SessionProvider>{children}</SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
