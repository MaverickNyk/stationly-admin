import type { Metadata } from 'next';
import { Bricolage_Grotesque, Hanken_Grotesk, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import EnvBanner from '@/components/EnvBanner';

// Distinctive type pairing (self-hosted by next/font): a characterful display
// grotesque for headlines + big numbers, a refined grotesque for the dense UI,
// and a sharp mono for ids/codes. Chosen to read as "designed transit ops",
// not generic system-font admin.
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});
const sans = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Stationly Admin',
  description: 'Internal admin console',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <EnvBanner />
        {children}
      </body>
    </html>
  );
}
