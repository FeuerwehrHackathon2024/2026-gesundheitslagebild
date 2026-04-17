'use client';

import clsx from 'clsx';

import { useSimStore } from '@/lib/store';

const WINDOW_MIN = 24 * 60; // 24h

export function TimelineStrip() {
  const simTime = useSimStore((s) => s.simTime);
  const incidents = useSimStore((s) => s.incidents);
  const alerts = useSimStore((s) => s.alerts);
  const stepForward = useSimStore((s) => s.stepForward);

  const cursorPct = Math.min(100, (simTime / WINDOW_MIN) * 100);

  return (
    <footer className="h-20 border-t border-border-1 bg-bg-1 flex items-center px-4 gap-4">
      <div className="section-label shrink-0">Timeline</div>

      <div className="relative flex-1 h-10">
        {/* Axis */}
        <div className="absolute inset-x-0 top-1/2 h-px bg-border-1" />
        {/* Hour ticks */}
        {[0, 4, 8, 12, 16, 20, 24].map((h) => {
          const pct = (h / 24) * 100;
          return (
            <div
              key={h}
              className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center"
              style={{ left: `${pct}%`, transform: `translateX(-50%)` }}
            >
              <div className="h-2 w-px bg-border-2" />
              <span className="num text-[9px] text-text-2 mt-0.5">
                T+{String(h).padStart(2, '0')}h
              </span>
            </div>
          );
        })}
        {/* Incident markers */}
        {incidents.map((i) => {
          const pct = Math.min(100, (i.startedAt / WINDOW_MIN) * 100);
          return (
            <div
              key={i.id}
              className="absolute top-1 w-0.5 h-3 bg-accent-amber"
              style={{ left: `${pct}%` }}
              title={`${i.label} (T+${i.startedAt}min)`}
            />
          );
        })}
        {/* Critical-Alert markers */}
        {alerts
          .filter((a) => a.severity === 'critical')
          .map((a) => {
            const pct = Math.min(100, (a.firedAt / WINDOW_MIN) * 100);
            return (
              <div
                key={a.id}
                className={clsx(
                  'absolute bottom-1 w-0.5 h-3 bg-accent-red',
                  a.resolvedAt != null && 'opacity-30',
                )}
                style={{ left: `${pct}%` }}
                title={a.title}
              />
            );
          })}
        {/* Cursor */}
        <div
          className="absolute top-0 bottom-0 w-[2px] bg-accent-cyan"
          style={{ left: `${cursorPct}%` }}
        />
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <span className="num text-[11px] text-text-0 w-16 text-center">
          T+{String(Math.floor(simTime / 60)).padStart(2, '0')}:
          {String(simTime % 60).padStart(2, '0')}
        </span>
        <button
          type="button"
          className="num text-[11px] px-1.5 py-0.5 border border-border-1 text-text-1 hover:text-text-0 hover:bg-bg-2"
          onClick={() => stepForward(10)}
        >
          +10m
        </button>
        <button
          type="button"
          className="num text-[11px] px-1.5 py-0.5 border border-border-1 text-text-1 hover:text-text-0 hover:bg-bg-2"
          onClick={() => stepForward(60)}
        >
          +1h
        </button>
      </div>
    </footer>
  );
}
