# Status — Rettungsleitstelle

## Aktueller Stand

| Feld | Wert |
|------|------|
| Aktive Phase | Setup / Phase 0 |
| Aktueller Schritt | Projekt-Infrastruktur eingerichtet — Bootstrap laut `doc/PHASES.md` steht aus |
| Session | 1 |
| Letztes Update | 2026-04-18 |
| Blockiert durch | — (doc/SPEC.md, doc/BOOTSTRAP.md, doc/PHASES.md referenziert in CLAUDE.md, aber noch nicht angelegt) |
| Naechste Aktion | `doc/START_HERE.md` lesen und den dort beschriebenen Ablauf starten |

## Changelog

### Session 1 — 2026-04-18
- **00:14** — Projekt mit /einrichten initialisiert
- Git-Repo initialisiert
- STATUS.md, .claude/settings.json, .claude/commands/{status,catchup}.md, .gitignore, .env.example erstellt
- CLAUDE.md existierte bereits mit vollstaendiger Spec (Next.js / TS / MapLibre / OSRM / Zustand / shadcn)
- doc/Krankenhaeuser_Muenchen.xlsx und doc/START_HERE.md bereits vorhanden
- Leere Verzeichnisse `src/`, `docs/`, `tests/` vorhanden
- **00:27** — Loop-Infrastruktur ergaenzt: `/next-phase`-Command (Gate-respektierend) und Stop-Hook (`.claude/hooks/on-stop.sh`) der STATUS.md-Datum aktualisiert und `.claude/session.log` fortschreibt

## Loop-Betrieb

Fuer autonomes Weiterarbeiten:
- `/loop /next-phase` (dynamisch, Claude pacet selbst) — arbeitet Phase fuer Phase, respektiert Gates
- Stop-Hook pflegt "Letztes Update" in STATUS.md und `.claude/session.log`
- Gate erreicht oder Blocker → Loop meldet und stoppt, wartet auf Freigabe

## Offene Aktionen
- [ ] `doc/START_HERE.md` lesen und autonomen Ablauf starten
- [ ] Fehlende Vertragsdokumente anlegen (SPEC.md, BOOTSTRAP.md, PHASES.md, DATA_MODEL.md, DATA_GENERATION.md, SIMULATION.md, ROUTING.md, SCENARIOS.md, MEASURES.md, DESIGN.md, UI.md, TIMELINE.md, AUDIT.md, TESTING.md)
- [ ] Next.js 14 App-Router-Projekt mit TypeScript strict bootstrappen (pnpm)
- [ ] `scripts/gen-hospitals.ts` — Excel → `lib/data/hospitals.json`
- [ ] Tailwind + Liquid-Glass-Tokens konfigurieren

## Bekannte Probleme
_Keine_
