# TIMELINE — Zentrales Lagebild-Instrument

Die Timeline ist nicht nur Scrubber, sondern **das** Instrument, mit dem die Einsatzleitung die Gesamtlage versteht und Maßnahmen auf ihre Wirksamkeit beurteilt.

## 1. Visueller Aufbau

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    Auslastung %                                              │
│ 100 ──────────────────────────────────────────────────────────────────       │ 100
│                                      ▄ critical zone ▄                       │
│  85 ─── ─────────────────────────────────────────────────────────────        │  85
│                         ╭───╮                ╭──────╮                        │
│  70 ──────────────╮     │   ╰──╮       ╭─────╯      ╰─╮                      │  70
│        overall ▓▓▓│▓▓▓▓▓│▓▓▓▓▓│▓▓▓    ╰ average ───╮  │                       │
│                   │     │     ╰──────────────     │  │                       │
│  50 ─────────     │     │                         ╰──╯                       │  50
│                   │     │       (ITS ─ dotted)                               │
│   0 ──────────────┴─────┴──────────────────────────────────────              │   0
│     │ T-1h │ T+0 │ T+2 │ T+4 │ T+6 │ T+8 │ T+12│ T+24│                        │
│     │      ▲     △           ✦                                               │
│     │ Hist │Jetzt│     Prognose                    Forecast end              │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Historie links** (letzte 60 Sim-min): durchgezogene Kurven aus `occupancyHistory`.
- **Jetzt** in der Mitte als vertikale 2 px Linie `var(--accent-blue)`.
- **Prognose rechts**: gestrichelte Kurven bis `max(plannedIntake.firstArrivalAt) + 120 min`. Falls keine Intake: 240 min Default-Prognose.
- **Kritische Zone** (≥ 85 %) in leichter roter Einfärbung hinter der Kurve.

## 2. Kurven (gleichzeitig bis zu 5)

| ID | Name                 | Quelle                                   | Farbe (default)      |
|----|----------------------|------------------------------------------|----------------------|
| `overall`     | Gesamt-Auslastung | Σ occupied / Σ total aller Kliniken     | `--chart-1` |
| `average`     | Ø Auslastung      | Mittelwert `overall` pro Klinik         | `--chart-1` 60 % |
| `its`         | ITS                | Σ its_bett.occupied / Σ its_bett.total  | `--chart-2` |
| `op`          | OP                 | Σ op_saal.occupied / Σ op_saal.total    | `--chart-3` |
| `notaufnahme` | Notaufnahme        | Σ notaufnahme                           | `--chart-4` |

Legende oben rechts als Toggles (Default: overall + its + op an; average + notaufnahme aus).

## 3. Prognose (Default, ohne Fork-Preview)

Die Prognose entsteht aus einer **vereinfachten Fortschreibung**:
- Pro bestehendem Patient: dessen erwartete Discharge-Zeit vermindert Auslastung.
- Pro aktivem Incident: noch ausstehende Patienten (per Arrival-Curve) erhöhen Auslastung.
- Pro aktivem `PlannedIntake`: an `flight.etaMin` erwartete Patienten = Stufen-Erhöhung.

Diese Vorausberechnung läuft in `lib/simulation/forecast.ts`, ist separater Fast-Forward ohne Randomness (deterministisch).

## 4. Event-Marker auf Zeitachse

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│ Curves                                              │
│                                                     │
├──●───────────────▲─────────────────✈───────▼────────┤
│ T-30 min        T+0               T+24h   T+26h    │
│ intake        sbahn MANV          flight landed     │
│ announced                                           │
└─────────────────────────────────────────────────────┘
```

- **●** intake.announced
- **▲** incident.started
- **✈** intake.flight-landed
- **◆** recommendation.executed (darüber Chip mit title)
- **▼** intake.completed
- Farbe der Marker folgt Event-Typ-Palette.
- Hover: Tooltip mit vollständigem Event + Affected Entities.

## 5. Fork-Preview-Overlay

Der zentrale, neue Feature-Teil.

### 5.1 Trigger

Hover auf eine `Recommendation`-Karte (Delay 150 ms, Debounce). Oder Klick "Preview".

### 5.2 Berechnung

Ruft `computeForkPreview(state, rec, horizonMin=240)` auf (siehe `SIMULATION.md §8`). Liefert zwei Kurvensätze: `curveWithout` und `curveWith`. Beide enthalten denselben Metrik-Satz wie die Timeline-Kurven.

### 5.3 Darstellung

- Für jede aktuell aktive Kurve wird `curveWith` als **gestrichelte, halbtransparente Overlay-Linie** in gleicher Farbe ergänzt.
- Am **Horizont-Rand** erscheint ein Vergleichs-Chip: `Δ Peak: -12 pp`, `Δ Crit-Stunden: -3.5 h`, `Betten+: 84`.
- Farbton des Chips:
  - `peakLoadDelta ≤ -5 pp` → Grün-Chip: "Verbesserung".
  - `peakLoadDelta ≥ +2 pp` → Rot-Chip: "Verschlechterung".
  - Dazwischen → Blau-Chip: "Marginal".

### 5.4 Mehrere Previews

Default: nur eine Preview gleichzeitig (letzter Hover gewinnt). Optional "Pin Preview" → kleine Pin-Fläche links oben der Karte, hält bis zu 3 Previews dauerhaft sichtbar (unterscheidbar durch Stroke-Width-Variation der gestrichelten Linie).

### 5.5 Performance

- Berechnung in `requestIdleCallback` soweit möglich.
- Bei > 500 aktiven Patienten + 3 Incidents: Web-Worker-Offload (`lib/workers/fork-preview.worker.ts`).
- Cache im Store für 30 Sim-Minuten nach Berechnung.

## 6. Hover-Verhalten auf Kurven

- Mouse-Over Kurve → diese Kurve Stroke-Width 3 px, andere 1.5 px + 40 % Opacity.
- Crosshair-Vertikale an Mouse-X, Zeit-Tooltip oben: `T+HH:MM`.
- Values-Tooltip rechts der Kurve: alle aktiven Kurven mit Werten bei dieser Zeit (Tabellen-Style).

## 7. Scrubber

- Drag in der Historie-Zone (links) → simulierter Zustand wird aus `occupancyHistory`-Snapshot rekonstruiert: Map + Panels zeigen Vergangenheit an.
- **Nicht**: Sim läuft weiter im Hintergrund. Anzeige ist read-only für historische Momente.
- Loslassen: "Zurück zu Live"-Button erscheint unten rechts.

## 8. Responsives Verhalten

- 160 px Höhe fix. Chart ≈ 120 px, Achse + Event-Lane 40 px.
- Breite = Viewport - 32 px Margin.
- Bei < 1280 Breite: nur 3 Kurven, Legende collapsed.

## 9. Recharts-Implementierung

```tsx
<ComposedChart data={merged}>
  <ReferenceArea y1={85} y2={100} fill="var(--accent-red)" fillOpacity={0.05} />
  <XAxis dataKey="t" tick={<MonoTick />} />
  <YAxis domain={[0, 100]} tick={<MonoTick />} />
  <Line dataKey="overall" stroke="var(--chart-1)" dot={false} strokeWidth={2} />
  <Line dataKey="its" stroke="var(--chart-2)" dot={false} strokeWidth={1.5} />
  <Line dataKey="op"  stroke="var(--chart-3)" dot={false} strokeWidth={1.5} />
  <Line dataKey="nota" stroke="var(--chart-4)" dot={false} strokeWidth={1.5} />
  {/* Forecast kurven (gestrichelt) */}
  <Line dataKey="overall_fcast" stroke="var(--chart-1)" dot={false} strokeDasharray="4 4" />
  {/* Fork-Preview */}
  {forkPreview && (
    <Line dataKey="overall_fork" stroke="var(--chart-1)" dot={false}
          strokeDasharray="2 3" strokeWidth={2.5} opacity={0.85} />
  )}
  <ReferenceLine x={simTime} stroke="var(--accent-blue)" strokeWidth={2} />
  <Tooltip content={<TimelineTooltip />} />
</ComposedChart>
```

## 10. Beispiel: Showcase-Visualisierung

Zeitachse während Showcase-Demo:

```
T-30       : Intake announced    → gestrichelte Prognose-Linie steigt um +10pp bei T+24h
T+0        : Operator zündet prepare-reception → Relocation Stream, Linie im Bereich T+0..T+24h sinkt leicht
T+12h      : Incident sbahn-ostbahnhof startet → scharfer Anstieg
             Preview-Hover auf "activate-surge" zeigt, dass Linie bei T+15h 10pp tiefer läge
T+14h      : optional 2. Incident → Preview auf "activate-reserve" zeigt +200 Betten Entlastung ab T+18h
T+24h      : Flüge landen → Linie im ITS-Bereich steigt
T+26h      : Lage beruhigt sich; Linie fällt
```

Jede Phase: Event-Marker, Kurven-Verlauf, Preview-Optionen sichtbar. Das ist die Lagebild-Story der Demo.
