export function Header() {
  return (
    <header className="h-12 flex items-center border-b border-border-1 bg-bg-1 px-4 gap-6">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-accent-amber" />
        <span className="section-label">MANV Dashboard</span>
      </div>

      <div className="flex items-center gap-4 text-text-1">
        <span className="section-label">Sim-Clock</span>
        <span className="num text-text-0">T+00:00:00</span>
      </div>

      <div className="flex items-center gap-4 text-text-1">
        <span className="section-label">Speed</span>
        <span className="num text-text-0">1x</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          className="num px-2 py-1 border border-border-1 bg-bg-2 hover:bg-bg-3 text-text-0"
          type="button"
        >
          Pause
        </button>
        <button
          className="num px-2 py-1 border border-border-1 bg-bg-2 hover:bg-bg-3 text-text-0"
          type="button"
        >
          +10 min
        </button>
      </div>

      <div className="ml-auto flex items-center gap-2 text-text-1">
        <span className="section-label">Scenario</span>
        <span className="num text-text-0">— kein Szenario —</span>
      </div>
    </header>
  );
}
