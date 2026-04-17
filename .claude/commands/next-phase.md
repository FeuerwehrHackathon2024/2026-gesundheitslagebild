---
description: Naechsten Schritt der aktiven Phase abarbeiten (loop-tauglich, respektiert Gates)
---

Arbeite **einen** konkreten Schritt dieses Projekts ab. Nicht mehrere. Halte Gates ein.

## 1. Eingangs-Check (PFLICHT, in Reihenfolge)

1. Lies `STATUS.md` vollstaendig. Merke dir: "Aktive Phase", "Aktueller Schritt", "Blockiert durch", "Naechste Aktion", "Offene Aktionen".
2. Lies `doc/PHASES.md` falls vorhanden. Finde die aktive Phase und ihre **Gate-Kriterien**.
3. Lies `doc/BOOTSTRAP.md` falls vorhanden — dort stehen Anti-Patterns und Autonomie-Regeln. Halte sie ein.
4. Lies `doc/SPEC.md` falls vorhanden, wenn der Schritt Architektur-Entscheidungen beruehrt.
5. `git status --short` — Working-Tree-Stand feststellen.

## 2. Entscheidungslogik (vor Ausfuehrung)

Pruefe in dieser Reihenfolge:

- **"Blockiert durch" hat einen Wert ausser `—`** → NICHT weiterarbeiten. Melde Blocker, frage nach Freigabe. Ende.
- **Aktuelle Phase erfuellt ihre Gate-Kriterien** (aus `doc/PHASES.md`) → NICHT in die naechste Phase springen. Melde "Gate erreicht", liste Nachweise (erledigte Punkte, Tests gruen, Artefakte vorhanden), frage nach Freigabe. Ende.
- **`doc/PHASES.md` fehlt** und wird in `CLAUDE.md` referenziert → NICHT raten. Melde "Phasen-Plan fehlt, kann keinen Schritt ableiten". Ende.
- **Aktueller Schritt noch offen** → diesen weiterarbeiten.
- **Sonst** → ersten noch offenen Punkt der aktiven Phase in Angriff nehmen.

## 3. Ausfuehrung

- Genau **ein** Schritt. Scope nicht aufbohren.
- Strikt an Tech-Stack und Regeln aus `CLAUDE.md` und `doc/SPEC.md` halten.
- Tests laufen lassen, falls welche den Bereich abdecken.
- Nach abgeschlossenem Teilschritt mit lauffaehigem Stand: **git commit** mit aussagekraeftiger deutscher Message im Projektstil.

## 4. Abschluss (PFLICHT)

Aktualisiere `STATUS.md`:
- **Aktueller Schritt** → was gerade erledigt ist bzw. was als naechstes dran ist
- **Letztes Update** → heutiges Datum (YYYY-MM-DD)
- **Naechste Aktion** → konkret formulieren, ein Satz
- **Blockiert durch** → setzen, falls du auf etwas wartest, sonst `—`
- **Changelog** → neuer Eintrag in aktueller Session: `- HH:MM — <kurz was>`
- **Offene Aktionen** → erledigte abhaken, neue ergaenzen falls entdeckt

## 5. Rueckmeldung (max. 8 Zeilen)

- Was wurde gemacht
- Commit-Hash (falls committed)
- Naechster Schritt
- Status: `laeuft weiter` / `Gate erreicht` / `blockiert`
- Bei Gate/Blocker: was genau vom User gebraucht wird
