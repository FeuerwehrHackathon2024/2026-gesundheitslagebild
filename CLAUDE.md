# Rettungsdienst — MANV Dashboard

Map-zentriertes Leitstand-Dashboard fuer Massenanfall-von-Verletzten (MANV) Szenarien in Deutschland. Simuliert in Echtzeit wie eine Grosslage Krankenhaus-Kapazitaeten belastet, erkennt Engpaesse und schlaegt dem Operator konkrete Massnahmen vor.

Alles client-only, keine Backend-Abhaengigkeiten, deterministische Regel-Engine. Demo auf echten deutschen Krankenhaus-Koordinaten.

## Quellen (Vertrag)
- **`doc/SPEC.md`** — verbindliche Produkt-Spezifikation. Jede Abweichung mit Begruendung in STATUS.md.
- **`doc/BOOTSTRAP.md`** — Phasen-Gating-Regeln und Anti-Patterns.
- **`doc/Krankenhaeuser_D.xlsx`** — Quelldaten fuer Krankenhaeuser (~2252 Eintraege, ~192 mit vollstaendigen Abteilungs-/Bettendaten fuer Simulation).

## Tech-Stack (gesperrt per SPEC §2)
- **Framework:** Next.js 14+ (App Router), TypeScript strict
- **Styling:** Tailwind CSS 3 + CSS-Variablen fuer Gotham-Tokens (globals.css)
- **Map:** MapLibre GL JS (**nicht** Mapbox, **nicht** Leaflet)
- **State:** Zustand (globaler Sim-Store) + React-State fuer lokales UI
- **Charts:** Recharts
- **Paketmanager:** pnpm (corepack/npm-global ok)
- **Kartendaten:** MapLibre Demo-Tiles oder Protomaps (kein Token)
- **Simulation:** Pure TypeScript in `lib/simulation/`, client-seitig

**Kein Backend. Keine DB. Keine API-Keys. Kein Auth.**

## Verzeichnisse
- `app/` — Next.js App Router (layout.tsx, page.tsx, globals.css)
- `components/map/` — MapLibre Container und Layer
- `components/panels/` — Header, Left/Right-Panel, Alerts, Recommendations, Timeline
- `components/charts/`, `components/ui/` — Recharts-Wrapper und Primitives
- `lib/simulation/` — engine, router, detection, recommendations, scenarios
- `lib/data/` — pzc.ts, disciplines.ts, hospitals.json
- `scripts/` — `gen-hospitals.ts` (parst die Excel, erzeugt hospitals.json)
- `doc/` — SPEC.md, BOOTSTRAP.md, Krankenhaeuser_D.xlsx

## Code-Regeln (aus SPEC §13 + BOOTSTRAP)
- **TypeScript strict.** `any` nur mit `// TODO` + Begruendung.
- **Deterministisch** bei gleichem Seed + gleichen Operator-Aktionen.
- **Phasen-Gating:** nur das implementieren, was die aktuelle Phase scoped (SPEC §11). Keine Vorab-Abstraktion. YAGNI.
- **Keine rounded-corner SaaS-Optik.** Gotham-Aesthetik strikt einhalten (SPEC §7).
- Keine Secrets im Code. `.env.example` als Vorlage.
- Saubere Fehlermeldungen auf Deutsch fuer den Operator, Logs auf Englisch.

## Domaenen-Hinweise
Rettungsdienst/Katastrophenschutz-Kontext — Entscheidungs-Vorschlaege muessen nachvollziehbar sein (rationale pro Recommendation). Regelbasiert, nicht ML.

## Demo-Workflow
1. `pnpm install`
2. Einmalig: `pnpm tsx scripts/gen-hospitals.ts` (erzeugt lib/data/hospitals.json aus der Excel)
3. `pnpm dev` → http://localhost:3000

## Referenz-Dateien
- Projektkontext: `CLAUDE.md` (diese Datei)
- Session-Log: `STATUS.md`
- SPEC: `doc/SPEC.md`
- Bootstrap: `doc/BOOTSTRAP.md`
