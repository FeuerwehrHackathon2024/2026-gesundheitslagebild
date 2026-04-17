---
description: Kontext wiederherstellen nach /clear oder neuem Start
---
Lies die folgenden Dateien und erstelle eine kompakte Zusammenfassung des aktuellen Stands:

1. `CLAUDE.md` — Projektkontext
2. `STATUS.md` — Aktueller Stand und letzte Aenderungen
3. `git diff --stat HEAD~3..HEAD 2>/dev/null` — Letzte Aenderungen
4. `git log --oneline -10 2>/dev/null` — Letzte Commits

Gib aus:
- Was ist das Projekt?
- Was wurde zuletzt gemacht?
- Was steht als naechstes an?
- Gibt es Blocker?
