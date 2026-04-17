'use client';

import clsx from 'clsx';

import { useSimStore } from '@/lib/store';
import type { Alert, AlertSeverity } from '@/lib/types';

const SEVERITY_BORDER: Record<AlertSeverity, string> = {
  info: 'border-accent-cyan',
  warn: 'border-accent-amber',
  critical: 'border-accent-red',
};

const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  info: 'INFO',
  warn: 'WARN',
  critical: 'CRIT',
};

function formatAgo(mins: number): string {
  if (mins < 1) return 'jetzt';
  if (mins < 60) return `-${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `-${h}h ${m}m` : `-${h}h`;
}

export function AlertList() {
  const simTime = useSimStore((s) => s.simTime);
  const alerts = useSimStore((s) => s.alerts);
  // Sortierung: ungeloeste zuerst (nach severity), dann resolvierte nach Alter
  const sorted = [...alerts].sort((a, b) => {
    if ((a.resolvedAt != null) !== (b.resolvedAt != null)) {
      return a.resolvedAt != null ? 1 : -1;
    }
    const sev = { critical: 0, warn: 1, info: 2 };
    if (sev[a.severity] !== sev[b.severity]) {
      return sev[a.severity] - sev[b.severity];
    }
    return b.firedAt - a.firedAt;
  });

  if (sorted.length === 0) {
    return (
      <section className="p-3 border-b border-border-1">
        <div className="section-label mb-2">Alerts</div>
        <div className="text-text-2 text-[12px]">Keine Alerts.</div>
      </section>
    );
  }

  return (
    <section className="p-3 border-b border-border-1">
      <div className="section-label mb-2 flex items-center justify-between">
        <span>Alerts</span>
        <span className="num text-text-2 text-[10px]">{sorted.length}</span>
      </div>
      <ul className="flex flex-col gap-1 max-h-[40vh] overflow-y-auto">
        {sorted.map((a) => (
          <AlertRow key={a.id} alert={a} simTime={simTime} />
        ))}
      </ul>
    </section>
  );
}

function AlertRow({ alert, simTime }: { alert: Alert; simTime: number }) {
  const setSelection = useSimStore((s) => s.setSelection);
  const isResolved = alert.resolvedAt != null;
  const ageMin = simTime - alert.firedAt;

  const onClick = () => {
    if (alert.scope === 'hospital') {
      setSelection({ kind: 'hospital', id: alert.scopeRef });
    }
  };

  return (
    <li
      className={clsx(
        'border-l-[3px] bg-bg-2 px-2 py-1.5 text-[12px] cursor-pointer hover:bg-bg-3',
        SEVERITY_BORDER[alert.severity],
        isResolved && 'opacity-40',
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="section-label text-[10px]">
          {SEVERITY_LABEL[alert.severity]}
        </span>
        <span className="num text-text-2 text-[10px]">{formatAgo(ageMin)}</span>
      </div>
      <div className="text-text-0 mt-0.5">{alert.title}</div>
      <div className="text-text-2 num text-[11px]">{alert.detail}</div>
      {isResolved && (
        <div className="text-text-2 text-[10px] mt-0.5">
          behoben seit {formatAgo(simTime - (alert.resolvedAt ?? simTime))}
        </div>
      )}
    </li>
  );
}
