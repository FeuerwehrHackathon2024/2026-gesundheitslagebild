'use client';

import { AlertList } from '@/components/panels/AlertList';
import { HospitalDetailPanel } from '@/components/panels/HospitalDetailPanel';
import { RecommendationList } from '@/components/panels/RecommendationList';
import { useSimStore } from '@/lib/store';

export function RightPanel() {
  const selection = useSimStore((s) => s.selection);

  return (
    <aside className="w-[360px] shrink-0 border-l border-border-1 bg-bg-1 flex flex-col overflow-y-auto">
      {selection?.kind === 'hospital' && (
        <HospitalDetailPanel id={selection.id} />
      )}
      <AlertList />
      <RecommendationList />
    </aside>
  );
}
