export function TimelineStrip() {
  return (
    <footer className="h-20 border-t border-border-1 bg-bg-1 flex items-center px-4 gap-4">
      <div className="section-label">Timeline</div>
      <div className="flex-1 h-1 bg-bg-3 relative">
        <div className="absolute top-0 left-0 h-full w-0 bg-accent-cyan" />
      </div>
      <div className="num text-text-1">T-0h / T-24h</div>
    </footer>
  );
}
