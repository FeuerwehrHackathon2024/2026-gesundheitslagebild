# SPEC — MANV Dashboard

## 1. Mission

A map-first decision-support dashboard for a crisis operator (Leitstand). Given a mass-casualty incident (MANV) or large-scale medical emergency anywhere in Germany, the system must:

1. **Visualize** the evolving situation on an interactive map (hospitals, incidents, patient flow, capacity pressure).
2. **Detect** capacity bottlenecks as early as possible — ideally before they become critical.
3. **Recommend** concrete, quantified actions to the operator: activate surge capacity, reroute patients, alert adjacent hospitals, mobilize outpatient services, request cross-regional support.

The demo runs entirely client-side with mock data on real German hospital coordinates.

## 2. Stack (locked)

| Layer              | Choice                                                |
|--------------------|-------------------------------------------------------|
| Framework          | Next.js 14+ (App Router), TypeScript strict           |
| Styling            | Tailwind CSS 3 + CSS variables for Gotham tokens      |
| Map                | MapLibre GL JS (not Mapbox, not Leaflet)              |
| State              | Zustand (global sim store) + React state for UI local |
| Charts             | Recharts                                              |
| Package manager    | pnpm                                                  |
| Geodata for map    | MapLibre demo tiles or Protomaps (free, no token)     |
| Hospital data      | Static JSON, generated once by a script (see §10)     |
| Simulation         | Pure TypeScript in `lib/simulation/`, client-side     |

No backend. No database. No API keys. No auth.

## 3. Domain Model

### 3.1 PZC Catalog (Patientenzustandscode)

The PZC describes a patient's clinical state and drives resource demand. This demo uses a simplified 12-code catalog representative of real MANV patient distributions. Each PZC carries resource requirements and a triage category (SK = Sichtungskategorie).

```ts
type Discipline =
  | 'notaufnahme'
  | 'chirurgie'
  | 'innere'
  | 'its'         // Intensivmedizin
  | 'neurochir'
  | 'verbrennung'
  | 'paediatrie'
  | 'op';         // OP-Saal-Kapazität

type TriageCategory = 'T1' | 'T2' | 'T3' | 'T4';

interface PZC {
  code: string;              // stable ID, e.g. "PZC-POLY-T1"
  label: string;             // human-readable
  triage: TriageCategory;
  primaryDiscipline: Discipline;
  requiredDisciplines: Discipline[];   // incl. primary
  requiresOP: boolean;
  requiresITS: boolean;
  requiresBurnCenter: boolean;
  minVersorgungsstufe: Versorgungsstufe; // lowest level of hospital that can treat
  avgTreatmentMin: number;   // avg bed occupation time in minutes
  stabilizationMin: number;  // time on scene / transport buffer before hospital arrival
}
```

The 12 codes to implement:

| Code                | Label                                       | SK | Primary      | OP | ITS | Burn | MinStufe        | Treat min |
|---------------------|---------------------------------------------|----|--------------|----|-----|------|-----------------|-----------|
| PZC-POLY-T1         | Polytrauma, kreislaufinstabil               | T1 | chirurgie    | Y  | Y   | N    | schwerpunkt     | 720       |
| PZC-SHT-T1          | Schweres SHT, bewusstlos                    | T1 | neurochir    | Y  | Y   | N    | schwerpunkt     | 900       |
| PZC-THORAX-T1       | Thoraxtrauma mit Atemnot                    | T1 | chirurgie    | Y  | Y   | N    | schwerpunkt     | 600       |
| PZC-BURN-T1         | Verbrennung >20 % KOF                       | T1 | verbrennung  | Y  | Y   | Y    | maximal         | 1440      |
| PZC-PENET-T1        | Penetrierendes Trauma, instabil             | T1 | chirurgie    | Y  | Y   | N    | schwerpunkt     | 540       |
| PZC-ABDO-T2         | Abdominaltrauma, stabil                     | T2 | chirurgie    | Y  | N   | N    | regel           | 360       |
| PZC-EXT-T2          | Offene Extremitätenfraktur                  | T2 | chirurgie    | Y  | N   | N    | regel           | 240       |
| PZC-BURN-T2         | Verbrennung 10–20 % KOF                     | T2 | verbrennung  | Y  | N   | Y    | schwerpunkt     | 720       |
| PZC-INHAL-T2        | Rauchgasintoxikation, symptomatisch         | T2 | innere       | N  | Y   | N    | regel           | 480       |
| PZC-MINOR-T3        | Prellung, Schürfwunde, kleine Platzwunde    | T3 | notaufnahme  | N  | N   | N    | grund           | 90        |
| PZC-PSYCH-T3        | Akute psychische Reaktion                   | T3 | notaufnahme  | N  | N   | N    | grund           | 120       |
| PZC-EXPECT-T4       | Infauste Verletzung, palliativ              | T4 | notaufnahme  | N  | N   | N    | grund           | 60        |

Pediatric variant rule: if the generated patient is flagged as child (`isChild: true`), `paediatrie` is prepended to `requiredDisciplines` and `minVersorgungsstufe` is raised one level.

### 3.2 Disciplines (coarse)

Exactly 8 disciplines (see type above). Each hospital holds a `Map<Discipline, DisciplineCapacity>` for the disciplines it offers.

```ts
interface DisciplineCapacity {
  bedsTotal: number;          // normal operation
  bedsOccupied: number;       // live, updated by sim
  bedsReservedMANV: number;   // kept free for crisis routing
  surgeCapacity: number;      // additional beds unlockable via escalation
  surgeActive: boolean;       // operator has activated surge
  staffOnDuty: number;
  staffOnCall: number;        // callable in ~60 min
}
```

### 3.3 Hospital

```ts
type Versorgungsstufe = 'grund' | 'regel' | 'schwerpunkt' | 'maximal';

type EscalationLevel =
  | 'normal'
  | 'erhoeht'        // preparedness raised
  | 'manv-1'         // internal MANV alert
  | 'manv-2'         // regional MANV alert
  | 'katastrophe';   // disaster plan active

interface Hospital {
  id: string;                      // stable, e.g. "H-DE-00042"
  name: string;
  traeger: 'oeffentlich' | 'freigemeinnuetzig' | 'privat';
  versorgungsstufe: Versorgungsstufe;
  coords: [number, number];        // [lng, lat]
  address: { street: string; city: string; plz: string; bundesland: string };
  disciplines: Partial<Record<Discipline, DisciplineCapacity>>;
  opSlots: { total: number; inUse: number };
  escalationLevel: EscalationLevel;
  canEscalateTo: EscalationLevel;
}
```

Capacity distribution heuristics (used by the data-gen script):

| Versorgungsstufe | Offers disciplines                                                              | Bed scale |
|------------------|---------------------------------------------------------------------------------|-----------|
| grund            | notaufnahme, chirurgie (basic), innere                                          | 80–200    |
| regel            | + its (small), op                                                               | 200–400   |
| schwerpunkt      | + neurochir, paediatrie                                                         | 400–800   |
| maximal          | + verbrennung (about 30 % of them, concentrated in known burn centers)          | 800–2000  |

Initial occupancy: 65–80 % random per discipline. `bedsReservedMANV` = 10 % of `bedsTotal` rounded. `surgeCapacity` = 20 % of `bedsTotal`.

### 3.4 Patient

```ts
interface Patient {
  id: string;
  pzc: string;                 // references PZC.code
  incidentId: string;
  isChild: boolean;
  spawnedAt: number;           // sim time ms
  arrivedAt?: number;          // sim time when hospital reached
  assignedHospitalId?: string;
  status: 'onScene' | 'transport' | 'inTreatment' | 'discharged' | 'deceased';
  dischargeAt?: number;        // projected
}
```

### 3.5 Incident

```ts
type IncidentType =
  | 'verkehrsunfall'     // road traffic MCI
  | 'industriebrand'     // industrial fire / chem
  | 'amoklauf'           // active shooter
  | 'fluechtlingsstrom'  // refugee influx with injuries
  | 'naturkatastrophe';  // flood / storm

interface Incident {
  id: string;
  type: IncidentType;
  label: string;
  location: [number, number];        // [lng, lat]
  radius?: number;                   // meters, for area incidents
  startedAt: number;                 // sim time
  estimatedCasualties: number;
  pzcDistribution: Record<string, number>;  // pzc code -> count
  arrivalCurve: 'immediate' | 'gauss' | 'plateau' | 'cascade';
  // immediate: all in first 10 min (e.g. amok)
  // gauss: bell over 60-90 min (e.g. road crash)
  // plateau: flat over 2-4h (e.g. fire evac)
  // cascade: slow ramp over 6-24h (e.g. refugee influx)
}
```

## 4. Simulation Engine

File: `lib/simulation/engine.ts`. Pure TypeScript, no React. Exposes a tick-based controller.

### 4.1 Clock

- Default compression: **1 simulated minute per real second** (configurable 0.5×–10×).
- Tick size: 1 simulated minute per tick. Engine runs `setInterval(tick, 1000 / speed)`.
- Pause, step-forward (+1 min, +10 min, +1 h), reset.

### 4.2 Tick sequence

Per tick, in this order:
1. **Incident spawn:** for each active incident, emit new patients per arrival curve.
2. **Transport progression:** patients in `transport` advance; arrival when ETA reached.
3. **Hospital assignment:** any patient in `onScene` without assignment runs through the router (§4.3).
4. **Treatment progression:** patients in `inTreatment` — check `dischargeAt`, free the bed if done.
5. **Detection pass:** run rules from §5, emit new alerts (deduplicated).
6. **Recommendation pass:** regenerate active recommendations from §6.
7. **Snapshot:** push state snapshot to store (for timeline scrubbing, keep last 24 sim hours).

### 4.3 Routing algorithm

For each unassigned patient, score every hospital that satisfies hard constraints, pick the best.

**Hard constraints (exclude if any fail):**
- Hospital offers all `pzc.requiredDisciplines`.
- Hospital's `versorgungsstufe` ≥ `pzc.minVersorgungsstufe`.
- At least one required discipline has a free bed (respecting `bedsReservedMANV` unless sim is in regional MANV state).
- If `pzc.requiresBurnCenter`, hospital must have `verbrennung`.
- Distance ≤ hard cutoff: 150 km for T1, 80 km for T2, 40 km for T3, 20 km for T4.

**Score (higher is better):**
```
score =
    w_distance   * (1 - normalized_distance)
  + w_capacity   * free_bed_fraction_primary
  + w_stufe_fit  * stufeFitScore      // penalize overshooting (T3 → Maximalversorger)
  - w_load       * hospital_overall_load
```

Weights: `w_distance=0.45`, `w_capacity=0.30`, `w_stufe_fit=0.15`, `w_load=0.10`.

Distance: great-circle (haversine) for simplicity. ETA: `distance_km / 60 km/h` + `pzc.stabilizationMin`. Good enough for demo; no real routing engine.

If no hospital passes hard constraints, patient enters `unassigned` queue and an alert fires (§5).

## 5. Detection Engine

File: `lib/simulation/detection.ts`. Rule-based. Each rule is a pure function `(state) => Alert[]`.

**Alert shape:**
```ts
interface Alert {
  id: string;
  severity: 'info' | 'warn' | 'critical';
  scope: 'hospital' | 'region' | 'system';
  scopeRef: string;         // hospital id, bundesland, or 'system'
  firedAt: number;          // sim time
  title: string;
  detail: string;
  linkedRecommendations: string[];  // recommendation ids
}
```

**Rules to implement (MVP set):**

1. **HospitalSaturation**: any discipline with `occupied / total ≥ 0.85` → warn; `≥ 0.95` → critical.
2. **CapacityTrend**: if occupancy grew by ≥ 15 percentage points in the last 30 sim min → warn with ETA-to-full projection (linear extrapolation).
3. **UnassignedPatients**: if any patient has been `onScene` > 20 sim min without assignment → critical.
4. **RegionalLoad**: aggregate all hospitals within 50 km of incident; if combined occupancy in the incident's primary disciplines ≥ 80 % → warn; ≥ 90 % → critical.
5. **DisciplineMismatch**: incident generates PZC demand that exceeds reachable capacity for that specific discipline (e.g. burn center demand > burn center supply within 150 km) → critical.
6. **EscalationOpportunity**: hospital is at ≥ 80 % and `surgeCapacity > 0` and `surgeActive = false` → info.

Alerts deduplicate on `scope + scopeRef + rule-name` within 10 sim min. Resolved alerts fade out rather than disappear.

## 6. Recommendation Engine

File: `lib/simulation/recommendations.ts`. Each recommendation is generated from one or more active alerts.

**Recommendation shape:**
```ts
interface Recommendation {
  id: string;
  triggeredBy: string[];    // alert ids
  action: 'activate-surge' | 'reroute' | 'activate-kv-notdienst'
        | 'alert-adjacent' | 'request-cross-region' | 'transfer-stable';
  targetHospitalIds: string[];
  title: string;
  rationale: string;        // one paragraph, plain language
  expectedImpact: {
    bedsGained?: number;
    timeBoughtMin?: number;
    patientsRerouted?: number;
  };
  effortLevel: 'low' | 'medium' | 'high';
  executable: boolean;      // can operator click "execute" to apply in sim
}
```

**Generation rules (MVP):**

- `HospitalSaturation` + `surgeCapacity > 0` → **activate-surge** (low effort, bedsGained = surgeCapacity).
- `RegionalLoad` warn → **alert-adjacent**: identify the 3 nearest hospitals outside the 50 km ring and recommend raising their `escalationLevel` to `erhoeht`.
- `RegionalLoad` critical → **request-cross-region**: flag adjacent Bundesländer for support (high effort).
- `HospitalSaturation` critical + patients in transport → **reroute**: redirect the next N patients to hospital Y with specific free capacity, show km + ETA delta.
- T3-dominated load and `notaufnahme` saturated → **activate-kv-notdienst**: mobilize KV-Notdienst / arztpraxen in affected PLZ area (medium effort, estimates T3 diversion).
- Hospital has stable `inTreatment` patients and needs capacity → **transfer-stable**: move N stable patients to further hospitals with capacity (medium effort).

**Execute behavior (when operator clicks Execute):**
- `activate-surge`: flips `surgeActive = true`, adds surge beds to `bedsTotal` for that discipline over 30 sim min ramp.
- `reroute`: future patients from the affected area with matching PZC get the target hospital forced in routing for the next 60 sim min.
- `activate-kv-notdienst`: diverts 40 % of future T3 patients in the PLZ region out of hospitals (they go to a virtual "KV" sink).
- `alert-adjacent`: raises escalation of named hospitals.
- `transfer-stable`: creates synthetic "transfer" patient movements freeing beds.
- `request-cross-region`: purely informational in demo; adds a banner.

## 7. UI — Palantir Gotham Aesthetic

### 7.1 Tokens (CSS vars in `globals.css`)

```
--bg-0: #0A0E14   /* app background */
--bg-1: #0F141B   /* panels */
--bg-2: #151B24   /* raised panels, hover */
--bg-3: #1C2431   /* inputs, active rows */
--border-1: #222B3A
--border-2: #2E3A4D
--text-0: #E6EAF2
--text-1: #A9B3C3
--text-2: #6B7687
--accent-amber: #F5A623
--accent-red: #E5484D
--accent-cyan: #38BDF8
--accent-green: #22C55E
--mono: 'JetBrains Mono', ui-monospace, monospace
--sans: 'Inter', system-ui, sans-serif
```

### 7.2 Layout (top-level)

```
┌─────────────────────────────────────────────────────────────┐
│  HEADER: sim-clock · speed · pause/step · scenario dropdown │  48px
├──────────────┬────────────────────────────┬─────────────────┤
│              │                            │                 │
│ LEFT         │         MAP                │  RIGHT          │
│ PANEL        │       (MapLibre)           │  PANEL          │
│ 320 px       │                            │  360 px         │
│              │                            │                 │
│ - Incidents  │                            │ - Alerts        │
│ - Filters    │                            │ - Recommend.    │
│ - Legend     │                            │ - Detail drawer │
│              │                            │                 │
├──────────────┴────────────────────────────┴─────────────────┤
│  TIMELINE STRIP: scrubber, playback, snapshots              │  80px
└─────────────────────────────────────────────────────────────┘
```

- Zero rounded corners beyond `2px` radius. No shadows. Borders are 1px `--border-1`.
- Numbers always in `--mono`. Labels in `--sans` uppercase tracking-wider for section headers.
- Dense tables with 28 px row height. Hover = `--bg-2`.
- No gradients, no decorative icons. Lucide icons only for functional affordance, stroke 1.5.

### 7.3 Map styling

- MapLibre style: custom dark style based on Protomaps dark or a hand-tuned `basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json` adapted to `--bg-0`.
- Hospital marker: circle, radius by `versorgungsstufe` (6/8/10/12 px), fill by occupancy (green→amber→red ramp), stroke 1px `--text-1`.
- Incident marker: pulsing ring + inner triangle, color `--accent-amber` for active, `--accent-red` for critical.
- Isochrone layer: 10/20/30 min drive-time as semi-transparent concentric polygons (precomputed as circles of 10/20/30 km for demo — not real isochrones).
- Hover on hospital → tooltip with name, stufe, 8 discipline bars (mini sparkbars of occupancy).
- Click on hospital → right panel opens `HospitalDetailPanel` with all disciplines, escalation controls, timeline of last 4 h.

### 7.4 Alert & Recommendation panels

- Alerts list: newest on top, severity indicator as a 3px left border (amber/red/cyan).
- Recommendations: card with title, rationale (2 lines max before "more"), impact chips (`+40 beds`, `+3 h`), two buttons `Details` · `Execute`.
- Executed recommendations move to a collapsed "Applied" section with timestamp.

## 8. Scenario Catalog

Five launchable scenarios in `lib/data/scenarios.ts`. Each is a function returning an `Incident`.

1. **BAB-Busunglück A7 bei Hamburg** — 80 casualties, `gauss` curve over 90 min. PZC mix: 10 % POLY-T1, 10 % SHT-T1, 20 % ABDO-T2, 25 % EXT-T2, 30 % MINOR-T3, 5 % EXPECT-T4.
2. **Industriebrand Ludwigshafen** — 45 casualties, `plateau` 3 h. Mix: 20 % BURN-T1, 30 % BURN-T2, 40 % INHAL-T2, 10 % MINOR-T3.
3. **Amoklauf München Innenstadt** — 35 casualties, `immediate` within 15 min. Mix: 25 % PENET-T1, 15 % POLY-T1, 20 % ABDO-T2, 20 % EXT-T2, 15 % PSYCH-T3, 5 % EXPECT-T4.
4. **Fluechtlingsstrom Görlitz** — 500 arrivals, `cascade` over 12 h. Mix: 5 % POLY-T1, 5 % PENET-T1, 10 % EXT-T2, 15 % ABDO-T2, 55 % MINOR-T3, 10 % PSYCH-T3. Child ratio 25 %.
5. **Hochwasser-Evakuierung Passau** — 120 casualties, `plateau` 4 h. Mix: 5 % POLY-T1, 20 % INHAL-T2 (as "hypothermia/aspiration"), 15 % EXT-T2, 50 % MINOR-T3, 10 % PSYCH-T3.

Scenarios are seeded (`seed: string`) so runs are reproducible for demo.

## 9. File Structure

```
manv-dashboard/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── map/
│   │   ├── MapContainer.tsx
│   │   ├── HospitalLayer.tsx
│   │   ├── IncidentLayer.tsx
│   │   ├── IsochroneLayer.tsx
│   │   └── mapStyle.ts
│   ├── panels/
│   │   ├── Header.tsx
│   │   ├── LeftPanel.tsx
│   │   ├── RightPanel.tsx
│   │   ├── AlertList.tsx
│   │   ├── RecommendationList.tsx
│   │   ├── HospitalDetailPanel.tsx
│   │   ├── IncidentLauncher.tsx
│   │   └── TimelineStrip.tsx
│   ├── charts/
│   │   └── CapacityTimeline.tsx
│   └── ui/
│       ├── Badge.tsx
│       ├── Bar.tsx
│       ├── Button.tsx
│       └── Panel.tsx
├── lib/
│   ├── simulation/
│   │   ├── engine.ts
│   │   ├── router.ts
│   │   ├── detection.ts
│   │   ├── recommendations.ts
│   │   └── scenarios.ts
│   ├── data/
│   │   ├── pzc.ts
│   │   ├── disciplines.ts
│   │   ├── hospitals.json
│   │   └── generate-hospitals.ts   // dev-only script
│   ├── geo.ts                       // haversine, bbox helpers
│   ├── types.ts
│   └── store.ts
├── public/
├── scripts/
│   └── gen-hospitals.ts             // run once: pnpm tsx scripts/gen-hospitals.ts
├── package.json
└── tsconfig.json
```

## 10. Hospital Data Generation

Goal: 200 hospitals with real coordinates, synthetic capacity, distributed across Germany proportional to population.

**Strategy:**
1. Pull hospital data from OSM via Overpass API at dev time — query for `amenity=hospital` in Germany bounding box, then dedupe on name + coords.
2. Sample 200 hospitals weighted by proximity to population centers (pre-computed city list with populations in the script is fine; no live population API).
3. Assign `versorgungsstufe` via heuristics: very large cities' university-associated hospitals → `maximal`; big-city hospitals → `schwerpunkt`; mid-size → `regel`; small town → `grund`. Target distribution: 8 maximal, 35 schwerpunkt, 90 regel, 67 grund.
4. Assign disciplines per §3.3 rules. Assign `verbrennung` only to 10 hospitals total (real burn centers — Bundeswehrkrankenhaus, BG-Kliniken, etc.; hardcode name list).
5. Generate bed counts within stufe ranges, seeded random.
6. Write to `lib/data/hospitals.json`.

The generation script is committed but runs only on demand. Production runtime reads the static JSON.

If Overpass is unreachable during generation, script has a fallback: a curated hardcoded list of 200 known German hospital names + approx coords (Claude Code can generate this list from knowledge — accuracy within city-level is sufficient for demo).

## 11. Phase Breakdown (with validation gates)

### Phase 1 — Foundation
**Deliver:** Next.js project initialized, Tailwind configured with Gotham CSS vars, empty routing shell (`/` renders the 3-panel layout with placeholder divs), base types in `lib/types.ts`, PZC catalog in `lib/data/pzc.ts`, discipline enum in `lib/data/disciplines.ts`.
**Gate:** `pnpm dev` opens, shows the Gotham-styled empty layout with header/left/map-placeholder/right/timeline. No runtime errors. Types compile.

### Phase 2 — Hospital Data + Map
**Deliver:** `scripts/gen-hospitals.ts` and resulting `hospitals.json` with 200 hospitals. `MapContainer` renders MapLibre centered on Germany with a dark style. `HospitalLayer` renders all 200 hospitals as circles colored by initial (static) occupancy.
**Gate:** Open page, see Germany map dark-themed with ~200 hospital dots distributed realistically. Hover shows name tooltip. Zoom/pan works.

### Phase 3 — Simulation Engine Core
**Deliver:** `engine.ts` with tick loop, pause/play/speed controls wired to header. `router.ts` with scoring. Ability to spawn a hardcoded test incident programmatically and watch patients get assigned. Zustand store driving state.
**Gate:** In dev, call a test helper to spawn an incident; observe patient assignments logged to console; hospital occupancy numbers change in the store (visible in React DevTools or a debug panel).

### Phase 4 — Incident Launcher + Live Map
**Deliver:** `IncidentLauncher` panel with scenario dropdown and "place custom incident" by map click. Incidents render on map with marker + radius. Hospital colors update live as occupancy changes. Sim clock in header shows running time.
**Gate:** Launch "BAB-Busunglück" scenario. Watch incident appear, hospitals in the region start turning amber over time. Pause/resume works. Speed switch works.

### Phase 5 — Detection + Alerts
**Deliver:** `detection.ts` with all 6 MVP rules. `AlertList` in right panel renders alerts live with severity border, title, detail, timestamp. Alert dedupe and fade-on-resolve.
**Gate:** Running the bus scenario produces alerts in real time. At least `HospitalSaturation` and `RegionalLoad` fire. Alerts are sorted newest-first and deduplicate correctly.

### Phase 6 — Recommendations + Execution
**Deliver:** `recommendations.ts` generating actionable cards. `RecommendationList` with Details/Execute buttons. Executing a recommendation mutates sim state per §6 rules and visibly changes the map/alerts.
**Gate:** In bus scenario, see "Activate Surge at Hospital X" appear, click Execute, see hospital's bed count increase and its color drop back. See "Reroute next patients to Y" appear when a hospital hits critical; executing it changes routing visibly.

### Phase 7 — Hospital Detail + Timeline Scrub
**Deliver:** Clicking a hospital opens `HospitalDetailPanel` with all disciplines (bars + numbers), escalation controls, last-4h capacity timeline via Recharts. `TimelineStrip` supports scrubbing backward through snapshots (map re-renders at that moment).
**Gate:** Click any hospital mid-scenario; panel shows live per-discipline state. Scrub timeline back 30 min; map and alerts reflect that moment. Scrub forward to "live".

### Phase 8 — Scenario Polish + Demo Script
**Deliver:** All 5 scenarios implemented and tested end-to-end. Isochrone rings on map when incident active. Small UX polish: keyboard shortcuts (space = pause, 1/2/3 = speed), "reset" button, incident summary card on map. A `DEMO.md` describing how to run each scenario and what to point out.
**Gate:** Each of the 5 scenarios runs cleanly start-to-finish, produces distinct alert/recommendation patterns, and demonstrates operator intervention changing outcomes. Demo-ready.

## 12. Non-Goals (explicit)

- Real-time data ingestion from real hospital systems.
- Authentication, multi-user, persistence across sessions.
- Actual routing via road network (haversine is the commitment).
- Real isochrones (concentric km circles only).
- Mobile responsive design (desktop-only demo, minimum 1440×900).
- Internationalization (German UI with English code identifiers; UI strings in de-DE).
- Accessibility beyond sensible semantics and keyboard support for primary controls.

## 13. Quality bar

- No console errors or warnings in normal operation.
- Tick loop never drops frames at 1×–5× speed with 200 hospitals and 500 active patients.
- Type safety strict. `any` only with a TODO comment.
- Deterministic given same seed + same operator actions.

End of SPEC.
