import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Rettungsleitstelle — MANV/Grosslage-Dashboard',
  description:
    'Map-zentriertes MANV/Grosslage-Leitstand-Dashboard fuer Einsatzleitung im Raum Muenchen.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
