import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: 'CSCP Supplier Portal',
  description: 'Construction Supply Chain Platform — Supplier Portal',
};

// Runs before the body paints. Reads the saved preference (or system pref) and
// applies data-theme on <html> so the first paint matches the chosen theme and
// there is no white→dark flash.
const THEME_INIT = `
(function(){
  try {
    var stored = localStorage.getItem('supplier_theme');
    var sysDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var theme = stored || (sysDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive">{THEME_INIT}</Script>
      </head>
      <body suppressHydrationWarning={true}>{children}</body>
    </html>
  );
}
