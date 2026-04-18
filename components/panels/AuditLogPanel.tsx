'use client';

import { useMemo, useState } from 'react';
import { useSimStore } from '@/lib/store';
import { downloadBlob, exportCsv, exportJsonl } from '@/lib/audit/event-log';
import type { Event, EventKind } from '@/lib/types';

const KIND_GROUPS: Array<{ label: string; kinds: EventKind[] }> = [
  { label: 'Einsatz', kinds: ['incident.started', 'incident.ended'] },
  {
    label: 'Intake',
    kinds: ['intake.announced', 'intake.flight-landed', 'intake.completed'],
  },
  {
    label: 'Massnahmen',
    kinds: ['recommendation.executed', 'measure.applied', 'hospital.surge-activated'],
  },
  {
    label: 'Verlegung',
    kinds: ['relocation.planned', 'relocation.executed', 'relocation.cancelled'],
  },
  {
    label: 'Steuerung',
    kinds: ['sim.paused', 'sim.resumed', 'sim.speed-changed', 'user.showcase-started'],
  },
];

export function AuditLogPanel() {
  const events = useSimStore((s) => s.events);
  const clearEvents = useSimStore((s) => s.clearEvents);
  const [activeGroup, setActiveGroup] = useState<string>('Alle');

  const filtered = useMemo(() => {
    if (activeGroup === 'Alle') return events;
    const group = KIND_GROUPS.find((g) => g.label === activeGroup);
    if (!group) return events;
    const allowed = new Set<EventKind>(group.kinds);
    return events.filter((e) => allowed.has(e.kind));
  }, [events, activeGroup]);

  const doExport = (fmt: 'jsonl' | 'csv') => {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    if (fmt === 'jsonl') {
      downloadBlob(exportJsonl(events), `rls-audit-${ts}.jsonl`, 'application/x-ndjson');
    } else {
      downloadBlob(exportCsv(events), `rls-audit-${ts}.csv`, 'text/csv');
    }
  };

  if (events.length === 0) {
    return (
      <div
        className="text-caption"
        style={{ color: 'var(--text-tertiary)', padding: 12 }}
      >
        Keine Events. Pause/Play/Start-Einsatz/Massnahmen loesen Eintraege aus.
      </div>
    );
  }

  return (
    <div data-testid="audit-log" className="flex flex-col gap-2 pt-2">
      <div className="flex flex-wrap items-center gap-1">
        <GroupTab
          label="Alle"
          active={activeGroup === 'Alle'}
          onClick={() => setActiveGroup('Alle')}
        />
        {KIND_GROUPS.map((g) => (
          <GroupTab
            key={g.label}
            label={g.label}
            active={activeGroup === g.label}
            onClick={() => setActiveGroup(g.label)}
          />
        ))}
      </div>

      <div className="flex gap-2">
        <button
          data-testid="btn-export-jsonl"
          type="button"
          onClick={() => doExport('jsonl')}
          className="h-7 rounded-md px-2 text-caption"
          style={{ background: 'var(--accent-blue)', color: 'var(--text-on-color)' }}
        >
          JSONL
        </button>
        <button
          data-testid="btn-export-csv"
          type="button"
          onClick={() => doExport('csv')}
          className="h-7 rounded-md px-2 text-caption"
          style={{
            background: 'var(--bg-elevated-2)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-2)',
          }}
        >
          CSV
        </button>
        <button
          type="button"
          onClick={() => clearEvents()}
          className="ml-auto text-caption"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Log leeren
        </button>
      </div>

      <ul className="flex flex-col gap-1">
        {[...filtered]
          .sort((a, b) => b.t - a.t)
          .slice(0, 200)
          .map((e) => (
            <EventRow key={e.id} event={e} />
          ))}
      </ul>
    </div>
  );
}

function GroupTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-2 py-[2px] text-caption"
      style={{
        background: active ? 'var(--accent-blue-soft)' : 'transparent',
        color: active ? 'var(--accent-blue)' : 'var(--text-tertiary)',
        border: '1px solid var(--border-1)',
      }}
    >
      {label}
    </button>
  );
}

function EventRow({ event }: { event: Event }) {
  return (
    <li
      className="rounded-md p-2 text-caption"
      style={{
        background: 'var(--bg-elevated-2)',
        border: '1px solid var(--border-1)',
        color: 'var(--text-primary)',
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div style={{ fontWeight: 500 }}>{event.kind}</div>
        <div className="font-mono" style={{ color: 'var(--text-tertiary)' }}>
          T+{event.t}
        </div>
      </div>
      {event.scopeRef ? (
        <div
          className="font-mono text-caption"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {event.scope}: {event.scopeRef}
        </div>
      ) : null}
    </li>
  );
}
