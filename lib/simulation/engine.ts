/**
 * Simulation-Engine per SPEC §4.
 * Tick-basiert, pure-ish: nimmt SimState rein, mutiert und gibt neuen zurueck.
 * Spawn-Curves, Transport, Zuweisung, Behandlung, Entlassung.
 */
import type { Discipline } from '@/lib/data/disciplines';
import { PZC_BY_CODE } from '@/lib/data/pzc';
import { haversineKm } from '@/lib/geo';
import { allocateBatch } from '@/lib/simulation/allocation';
import type { Hospital, Incident, Patient } from '@/lib/types';

export interface OccupancySnapshot {
  simTime: number;
  occupancy: Record<string, number>; // hospitalId -> overall occupancy 0..1
}

export interface SimState {
  simTime: number; // Minuten seit T0
  incidents: Incident[];
  patients: Patient[];
  hospitals: Record<string, Hospital>;
  childFlags: Record<string, boolean>; // patient.id -> isChild (cache)
  unassigned: string[]; // patient-ids ohne Zuweisung
  tickLog: string[];
  /** Rolling window (max 12 Eintraege = 60 min bei 5-min-Resolution). */
  occupancyHistory: OccupancySnapshot[];
}

/**
 * Wie viele Patienten sollte dieser Incident bis "relativeMin" Minuten nach
 * startedAt emittiert haben? (kumulativ, als Bruchteil von 0..1)
 */
function cumulativeArrival(incident: Incident, relativeMin: number): number {
  if (relativeMin <= 0) return 0;
  switch (incident.arrivalCurve) {
    case 'immediate': {
      // alles in den ersten 10 min
      return Math.min(1, relativeMin / 10);
    }
    case 'gauss': {
      // Gauss-aehnliche Glockenkurve ueber 90 min, Peak bei 45 min
      // Verwende kumulative Normalverteilung approx.
      const duration = 90;
      const x = Math.min(relativeMin, duration);
      // Simplified: sigmoid centered at duration/2
      const t = (x - duration / 2) / (duration / 6);
      return 1 / (1 + Math.exp(-t * 1.6));
    }
    case 'plateau': {
      // linear ueber duration (bis ~240 min)
      const duration = 240;
      return Math.min(1, relativeMin / duration);
    }
    case 'cascade': {
      // langsamer Anstieg ueber 720 min mit sanftem Ramp
      const duration = 720;
      const t = Math.min(1, relativeMin / duration);
      // Ease-in-out cubic
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
  }
}

/** Zieht n Elemente aus einer Verteilung proportional zu Gewichten. */
function drawFromDistribution(
  dist: Record<string, number>,
  n: number,
  rng: () => number,
): string[] {
  const entries = Object.entries(dist).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return [];
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    let r = rng() * total;
    for (const [code, w] of entries) {
      r -= w;
      if (r <= 0) {
        out.push(code);
        break;
      }
    }
  }
  return out;
}

/**
 * Fuer jeden Incident: berechnet, wie viele Patienten seit Start schon
 * emittiert werden sollten, und spawnt ggf. neue.
 */
function spawnPatients(state: SimState, rng: () => number): void {
  for (const inc of state.incidents) {
    const existing = state.patients.filter((p) => p.incidentId === inc.id).length;
    const rel = state.simTime - inc.startedAt;
    const shouldTotal = Math.round(
      cumulativeArrival(inc, rel) * inc.estimatedCasualties,
    );
    const toSpawn = shouldTotal - existing;
    if (toSpawn <= 0) continue;

    const codes = drawFromDistribution(inc.pzcDistribution, toSpawn, rng);
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i]!;
      const pid = `P-${inc.id}-${existing + i}`;
      const isChild = rng() < getChildRatio(inc);
      state.childFlags[pid] = isChild;
      const p: Patient = {
        id: pid,
        pzc: code,
        incidentId: inc.id,
        isChild,
        spawnedAt: state.simTime,
        status: 'onScene',
      };
      state.patients.push(p);
    }
  }
}

/**
 * Kind-Anteil: kodieren wir nicht explizit im Incident (SPEC-Typ hat das nicht).
 * Stattdessen: bekannt fuer Goerlitz (25 %) und Passau (15 %), Rest ~5 %.
 */
function getChildRatio(inc: Incident): number {
  if (inc.id.includes('goerlitz')) return 0.25;
  if (inc.id.includes('passau')) return 0.15;
  return 0.05;
}

/**
 * Bett in der Discipline belegen. Erlaubt Ueberbelegung
 * (bedsOccupied > bedsTotal, MANV-Flur-Szenario). False nur, wenn die
 * Discipline gar nicht im Haus existiert.
 */
function assignBed(h: Hospital, d: Discipline): boolean {
  const cap = h.disciplines[d];
  if (!cap) return false;
  cap.bedsOccupied += 1;
  return true;
}

function freeBed(h: Hospital, d: Discipline): void {
  const cap = h.disciplines[d];
  if (!cap) return;
  cap.bedsOccupied = Math.max(0, cap.bedsOccupied - 1);
}

/**
 * Weist alle onScene-Patienten dieses Ticks Krankenhaeusern zu.
 * Delegiert an allocateBatch() — Triage-First Water-Filling mit Tick-Caps.
 */
function assignPatients(state: SimState): void {
  const pending: Patient[] = [];
  const pendingIds = new Set<string>();
  for (const p of state.patients) {
    if (p.status !== 'onScene') continue;
    if (p.assignedHospitalId) continue;
    pending.push(p);
    pendingIds.add(p.id);
  }
  if (pending.length === 0) {
    // Alte unassigned-Eintraege behalten — sie werden im naechsten Tick mit
    // re-spawned oder bleiben wenn wirklich kein Haus verfuegbar ist.
    return;
  }

  const { results, unassignedIds, summary } = allocateBatch(state, pending);
  const resultById: Record<string, (typeof results)[number]> = {};
  for (const r of results) resultById[r.patientId] = r;

  for (const p of state.patients) {
    if (!pendingIds.has(p.id)) continue;
    const r = resultById[p.id];
    if (!r) continue;
    p.assignedHospitalId = r.hospitalId;
    p.status = 'transport';
    p.arrivedAt = state.simTime + r.etaMin;
  }

  // Unassigned-Liste: pending ohne Allocation-Result landen drin,
  // bereits vorhandene unassigned bleiben solange sie nicht jetzt allokiert.
  const stillUnassigned = new Set<string>(state.unassigned);
  for (const id of pendingIds) {
    if (resultById[id]) {
      stillUnassigned.delete(id);
    } else if (unassignedIds.includes(id)) {
      stillUnassigned.add(id);
    }
  }
  state.unassigned = Array.from(stillUnassigned);

  if (summary.byTriage.T1.assigned + summary.byTriage.T2.assigned + summary.byTriage.T3.assigned + summary.byTriage.T4.assigned > 0) {
    const total =
      summary.byTriage.T1.assigned +
      summary.byTriage.T2.assigned +
      summary.byTriage.T3.assigned +
      summary.byTriage.T4.assigned;
    const unAll =
      summary.byTriage.T1.unassigned +
      summary.byTriage.T2.unassigned +
      summary.byTriage.T3.unassigned +
      summary.byTriage.T4.unassigned;
    state.tickLog.push(
      `[alloc T+${state.simTime}min] ` +
        `T1:${summary.byTriage.T1.assigned} T2:${summary.byTriage.T2.assigned} ` +
        `T3:${summary.byTriage.T3.assigned} T4:${summary.byTriage.T4.assigned} ` +
        `→ ${summary.hospitalsTouched} Haeuser · cascade=${summary.cascadeUsed} ` +
        `unassigned=${unAll}/${total + unAll}`,
    );
    if (state.tickLog.length > 200) state.tickLog.splice(0, state.tickLog.length - 200);
  }
}

/** Transport -> inTreatment wenn arrivedAt erreicht; belegt Bett. */
function advanceTransport(state: SimState): void {
  for (const p of state.patients) {
    if (p.status !== 'transport') continue;
    if (p.arrivedAt == null || state.simTime < p.arrivedAt) continue;
    const pzc = PZC_BY_CODE[p.pzc];
    const hospital = p.assignedHospitalId
      ? state.hospitals[p.assignedHospitalId]
      : undefined;
    if (!pzc || !hospital) {
      p.status = 'deceased';
      continue;
    }

    // Versuche primaere Discipline, dann andere required (Fallback).
    const tryDisc = [pzc.primaryDiscipline, ...pzc.requiredDisciplines];
    let assigned = false;
    for (const d of tryDisc) {
      if (assignBed(hospital, d)) {
        assigned = true;
        p.status = 'inTreatment';
        p.dischargeAt = state.simTime + pzc.avgTreatmentMin;
        break;
      }
    }
    if (!assigned) {
      // Alles voll: re-retry naechsten Tick. Abbruch nach 300 min.
      if (state.simTime - (p.spawnedAt ?? state.simTime) > 300) {
        p.status = 'deceased';
      }
    }
  }
}

/** Behandlungen abgeschlossen -> discharge + Bett frei. */
function advanceTreatments(state: SimState): void {
  for (const p of state.patients) {
    if (p.status !== 'inTreatment') continue;
    if (p.dischargeAt == null || state.simTime < p.dischargeAt) continue;
    const pzc = PZC_BY_CODE[p.pzc];
    const hospital = p.assignedHospitalId
      ? state.hospitals[p.assignedHospitalId]
      : undefined;
    if (pzc && hospital) {
      freeBed(hospital, pzc.primaryDiscipline);
    }
    p.status = 'discharged';
  }
}

/** Fuehrt einen Tick aus (1 sim-Minute). Mutiert state. */
export function tick(state: SimState, rng: () => number): void {
  state.simTime += 1;
  spawnPatients(state, rng);
  advanceTransport(state);
  assignPatients(state);
  advanceTreatments(state);
  // Rolling occupancy snapshot alle 5 sim-min fuer Trend-Detection.
  if (state.simTime % 5 === 0) {
    const snap: OccupancySnapshot = {
      simTime: state.simTime,
      occupancy: {},
    };
    for (const h of Object.values(state.hospitals)) {
      let total = 0;
      let occ = 0;
      for (const cap of Object.values(h.disciplines)) {
        if (!cap) continue;
        total += cap.bedsTotal;
        occ += cap.bedsOccupied;
      }
      snap.occupancy[h.id] = total > 0 ? occ / total : 0;
    }
    state.occupancyHistory.push(snap);
    if (state.occupancyHistory.length > 12) {
      state.occupancyHistory.shift();
    }
  }
}

/** Faengt Szenario an. Seed als PRNG-Quelle. */
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

/** Debug: Kurzbericht vom Zustand. */
export function stateSummary(state: SimState): string {
  const byStatus: Record<string, number> = {};
  for (const p of state.patients) {
    byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
  }
  return `T+${state.simTime}min  patients=${state.patients.length}  ${Object.entries(
    byStatus,
  )
    .map(([k, v]) => `${k}:${v}`)
    .join(' ')}`;
}

