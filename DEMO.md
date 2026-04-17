# MANV Dashboard — Demo

Vollständiger Durchlauf für eine Demo-Session (ca. 10 Minuten).

## Vorbereitung

```bash
pnpm install
pnpm gen:hospitals   # einmalig: erzeugt lib/data/hospitals.json aus doc/Krankenhäuser_D.xlsx
pnpm dev             # http://localhost:3000
```

Browser: 1440×900 oder größer (Desktop-only, keine Mobile-Unterstützung per SPEC §12).

## Tastatur-Shortcuts

| Taste    | Wirkung                           |
|----------|-----------------------------------|
| `Space`  | Pause / Resume                    |
| `1`–`5`  | Speed 0.5x / 1x / 2x / 5x / 10x   |
| `R`      | Sim zurücksetzen (mit Bestätigung)|
| `Esc`    | Auswahl schließen                 |

## Szenario 1 — Amoklauf München Innenstadt (Kurz-Demo, ~2 min)

**Warum:** Geografisch eng — alle 49 München-Häuser innerhalb der T1-Cutoff (150 km). Zeigt breite Verteilung, schnelle Patientenwellen, aktive Empfehlungen.

1. Dropdown links: **„Amoklauf Muenchen Innenstadt"**. Klick **„SZENARIO STARTEN"**.
2. Karte fliegt zum Marienplatz. Amber-Ring + oranger Kern als Incident-Marker. Gelbe Isochronen-Ringe (10/20/30 km).
3. Speed auf **5x** (Taste `4`). Sim läuft los.
4. **Erwarte binnen 30 Sekunden:**
   - ~8–12 München-Häuser bekommen cyan Halo (Patienten-Zulauf)
   - Patient-Counter links füllen sich: `Transport` steigt, dann `Behandlung`
   - Erste **Alerts** erscheinen rechts: `HospitalSaturation` bei kleineren Häusern, evtl. `DisciplineMismatch` (Neurochirurgie oder Burn)
   - Erste **Empfehlungen**: oft `Surge aktivieren: <Haus>` als erstes
5. **Empfehlung ausführen:** Klick „Ausfuehren" auf einer Surge-Empfehlung. Haus-Dot färbt sich zurück Richtung grün; Alert verschwindet nach ein paar Ticks.
6. **Haus anklicken:** Klick auf einen roten Dot → HospitalDetailPanel rechts zeigt alle Disciplines als Balken, Escalation-Stufe, Recharts-Trendkurve „Auslastung letzte 4h". Button „Stufe erhoehen" verfügbar.
7. **Filter ausprobieren:** Links z.B. `Freie Betten ≥ 100` eingeben → nur große Häuser bleiben farbig, Rest wird gedimmt. Checkbox **SK I** aus → nur T2/T3-Patienten zählen in Counter und Halo.

## Szenario 2 — BAB-Busunglück A7 Hamburg (Gauss-Profil, ~5 min)

**Warum:** Demonstriert den langsameren Anstieg (Gauss über 90 min), räumlich weiter verteilt, zeigt `CapacityTrend` und `RegionalLoad`.

1. Reset (`R`). Dropdown: **„BAB-Busunglueck A7 bei Hamburg"** → Start.
2. Karte fliegt in den Hamburger Süden. Speed **10x** (`5`).
3. **Nach 1–2 Minuten real (30–60 sim-min):**
   - `RegionalLoad: Region um BAB … angespannt` erscheint (warn) → zugehörige Empfehlung `3 angrenzende Haeuser alarmieren` wird generiert
   - `CapacityTrend` feuert wenn ein Haus in 30 min um >15pp steigt
4. **Alerts-Dedup beobachten:** gleicher Alert feuert nicht erneut, Titel/Detail werden nur aktualisiert. Resolvierte Alerts bleiben 30 sim-min als ausgegraute Einträge.

## Szenario 3 — Flüchtlingsstrom Görlitz (Langlauf, ~7 min)

**Warum:** 500 Patienten über 12 h Cascade-Curve, 25 % Kinder. Zeigt Kind-Routing (Pädiatrie-Pflicht, Stufe +1), lange Recommendation-Dynamik, Timeline-Cursor-Wanderung.

1. Reset. Dropdown: **„Fluechtlingsstrom Goerlitz"** → Start. Speed **10x**.
2. Fokus: Unten die **Timeline** verfolgen. Incident-Marker bei T+0, Cursor wandert. Critical-Alerts erscheinen als rote Ticks unten auf der Zeitleiste.
3. Nach ~5 min Realzeit (~30 sim-min): die 3 regionalen Empfehlungen können nacheinander ausgeführt werden. Verhalten vergleichen:
   - `activate-surge`: sofortige Bettenerhöhung
   - `alert-adjacent`: Escalation der Nachbarhäuser (im HospitalDetailPanel sichtbar als orangefarbene Stufenleiste)
   - `transfer-stable`: ausgewählte stabile Patienten werden sofort entlassen, Betten frei

## Szenario 4 — Industriebrand Ludwigshafen

**Besonderheit:** Brandverletzungsmedizin getestet. Der Burn-Zulauf (20 % BURN-T1 + 30 % BURN-T2) zeigt `DisciplineMismatch`, wenn die erreichbaren Verbrennungszentren zu weit sind (Ludwigshafen liegt günstig zu mehreren Zentren — kann aber trotzdem Supply-Engpass auslösen).

## Szenario 5 — Hochwasser-Evakuierung Passau

**Besonderheit:** Plateau-Kurve über 4h, hoher Anteil `INHAL-T2` (Aspiration/Hypothermie). Zeigt Routing nach Innerer Medizin + ITS.

## Was ist zu zeigen

- **Client-only**: kein Backend. Reload verliert den Zustand (nicht Teil des Demos).
- **Deterministisch**: Seed `20260417`. Zwei Läufe mit gleichen Operator-Aktionen produzieren identische Ergebnisse.
- **Regelbasiert, nicht ML**: jede Entscheidung ist nachvollziehbar (rationale im Tooltip/Empfehlungs-Karte).
- **Palantir-Gotham-Aesthetik**: keine Rounded-SaaS-Optik, dichte Typografie, Mono für Zahlen.

## Bekannte Limitierungen (absichtlich YAGNI)

- Distanzen: haversine, kein reales Routing (siehe SPEC §12).
- Isochronen: geografische Kreise, keine Fahrzeit-Isochronen.
- Timeline-Scrubbing: nur visueller Cursor, kein Zeitreise-Modus.
- Kein Auth, keine Persistenz.
