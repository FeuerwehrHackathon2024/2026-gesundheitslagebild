# DATA_MODEL — Typen und Zustands-Shape

Alle Typen gehören in `lib/types.ts`. Abgeleitete Constants in `lib/data/resources.ts`.

## 1. Grundtypen

```ts
export type Triage = 'T1' | 'T2' | 'T3' | 'T4';

export type ResourceType =
  | 'notaufnahme'    // ER / Schockraum
  | 'op_saal'        // OP-Slot
  | 'its_bett'       // Intensiv
  | 'normal_bett';   // Normalstation

export type PatientStatus =
  | 'onScene'        // am Einsatzort, wartet auf Zuweisung
  | 'transport'      // im Transport zur Klinik
  | 'inTreatment'    // belegt ein Bett/OP
  | 'transferring'   // wird zwischen Kliniken verlegt
  | 'discharged'
  | 'deceased';

export type HospitalTier = 'maximal' | 'schwerpunkt' | 'regel' | 'grund';
```

## 2. Patient

```ts
export interface Patient {
  id: string;                       // "P-<incident-id>-<idx>" oder "P-baseline-<idx>"
  triage: Triage;
  needs: Record<ResourceType, boolean>;
  treatmentMin: number;             // wie lange am Bett
  source: 'baseline' | 'incident' | 'planned-intake';
  sourceRefId?: string;             // incident.id / plannedIntake.id
  spawnedAt: number;                // sim time
  status: PatientStatus;
  assignedHospitalId?: string;      // initiale Zuweisung
  transferTargetHospitalId?: string;// bei Verlegung
  routeId?: string;                 // Referenz in RouteCache
  arrivedAt?: number;               // sim time erste Ankunft
  dischargeAt?: number;             // sim time Soll-Entlassung
  // computed im Engine-Tick:
  isStableForTransfer: boolean;
}
```

**Stabilitäts-Regel (computed):**
`isStableForTransfer === true` wenn:
- `triage ∈ {'T2', 'T3'}`
- `status === 'inTreatment'`
- `simTime - arrivedAt >= 60` (mindestens 1 h Versorgung)
- kein OP-Slot belegt (`needs.op_saal === false` oder OP bereits abgeschlossen)

T1 bleiben *nie* transferfähig. T4 werden nicht verlegt (Palliativ-Ende).

## 3. Capacity

```ts
export interface Capacity {
  total: number;
  occupied: number;
  surgeReserve: number;      // zusätzlich aktivierbar via Maßnahme
  surgeActive: boolean;
}
```

**Rechnung:**
- Aktuelle verfügbare Betten: `total - occupied + (surgeActive ? surgeReserve : 0)`.
- Auslastung: `occupied / (total + (surgeActive ? surgeReserve : 0))`.

## 4. Hospital

```ts
export interface Hospital {
  id: string;                       // "H-MUC-<idx>"
  name: string;                     // wie aus Excel
  kind: string;                     // raw "Art"
  tier: HospitalTier;               // abgeleitet
  coords: [number, number];         // [lng, lat]
  address: { street: string; city: string; plz: string };
  capacity: Record<ResourceType, Capacity>;
  abteilungen: string[];            // raw gefiltert
  flags: {
    hasOP: boolean;
    hasITS: boolean;
    hasNotaufnahme: boolean;
    hasBurnCenter: boolean;         // aus "Abteilungen" ableitbar via "Brand", "Verbrennung", "Plastische Chirurgie"
    hasNeurochir: boolean;
    hasPaediatrie: boolean;
  };
  staff: { onDuty: number; onCall: number };
  escalation: 'normal' | 'erhoeht' | 'manv-1' | 'manv-2' | 'katastrophe';
  electiveActive: boolean;
  divertActive: boolean;
}
```

**Tier-Ableitung** (siehe `DATA_GENERATION.md`):
- `Art === 'Universitätsklinikum'` → `maximal`
- `Betten ≥ 500` → `schwerpunkt`
- `Betten ≥ 200` → `regel`
- sonst → `grund`

## 5. Incident

```ts
export type IncidentType =
  | 'verkehrsunfall' | 'amoklauf' | 'industriebrand'
  | 'naturkatastrophe' | 'panik';

export type ArrivalCurve = 'immediate' | 'gauss' | 'plateau';

export interface Incident {
  id: string;
  type: IncidentType;
  label: string;
  location: [number, number];
  startedAt: number;
  estimatedCasualties: number;
  arrivalCurve: ArrivalCurve;
  durationMin: number;
  triageMix: Record<Triage, number>;     // Summe = 1
  needsProfile: {
    opShare: number;
    itsShare: number;
    notaufnahmeShare: number;
    normalBedShare: number;              // Summe = 1
  };
}
```

Patient-Generierung (Engine):
- pro Tick: Anteil aus `cumulativeArrival(curve, rel)` × `estimatedCasualties` - bisher gespawnt
- je neuem Patient: würfle `triage` aus `triageMix`, dann `needs` aus `needsProfile` (jeder Shares-Eintrag ist P(true)).

## 6. PlannedIntake

```ts
export interface FlightArrival {
  idx: number;                    // 1..N
  etaMin: number;                 // sim time, absolute
  patientCount: number;
  triageMix: Record<Triage, number>;
  needsProfile: Incident['needsProfile'];
}

export interface PlannedIntake {
  id: string;
  label: string;
  arrivalPoint: [number, number]; // z.B. Flughafen MUC
  announcedAt: number;            // sim time
  firstArrivalAt: number;
  flights: FlightArrival[];
  totalPatients: number;
  prepWindowMin: number;          // firstArrivalAt - announcedAt
  status: 'announced' | 'preparing' | 'arriving' | 'complete' | 'cancelled';
  bufferRatio: number;            // default 0.15
}
```

**Soldaten-Template:**
```ts
{
  label: 'Medizinische Evakuierung — Soldaten MUC',
  arrivalPoint: [11.7861, 48.3538],
  totalPatients: 750,
  flights: 3,
  flightIntervalMin: 45,
  prepWindowMin: 1440,                      // 24 h
  triageMix: { T1: 0.25, T2: 0.45, T3: 0.25, T4: 0.05 },
  needsProfile: {
    opShare: 0.55, itsShare: 0.30,
    notaufnahmeShare: 0.05, normalBedShare: 0.10
  }
}
```

## 7. Alert

```ts
export interface Alert {
  id: string;
  ruleName: string;
  severity: 'info' | 'warn' | 'critical';
  scope: 'hospital' | 'region' | 'system' | 'intake' | 'conflict';
  scopeRef: string;
  firedAt: number;
  title: string;                  // DE
  detail: string;                 // DE
  resolvedAt?: number;
  linkedRecommendations: string[];
}
```

## 8. Recommendation

```ts
export type MeasureAction =
  | 'activate-surge' | 'reroute-manv' | 'relocate-stable-batch'
  | 'prepare-reception' | 'staff-callup' | 'cancel-elective'
  | 'divert-normal-admissions' | 'activate-reserve-hospital'
  | 'alert-adjacent' | 'request-cross-region';

export interface Recommendation {
  id: string;
  triggeredBy: string[];          // alert.id[]
  action: MeasureAction;
  targetHospitalIds: string[];
  intakeRefId?: string;
  title: string;                  // DE
  rationale: string;              // DE, 1–2 Sätze
  expectedImpact: {
    bedsGained?: number;
    timeBoughtMin?: number;
    patientsRerouted?: number;
    patientsRelocated?: number;
    occupancyDeltaPp?: number;    // erwartete Auslastungs-Veränderung
  };
  effortLevel: 'low' | 'medium' | 'high';
  executable: boolean;
  executedAt?: number;
}
```

## 9. Event (Audit)

```ts
export type EventKind =
  | 'sim.tick' | 'sim.paused' | 'sim.resumed' | 'sim.speed-changed'
  | 'incident.started' | 'incident.ended'
  | 'intake.announced' | 'intake.flight-landed' | 'intake.completed'
  | 'patient.spawned' | 'patient.assigned' | 'patient.arrived'
  | 'patient.treated' | 'patient.discharged' | 'patient.deceased'
  | 'relocation.planned' | 'relocation.executed' | 'relocation.cancelled'
  | 'recommendation.generated' | 'recommendation.executed'
  | 'measure.applied'
  | 'hospital.escalated' | 'hospital.surge-activated'
  | 'forkPreview.computed'
  | 'user.showcase-started';

export interface Event {
  id: string;                     // ULID
  t: number;                      // sim time
  wallClockISO: string;           // reale Ausführungszeit
  kind: EventKind;
  scope: 'system' | 'hospital' | 'patient' | 'incident' | 'intake';
  scopeRef?: string;
  payload: Record<string, unknown>;
  causedBy?: string;              // event.id, wenn eines durch ein anderes getriggert
  triggeredBy?: 'operator' | 'simulation' | 'rule';
}
```

Details zu Persistenz in `AUDIT.md`.

## 10. Route

```ts
export interface Route {
  id: string;                     // "R-<from-lng>-<from-lat>-<to-lng>-<to-lat>"
  from: [number, number];
  to: [number, number];
  polyline: [number, number][];   // Decoded LngLat
  durationSec: number;            // aus OSRM
  distanceM: number;
  computedAt: string;             // ISO
  source: 'osrm' | 'haversine-fallback';
}
```

## 11. Simulation-State (Store)

```ts
export interface SimState {
  simTime: number;                // min
  speed: number;                  // 0.5..10
  isRunning: boolean;
  seed: number;

  hospitals: Record<string, Hospital>;
  patients: Patient[];
  incidents: Incident[];
  plannedIntakes: PlannedIntake[];

  routes: Record<string, Route>;

  alerts: Alert[];
  recommendations: Recommendation[];

  // Timeline-Rolling-Buffer, 1 Eintrag pro 5 Sim-min, max 24 h
  occupancyHistory: Array<{
    simTime: number;
    totals: Record<ResourceType, { total: number; occupied: number }>;
    overall: number;
    critCount: number;
  }>;

  // Fork-Preview-Cache
  forkPreviewCache: Record<string, ForkPreviewResult>;

  filters: {
    bedThresholds: { min: number; max: number };
    triage: Record<Triage, boolean>;
  };
}
```

`ForkPreviewResult` ist in `SIMULATION.md §8` definiert.
