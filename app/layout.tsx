import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MANV Dashboard — Leitstand',
  description:
    'Entscheidungs-Dashboard fuer Grosslagen (MANV). Karte, Kapazitaeten, Vorschlaege.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
