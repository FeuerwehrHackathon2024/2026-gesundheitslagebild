# DECISIONS — Annahmen und Abweichungen von der Spec

Jede während der Implementierung getroffene Annahme, die nicht 1:1 aus Spec ableitbar ist.
Format: Datum · Bereich · Annahme · Begründung.

| Datum (Real) | Bereich | Annahme | Begründung |
|---|---|---|---|
| 2026-04-18 | Phase 2 / DATA_GENERATION.md §1 | Excel-Spalten starten bei `col 1 = Name` (nicht `col 2`), es gibt **keine leere Spalte A**. Die exceljs-Quirk-Beschreibung in der Spec trifft für diese Datei nicht zu. | Direkte Inspektion der `doc/Krankenhäuser_München.xlsx` via `sheet.getRow(1)` — Header-Row liefert `Name, Ort, Art, Adresse, Bundesland, Land, Telefon, URL, Abteilungen, Ausstattung, Betten, Intensivbetten, Latitude, Longitude` in den Spalten 1–14. |
| 2026-04-18 | Phase 2 / DATA_GENERATION.md §1 | Datenzeilen = **48**, nicht 49. | Excel hat 49 Rows total (Row 1 Header + Row 2–49 Daten). Spec-Werte "49 Kliniken" in CLAUDE.md, SPEC §3, PHASES.md Phase-2-Gate, DATA_GENERATION.md verweisen vermutlich auf die Row-Zahl inklusive Header. Die Tests nutzen 48. |
| 2026-04-18 | Phase 2 / DATA_MODEL.md §11 | `ForkPreviewResult` zunächst als offenes Interface (`[key: string]: unknown`) mit TODO-Kommentar in `lib/types.ts`. | Konkrete Struktur steht laut SIMULATION.md §8 erst in Phase 9 fest. Offenes Interface erlaubt typed `SimState` ohne Phase 9 vorzugreifen. |
