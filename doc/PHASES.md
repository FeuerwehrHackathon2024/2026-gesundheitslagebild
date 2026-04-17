# PHASES — Schrittweise Aufbau-Anleitung

Arbeite diese Phasen **streng nacheinander** ab. Jede Phase endet mit einem **Gate** — erst wenn alle Prüfungen bestanden, geht es zur nächsten Phase.

Nach jeder bestandenen Phase: `git commit -m "feat(phase-N): ..."` + `STATUS.md` aktualisieren.

---

## Phase 0 — Repo-Bootstrap

**Liefert:**
- `git init` + erster Commit mit den Doc-Dateien (`docs: initial spec`).
- `pnpm init` + `package.json` mit allen Scripts (`dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:e2e`, `format`).
- Installation aller Pakete aus `SPEC §2`.
- `tsconfig.json` strict, Pfad-Alias `@/*` auf Root.
- `next.config.mjs`, `postcss.config.mjs`, `.eslintrc.json`, `.gitignore`, `.env.example`.
- `app/layout.tsx`, `app/page.tsx`, `app/globals.css` — leeres Shell-Layout.
- `tailwind.config.ts` mit Liquid-Glass-Tokens aus `DESIGN.md`.
- shadcn-Init: `pnpm dlx shadcn@latest init` — New York Style, Zinc Base, CSS-Variablen aus `DESIGN.md`.
- `vitest.config.ts` + `playwright.config.ts` (Basis-Setup).
- `STATUS.md`-Skelett.
- `README.md`-Skelett.

**Gate:**
- `pnpm dev` öffnet eine weiße Seite ohne Fehler.
- `pnpm build` grün.
- `pnpm typecheck` grün.
- `pnpm lint` grün.
- `pnpm test` läuft durch (0 Tests OK).

---

## Phase 1 — Datenmodell & Typen

**Liefert:**
- `lib/types.ts` — alle Types aus `DATA_MODEL.md`: `Patient`, `Hospital`, `Capacity`, `Incident`, `PlannedIntake`, `FlightArrival`, `Event`, `Recommendation`, `Alert`.
- `lib/data/resources.ts` — `ResourceType`-Enum + Display-Namen + Farb-Mapping.
- `lib/geo.ts` — Haversine, BBox-Helpers, `FLUGHAFEN_MUC_COORDS`.

**Gate:**
- Typecheck grün.
- Unit-Tests für `geo.ts` (Haversine München–Flughafen ≈ 28 km).

---

## Phase 2 — Excel-Parser & Hospitals-JSON

**Liefert:**
- `scripts/gen-hospitals.ts` gemäß `DATA_GENERATION.md`. Parst `doc/Krankenhäuser_München.xlsx`, leitet `tier`, `capacity`, `flags` ab, schreibt `lib/data/hospitals.json`.
- `lib/data/hospitalsLoader.ts` — typisierter Loader für `hospitals.json`.
- Vitest-Tests: 49 Kliniken geladen, Betten-Summen plausibel, Koordinaten in Bayern-BBox.

**Gate:**
- `pnpm tsx scripts/gen-hospitals.ts` erzeugt `lib/data/hospitals.json` mit 49 Einträgen.
- Tests grün.
- Sichtprüfung: LMU Klinikum Großhadern hat `tier: 'maximal'` und `flags.hasITS: true`.

---

## Phase 3 — Map-Basis + Kliniken-Layer

**Liefert:**
- `components/map/mapStyle.ts` — helles CartoDB Positron (oder gleichwertig).
- `components/map/MapContainer.tsx` — MapLibre-Container, Center `[11.5755, 48.1374]`, Zoom 9.5.
- `components/map/HospitalLayer.tsx` — 49 Kliniken als Kreise, Farbe nach initialer Auslastung (grün/gelb/orange/rot), Radius nach `tier`.
- Hover-Tooltip (shadcn `Tooltip`) mit Name, Tier, 4 Auslastungs-Balken.
- `app/page.tsx` zeigt Header-Platzhalter + Map (vollflächig, responsive-Layout vorbereitet).

**Gate:**
- Browser: Karte zeigt München + 49 Kliniken als farbige Punkte.
- Hover auf Klinik → Tooltip mit Name + 4 Auslastungen.
- Keine Console-Errors.

---

## Phase 4 — Simulation-Engine-Kern + Store

**Liefert:**
- `lib/store.ts` — Zustand-Store mit `simState`, Actions `tick`, `pause`, `resume`, `setSpeed`, `reset`, `launchIncident`, `launchPlannedIntake`, `executeRecommendation`.
- `lib/simulation/engine.ts` — `tick(state, rng)` gemäß `SIMULATION.md §3`.
- `lib/simulation/router.ts` — Kandidaten-Filter, Scoring-Helper.
- `lib/simulation/allocation.ts` — Triage-First Water-Filling mit Cascade.
- `lib/simulation/detection.ts` — 8 Regeln aus `SPEC §6`.
- `lib/simulation/recommendations.ts` — Generator für 10 Maßnahmenarten.
- Initialer Sim-State: Normalbetrieb aus Hospitals-JSON mit 65–80 % Baseline-Belegung.
- Header-Controls: Play/Pause, Speed-Selector 0.5×/1×/2×/5×/10×, Reset.

**Gate:**
- Button "Play" → Tick-Loop läuft sichtbar (Uhr im Header zählt Sim-Minuten).
- Unit-Tests für Allocation mit konstruiertem State (30+ Tests).
- Unit-Tests für Detection-Regeln.
- Speed-Umschaltung sichtbar schneller/langsamer.

---

## Phase 5 — Incident-Launcher + MANV-Layer

**Liefert:**
- `lib/simulation/scenarios.ts` — die 5 Szenarien aus `SCENARIOS.md` als Factory-Funktionen.
- `components/panels/IncidentLauncher.tsx` — Links-Panel-Sektion mit Scenario-Dropdown, Start-Button, "Parallel starten"-Option; bei mehrfachem Start: jedes weitere Szenario mit leichter Orts-Variation (siehe `SCENARIOS.md §3`).
- `components/map/IncidentLayer.tsx` — MANV-Marker **ohne Radiuskreis**, Größe ~ `sqrt(estimatedCasualties) * 4`, Label mit Fallzahl, farbcodiert nach Schwere.
- Allocation-Engine teilt Patienten auf Kliniken zu, Klinik-Farben verändern sich live.

**Gate:**
- Amok starten → 35 Marker-Zahl, Kliniken im Zentrum werden gelb/orange.
- Parallel S-Bahn + Fußball → zwei MANV-Marker an unterschiedlichen Orten, Allocation bedient beide.
- E2E-Test: "Starte Amok, warte 20 Sim-Min, erwarte mindestens 3 Kliniken mit > 80 % Auslastung".

---

## Phase 6 — OSRM-Routing + Patientenbewegungen

**Liefert:**
- `lib/routing/osrm-client.ts` — OSRM-HTTP-Client mit Timeout, Retry, Rate-Limit (kein Burst > 1/s).
- `lib/routing/route-cache.ts` — IndexedDB-Cache (`idb`) für berechnete Routen.
- `lib/routing/route-types.ts` — `Route = { id, polyline, durationSec, distanceM }`.
- `components/map/RouteLayer.tsx` — animierte Marker-Pillen entlang jeder aktiven Route. Farbe nach Kontext: `#007AFF` MANV-Transport, `#AF52DE` Verlegung, `#34C759` geplanter Zulauf.
- Engine: wenn Patient `onScene → transport` wechselt, wird Route angefordert; Progress pro Tick aus `durationSec`.

**Gate:**
- MANV-Start → kleine Pillen bewegen sich entlang **echter Straßen** (z. B. über A9) auf die Kliniken zu.
- Cache-Hit-Rate nach 2 parallelen MANVs > 50 %.
- Fallback-Test: bei OSRM-Timeout wird Haversine + 50 km/h verwendet, Marker bewegt sich immer noch.

---

## Phase 7 — PlannedIntake + Relocation-Engine

**Liefert:**
- `components/panels/PlannedIntakeForm.tsx` — Formular im Links-Panel: Label, Anzahl Patienten, Flug-Anzahl, Intervall, Vorlauf, Trigger "Ankündigen".
- `components/map/PlannedIntakeLayer.tsx` — Flughafen-Marker, Trichter-Visualisierung der erwarteten Ströme.
- `lib/simulation/relocation.ts` — Berechnet Bedarf aus Intake, markiert stabile T2/T3 zum Verlegen, schlägt Ziel-Kliniken vor.
- Engine-Integration: bei `prepare-reception`-Maßnahme startet Relocation-Welle; Patienten werden `status: 'transferring'`, echte Routen zwischen Source- und Target-Klinik, Betten beim Source werden frei, beim Target belegt nach Ankunft.
- Detection-Regel `PlannedIntakeShortfall` + Recommendation `prepare-reception` und `relocate-stable-batch`.

**Gate:**
- Intake ankündigen (750 Pat., 24 h Vorlauf) → Recommendation "Vorbereitung aktivieren" erscheint.
- Execute → Verlegungs-Pillen bewegen sich zwischen Kliniken (violett).
- Nach 24 Sim-h: Zielkliniken in Flughafen-Nähe haben > 750 + 15 % freie Betten.

---

## Phase 8 — Right-Panel: Alerts + Recommendations + Hospital-Detail

**Liefert:**
- `components/panels/RightPanel.tsx` — Tabs "Alarme", "Empfehlungen", "Klinik", "Audit".
- `components/panels/AlertList.tsx` — sortiert nach Schwere + Zeit, Filter, Dedup-Anzeige.
- `components/panels/RecommendationList.tsx` — Karten mit Titel, Rationale, Impact-Chips, Buttons "Preview" und "Aktivieren". Preview zündet Fork-Simulation (siehe Phase 9).
- `components/panels/HospitalDetailPanel.tsx` — wird beim Klick auf Klinik auf der Karte geöffnet; zeigt 4 Ressourcen-Balken, Belegungs-Sparkline 4 h, Escalation-Controls, Liste aktiver Maßnahmen an diesem Haus.

**Gate:**
- MANV läuft → Alerts erscheinen und bleiben bis Situation entspannt.
- Recommendation-Karte hat Impact-Chips (z. B. `+28 Betten`, `+45 min`).
- Klick auf Klinik → Detail-Panel geht auf, zeigt Sparkline.

---

## Phase 9 — Timeline mit Fork-Preview

**Liefert:**
- `lib/simulation/fork-preview.ts` — forkt `SimState` (strukturierter Clone), simuliert N Minuten mit Maßnahme aktiviert, liefert Kurven-Delta. Debounced 150 ms. Cached per `recommendationId`.
- `components/panels/TimelineStrip.tsx` — Höhe 160 px, 3 Sektionen: Historie (links), Jetzt (Mitte mit Scrubber), Prognose (rechts bis zur fernsten `firstArrivalAt`). Multi-Kurven: Gesamt-Auslastung, Durchschnitt, ITS, OP, Notaufnahme. Kritische Bereiche eingefärbt.
- `components/charts/ForkPreviewOverlay.tsx` — gestrichelte Overlay-Kurve für Was-wäre-wenn.
- Event-Marker auf Zeitachse: MANV-Starts, Flug-Landungen, ausgeführte Maßnahmen, Eskalationen.
- Hover auf Recommendation oder Timeline-Kurve → Highlight + Tooltip.

**Gate:**
- Timeline zeigt 4 Kurven. Hover auf Kurve highlightet sie, dimmt andere.
- Hover auf eine Recommendation → innerhalb < 300 ms erscheint gestrichelte Preview-Linie.
- Execute → Preview wird durch tatsächliche Kurve ersetzt, Marker auf Zeitachse bleibt stehen.
- Visueller Check: Flug-Ankündigung setzt gestrichelte Prognose-Linie in die Zukunft.

---

## Phase 10 — Audit-Log + Export + Filter + Demo-Showcase

**Liefert:**
- `lib/audit/event-log.ts` + `lib/audit/event-types.ts` gemäß `AUDIT.md`.
- `components/panels/AuditLogPanel.tsx` — chronologische Tabelle aller Events, Filter nach Typ/Scope, Export als JSONL + CSV.
- `components/panels/FilterPanel.tsx` — Filter (aus Alt-System übernommen) für Bett-Schwellen + Triage-Kategorien.
- `components/panels/Header.tsx` — "Demo-Showcase starten"-Button, der den in `SPEC §15` beschriebenen Ablauf triggert.
- `tests/e2e/demo-showcase.spec.ts` — Playwright spielt den Ablauf und assertiert Endzustände.
- `README.md` vollständig.

**Gate:**
- Demo-Button → Showcase läuft reproduzierbar in ~6 Minuten bei 10× Speed durch.
- Export liefert wohlgeformte JSONL-Datei mit allen Events.
- Filter verändern die Kliniken-Darstellung auf der Karte.
- Alle Tests grün, E2E-Test grün.
- `pnpm build` ohne Warnings.

---

## Phase 11 (optional) — Polish & Performance

**Liefert:**
- Keyboard-Shortcuts (`Space` = Pause, `1/2/3/4/5` = Speed, `R` = Reset, `D` = Demo).
- Ladeverhalten: Skelett-Panels, sanfte Transitions.
- Performance-Review: tick-Loop unter 20 ms bei 500 Patienten + 3 MANV.
- Accessibility-Baseline: Fokus-Ringe, ARIA-Labels für interaktive Elemente.

**Gate:**
- Lighthouse Score Desktop > 85 Performance, > 90 Accessibility.
- `STATUS.md` finalisiert: "alle Phasen abgeschlossen, Release-Candidate".

---

Ende PHASES.
