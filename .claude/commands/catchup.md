---
description: Kontext wiederherstellen nach /clear oder neuem Start
---
Lies die folgenden Dateien und erstelle eine kompakte Zusammenfassung des aktuellen Stands:

1. `CLAUDE.md` — Projektkontext
2. `STATUS.md` — Aktueller Stand und letzte Aenderungen
3. `doc/START_HERE.md` — Einstiegspunkt (autonome Arbeitsanweisung)
4. `git diff --stat HEAD~3..HEAD 2>/dev/null` — Letzte Aenderungen
5. `git log --oneline -10 2>/dev/null` — Letzte Commits

Gib aus:
- Was ist das Projekt?
- In welcher Phase ist es (laut STATUS.md / doc/PHASES.md)?
- Was wurde zuletzt gemacht?
- Was steht als naechstes an?
- Gibt es Blocker?
