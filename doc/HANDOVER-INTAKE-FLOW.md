# Handover: Intake-Flow-Visualisierung (OFFEN)

**Status:** User sieht die Verlegung der Soldaten vom Flughafen in die
Münchner Kliniken nicht als Linien/Pillen. Trotz mehrerer Iterationen
persistiert das Wahrnehmungsproblem.

## Was der User erwartet

Wenn ein Flug am Flughafen MUC landet, soll visuell nachvollziehbar sein:
- Von Flughafen → einzelne Münchner Kliniken laufen **Bezier-Linien** (grün).
- Auf den Linien rollen **Pillen/Batches** (z. B. 30er-Pakete mit Zahl drauf)
  mit sichtbarer Bewegung Richtung Ziel.
- Analog zum MANV-Fall: Wenn ein Amok startet, sieht man die Patientenströme
  vom Marienplatz aus zu den Kliniken — genau so soll es beim Intake aussehen.

## Was technisch passiert (verifiziert)

Debug-Logs (`window.__RL_DEBUG_FLOWS = true`) haben bestätigt:

- **T+17 bis T+29** (Peak nach Flug 1 mit `prepWindow=15`, `patients=300`):
  `planned-intake/transport: 150` — 150 Soldaten sind tatsächlich im
  `transport`-Status, mit `arrivedAt` in der Zukunft.
- `RouteLayer.useMemo` läuft und erzeugt `groups` nach
  `kind|from|to` → Batch-Pillen (Radius 9–22 px) mit Zahl.
- Source `rl-routes-lines` / `rl-routes-dots` / `rl-routes-dot-labels`
  wird per `setData()` aktualisiert.

## Was schon versucht wurde

1. **Batch-Aggregation** (30er-Pakete): pro Flow-Gruppe 1 große Pille mit
   Patientenzahl drauf. (`BATCH_SIZE=30` in `RouteLayer.tsx`)
2. **Halo-Layer** speziell für `kind='planned'`: breiter transparenter
   Glow unter der Hauptlinie.
3. **Runder Flughafen-Marker** (46×46 Kreis statt Rechteck) damit Pillen
   nicht überdeckt werden. Pulse-Ring expandiert nach außen.
4. **Kräftigeres Grün** `#00C853` (vorher Mint `#34C759`).
5. **Linien-Dicke-Boost** `+1.5 px` für `planned` in `RouteLayer`.
6. **Staggered Deplane**: Fluglandung spawnt Patienten linear über
   10 Sim-Min statt alle in einem Tick (`engine.processPlannedIntakes`).
7. **Intake-Cluster-Malus** (`scoreCandidate` + `rankCandidates`): Kliniken
   innerhalb 20 km um den Flughafen werden beim Scoring abgewertet
   (`clusterMalusWeight: 0.45`), damit Soldaten in entferntere Münchner
   Kliniken gehen → lange Linien.
8. **Complete-Check-Fix**: Intake nicht zu früh `complete` (Phantom-
   Relocations dürfen nicht den Soldaten-Zähler überstimmen).

## Hypothesen warum der User es trotzdem nicht sieht

1. **User testet bei Speed 10× oder schneller**: Bei 10× ist Deplane (10 min)
   nur 1 s real, Transport 5–20 min = 0.5–2 s real. Pillen rauschen durch.
   → Test-Empfehlung bei `Speed 1×` oder `2×`.
2. **Cluster-Malus reicht nicht**: Trotz Malus 0.45 landen viele Soldaten
   noch in Flughafen-Region weil diese Kliniken durch Relocation
   überproportional freie Kapazität haben. Könnte verstärkt werden:
   `clusterMalusKm: 30` oder `clusterMalusWeight: 0.8`.
3. **Browser-Cache**: Vielleicht serviert der Dev-Server noch eine ältere
   Version der Client-Bundles nach HMR-Schluckauf.
   → Hard-Refresh (Ctrl+Shift+R) nötig, oder `.next` löschen.
4. **Die Flüsse SIND sichtbar, der User übersieht sie**: In den von der
   Tests-Suite erzeugten Screenshots (`scripts/_peak-*.png`) sind die
   bunten Batch-Pillen mit Zahlen erkennbar. Vielleicht sieht der User
   sie ohne direkten Hinweis auf dem Bildschirm nicht.

## Nächste Untersuchungsschritte

1. **User fragen**:
   - Bei welcher Speed testet er? (1× empfohlen)
   - Sieht er die **violetten** Relocation-Linien am Flughafen? Falls ja,
     warum nicht die grünen? (Derselbe Rendering-Pfad.)
   - Browser-Hard-Refresh probiert?
2. **Debug-Log im UI sichtbar machen**: Top-Bar zeigt Live-Count
   `planned-intake/transport: N` damit der User sofort sieht wenn
   Soldaten unterwegs sind.
3. **Testweise den Cluster-Malus drastisch erhöhen** (`clusterMalusKm: 40`,
   `clusterMalusWeight: 1.5`) damit ALLE Soldaten nach München-Zentrum
   gehen — sichtbar lange Flüsse.
4. **Pulsation der Soldaten-Pillen**: CSS-Animation auf den grünen Batch-
   Pillen um sie visuell von den statischen Klinik-Kreisen abzuheben.
5. **Explizites "Mobile Leitstelle startet N Transporte"-Event** als
   Overlay-Banner beim Flug-Landen.

## Relevante Dateien

- `components/map/RouteLayer.tsx` — Flow-Rendering (Lines + Dots + Labels)
- `components/map/PlannedIntakeLayer.tsx` — Flughafen-Marker
- `app/globals.css` — `.rl-intake-marker`, Pulse-Ring
- `lib/simulation/engine.ts` — `processPlannedIntakes`, Staggered Deplane
- `lib/simulation/allocation.ts` — `allocatePatient` mit Cluster-Malus
- `lib/simulation/router.ts` — `scoreCandidate` + `rankCandidates`
- `scripts/inspect-soldiers-debug.mjs` — Debug-E2E mit Patient-Breakdown
- `scripts/demo-peak.mjs` — Peak-Screenshots
- `scripts/inspect-scenario.mjs` — vollständiger MANV+Intake-Durchlauf

## Test-Sequenz für Reproduktion

```
1. Dev-Server: rm -rf .next && pnpm dev (Port 3000)
2. UI: Vorlauf 15, Intervall 20, Patienten 300, 2 Flüge
3. "Sofort vorbereiten" ✓
4. Ankündigen
5. Speed 1×
6. Play
7. Beobachten ab T+15 (erste Landung) bis T+40
```

Erwartet: Grüne Batch-Pillen mit Zahlen rollen vom Flughafen-Kreis
nach LMU Großhadern, TUM Rechts der Isar, Schwabing etc. (10–30 km).

Tatsächlich: laut User nicht sichtbar.
