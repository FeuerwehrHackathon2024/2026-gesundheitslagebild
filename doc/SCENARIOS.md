# SCENARIOS — MANV-Katalog, PlannedIntake-Template, Parallel-Regeln

## 1. MANV-Szenarien (5 Stück)

Alle parallel aktivierbar. Bei mehrfachem Start desselben Szenarios wird der Ort leicht variiert (siehe §3).

### 1.1 Amoklauf Innenstadt

```ts
{
  id: 'amok-innenstadt',
  label: 'Amoklauf Innenstadt',
  type: 'amoklauf',
  location: [11.5755, 48.1374],        // Marienplatz
  durationMin: 15,
  arrivalCurve: 'immediate',
  estimatedCasualties: 35,
  triageMix: { T1: 0.40, T2: 0.35, T3: 0.20, T4: 0.05 },
  needsProfile: { opShare: 0.50, itsShare: 0.25, notaufnahmeShare: 0.20, normalBedShare: 0.05 },
}
```

### 1.2 Busunglück A9 bei Ingolstadt

```ts
{
  id: 'bus-a9-ingolstadt',
  label: 'Busunglück A9 Ingolstadt',
  type: 'verkehrsunfall',
  location: [11.4218, 48.7665],        // A9 bei Ingolstadt Süd
  durationMin: 90,
  arrivalCurve: 'gauss',
  estimatedCasualties: 60,
  triageMix: { T1: 0.15, T2: 0.35, T3: 0.45, T4: 0.05 },
  needsProfile: { opShare: 0.30, itsShare: 0.10, notaufnahmeShare: 0.35, normalBedShare: 0.25 },
}
```

### 1.3 S-Bahn-Auffahrunfall Ostbahnhof  *(Showcase-Kern)*

```ts
{
  id: 'sbahn-ostbahnhof',
  label: 'S-Bahn-Auffahrunfall Ostbahnhof',
  type: 'verkehrsunfall',
  location: [11.6043, 48.1269],        // Ostbahnhof
  durationMin: 20,
  arrivalCurve: 'immediate',
  estimatedCasualties: 180,
  triageMix: { T1: 0.10, T2: 0.30, T3: 0.55, T4: 0.05 },
  needsProfile: { opShare: 0.20, itsShare: 0.10, notaufnahmeShare: 0.50, normalBedShare: 0.20 },
}
```

### 1.4 Explosion BMW-Werk Milbertshofen

```ts
{
  id: 'bmw-milbertshofen',
  label: 'Explosion BMW-Werk Milbertshofen',
  type: 'industriebrand',
  location: [11.5570, 48.1758],        // BMW-Werk München
  durationMin: 180,
  arrivalCurve: 'plateau',
  estimatedCasualties: 70,
  triageMix: { T1: 0.25, T2: 0.40, T3: 0.30, T4: 0.05 },
  needsProfile: { opShare: 0.35, itsShare: 0.30, notaufnahmeShare: 0.25, normalBedShare: 0.10 },
}
```

### 1.5 Fußball-Unglück Allianz Arena

```ts
{
  id: 'allianz-arena-panik',
  label: 'Massenpanik Allianz Arena',
  type: 'panik',
  location: [11.6247, 48.2188],        // Allianz Arena, Fröttmaning
  durationMin: 60,
  arrivalCurve: 'gauss',
  estimatedCasualties: 220,
  triageMix: { T1: 0.05, T2: 0.20, T3: 0.70, T4: 0.05 },
  needsProfile: { opShare: 0.10, itsShare: 0.05, notaufnahmeShare: 0.60, normalBedShare: 0.25 },
}
```

## 2. PlannedIntake-Template

### 2.1 Soldaten-Evakuierung MUC

```ts
{
  templateId: 'evac-soldiers-muc',
  label: 'Medizinische Evakuierung — Soldaten MUC',
  arrivalPoint: [11.7861, 48.3538],    // Flughafen München
  defaults: {
    totalPatients: 750,
    flightCount: 3,
    flightIntervalMin: 45,
    prepWindowMin: 1440,               // 24 h
    bufferRatio: 0.15,
    perFlightTriageMix: { T1: 0.25, T2: 0.45, T3: 0.25, T4: 0.05 },
    perFlightNeedsProfile: {
      opShare: 0.55, itsShare: 0.30,
      notaufnahmeShare: 0.05, normalBedShare: 0.10,
    },
  }
}
```

### 2.2 Formular-Felder (in `PlannedIntakeForm.tsx`)

- Label (Text)
- Anzahl Patienten (Number, 50–2000)
- Anzahl Flüge (Number, 1–10)
- Abstand zwischen Flügen (Min, 15–180)
- Vorlauf (Min, 60–4320)
- Puffer-Anteil (Slider, 0.05–0.30)
- "Ankündigen"-Button → `state.plannedIntakes.push(...)` + Audit-Event.

## 3. Parallel-Aktivierung + Ort-Variation

### 3.1 Zweitmalige Aktivierung

Wenn der Operator dasselbe MANV-Szenario mehrfach startet (oder "Zufall"-Button), wird der Ort leicht variiert:

```ts
function perturb(loc: [number, number], rng: () => number): [number, number] {
  // Zufällige Verschiebung 0.5–3 km in zufällige Richtung
  const angle = rng() * Math.PI * 2;
  const distKm = 0.5 + rng() * 2.5;
  const dLat = (distKm / 111) * Math.sin(angle);
  const dLng = (distKm / (111 * Math.cos(loc[1] * Math.PI / 180))) * Math.cos(angle);
  return [loc[0] + dLng, loc[1] + dLat];
}
```

### 3.2 Zufalls-MANV

Im Launcher gibt es einen **"Zufall"-Button**, der:
1. Ein Szenario-Template zufällig wählt.
2. Optional einen realistischen Ort aus einer kuratierten Liste wählt (z. B. Hauptbahnhof, Messe München, Olympiapark, Stachus, ZOB, U-Bahn-Knoten). Liste in `scenarios.ts`:

```ts
export const RANDOM_PLACES_MUC = [
  { name: 'Hauptbahnhof', coords: [11.5583, 48.1402] },
  { name: 'Messe Riem', coords: [11.6905, 48.1376] },
  { name: 'Olympiapark', coords: [11.5519, 48.1732] },
  { name: 'Stachus', coords: [11.5664, 48.1395] },
  { name: 'Donnersbergerbrücke', coords: [11.5349, 48.1419] },
  { name: 'Therese-Wiese', coords: [11.5500, 48.1317] },
  { name: 'Flughafen-Zufahrt A92', coords: [11.7012, 48.2920] },
  // … 15 weitere
];
```

3. Template-Typ mit realistischem Ort-Match: Industriebrand bevorzugt Industriegebiete (Werksviertel, Hallbergmoos), Panik bevorzugt Großveranstaltungsorte.

## 4. MANV-Marker-Visualisierung

- Kein Radiuskreis.
- Marker-Durchmesser: `8 + sqrt(estimatedCasualties) * 3` (Pixel). Beispiele: 35 → 26 px, 180 → 48 px, 220 → 53 px.
- Innen: Verletzten-Zahl zentriert in Monospace, weiß/schwarz je nach Background.
- Hintergrund: Farbe nach Typ (Amok rot, Verkehrsunfall orange, Industriebrand magenta, Panik violett, Naturkatastrophe blau).
- Pulse-Animation 2 s bei initialem Start, dann statisch.
- Bei Hover: Tooltip zeigt Label + `estimatedCasualties` + `ca. X% versorgt`.

## 5. Showcase-Ablauf (Button "Demo starten")

In `header` als primärer CTA. Löst deterministisch aus:

```ts
async function runShowcase(store) {
  store.reset({ seed: 20260418 });
  store.setSpeed(10);
  store.resume();
  store.waitSim(30);            // T+30
  store.launchPlannedIntake('evac-soldiers-muc');
  store.waitSim(30);            // T+60 — Operator soll aktivieren (auto-execute nach 90 sim-sec)
  store.autoExecute('prepare-reception');
  store.waitSim(720 - 60);      // T+12h
  store.launchIncident('sbahn-ostbahnhof');
  store.waitSim(120);            // T+14h
  store.launchIncident('allianz-arena-panik', { perturb: true });
  // weiter bis Intake fertig
}
```

`store.waitSim(n)` wartet bis `simTime >= snapshot + n`.

Showcase-Button ist deaktiviert während ein Showcase läuft. Nach Abschluss bleibt der finale Zustand stehen; Operator kann Audit-Log exportieren.

## 6. Zustandskonservierung

Szenarien sind reine Daten (keine Seiteneffekte). Aktivierung erzeugt einen `Incident` im State mit `id = '<scenario-id>-<simTime>'`. Mehrere Incidents derselben ID-Basis sind erlaubt.
