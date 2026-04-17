# Rettungsleitstelle — MANV/Großlage-Dashboard Raum München

Map-zentriertes Leitstand-Dashboard für Einsatzleitung im Raum München. Simuliert in Echtzeit, wie drei Belastungsquellen eine Kliniklandschaft gegeneinander verschieben:

1. **Normalbetrieb** — die ruhende Ausgangs-Auslastung der Münchner Kliniken.
2. **MANV-Fälle** — akute Großschadensereignisse mit sofortigem Patientenzustrom, Verteilung nach Nähe mit Überlauf in entferntere Häuser.
3. **Geplante Belegungen** — angekündigte Großeinweisungen (z. B. 750 Verwundete per Flugzeug in München) mit Vorlaufzeit (z. B. 24 h), in der Kliniken *proaktiv* Kapazität freiräumen müssen, indem stabile Patienten in entferntere Häuser verlegt werden.

Das System macht die **gegenseitige Interferenz** dieser drei Ebenen sichtbar, identifiziert kritische Häuser, alarmiert, schlägt Maßnahmen vor und lässt die Einsatzleitung per Klick eingreifen. Jede Aktion ist nachvollziehbar (Audit-Trail).

Alles client-only, keine Backend-Abhängigkeiten, deterministisch bei gleichem Seed.

## Vertragsdokumente (verbindlich, in dieser Reihenfolge lesen)

| Datei | Zweck |
|---|---|
| `doc/START_HERE.md` | **Einstiegspunkt** für Claude Code — autonome Arbeitsanweisung |
| `doc/SPEC.md` | Verbindliche Produkt-Spezifikation |
| `doc/BOOTSTRAP.md` | Phasen-Gates, Anti-Patterns, Autonomie-Regeln |
| `doc/PHASES.md` | Schrittweise Arbeitsanleitung, Phase 1–10 |
| `doc/DATA_MODEL.md` | Types: Patient, Hospital, Incident, PlannedIntake, Event |
| `doc/DATA_GENERATION.md` | Excel-Parser-Spezifikation |
| `doc/SIMULATION.md` | Engine, Allocation, Relocation-Engine, Fork-Preview |
| `doc/ROUTING.md` | OSRM-Integration, Cache, Fallbacks |
| `doc/SCENARIOS.md` | 5 MANV-Szenarien + Parallel-Regeln |
| `doc/MEASURES.md` | Maßnahmenkatalog mit Execute-Semantik |
| `doc/DESIGN.md` | Apple-Liquid-Glass-Design-System |
| `doc/UI.md` | Layout, Komponenten, shadcn-Nutzung |
| `doc/TIMELINE.md` | Timeline-Panel mit Was-wäre-wenn-Preview |
| `doc/AUDIT.md` | Event-Log, IndexedDB, Export |
| `doc/TESTING.md` | Test-Strategie, Gates |

## Datenquelle

`doc/Krankenhäuser_München.xlsx` — 49 Kliniken Großraum München mit Koordinaten, Abteilungen, Betten und Intensivbetten. Einmal per `scripts/gen-hospitals.ts` zu `lib/data/hospitals.json` konvertieren.

## Tech-Stack (gesperrt per SPEC §2)

- **Framework:** Next.js 14+ (App Router), TypeScript strict
- **Styling:** Tailwind CSS 3 + CSS-Variablen für Liquid-Glass-Tokens
- **UI-Primitives:** shadcn/ui
- **Map:** MapLibre GL JS + OSRM (public demo) für echte Straßen-Routen
- **State:** Zustand
- **Charts:** Recharts
- **Persistenz (Audit):** IndexedDB via `idb`
- **Tests:** Vitest (unit/integration) + Playwright (E2E)
- **Paketmanager:** pnpm

**Kein Backend. Keine DB auf dem Server. Keine API-Keys. Kein Auth.**

## Demo-Workflow

```bash
pnpm install
pnpm tsx scripts/gen-hospitals.ts   # einmal: Excel → hospitals.json
pnpm dev                             # → http://localhost:3000
```

## Code-Regeln

- **TypeScript strict.** `any` nur mit `// TODO` + Begründung.
- **Deterministisch** bei gleichem Seed + gleichen Operator-Aktionen.
- **Phasen-Gating** per `doc/PHASES.md`.
- **Apple-Liquid-Glass-Ästhetik** strikt einhalten (`doc/DESIGN.md`).
- Keine Secrets im Code. `.env.example` als Vorlage.
- Fehlermeldungen auf Deutsch für den Operator, Logs auf Englisch.
- Nachvollziehbarkeit: jede Zustandsänderung durch Operator-Maßnahme oder Simulation ist im Event-Log.

## Domänen-Hinweis

Leitstellen-Kontext — Handlungsvorschläge müssen für die Einsatzleitung *nachvollziehbar* sein. Regelbasiert, nicht ML. Jede Maßnahme hat eine Rationale, einen Erwartungsimpact und ein Vorher/Nachher in der Timeline (Fork-Preview).
