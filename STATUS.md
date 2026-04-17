# Status — Rettungsdienst (MANV Dashboard)

## Aktueller Stand

| Feld | Wert |
|------|------|
| Aktive Phase | Setup |
| Aktueller Schritt | Stack umgestellt auf Next.js, Phase 1 startet |
| Session | 1 |
| Letztes Update | 2026-04-17 |
| Blockiert durch | — |
| Naechste Aktion | Next.js initialisieren, Gotham-Layout-Shell, PZC-Katalog |

## Changelog

### Session 1 — 2026-04-17
- **17:38** — Projekt mit /einrichten initialisiert (Python-Setup)
- **18:00** — SPEC.md + BOOTSTRAP.md + Krankenhaeuser_D.xlsx im doc/ bereitgestellt
- **18:10** — Rueckfragen-Runde: Tech-Stack-Widerspruch geklaert, Workflow "locker", Hospital-Daten aus Excel
- **18:15** — Setup umgestellt Python → Next.js/TS per SPEC §2
- pnpm ueber npm global installiert (Corepack scheiterte an EPERM)

## Offene Aktionen
- [ ] Phase 1: Next.js init, Gotham-Tokens, 3-Panel-Layout-Shell, pzc.ts, disciplines.ts
- [ ] Phase 2: gen-hospitals.ts (Excel-Parse), MapLibre, HospitalLayer
- [ ] Phase 3: Sim-Engine, Router, Zustand-Store
- [ ] Phase 4-8: siehe SPEC §11

## Entscheidungen (relevant fuer spaeter)
- **Stack:** Next.js 14 / TS strict / MapLibre / Zustand / Recharts / Tailwind (SPEC §2)
- **Workflow:** Phasen durchziehen, Commit pro Phase, nur bei echten Blockern stoppen
- **Hospital-Quelle:** `doc/Krankenhaeuser_D.xlsx` (2252 Eintraege, ~192 vollstaendig fuer Simulation)
- **Discipline-Mapping:** Ich erstelle Vorschlag, Review in Phase 2
- **Versorgungsstufe:** abgeleitet aus Betten + Abteilungs-Breite
- **Verbrennungszentren:** 6 Haeuser mit 'Verbrennungsmedizin' in Excel

## Bekannte Probleme
_Keine_
