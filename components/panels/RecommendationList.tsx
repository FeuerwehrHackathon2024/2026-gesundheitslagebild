'use client';

import { useState } from 'react';
import clsx from 'clsx';

import { useSimStore } from '@/lib/store';
import type { Recommendation } from '@/lib/types';

const EFFORT_LABEL = { low: 'niedrig', medium: 'mittel', high: 'hoch' };
const EFFORT_COLOR = {
  low: 'text-accent-green',
  medium: 'text-accent-amber',
  high: 'text-accent-red',
};

export function RecommendationList() {
  const recs = useSimStore((s) => s.recommendations);

  const active = recs.filter((r) => r.executable);
  const executed = recs.filter((r) => !r.executable);

  return (
    <section className="p-3 border-b border-border-1">
      <div className="section-label mb-2 flex items-center justify-between">
        <span>Empfehlungen</span>
        {active.length > 0 && (
          <span className="num text-text-2 text-[10px]">{active.length}</span>
        )}
      </div>

      {active.length === 0 && (
        <div className="text-text-2 text-[12px]">Keine Empfehlungen.</div>
      )}

      <ul className="flex flex-col gap-2">
        {active.map((r) => (
          <RecCard key={r.id} rec={r} />
        ))}
      </ul>

      {executed.length > 0 && (
        <ExecutedList executed={executed} />
      )}
    </section>
  );
}

function RecCard({ rec }: { rec: Recommendation }) {
  const execute = useSimStore((s) => s.executeRecommendation);
  const [showDetail, setShowDetail] = useState(false);

  const impactChips: string[] = [];
  if (rec.expectedImpact.bedsGained)
    impactChips.push(`+${rec.expectedImpact.bedsGained} Betten`);
  if (rec.expectedImpact.timeBoughtMin)
    impactChips.push(`+${rec.expectedImpact.timeBoughtMin} min`);
  if (rec.expectedImpact.patientsRerouted)
    impactChips.push(`${rec.expectedImpact.patientsRerouted} umgeleitet`);

  return (
    <li className="border border-border-1 bg-bg-2 p-2">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="text-text-0 text-[12px] font-medium">{rec.title}</div>
        <span
          className={clsx(
            'num text-[10px] section-label',
            EFFORT_COLOR[rec.effortLevel],
          )}
        >
          {EFFORT_LABEL[rec.effortLevel]}
        </span>
      </div>

      <div
        className={clsx(
          'text-text-1 text-[11px] num',
          !showDetail && 'line-clamp-2',
        )}
      >
        {rec.rationale}
      </div>

      {impactChips.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {impactChips.map((c) => (
            <span
              key={c}
              className="num text-[10px] bg-bg-3 border border-border-1 px-1.5 py-0.5 text-text-0"
            >
              {c}
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2 mt-2">
        <button
          type="button"
          className="num text-[11px] px-2 py-0.5 border border-border-1 text-text-1 hover:text-text-0 hover:bg-bg-3"
          onClick={() => setShowDetail((v) => !v)}
        >
          {showDetail ? 'Weniger' : 'Details'}
        </button>
        <button
          type="button"
          className="num text-[11px] px-2 py-0.5 border border-accent-cyan bg-accent-cyan/10 text-accent-cyan hover:bg-accent-cyan/20 disabled:opacity-30 disabled:cursor-not-allowed ml-auto"
          onClick={() => execute(rec)}
          disabled={!rec.executable}
        >
          Ausfuehren
        </button>
      </div>
    </li>
  );
}

function ExecutedList({ executed }: { executed: Recommendation[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        className="section-label text-[10px] text-text-2 hover:text-text-0"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? '▼' : '▶'} Ausgefuehrt ({executed.length})
      </button>
      {open && (
        <ul className="flex flex-col gap-1 mt-1 opacity-60">
          {executed.map((r) => (
            <li key={r.id} className="text-[11px] text-text-1 border-l-2 border-text-2 pl-2">
              {r.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
