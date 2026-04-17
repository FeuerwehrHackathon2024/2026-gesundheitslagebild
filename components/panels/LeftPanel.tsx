'use client';

import { useSimStore } from '@/lib/store';
import { IncidentLauncher } from '@/components/panels/IncidentLauncher';

export function LeftPanel() {
  const counts = useSimStore((s) => s.patientsByStatus());
  const unassigned = useSimStore((s) => s.unassigned.length);
  const activeHospitals = useSimStore((s) => {
    const set = new Set<string>();
    for (const p of s.patients) {
      if (!p.assignedHospitalId) continue;
      if (p.status === 'transport' || p.status === 'inTreatment') {
        set.add(p.assignedHospitalId);
      }
    }
    return set.size;
  });

  return (
    <aside className="w-[320px] shrink-0 border-r border-border-1 bg-bg-1 flex flex-col overflow-y-auto">
      <IncidentLauncher />

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
        <div className="flex flex-col gap-1 text-text-1 text-[12px]">
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
