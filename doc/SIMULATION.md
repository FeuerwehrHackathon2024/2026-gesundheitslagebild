# SIMULATION — Engine, Allocation, Relocation, Fork-Preview

Alle Funktionen in `lib/simulation/` sind **reine TypeScript-Funktionen**. Keine React-Imports. Deterministisch bei gleichem Seed + gleicher Aktionsfolge.

## 1. Zeitmodell

- **Sim-Zeit** in Minuten, `state.simTime: number`.
- **Tick** = 1 Sim-Minute.
- **Realzeit pro Tick** = `1000 / speed` ms. Speed ∈ {0.5, 1, 2, 5, 10}.
- Tick-Loop in `lib/store.ts` via `setInterval`, ausgelöst durch `isRunning`-Flag.
- `tick(state, rng)` mutiert `state` in-place (aus Performance-Gründen) und wird dann per `set(state => ({ ...state }))` ins Zustand-Store übernommen.

## 2. Seed & RNG

`seededRng(seed: number)` liefert eine deterministische RNG-Funktion. Seed ist Teil des `SimState`. Reset setzt Seed auf den Anfangswert zurück.

```ts
export function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

## 3. Tick-Sequenz

Pro Tick, in dieser Reihenfolge:

1. `state.simTime += 1`
2. **Spawn**: pro Incident die nach Arrival-Curve berechneten neuen Patienten erzeugen.
3. **Planned-Intake-Checks**: wenn ein Flug landet (`flight.etaMin === simTime`), spawne dessen Patienten direkt am `arrivalPoint` und allokiere sie bevorzugt auf vorbereitete Kliniken.
4. **Transport-Fortschritt**: Patienten im Status `transport` nach Route-Progress fortschreiten; bei Ankunft `transport → inTreatment` + Bett belegen.
5. **Transfer-Fortschritt**: Patienten im Status `transferring` (Inter-Hospital-Verlegung) ebenso, bei Ankunft → `inTreatment` in Zielklinik, Quellbett wird beim **Abfahrt**-Tick frei (nicht erst bei Ankunft, da Patient dann physisch weg ist).
6. **Allocation**: alle `onScene`-Patienten ohne Zuweisung werden in einem Batch verteilt (`allocateBatch`, §4).
7. **Relocation-Step**: aktive `PlannedIntake` mit Status `preparing` bekommen pro Tick eine **Verlegungs-Welle** berechnet (§5). Bis zum Soll.
8. **Behandlungs-Ende**: Patienten mit `dischargeAt === simTime` → `discharged`, Bett frei.
9. **Stable-Update**: für jeden `inTreatment`-Patient `isStableForTransfer` neu berechnen.
10. **Detection**: Regeln aus §7 laufen, Alerts gemergt (Dedup-Key `scope|scopeRef|ruleName`, 10 Min).
11. **Recommendation-Generator**: Kandidaten aus Alerts ableiten, mit bestehenden mergen.
12. **Conflict-Priorisierung** §6 ggf. Maßnahmen re-gewichten.
13. **Occupancy-Snapshot**: alle 5 Sim-Minuten einen Eintrag in `occupancyHistory` pushen (Ring-Buffer max 24 h = 288 Einträge).
14. **Audit-Event**: `sim.tick` wird **nicht** pro Tick geloggt (Menge), nur relevante Ereignisse.

## 4. Allocation-Engine (MANV)

`lib/simulation/allocation.ts` — Triage-First Water-Filling mit Cascade-Erweiterung.

### 4.1 Kandidaten-Filter (Hard-Constraints)

Für einen Patienten ist eine Klinik Kandidat, wenn:

- Klinik bietet alle in `patient.needs === true` markierten Ressourcen (`flags` + `capacity[r].total > 0`).
- Mindestens eine benötigte Ressource hat `occupied < total + (surgeActive ? surgeReserve : 0)`.
- `distanceKm ≤ DISTANCE_CUTOFF[triage]` (wird per Cascade erhöht):
  - T1: 60 km
  - T2: 40 km
  - T3: 25 km
  - T4: 15 km
- Für T1 zusätzlich: `tier ∈ {'maximal', 'schwerpunkt'}`.
- Für Kinder-Patienten (optional später): `flags.hasPaediatrie === true`.

### 4.2 Scoring

```
score = w_dist * (1 - dist/maxDist)
      + w_free * freeFrac_primary
      + w_tier * tierFitScore
      - w_load * overallLoad^2
```

Gewichte: `w_dist=0.45`, `w_free=0.30`, `w_tier=0.15`, `w_load=0.10`.

### 4.3 Water-Filling-Quote pro Tick

Pro Haus und Tick:
- T1: 3
- T2: 5
- T3: 8
- T4: 10

Quote ist eine **Obergrenze** für die Zahl an Patienten, die in dieser Sim-Minute diesem Haus neu zugewiesen werden dürfen. Verhindert Punkt-zu-Punkt-Überflutung.

### 4.4 Cascade-Stufen bei Erschöpfung

```
Stage none       : Baseline
Stage A-distance : Distance-Cutoff * 2 (max 120 km)
Stage B-quota    : Quote * 2
Stage C-load     : effLoad bis 1.0 zulassen
Stage D-surge    : Überbelegung zulassen (bedsOccupied > total), Quote unbegrenzt
```

Der Patient durchläuft die Stufen nacheinander bis ein Platz gefunden ist. In D-surge MUSS ein Platz gefunden werden — "alle Patienten werden versorgt" (Nutzer-Vorgabe).

### 4.5 Stabilisierung vor Transport

`etaMin = distanceKm / avgSpeed + stabilizationMin`
- `avgSpeed` aus OSRM `durationSec` falls Route bekannt, sonst 55 km/h.
- `stabilizationMin`: T1=8, T2=5, T3=2, T4=1.

## 5. Relocation-Engine (geplante Verlegungen)

`lib/simulation/relocation.ts`.

### 5.1 Trigger

Wird durch Maßnahme `prepare-reception` aktiviert (nicht automatisch!). Der Operator klickt "Vorbereitung aktivieren" bei einer `PlannedIntake` — der Status wechselt auf `preparing`, die Relocation-Engine läuft ab sofort pro Tick.

### 5.2 Bedarfs-Berechnung

```ts
function computeTargetFreeBeds(intake: PlannedIntake) {
  const total = intake.totalPatients * (1 + intake.bufferRatio);
  // needsProfile aus letztem Flug als Proxy
  const profile = aggregateNeedsProfile(intake.flights);
  return {
    op_saal:     Math.ceil(total * profile.opShare),
    its_bett:    Math.ceil(total * profile.itsShare),
    notaufnahme: Math.ceil(total * profile.notaufnahmeShare),
    normal_bett: Math.ceil(total * profile.normalBedShare),
  };
}
```

### 5.3 Ziel-Cluster identifizieren

"Nahe Kliniken" = alle Kliniken innerhalb **30 km um `arrivalPoint`**. Innerhalb dieses Clusters wird der Bedarf verteilt, grob proportional zur Klinik-Kapazität pro Ressource.

```ts
interface PerHospitalTarget {
  hospitalId: string;
  desiredFreeByResource: Record<ResourceType, number>;
}
```

### 5.4 Verlegungs-Auswahl

Pro Klinik im Ziel-Cluster, pro Ressource:
1. Berechne, wieviele Betten dieser Ressource aktuell frei sind (unter Beachtung der für Intake reservierten Soll-freien Menge).
2. Wenn `frei < desired`, brauche Verlegungen: Anzahl = `desired - frei`.
3. Kandidaten = Patienten mit `assignedHospitalId === thisHospital` UND `isStableForTransfer === true` UND `needs[resType] === true`.
4. Sortiere Kandidaten: T3 vor T2, längere Zeit-seit-Aufnahme zuerst.
5. Pro Kandidat: suche Zielklinik **außerhalb 30 km** um `arrivalPoint` mit Kapazität für dessen Ressourcen. Scoring: nächstgelegene Klinik mit ausreichend Puffer, die nicht selbst im Zielcluster liegt.
6. Wenn Zielklinik gefunden: erzeuge Relocation-Plan.

### 5.5 Tick-Cap

Pro Tick max **N Relocations** pro Quell-Klinik (Default: 4) — sonst würde die Simulation nicht mehr wie realistische Krankentransport-Infrastruktur wirken.

### 5.6 Durchführung einer Relocation

Beim Tick wird ein Plan zur Ausführung gebracht:

1. Patient-Status: `inTreatment → transferring`.
2. `transferTargetHospitalId = target.id`.
3. Route vom Quellklinik zum Zielklinik via OSRM anfordern (oder aus Cache).
4. **Quellbett sofort frei** (Patient verlässt Haus).
5. `arrivedAt = simTime + durationMin(route)` — beim Ankommen: `transferring → inTreatment`, Zielklinik-Bett belegen, `dischargeAt` anpassen.
6. **Audit-Event** `relocation.executed`.

### 5.7 Abbruch / Rückholung

Wenn eine MANV-Allocation in Konflikt mit der Vorbereitung tritt (§6), kann die Relocation-Engine geplante — aber noch nicht gestartete — Verlegungen **abbrechen** (`relocation.cancelled`-Event). Bereits begonnene Verlegungen sind **nicht reversibel** (der Krankentransport läuft bereits).

## 6. Konflikt-Priorisierung

Wenn gleichzeitig:
- mindestens ein aktiver Incident mit unerfüllter Allocation-Nachfrage läuft UND
- mindestens eine `PlannedIntake` mit Status `preparing` aktiv ist

dann gilt:

```
restTimeMin = intake.firstArrivalAt - simTime
intakeUrgency = clamp(1 - restTimeMin / intake.prepWindowMin, 0, 1)
manvUrgency   = clamp(unassignedPatients / max(incident.estimatedCasualties, 1), 0, 1)

// Wenn MANV-Urgency > Intake-Urgency → MANV priorisieren:
if (manvUrgency > intakeUrgency) {
  - Relocation-Wellen pausieren (keine neuen Plans)
  - Allocation bedient MANV ohne Relocation-Blocking
  - Alert "ConflictLoad" critical
  - Recommendation `prepare-reception` wird als "zurückgestellt" markiert
}
```

Wenn umgekehrt `intakeUrgency > manvUrgency + 0.2` (Restzeit klein): MANV wird zwar bedient, aber Ziel-Cluster-Kliniken werden im Scoring mit Malus versehen, damit MANV-Patienten eher **entferntere** Kliniken bekommen.

Diese Logik ist im Alert-Panel und in der Recommendation-Rationale für den Operator **sichtbar begründet**. Nachvollziehbarkeit hat höchste Priorität.

## 7. Detection-Regeln

`lib/simulation/detection.ts`.

### 7.1 HospitalSaturation

Pro Klinik pro Ressource: `occupied / effectiveTotal`.
- `≥ 0.85` → warn
- `≥ 0.95` → critical

### 7.2 CapacityTrend

Gleiche Klinik jetzt vs. vor 30 Sim-Minuten. Wenn `delta ≥ 0.15`:
```
remaining = 1 - now
ratePerMin = delta / 30
etaToFull = remaining / ratePerMin
→ warn mit etaToFull im detail
```

### 7.3 UnassignedPatients

Anzahl Patienten mit `status === 'onScene' AND simTime - spawnedAt > 20`. Wenn > 0 → critical.

### 7.4 RegionalLoad

Pro Incident: Kliniken in 50 km Umkreis. Summe occupied / Summe total über alle Ressourcen.
- `≥ 0.80` → warn
- `≥ 0.90` → critical

### 7.5 PlannedIntakeShortfall (neu)

Pro aktiver `PlannedIntake`:
- Berechne `desired` aus `computeTargetFreeBeds`.
- Vergleiche mit aktuell freien Kapazitäten im 30-km-Cluster.
- Wenn bei `restTime < prepWindow * 0.5` und `shortfall > 0`: warn.
- Wenn bei `restTime < prepWindow * 0.2` und `shortfall > 0`: critical mit konkreter Betten-Zahl.

### 7.6 RelocationStalled (neu)

Wenn in den letzten 30 Sim-Min für eine aktive Intake keine `relocation.executed`-Events, aber `shortfall > 0`: warn.

### 7.7 ConflictLoad (neu)

Siehe §6. Warn oder critical.

### 7.8 EscalationOpportunity

Haus ≥ 80 % Gesamt + `surgeReserve > 0` + `!surgeActive` → info.

### 7.9 Dedup

Key: `scope|scopeRef|ruleName`. Wenn ein gleicher Alert innerhalb der letzten 10 Sim-Min schon existiert, wird der neue nicht erzeugt (existierender bleibt "aktiv"). Wenn Bedingung nicht mehr erfüllt: `resolvedAt = simTime`, Fade-Out in UI (Alert bleibt in Liste, ausgegraut, sortiert ans Ende).

## 8. Fork-Preview ("Was-wäre-wenn")

`lib/simulation/fork-preview.ts`.

### 8.1 Zweck

Wenn der Operator über eine Recommendation-Karte hovert, soll die Timeline **sofort sehen lassen**, wie sich die Kurven entwickeln würden, wenn diese Maßnahme jetzt gezündet wird.

### 8.2 Algorithmus

```ts
export interface ForkPreviewResult {
  recommendationId: string;
  computedAt: number;       // sim time der Berechnung
  horizonMin: number;       // default 240
  curveWithout: TimelinePoint[];  // projected without measure
  curveWith: TimelinePoint[];     // projected with measure
  diff: {
    peakLoadDelta: number;        // pp
    critCountDelta: number;
    bedsFreedDelta: number;
  };
}

function computeForkPreview(
  baseState: SimState,
  rec: Recommendation,
  horizonMin = 240,
): ForkPreviewResult {
  // Deep-clone state (structuredClone), ohne routes/audit (nicht nötig).
  const A = cloneForFork(baseState);
  const B = cloneForFork(baseState);
  applyMeasureToState(B, rec);     // Maßnahme in B anwenden

  const rngA = seededRng(A.seed ^ 0xBAD);
  const rngB = seededRng(B.seed ^ 0xBAD);

  const curveA: TimelinePoint[] = [];
  const curveB: TimelinePoint[] = [];

  for (let m = 0; m < horizonMin; m++) {
    tick(A, rngA);
    tick(B, rngB);
    if (m % 5 === 0) {
      curveA.push(snapshotPoint(A));
      curveB.push(snapshotPoint(B));
    }
  }
  return { ...computeDiff(curveA, curveB), curveWithout: curveA, curveWith: curveB, ... };
}
```

### 8.3 Performance

- **Debounce** 150 ms Hover.
- **Cancellation**: neuer Hover auf andere Recommendation → alte Berechnung abbrechen (Flag setzen, in Loop prüfen).
- **Cache**: pro `rec.id + baseState.simTime` für 30 Sim-min wiederverwenden.
- Horizon default 240 Sim-min, auch bei 10×-Speed < 100 ms auf modernem Desktop.
- **Optional** in Web-Worker auslagern wenn Main-Thread zu blockiert.

### 8.4 UI-Integration

Siehe `TIMELINE.md §5`. Gestrichelte Overlay-Linie(n) im TimelineChart, eingefärbt nach `diff.peakLoadDelta`:
- `diff.peakLoadDelta < -5 pp` → Overlay grün (Verbesserung).
- `diff.peakLoadDelta > +2 pp` → Overlay rot (Verschlechterung).
- dazwischen → neutral blau.

## 9. Maßnahmen-Anwendung auf Sim-State

Jede `MeasureAction` hat eine pure Funktion `apply(state, rec): void`:

- `activate-surge`: pro Ziel-Klinik `surgeActive = true` für alle Ressourcen. Innerhalb 30 Sim-Min rampen die `total`-Werte um `surgeReserve` hoch.
- `reroute-manv`: für die nächsten 60 Sim-Min bekommen neue MANV-Patienten aus dem Incident-Quellradius das Ziel-Haus als **Präferenz** im Allocation-Scoring.
- `relocate-stable-batch`: Erzeugt N konkrete Relocation-Plans und führt den ersten Tick sofort aus.
- `prepare-reception`: `plannedIntake.status = 'preparing'`. Relocation-Engine läuft ab Folgetick.
- `staff-callup`: `staff.onCall → staff.onDuty`, `onCall = 0`. Effekt: gewichtet die Bett-Pflege-Rate, bleibt in v1 kosmetisch (erhöht `effectiveTotal` um 5 % in Normal-Betten, da mehr Personal).
- `cancel-elective`: `electiveActive = false`. Erhöht freie OP-Slots sofort um 25 % (wird zur `surgeReserve`).
- `divert-normal-admissions`: `divertActive = true`. In v1 kosmetisch (keine dynamischen Baseline-Admissions — §5 SPEC).
- `activate-reserve-hospital`: fügt synthetisches Reserve-Haus in `state.hospitals` (z. B. "Sanitätszentrum Fürstenfeldbruck" mit +200 Betten). Baseline-Auslastung 0 %.
- `alert-adjacent`: `escalation = 'erhoeht'` für Ziel-Häuser.
- `request-cross-region`: rein informational — fügt Banner oben ein; keine Sim-Änderung.

Jede Anwendung schreibt **vor** der Mutation ein `measure.applied`-Event in das Audit-Log.

## 10. Testbarkeit

Alle Funktionen in `lib/simulation/` sind **pure** (State rein, State raus). Unit-Tests mit handgebauten Minimal-Zuständen in `tests/unit/`.

Empfohlene Tests (siehe `TESTING.md`):
- Allocation: 30 Patienten auf 5 Kliniken, keine Überlastung.
- Cascade: 200 Patienten auf 3 kleine Kliniken, Cascade D triggert, alle versorgt.
- Relocation: Intake 100 Patienten am Flughafen, nach 12 Sim-h sind im 30-km-Cluster 115 Betten frei.
- Konflikt: Intake vorbereitet + MANV startet mit `manvUrgency > intakeUrgency` → Relocation pausiert.
- Fork-Preview: `activate-surge` vs ohne, `peakLoadDelta < -5 pp` im getesteten Szenario.
