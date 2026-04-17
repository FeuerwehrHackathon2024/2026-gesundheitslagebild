'use client';

import { useSimStore } from '@/lib/store';

const SPEEDS = [0.5, 1, 2, 5, 10];

function formatSimTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `T+${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

export function Header() {
  const simTime = useSimStore((s) => s.simTime);
  const isPaused = useSimStore((s) => s.isPaused);
  const speed = useSimStore((s) => s.speed);
  const togglePause = useSimStore((s) => s.togglePause);
  const setSpeed = useSimStore((s) => s.setSpeed);
  const stepForward = useSimStore((s) => s.stepForward);
  const reset = useSimStore((s) => s.reset);
  const incidents = useSimStore((s) => s.incidents);

  return (
    <header className="h-12 flex items-center border-b border-border-1 bg-bg-1 px-4 gap-6">
      <div className="flex items-center gap-2">
        <div
          className={`w-2 h-2 ${
            isPaused ? 'bg-text-2' : 'bg-accent-green'
          }`}
        />
        <span className="section-label">MANV Dashboard</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="section-label">Sim-Clock</span>
        <span className="num text-text-0">{formatSimTime(simTime)}</span>
      </div>

      <div className="flex items-center gap-1">
        <span className="section-label mr-1">Speed</span>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            className={`num px-2 py-0.5 border text-[11px] ${
              s === speed
                ? 'border-accent-cyan text-accent-cyan bg-bg-2'
                : 'border-border-1 text-text-1 hover:bg-bg-2'
            }`}
            onClick={() => setSpeed(s)}
          >
            {s}x
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="num px-2 py-1 border border-border-1 bg-bg-2 hover:bg-bg-3 text-text-0"
          onClick={togglePause}
        >
          {isPaused ? 'Play' : 'Pause'}
        </button>
        <button
          type="button"
          className="num px-2 py-1 border border-border-1 bg-bg-2 hover:bg-bg-3 text-text-0"
          onClick={() => stepForward(10)}
        >
          +10 min
        </button>
        <button
          type="button"
          className="num px-2 py-1 border border-border-1 bg-bg-2 hover:bg-bg-3 text-text-0"
          onClick={() => stepForward(60)}
        >
          +1 h
        </button>
        <button
          type="button"
          className="num px-2 py-1 border border-border-1 text-text-2 hover:text-text-0"
          onClick={reset}
        >
          Reset
        </button>
      </div>

      <div className="ml-auto flex items-center gap-3 text-text-1">
        <span
          className="num text-[10px] text-text-2"
          title="Space = Pause · 1-5 = Speed · R = Reset · Esc = Auswahl schliessen"
        >
          ⌨ Space · 1-5 · R · Esc
        </span>
        <span className="section-label">Szenario</span>
        <span className="num text-text-0">
          {incidents.length === 0
            ? '— kein Szenario —'
            : incidents[incidents.length - 1]!.label}
        </span>
      </div>
    </header>
  );
}
