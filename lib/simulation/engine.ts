/**
 * Simulation-Engine per SPEC §4.
 * Tick-basiert, pure-ish: nimmt SimState rein, mutiert und gibt neuen zurueck.
 * Spawn-Curves, Transport, Zuweisung, Behandlung, Entlassung.
 */
import type { Discipline } from '@/lib/data/disciplines';
import { PZC_BY_CODE } from '@/lib/data/pzc';
import { haversineKm } from '@/lib/geo';
import { etaMinutes, routePatient } from '@/lib/simulation/router';
import type { Hospital, Incident, Patient } from '@/lib/types';

export interface SimState {
  simTime: number; // Minuten seit T0
  incidents: Incident[];
  patients: Patient[];
  hospitals: Record<string, Hospital>;
  childFlags: Record<string, boolean>; // patient.id -> isChild (cache)
  unassigned: string[]; // patient-ids ohne Zuweisung
  tickLog: string[];
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

function assignBed(h: Hospital, d: Discipline): boolean {
  const cap = h.disciplines[d];
  if (!cap) return false;
  if (cap.bedsOccupied >= cap.bedsTotal) return false;
  cap.bedsOccupied += 1;
  return true;
}

function freeBed(h: Hospital, d: Discipline): void {
  const cap = h.disciplines[d];
  if (!cap) return;
  cap.bedsOccupied = Math.max(0, cap.bedsOccupied - 1);
}

/** MANV-Reserve fuer einen zugewiesenen Patienten aufbauen. */
function reserveBed(h: Hospital, d: Discipline): void {
  const cap = h.disciplines[d];
  if (!cap) return;
  cap.bedsReservedMANV += 1;
}

/** Reservierung zuruecknehmen (Patient kommt an oder storniert). */
function releaseReservation(h: Hospital, d: Discipline): void {
  const cap = h.disciplines[d];
  if (!cap) return;
  cap.bedsReservedMANV = Math.max(0, cap.bedsReservedMANV - 1);
}

/** Weist unassigned onScene-Patienten Krankenhaeuser zu. */
function assignPatients(state: SimState): void {
  const hospitals = Object.values(state.hospitals);
  for (const p of state.patients) {
    if (p.status !== 'onScene') continue;
    if (p.assignedHospitalId) continue;

    const pzc = PZC_BY_CODE[p.pzc];
    if (!pzc) continue;

    const inc = state.incidents.find((i) => i.id === p.incidentId);
    if (!inc) continue;

    const res = routePatient({
      from: inc.location,
      pzc,
      hospitals,
      isChild: p.isChild,
      patientId: p.id,
    });
    if (!res) {
      if (!state.unassigned.includes(p.id)) state.unassigned.push(p.id);
      continue;
    }

    // Bett auf der Primaerdiscipline reservieren (bleibt bis zur Ankunft).
    reserveBed(res.hospital, pzc.primaryDiscipline);
    p.reservedDiscipline = pzc.primaryDiscipline;

    p.assignedHospitalId = res.hospital.id;
    p.status = 'transport';
    p.arrivedAt = state.simTime + etaMinutes(res.distanceKm, pzc);
    // aus unassigned austragen
    state.unassigned = state.unassigned.filter((x) => x !== p.id);
  }
}

/** Transport -> inTreatment wenn arrivedAt erreicht; Reserve -> Belegung. */
function advanceTransport(state: SimState): void {
  for (const p of state.patients) {
    if (p.status !== 'transport') continue;
    if (p.arrivedAt == null || state.simTime < p.arrivedAt) continue;
    const pzc = PZC_BY_CODE[p.pzc];
    const hospital = p.assignedHospitalId
      ? state.hospitals[p.assignedHospitalId]
      : undefined;
    if (!pzc || !hospital) {
      if (hospital && p.reservedDiscipline) {
        releaseReservation(hospital, p.reservedDiscipline);
      }
      p.status = 'deceased';
      continue;
    }

    // Zuerst die Reservierung aufloesen, dann Bett belegen.
    if (p.reservedDiscipline) {
      releaseReservation(hospital, p.reservedDiscipline);
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
      // Alles voll: Patient verharrt in transport (re-retry naechsten Tick).
      // Reserve wieder aufbauen, damit beim naechsten Versuch nicht doppelt belegt wird.
      if (p.reservedDiscipline) {
        reserveBed(hospital, p.reservedDiscipline);
      }
      // Abbruch-Kriterium gegen Endlosschleife: nach 300 min verstorben.
      if (state.simTime - (p.spawnedAt ?? state.simTime) > 300) {
        if (p.reservedDiscipline) {
          releaseReservation(hospital, p.reservedDiscipline);
        }
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

