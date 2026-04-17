'use client';

import { PZC_BY_CODE } from '@/lib/data/pzc';
import { useSimStore } from '@/lib/store';
import { FilterPanel } from '@/components/panels/FilterPanel';
import { IncidentLauncher } from '@/components/panels/IncidentLauncher';

export function LeftPanel() {
  const filters = useSimStore((s) => s.filters);

  // Status-Zaehler nur fuer Patienten, deren Triage in den aktiven SK liegt.
  // T4 bleibt immer drin, da SK-Filter nur T1-T3 umfasst (T4 = palliativ).
  const counts = useSimStore((s) => {
    const out: Record<string, number> = {
      onScene: 0,
      transport: 0,
      inTreatment: 0,
      discharged: 0,
      deceased: 0,
    };
    for (const p of s.patients) {
      const pzc = PZC_BY_CODE[p.pzc];
      if (!pzc) continue;
      if (pzc.triage !== 'T4') {
        if (!filters.sk[pzc.triage as 'T1' | 'T2' | 'T3']) continue;
      }
      out[p.status] = (out[p.status] ?? 0) + 1;
    }
    return out;
  });

  const unassigned = useSimStore((s) => {
    let n = 0;
    for (const id of s.unassigned) {
      const p = s.patients.find((x) => x.id === id);
      if (!p) continue;
      const pzc = PZC_BY_CODE[p.pzc];
      if (!pzc) continue;
      if (pzc.triage !== 'T4' && !filters.sk[pzc.triage as 'T1' | 'T2' | 'T3'])
        continue;
      n++;
    }
    return n;
  });

  const activeHospitals = useSimStore((s) => {
    const set = new Set<string>();
    for (const p of s.patients) {
      if (!p.assignedHospitalId) continue;
      if (p.status !== 'transport' && p.status !== 'inTreatment') continue;
      const pzc = PZC_BY_CODE[p.pzc];
      if (!pzc) continue;
      if (pzc.triage !== 'T4' && !filters.sk[pzc.triage as 'T1' | 'T2' | 'T3'])
        continue;
      set.add(p.assignedHospitalId);
    }
    return set.size;
  });

  return (
    <aside className="w-[320px] shrink-0 border-r border-border-1 bg-bg-1 flex flex-col overflow-y-auto">
      <IncidentLauncher />

      <FilterPanel />

      <section className="p-3 border-b border-border-1">
        <div className="section-label mb-2">Patienten</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
          <PatientRow label="Vor Ort" value={counts['onScene'] ?? 0} />
          <PatientRow label="Transport" value={counts['transport'] ?? 0} />
          <PatientRow label="Behandlung" value={counts['inTreatment'] ?? 0} />
          <PatientRow label="Entlassen" value={counts['discharged'] ?? 0} />
          <PatientRow label="Verstorben" value={counts['deceased'] ?? 0} />
          <PatientRow
            label="Unvermittelt"
            value={unassigned}
            warn={unassigned > 0}
          />
          <PatientRow label="Haeuser aktiv" value={activeHospitals} />
        </div>
      </section>

      <section className="p-3 border-b border-border-1">
        <div className="section-label mb-2">Legende</div>
        <div className="flex flex-col gap-1.5 text-text-1 text-[12px]">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-accent-green" />
            <span>Auslastung ok (&lt; 70 %)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-accent-amber" />
            <span>Erhoeht (70-95 %)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-accent-red" />
            <span>Kritisch (&gt; 95 %)</span>
          </div>
          <div className="h-px bg-border-1 my-1" />
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-accent-cyan" />
            <span>MANV-Zulauf (Ringgroesse ~ Patienten)</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-full bg-accent-amber"
              style={{ boxShadow: '0 0 0 1.5px var(--accent-cyan)' }}
            />
            <span>Haus mit aktivem Zulauf</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-text-2 opacity-20" />
            <span>Filter nicht erfuellt</span>
          </div>
        </div>
      </section>
    </aside>
  );
}

function PatientRow({
  label,
  value,
  warn,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <>
      <span className="text-text-2">{label}</span>
      <span
        className={`num text-right ${
          warn ? 'text-accent-red' : 'text-text-0'
        }`}
      >
        {value}
      </span>
    </>
  );
}
