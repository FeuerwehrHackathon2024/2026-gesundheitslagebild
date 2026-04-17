'use client';

import { AlertList } from '@/components/panels/AlertList';
import { RecommendationList } from '@/components/panels/RecommendationList';

export function RightPanel() {
  return (
    <aside className="w-[360px] shrink-0 border-l border-border-1 bg-bg-1 flex flex-col overflow-y-auto">
      <AlertList />
      <RecommendationList />

      <section className="p-3 flex-1">
        <div className="section-label mb-2">Detail</div>
        <div className="text-text-2 text-[12px]">
          Klick ein Krankenhaus oder einen Einsatz auf der Karte.
        </div>
      </section>
    </aside>
  );
}
