# Rettungsdienst

Python-Desktop-App zum Monitoren der Gesamtnotfalllage und zur Unterstuetzung bei Entscheidungen im Rettungsdienst-Kontext.

## Tech-Stack
- **Sprache:** Python 3.11+
- **GUI:** TBD (z.B. PyQt6, Tkinter, CustomTkinter, oder Flet) — noch zu entscheiden
- **Datenhaltung:** TBD (SQLite fuer lokale Persistenz, ggf. spaeter REST-Anbindung)
- **Testing:** pytest
- **Lint/Format:** ruff + black

## Architektur
<!-- Wird ergaenzt sobald erste Struktur steht. Grobe Idee:
- Dashboard-UI zeigt aktuelle Einsatzlage (Fahrzeuge, Verfuegbarkeit, laufende Einsaetze)
- Entscheidungs-Unterstuetzung: Priorisierung, Routing, Ressourcenzuweisung
- Datenquellen: zunaechst manuell/Mock, spaeter API-Anbindung moeglich -->

## Verzeichnisse
- `src/rettungsdienst/` — Quellcode (Package)
- `src/rettungsdienst/ui/` — GUI-Komponenten
- `src/rettungsdienst/core/` — Domaenen-Logik (Einsaetze, Fahrzeuge, Entscheidungslogik)
- `src/rettungsdienst/data/` — Datenzugriff / Persistenz
- `tests/` — pytest-Tests
- `docs/` — Dokumentation, Architektur-Notizen
- `scripts/` — Hilfs-Scripts (Seed-Daten, Migrationen)

## Code-Regeln
- Keine Secrets im Code — nutze `.env` (siehe `.env.example`)
- Saubere Fehlermeldungen auf Deutsch fuer End-User, technische Logs auf Englisch
- Type-Hints verwenden (`mypy`-kompatibel)
- Kommentare nur wo das **Warum** nicht offensichtlich ist
- Keine Mock-Daten in produktivem Code — Test-Fixtures gehoeren in `tests/`
- Kritische Entscheidungslogik **muss** getestet sein (Einsatz-Priorisierung, Routing)

## Domaenen-Hinweise
- **Rettungsdienst-Kontext:** Fehlentscheidungen koennen Leben kosten — defensives Programmieren, klare Validierung, deterministische Ausgaben.
- **Nachvollziehbarkeit:** Entscheidungs-Vorschlaege sollten immer begruendbar sein (Audit-Log).

## Referenz-Dateien
- Projektkontext: `CLAUDE.md` (diese Datei)
- Session-Log: `STATUS.md`
- Umgebungsvariablen: `.env.example`
