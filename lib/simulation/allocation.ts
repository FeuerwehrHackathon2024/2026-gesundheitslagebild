/**
 * Leitstellen-Allokator.
 *
 * Statt jeden Patienten einzeln zu routen (Score-Argmax), verteilt diese
 * Batch-Funktion alle noch nicht zugewiesenen Patienten eines Ticks wie
 * eine Rettungsleitstelle:
 *
 * 1. Triage-First: T1 → T2 → T3 → T4.
 * 2. Water-Filling mit harter Pro-Tick-Quote pro Haus (SPEC §6 /
 *    User-Entscheidung): T1=3, T2=5, T3=8, T4=10 Patienten pro Haus
 *    pro Sim-Minute. Kein Haus wird ueberladen.
 * 3. Cascade bei Erschoepfung: Distanz-Cutoff verdoppeln, Quote verdoppeln,
 *    effLoad bis 1.0 zulassen.
 *
 * Rein funktional — gleiche Eingabe + Seed liefert identische Zuweisung.
 */
import { PZC_BY_CODE } from '@/lib/data/pzc';
import type { Hospital, Patient, TriageCategory } from '@/lib/types';
import type { SimState } from '@/lib/simulation/engine';
import {
  DISTANCE_CUTOFF_KM,
  effectiveLoad,
  etaMinutes,
  findCandidates,
  freeBedFractionMin,
  freeBedsPrimary,
  jitterFromId,
  resolveRequiredDisciplines,
} from '@/lib/simulation/router';

export interface AllocationResult {
  patientId: string;
  hospitalId: string;
  distanceKm: number;
  etaMin: number;
}

export interface AllocationSummary {
  byTriage: Record<TriageCategory, { assigned: number; unassigned: number }>;
  cascadeUsed: CascadeStage;
  hospitalsTouched: number;
}

/** Cascade-Stufen bei Erschoepfung der ersten Suche. */
export type CascadeStage =
  | 'none'
  | 'A-distance'
  | 'B-quota'
  | 'C-load'
  | 'D-surge';

/** Default-Tick-Caps per Triage. */
const BASE_QUOTA: Record<TriageCategory, number> = {
  T1: 3,
  T2: 5,
  T3: 8,
  T4: 10,
};

/** Cascade-Multiplikator je Stufe. */
function quotaForStage(stage: CascadeStage): number {
  if (stage === 'D-surge') return 999; // effektiv unbegrenzt
  if (stage === 'B-quota' || stage === 'C-load') return 2;
  return 1;
}

/** Distanz-Cutoff fuer Stufe. */
function cutoffForStage(triage: TriageCategory, stage: CascadeStage): number {
  if (stage === 'D-surge') return 900; // ganz Deutschland
  const base = DISTANCE_CUTOFF_KM[triage];
  if (stage === 'A-distance' || stage === 'B-quota' || stage === 'C-load') {
    return Math.min(base * 2, 300);
  }
  return base;
}

/** effLoad-Obergrenze je Stufe. */
function loadCeilForStage(stage: CascadeStage): number {
  if (stage === 'D-surge') return Infinity;
  return stage === 'C-load' ? 1.0 : 0.99;
}

/** In Cascade D: auch Haeuser ohne freies Bett akzeptieren (Ueberbelegung). */
function allowFullForStage(stage: CascadeStage): boolean {
  return stage === 'D-surge';
}

const STAGES: CascadeStage[] = [
  'none',
  'A-distance',
  'B-quota',
  'C-load',
  'D-surge',
];

/**
 * Prioritaet eines Kandidaten fuer einen Patienten.
 * Reihenfolge wird absichtlich so gewichtet, dass:
 * - viele freie Plaetze (remainingQuota) das staerkste Signal sind
 * - Naehe als Tie-Modulator nachgeordnet ist
 * - hohe effektive Last abstrafft
 */
function candidatePriority(
  remainingQuota: number,
  km: number,
  maxKm: number,
  effLoad: number,
  freeFrac: number,
): number {
  return (
    remainingQuota * 1000 +
    (1 - km / Math.max(1, maxKm)) * 100 +
    freeFrac * 50 -
    effLoad * effLoad * 80
  );
}

/** Hauptfunktion. */
export function allocateBatch(
  state: SimState,
  pending: Patient[],
): { results: AllocationResult[]; unassignedIds: string[]; summary: AllocationSummary } {
  const hospitals = Object.values(state.hospitals);

  // In-Transit-Initialbelegung aus bereits existierenden Patienten.
  // Wird waehrend der Allokation bei jeder Zuweisung inkrementiert.
  const inTransit: Record<string, number> = {};
  for (const p of state.patients) {
    if (!p.assignedHospitalId) continue;
    if (p.status !== 'transport' && p.status !== 'inTreatment') continue;
    inTransit[p.assignedHospitalId] = (inTransit[p.assignedHospitalId] ?? 0) + 1;
  }

  // Triage-Buckets
  const buckets: Record<TriageCategory, Patient[]> = {
    T1: [],
    T2: [],
    T3: [],
    T4: [],
  };
  for (const p of pending) {
    const pzc = PZC_BY_CODE[p.pzc];
    if (!pzc) continue;
    buckets[pzc.triage].push(p);
  }
  // Stabil sortieren: aelter zuerst, tiebreak via ID-Jitter
  for (const t of Object.keys(buckets) as TriageCategory[]) {
    buckets[t].sort((a, b) => {
      if (a.spawnedAt !== b.spawnedAt) return a.spawnedAt - b.spawnedAt;
      return jitterFromId(a.id) - jitterFromId(b.id);
    });
  }

  // Remaining-Quote pro Haus: laeuft ueber alle Triage-Klassen gemeinsam.
  const remaining: Record<string, number> = {};
  for (const h of hospitals) {
    if (h.excludedFromAllocation) continue;
    remaining[h.id] = 0; // wird pro Triage nachgefuellt (min mit Rest-Cap)
  }

  const results: AllocationResult[] = [];
  const unassignedIds: string[] = [];
  const touched = new Set<string>();
  const summary: AllocationSummary = {
    byTriage: {
      T1: { assigned: 0, unassigned: 0 },
      T2: { assigned: 0, unassigned: 0 },
      T3: { assigned: 0, unassigned: 0 },
      T4: { assigned: 0, unassigned: 0 },
    },
    cascadeUsed: 'none',
    hospitalsTouched: 0,
  };

  for (const triage of ['T1', 'T2', 'T3', 'T4'] as TriageCategory[]) {
    const list = buckets[triage];
    if (list.length === 0) continue;

    // Basis-Quote pro Haus fuer diese Triage (zum vorhandenen Rest addieren).
    for (const h of hospitals) {
      if (h.excludedFromAllocation) continue;
      const primary = PZC_BY_CODE[list[0]!.pzc]?.primaryDiscipline;
      const bedLimit = primary ? freeBedsPrimary(h, primary) : 0;
      const addon = Math.max(0, Math.min(BASE_QUOTA[triage], bedLimit));
      remaining[h.id] = (remaining[h.id] ?? 0) + addon;
    }

    for (const patient of list) {
      let placed = false;
      for (const stage of STAGES) {
        const result = tryPlace(
          patient,
          hospitals,
          state,
          inTransit,
          remaining,
          triage,
          stage,
        );
        if (result) {
          results.push(result);
          inTransit[result.hospitalId] =
            (inTransit[result.hospitalId] ?? 0) + 1;
          remaining[result.hospitalId] = Math.max(
            0,
            (remaining[result.hospitalId] ?? 0) - 1,
          );
          touched.add(result.hospitalId);
          summary.byTriage[triage].assigned += 1;
          placed = true;
          if (stage !== 'none' && summary.cascadeUsed === 'none') {
            summary.cascadeUsed = stage;
          } else if (
            STAGES.indexOf(stage) > STAGES.indexOf(summary.cascadeUsed)
          ) {
            summary.cascadeUsed = stage;
          }
          break;
        }
      }
      if (!placed) {
        unassignedIds.push(patient.id);
        summary.byTriage[triage].unassigned += 1;
      }
    }
  }

  summary.hospitalsTouched = touched.size;
  return { results, unassignedIds, summary };
}

function tryPlace(
  patient: Patient,
  hospitals: Hospital[],
  state: SimState,
  inTransit: Record<string, number>,
  remaining: Record<string, number>,
  triage: TriageCategory,
  stage: CascadeStage,
): AllocationResult | null {
  const pzc = PZC_BY_CODE[patient.pzc];
  if (!pzc) return null;

  const inc = state.incidents.find((i) => i.id === patient.incidentId);
  if (!inc) return null;

  const cutoff = cutoffForStage(triage, stage);
  const loadCeil = loadCeilForStage(stage);
  const quotaMult = quotaForStage(stage);
  const allowFull = allowFullForStage(stage);

  // Cascade-Stufe B/C/D: Quote-Cap hochdrehen. In D: effektiv unbegrenzt,
  // Bett-Limit wird ignoriert (Surge-Ueberbelegung).
  if (quotaMult > 1) {
    for (const h of hospitals) {
      if (h.excludedFromAllocation) continue;
      const cap = BASE_QUOTA[triage] * quotaMult;
      if (stage === 'D-surge') {
        remaining[h.id] = cap; // kein Bett-Limit mehr
      } else {
        const primary = pzc.primaryDiscipline;
        const bedLimit = freeBedsPrimary(h, primary);
        remaining[h.id] = Math.min(
          Math.max(remaining[h.id] ?? 0, cap),
          bedLimit,
        );
      }
    }
  }

  const candidates = findCandidates({
    from: inc.location,
    pzc,
    hospitals,
    isChild: patient.isChild,
    distanceCutoffKm: cutoff,
    allowFull,
  });
  if (candidates.length === 0) return null;

  const required = resolveRequiredDisciplines(pzc, patient.isChild);
  const maxKm = Math.max(...candidates.map((c) => c.km), 1);
  const jitter = jitterFromId(patient.id);

  let bestPriority = -Infinity;
  let best: AllocationResult | null = null;

  for (const { h, km } of candidates) {
    const quota = remaining[h.id] ?? 0;
    if (quota <= 0) continue;
    const effLoad = effectiveLoad(h, inTransit[h.id] ?? 0);
    if (effLoad >= loadCeil) continue;
    const freeFrac = freeBedFractionMin(h, required);
    const priority =
      candidatePriority(quota, km, maxKm, effLoad, freeFrac) * (1 + jitter);
    if (priority > bestPriority) {
      bestPriority = priority;
      best = {
        patientId: patient.id,
        hospitalId: h.id,
        distanceKm: km,
        etaMin: etaMinutes(km, pzc),
      };
    }
  }

  return best;
}

