# Status — Rettungsleitstelle

## Aktueller Stand

| Feld | Wert |
|------|------|
| Aktive Phase | Phase 0 — Repo-Bootstrap |
| Aktueller Schritt | Schritt 0.5 erledigt (vitest.config.ts + vitest.setup.ts + playwright.config.ts + `--passWithNoTests`). Phase-0-Gate **technisch** gruen: build ✓ typecheck ✓ lint ✓ test ✓. Offen fuer Phase-0-Komplettierung: manueller `pnpm dev`-UI-Check + shadcn-Init + README-Skelett |
| Session | 1 |
| Letztes Update | 2026-04-18 |
| Blockiert durch | — |
| Naechste Aktion | Schritt 0.6: `pnpm dev`-Smoke-Check, `components.json` + shadcn-Init, `README.md`-Skelett; dann Phase-0 abgeschlossen → Commit `feat(phase-0): ...` und Phase 1 starten |

## Changelog

### Session 1 — 2026-04-18
- **00:14** — Projekt mit /einrichten initialisiert
- Git-Repo initialisiert (steht an — noch kein `git init` ausgefuehrt)
- STATUS.md, `.claude/settings.json`, `.claude/commands/{status,catchup,next-phase}.md`, `.gitignore`, `.env.example` erstellt
- `doc/Krankenhaeuser_Muenchen.xlsx` (49 Kliniken) vorhanden
- **00:27** — Loop-Infrastruktur: `/next-phase`-Command (Gate-respektierend) + Stop-Hook (`.claude/hooks/on-stop.sh`)
- **00:35** — Vollstaendige Dokumentation angelegt:
  - `CLAUDE.md` (Projektkontext)
  - `doc/START_HERE.md`, `doc/SPEC.md`, `doc/BOOTSTRAP.md`, `doc/PHASES.md`
  - `doc/DATA_MODEL.md`, `doc/DATA_GENERATION.md`
  - `doc/SIMULATION.md`, `doc/ROUTING.md`, `doc/SCENARIOS.md`, `doc/MEASURES.md`
  - `doc/DESIGN.md`, `doc/UI.md`, `doc/TIMELINE.md`
  - `doc/AUDIT.md`, `doc/TESTING.md`
- **00:44** — Phase 0, Schritt 0.1: `pnpm init` + `package.json` mit allen Scripts (dev/build/start/lint/typecheck/test/test:e2e/format). SPEC-§2-Dependencies installiert: next@14, react@18, maplibre-gl, zustand, recharts, idb, exceljs (runtime); tailwind@3, typescript, vitest, @playwright/test, RTL-Toolkit, eslint@9 + eslint-config-next@14, tsx, prettier (dev). Peer-Pins gesetzt (eslint, @types/react, eslint-config-next) damit Gate gruenbar bleibt.
- **00:50** — Phase 0, Schritt 0.2: `tsconfig.json` (strict, Pfad-Alias `@/*`), `next.config.mjs` (reactStrictMode), `postcss.config.mjs` (tailwind + autoprefixer), `.eslintrc.json` (`next/core-web-vitals`), leerer `next-env.d.ts`-Stub. `pnpm typecheck` gruen. `.gitignore` erweitert um `.claude/session.log` und `.claude/scheduled_tasks.lock` (Runtime-Artefakte).
- **00:56** — Phase 0, Schritt 0.3: `tailwind.config.ts` mit allen Liquid-Glass-Tokens aus `doc/DESIGN.md` (Farben, Typografie-Skalen, Spacing, Radii, Shadows, Blur, Z-Indizes, Timing-Funktionen). Tokens als CSS-var-Bridges — die konkreten Werte kommen in Schritt 0.4 in `app/globals.css`. shadcn-kompatibles Token-Mapping vorbereitet. Typecheck gruen.
- **01:02** — Phase 0, Schritt 0.4: App-Shell angelegt: `app/layout.tsx` (html lang=de, Metadata), `app/page.tsx` (Placeholder-Text, Liquid-Glass-konformes Styling via `text-caption` + CSS-var), `app/globals.css` (komplette DESIGN.md §1-Tokens + shadcn-HSL-Mapping + backdrop-filter-Fallback). Begleitende Fixes: ESLint-Downgrade auf 8 (Next 14 kompatibel), `globals.d.ts` mit `declare module '*.css'` fuer TS-6-side-effect-Import. Gate-Stand: `pnpm build`, `pnpm typecheck`, `pnpm lint` alle gruen; `pnpm test` faellt noch weil Testrunner nicht konfiguriert (Schritt 0.5).
- **01:08** — Phase 0, Schritt 0.5: Testrunner-Setup. `vitest.config.ts` (jsdom, globals, `@`-Alias, include-Globs fuer tests/unit|integration + lib + components), `vitest.setup.ts` mit `@testing-library/jest-dom/vitest`, `playwright.config.ts` (chromium, webServer `pnpm dev`, 1920x1080, retries in CI). `package.json` test-Script auf `--passWithNoTests`. Phase-0-Gate technisch gruen (build/typecheck/lint/test alle ✓).

## Loop-Betrieb

Fuer autonomes Weiterarbeiten:
- `/loop /next-phase` (dynamisch, Claude pacet selbst) — arbeitet Phase fuer Phase, respektiert Gates
- Stop-Hook pflegt "Letztes Update" in STATUS.md und `.claude/session.log`
- Gate erreicht oder Blocker → Loop meldet und stoppt, wartet auf Freigabe

## Offene Aktionen
- [ ] Phase 0 — Repo-Bootstrap (git init, pnpm init, Pakete, tsconfig, shadcn init, Next.js-Shell, Testrunner, STATUS-Skelett)
- [ ] Phase 1 — Datenmodell & Typen (`lib/types.ts`, `lib/data/resources.ts`, `lib/geo.ts`)
- [ ] Phase 2 — Excel-Parser + `hospitals.json` (`scripts/gen-hospitals.ts`)
- [ ] Phase 3 — Map-Basis + Kliniken-Layer (helles CartoDB Positron)
- [ ] Phase 4 — Simulation-Engine-Kern + Store (Tick-Loop, Allocation, Detection, Recommendations)
- [ ] Phase 5 — Incident-Launcher + MANV-Layer (5 Szenarien, parallele Aktivierung, keine Radiuskreise)
- [ ] Phase 6 — OSRM-Routing + animierte Patientenbewegungen
- [ ] Phase 7 — PlannedIntake + Relocation-Engine (T2/T3 proaktiv verlegen)
- [ ] Phase 8 — Right-Panel (Alarme/Empfehlungen/Klinik/Audit)
- [ ] Phase 9 — Timeline mit Fork-Preview (Was-wäre-wenn)
- [ ] Phase 10 — Audit-Log + Export + Filter + Demo-Showcase-Button
- [ ] Phase 11 (optional) — Polish & Performance

## Bekannte Probleme
_Keine_

## Vertragsdokumente (Referenz)

Verbindliche Quellen in dieser Reihenfolge lesen:
1. `doc/START_HERE.md` — Autonomer Einstieg
2. `doc/SPEC.md` — Produktvertrag
3. `doc/BOOTSTRAP.md` — Phasen-Gates, Anti-Patterns, Autonomie-Regeln
4. `doc/PHASES.md` — Schrittweise Anleitung
5. `doc/DATA_MODEL.md`, `doc/DATA_GENERATION.md`
6. `doc/SIMULATION.md`, `doc/ROUTING.md`, `doc/SCENARIOS.md`, `doc/MEASURES.md`
7. `doc/DESIGN.md`, `doc/UI.md`, `doc/TIMELINE.md`
8. `doc/AUDIT.md`, `doc/TESTING.md`
