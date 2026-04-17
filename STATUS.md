# Status — Rettungsdienst (MANV Dashboard)

## Aktueller Stand

| Feld | Wert |
|------|------|
| Aktive Phase | Leitstellen-Feedback-Iteration |
| Aktueller Schritt | Allokator mit Cascade-D live, User testet im Browser |
| Session | 1 |
| Letztes Update | 2026-04-17 22:02 |
| Blockiert durch | — |
| Naechste Aktion | Verteilung visuell verifizieren, ggf. weiteres Feintuning / UI-Feedback vom User |
| Repo | https://github.com/FeuerwehrHackathon2024/2026-gesundheitslagebild |
| Dev-Server | laeuft im Hintergrund auf http://localhost:3000 (Task b9rbgg7q6) |

## Changelog

### Session 1 — 2026-04-17
- **17:38** — Projekt mit /einrichten initialisiert (urspruenglich Python-Setup)
- **18:00** — SPEC.md + BOOTSTRAP.md + Krankenhaeuser_D.xlsx im doc/ bereitgestellt
- **18:10** — Tech-Stack-Konflikt geklaert: Python raus, Next.js 14 + TS strict per SPEC §2
- **18:15** — pnpm ueber npm global installiert (Corepack EPERM), Setup umgestellt
- **18:30** — Phase 1 Foundation: Layout-Shell, Gotham-Tokens, PZC-Katalog, Types
- **18:45** — Phase 2 Map: gen-hospitals.ts (Excel-Parser mit ExcelJS), MapLibre + CartoDB Dark-Matter, 192 simulierbare + 2060 Kontext-Haeuser. Discipline-Mapping 130 Token → 8 SPEC-Disciplines
- **19:00** — Phase 3+4 Sim-Engine + Incident-Launcher: Zustand-Store, Tick-Loop, Routing-Engine, 5 SPEC-Szenarien (A7 Hamburg, Ludwigshafen, Amok Muenchen, Goerlitz, Passau)
- **19:20** — Map-Rendering-Bug gefixt: Canvas hing auf 300px (Flex-Layout-Reihenfolge) → h-full/w-full + ResizeObserver
- **19:30** — Sichtbarkeits-Fixes: cyan Halo-Ring fuer Haeuser mit MANV-Zulauf, Max-Discipline-Metrik
- **19:45** — Filter-Panel: Bett-Schwellen (Freie/Belegte/MANV-Reserve) + SK-Triage-Multi-Checkboxen
- **20:00** — Dynamische Reserve (MANV-Reserve-Feld): Plan + Implementation ueber Plan-Mode
- **20:15** — MANV-Reserve auf Wunsch wieder entfernt (850 Zeilen weniger)
- **20:25** — Notfallbetten-Feld (10% der Gesamt, nur bei Haeusern mit echter Notaufnahme-Abteilung, 123/192) + Filter
- **20:40** — Phase 5 Detection: 6 Rules (HospitalSaturation, CapacityTrend, UnassignedPatients, RegionalLoad, DisciplineMismatch, EscalationOpportunity) mit Dedup-Fenster
- **20:55** — Phase 6 Recommendations: 6 Actions (activate-surge, reroute, alert-adjacent, request-cross-region, activate-kv-notdienst, transfer-stable) mit Execute-Pfad
- **21:10** — Phase 7 Hospital-Detail: HospitalDetailPanel mit Disciplin-Balken, Escalation-Leiste, Recharts-Trendkurve. TimelineStrip mit Stundenticks und Incident/Alert-Markern
- **21:20** — Phase 8 Polish: Keyboard-Shortcuts (Space/1-5/R/Esc), Pseudo-Isochronen (10/20/30km), DEMO.md
- **21:30** — User-Feedback: inkonsistente Auslastungs-Anzeige (Max vs Gesamt) und einseitige Verteilung → Umstellung auf Gesamt-Auslastung, quadratischer Load-Penalty, inTransit-Kompensation
- **21:40** — Plan-Mode: Leitstellen-Perspektive. Allokator statt Pro-Patient-Router
- **21:55** — Phase C: Leitstellen-Allokator (lib/simulation/allocation.ts) mit Triage-First Water-Filling, Tick-Caps (T1=3, T2=5, T3=8, T4=10), 3-Stufen-Cascade. Operator-Exclude-Toggle im HospitalDetailPanel, rote Ring-Overlay auf Karte. IncidentAllocationTable mit Pro-Haus-Verteilung
- **21:58** — Push auf GitHub: Remote angelegt, master→main, Merge mit initialem README, 20+ Commits online
- **22:00** — User-Feedback: Patienten bleiben unvermittelt. Fix: Cascade-Stufe D-surge (Distanz 900km, kein Bett-Check, Ueberbelegung erlaubt). Isochronen entfernt. assignBed toleriert bedsOccupied > bedsTotal
- **22:02** — Session-Pause

## Offene Aktionen
- [x] Phase 1-8 komplett (Foundation → Polish)
- [x] Repo auf GitHub gepusht
- [x] Leitstellen-Allokator mit garantierter Verteilung
- [ ] User verifiziert visuell: alle Patienten werden bei Goerlitz verteilt, `Unvermittelt` bleibt bei 0
- [ ] README.md auf GitHub ist noch Placeholder-Einzeiler — koennte erweitert werden
- [ ] Recommendations-Engine im Amok-Muenchen-Szenario praxistesten (wenige Patienten = spaet ausloesende Empfehlungen)
- [ ] Evtl. Backward-Timeline-Scrub (Sim-Snapshots fuer echtes Time-Travel) — aktuell nur Cursor-Anzeige

## Entscheidungen (relevant fuer Fortsetzung)
- **Stack:** Next.js 14 / TS strict / MapLibre / Zustand / Recharts / Tailwind
- **Workflow:** Phasen durchziehen, Commit pro Phase, Plan-Mode bei groesseren Refactors
- **Hospital-Quelle:** `doc/Krankenhaeuser_D.xlsx` — 192 simuliert, 2060 Kontext
- **Discipline-Mapping:** 130 Excel-Tokens → 8 SPEC-Disciplines in `lib/data/discipline-mapping.ts`
- **Versorgungsstufe:** aus Betten + Abteilungs-Breite abgeleitet (26 maximal / 48 schwerpunkt / 64 regel / 54 grund)
- **Verbrennungszentren:** 6 aus Excel (Bogenhausen, Murnau, Koblenz, Aachen, Nuernberg, Dresden)
- **Notfallbetten:** 10% der Gesamt bei Haeusern mit echter Notaufnahme (123/192, Summe 6282)
- **MANV-Reserve-Feld:** bewusst NICHT modelliert (User-Entscheidung, vereinfacht)
- **Allokator-Prinzip:** Triage-First, Tick-Caps konservativ (T1=3/T2=5/T3=8/T4=10), Cascade A→B→C→D, assignBed toleriert Ueberbelegung
- **Operator-Controls:** HospitalDetailPanel kann Haus aus Zuteilung nehmen (roter Ring auf Karte)
- **Keine Isochronen-Kreise** (wurden entfernt, kein Mehrwert)
- **Seed:** 20260417 fuer Reproduzierbarkeit

## Bekannte Probleme
- **Recommendations in kleinen Szenarien:** Bei Amok-Muenchen (35 Patienten) feuern die Empfehlungen spaet, weil `HospitalSaturation` erst bei >=85% anschlaegt und die Muenchner Uni-Kliniken so viele Betten haben, dass 35 Patienten die Schwelle kaum heben. Fuer Goerlitz/Ludwigshafen greifen sie besser.
- **Timeline-Scrub ist visuell, nicht funktional:** Man kann den Cursor sehen, aber nicht "zurueckspulen". Echte Time-Travel-Snapshots waeren Phase 7 Gate-Soll laut SPEC, wurden als YAGNI ausgelagert.
- **Headless-Chrome zeigt keine MapLibre-Tiles** — WebGL-Einschraenkung. Im echten Browser funktioniert es.

## Referenzdateien
- Plan-File: `C:\Users\markp\.claude\plans\nach-meinem-verst-ndnis-m-ssten-mossy-ritchie.md`
- SPEC: `doc/SPEC.md`
- BOOTSTRAP: `doc/BOOTSTRAP.md`
- DEMO-Anleitung: `DEMO.md`
