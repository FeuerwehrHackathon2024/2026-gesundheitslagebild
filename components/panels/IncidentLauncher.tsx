'use client';

import { useState } from 'react';

import { IncidentAllocationTable } from '@/components/panels/IncidentAllocationTable';
import { useSimStore } from '@/lib/store';
import { SCENARIOS } from '@/lib/simulation/scenarios';

export function IncidentLauncher() {
  const incidents = useSimStore((s) => s.incidents);
  const launchScenario = useSimStore((s) => s.launchScenario);
  const [selected, setSelected] = useState<string>('amok-muenchen');

  return (
    <section className="p-3 border-b border-border-1">
      <div className="section-label mb-2">Szenarien</div>

      <select
        className="num w-full bg-bg-3 border border-border-1 text-text-0 px-2 py-1 text-[12px]"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        {SCENARIOS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>

      <button
        type="button"
        className="mt-2 w-full num px-2 py-1.5 border border-border-1 bg-accent-amber text-bg-0 hover:bg-[#ffb84d] font-semibold"
        onClick={() => launchScenario(selected)}
      >
        SZENARIO STARTEN
      </button>

      {incidents.length > 0 && (
        <div className="mt-3">
          <div className="section-label mb-1">Aktive Lagen</div>
          <ul className="flex flex-col gap-2">
            {incidents.map((inc) => (
              <li
                key={inc.id}
                className="border-l-2 border-accent-amber pl-2 text-[12px]"
              >
                <div className="text-text-0">{inc.label}</div>
                <div className="text-text-2 num">
                  {inc.estimatedCasualties} Patienten · ab T+{inc.startedAt}min
                </div>
                <IncidentAllocationTable incident={inc} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
