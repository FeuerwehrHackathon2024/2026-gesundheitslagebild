'use client';

import { MapContainer } from '@/components/map/MapContainer';
import { HospitalLayer } from '@/components/map/HospitalLayer';

export default function Home() {
  return (
    <main className="relative h-screen w-screen overflow-hidden">
      {/* Header-Platzhalter (Liquid-Glass, Phase 4 fuellt Inhalte) */}
      <header
        data-testid="app-header"
        className="pointer-events-auto absolute inset-x-0 top-0 z-panel flex h-14 items-center justify-between px-4"
        style={{
          background: 'var(--bg-elevated)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          borderBottom: '1px solid var(--border-1)',
        }}
      >
        <div className="text-h3" style={{ fontWeight: 600 }}>
          Rettungsleitstelle
        </div>
        <div className="text-caption" style={{ color: 'var(--text-tertiary)' }}>
          Phase 3 — Map-Basis
        </div>
      </header>

      <MapContainer>
        {(map) => <HospitalLayer map={map} />}
      </MapContainer>
    </main>
  );
}
