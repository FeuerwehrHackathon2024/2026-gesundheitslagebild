# START HERE — Autonomer Aufbau-Auftrag für Claude Code

Du baust das Projekt **Rettungsleitstelle** vollständig von Grund auf neu und selbstständig. Der Nutzer wird nicht regelmäßig zurückgefragt — triff Annahmen, dokumentiere sie, und arbeite alle Phasen durch. Es ist ausdrücklich erlaubt, dass dieser Auftrag mehrere Stunden läuft.

## Dein Arbeitsmodus

1. **Lies alle Vertragsdokumente** in `doc/` in dieser Reihenfolge, bevor du mit Code beginnst:
   - `SPEC.md` (Produkt-Vertrag)
   - `BOOTSTRAP.md` (Phasen-Gates, Anti-Patterns, Autonomie-Regeln)
   - `PHASES.md` (schrittweise Anleitung)
   - `DATA_MODEL.md`, `DATA_GENERATION.md`, `SIMULATION.md`, `ROUTING.md`, `SCENARIOS.md`, `MEASURES.md`
   - `DESIGN.md`, `UI.md`, `TIMELINE.md`
   - `AUDIT.md`, `TESTING.md`

2. **Arbeite Phase für Phase** durch `doc/PHASES.md`. Jede Phase hat ein **Gate**, das du selbst prüfst (Build grün, Tests grün, manueller UI-Check beschrieben). Erst Gate bestanden → nächste Phase.

3. **Committe nach jeder bestandenen Phase** mit einer kurzen, konventionellen Commit-Nachricht (`feat(phase-N): ...`, `fix: ...`, `chore: ...`).

4. **Teste selbstständig**. Schreibe Vitest-Unit-Tests für alle Pure-Functions in `lib/simulation/` und `lib/data/`. Schreibe mindestens einen Playwright-E2E-Test, der den Demo-Showcase-Ablauf durchspielt. Siehe `doc/TESTING.md`.

5. **Bei Fehlern**: Diagnostiziere und fixe sie eigenständig. Wenn du mehr als **3 Anläufe** für dasselbe Problem brauchst, logge den Stand in `STATUS.md` und versuche einen alternativen Ansatz.

6. **Bei Unklarheiten**: Triff die pragmatischste Annahme, die dem Geist der SPEC entspricht, und schreibe einen `// ASSUMPTION:`-Kommentar ins Code plus einen Eintrag in `doc/DECISIONS.md` (legst du bei Bedarf an).

7. **Halte die Docs aktuell**. Wenn du während der Arbeit merkst, dass eine Spec-Aussage ungenau ist, aktualisiere die betreffende Markdown-Datei und erwähne den Grund im Commit.

## Was "fertig" heißt

Das System ist fertig, wenn **alle** dieser Punkte gleichzeitig wahr sind:

- [ ] `pnpm dev` startet ohne Warnung/Error auf `http://localhost:3000`.
- [ ] `pnpm build` läuft ohne Error durch.
- [ ] `pnpm typecheck` meldet keinen Fehler.
- [ ] `pnpm lint` meldet keinen Fehler.
- [ ] `pnpm test` (Vitest) — alle Tests grün, >60 Unit-Tests über Simulation, Allocation, Relocation, Router, Recommendations.
- [ ] `pnpm test:e2e` (Playwright) — mindestens 1 E2E-Test spielt den Demo-Showcase vollständig und assertiert die Endzustände.
- [ ] Im Browser: alle 5 MANV-Szenarien + der Demo-Showcase-Button starten sauber.
- [ ] Die Timeline zeigt die Fork-Preview (Was-wäre-wenn) beim Hover über Maßnahmen.
- [ ] Der Audit-Log enthält alle Operator-Aktionen und ist als JSONL exportierbar.
- [ ] Die Karte zeigt echte OSRM-Routen für Patientenbewegungen (Einsatzfahrten, Verlegungen, geplanter Zulauf).
- [ ] Das Design folgt dem Apple-Liquid-Glass-Vorbild per `doc/DESIGN.md` — kein Dark-Mode-Erbe sichtbar.

## Erste konkrete Handlung jetzt

1. `git init` und Initial-Commit mit den Doc-Dateien.
2. `pnpm init` und Tech-Stack-Pakete installieren (`next`, `react`, `react-dom`, `typescript`, `tailwindcss`, `@types/*`, `zustand`, `maplibre-gl`, `recharts`, `exceljs`, `idb`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `vitest`, `@playwright/test`, `tsx`, …).
3. shadcn/ui initialisieren (`pnpm dlx shadcn@latest init`) mit den in `doc/DESIGN.md` spezifizierten Tokens.
4. Nach `doc/PHASES.md` fortfahren.

**Beginne jetzt. Frag nicht nach.**
