import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: 'CSCP Admin Portal',
  description: 'Construction Supply Chain Platform — Admin Portal',
};

// Applies the saved theme to <html> before paint so the first frame is correct.
const THEME_INIT = `
(function(){
  try {
    var stored = localStorage.getItem('admin_theme');
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
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
