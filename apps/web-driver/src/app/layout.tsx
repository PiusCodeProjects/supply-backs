import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CSCP Driver Portal',
  description: 'Construction Supply Chain Platform — Driver Portal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="mobile-body" suppressHydrationWarning>{children}</body>
    </html>
  );
}
