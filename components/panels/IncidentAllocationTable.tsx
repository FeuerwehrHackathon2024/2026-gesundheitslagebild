'use client';

import { useState } from 'react';

import { useSimStore } from '@/lib/store';
import type { Incident } from '@/lib/types';

interface HospitalRow {
  id: string;
  name: string;
  planned: number;
  transport: number;
  inTreatment: number;
  done: number;
  total: number;
}

export function IncidentAllocationTable({ incident }: { incident: Incident }) {
  const rows = useSimStore((s) => {
    const byHospital: Record<string, HospitalRow> = {};
    for (const p of s.patients) {
      if (p.incidentId !== incident.id) continue;
      if (!p.assignedHospitalId) continue;
      const h = s.hospitals[p.assignedHospitalId];
      if (!h) continue;
      const r =
        byHospital[h.id] ??
        (byHospital[h.id] = {
          id: h.id,
          name: h.name,
          planned: 0,
          transport: 0,
          inTreatment: 0,
          done: 0,
          total: 0,
        });
      if (p.status === 'onScene') r.planned += 1;
      else if (p.status === 'transport') r.transport += 1;
      else if (p.status === 'inTreatment') r.inTreatment += 1;
      else if (p.status === 'discharged' || p.status === 'deceased') r.done += 1;
      r.total += 1;
    }
    return Object.values(byHospital).sort((a, b) => b.total - a.total);
  });
  const setSelection = useSimStore((s) => s.setSelection);

  const unassignedCount = useSimStore((s) => {
    let n = 0;
    for (const p of s.patients) {
      if (p.incidentId !== incident.id) continue;
      if (!p.assignedHospitalId && p.status === 'onScene') n += 1;
    }
    return n;
  });

  const [expanded, setExpanded] = useState(false);
  const MAX = 8;
  const visibleRows = expanded ? rows : rows.slice(0, MAX);

  return (
    <div className="mt-2 border-t border-border-1 pt-2">
      <div className="section-label mb-1 flex items-center justify-between">
        <span>Zuteilung</span>
        <span className="num text-text-2 text-[10px]">
          {rows.length} Haeuser
        </span>
      </div>
      {rows.length === 0 && (
        <div className="text-text-2 text-[11px] num">
          Noch keine Zuweisungen.
        </div>
      )}
      {rows.length > 0 && (
        <div className="num text-[10px]">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-2 text-text-2 pb-1 border-b border-border-1">
            <span>Haus</span>
            <span className="text-right">gepl.</span>
            <span className="text-right">Zulauf</span>
            <span className="text-right">Beh.</span>
            <span className="text-right">fertig</span>
          </div>
          {visibleRows.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelection({ kind: 'hospital', id: r.id })}
              className="w-full grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-2 py-0.5 hover:bg-bg-2 text-left"
            >
              <span className="text-text-0 truncate" title={r.name}>
                {r.name}
              </span>
              <span className="text-right text-text-1">{r.planned}</span>
              <span className="text-right text-accent-cyan">
                {r.transport}
              </span>
              <span className="text-right text-text-0">{r.inTreatment}</span>
              <span className="text-right text-text-2">{r.done}</span>
            </button>
          ))}
          {rows.length > MAX && (
            <button
              type="button"
              className="w-full text-text-2 hover:text-text-0 text-[10px] mt-1"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'weniger anzeigen' : `+ ${rows.length - MAX} weitere`}
            </button>
          )}
        </div>
      )}
      {unassignedCount > 0 && (
        <div className="num text-[10px] text-accent-red mt-1">
          {unassignedCount} unvermittelt
        </div>
      )}
    </div>
  );
}
