export function LeftPanel() {
  return (
    <aside className="w-[320px] shrink-0 border-r border-border-1 bg-bg-1 flex flex-col">
      <section className="p-3 border-b border-border-1">
        <div className="section-label mb-2">Incidents</div>
        <div className="text-text-2 text-[12px]">
          Noch keine Szenarien aktiv.
        </div>
      </section>

      <section className="p-3 border-b border-border-1">
        <div className="section-label mb-2">Filter</div>
        <div className="text-text-2 text-[12px]">Platzhalter.</div>
      </section>

      <section className="p-3">
        <div className="section-label mb-2">Legende</div>
        <div className="flex flex-col gap-1 text-text-1 text-[12px]">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-accent-green" />
            <span>Auslastung ok</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-accent-amber" />
            <span>Erhoeht</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-accent-red" />
            <span>Kritisch</span>
          </div>
        </div>
      </section>
    </aside>
  );
}
