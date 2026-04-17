/**
 * Globaler Sim-Store (Zustand). Enthaelt Clock, Hospitals (mutable),
 * Incidents, Patients. Engine tickt aus useEffect im HomePage.
 */
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

import { HOSPITALS } from '@/lib/data/hospitalsLoader';
import { PZC_BY_CODE } from '@/lib/data/pzc';
import type {
  Alert,
  Hospital,
  Incident,
  Recommendation,
  TriageCategory,
} from '@/lib/types';
import {
  seededRng,
  stateSummary,
  tick as engineTick,
  type SimState,
} from '@/lib/simulation/engine';
import {
  alertKey,
  detectAll,
  type AlertCandidate,
} from '@/lib/simulation/detection';
import {
  generateRecommendations,
  mergeRecommendations,
} from '@/lib/simulation/recommendations';
import {
  SCENARIOS_BY_ID,
  scenarioToIncident,
} from '@/lib/simulation/scenarios';

export interface Filters {
  /** Mindestens N freie Betten (gesamt). 0 = aus. */
  freeMin: number;
  /** Hoechstens N belegte Betten (gesamt). 0 = aus. */
  occupiedMax: number;
  /** Mindestens N Notfallbetten (statisch). 0 = aus. */
  emergencyMin: number;
  /** SK-Checkboxen - jede aktiv heisst: wird in Zaehlern/Halos beruecksichtigt. */
  sk: Record<Exclude<TriageCategory, 'T4'>, boolean>;
}

export const DEFAULT_FILTERS: Filters = {
  freeMin: 0,
  occupiedMax: 0,
  emergencyMin: 0,
  sk: { T1: true, T2: true, T3: true },
};

export type Selection =
  | { kind: 'hospital'; id: string }
  | { kind: 'incident'; id: string }
  | null;

interface Store extends SimState {
  // clock
  isPaused: boolean;
  speed: number;

  // filters
  filters: Filters;

  // detection
  alerts: Alert[];
  recommendations: Recommendation[];

  // UI selection (HospitalDetailPanel / IncidentPanel)
  selection: Selection;

  // rng shared across ticks (seeded per reset/launch)
  _rng: () => number;
  _seed: number;

  // actions
  togglePause: () => void;
  setSpeed: (speed: number) => void;
  stepForward: (minutes: number) => void;
  launchScenario: (scenarioId: string) => void;
  reset: () => void;
  runTick: () => void;
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  toggleSK: (sk: keyof Filters['sk']) => void;
  resetFilters: () => void;
  setSelection: (sel: Selection) => void;
  executeRecommendation: (rec: Recommendation) => void;
  escalateHospital: (hospitalId: string) => void;

  // derived: counters for UI
  patientsByStatus: () => Record<string, number>;
}

function cloneHospitals(): Record<string, Hospital> {
  const out: Record<string, Hospital> = {};
  for (const h of HOSPITALS.simulated) {
    out[h.id] = {
      ...h,
      disciplines: Object.fromEntries(
        Object.entries(h.disciplines).map(([k, v]) => [
          k,
          v ? { ...v } : v,
        ]),
      ) as Hospital['disciplines'],
      opSlots: { ...h.opSlots },
      address: { ...h.address },
    };
  }
  return out;
}

const INITIAL_SEED = 20260417;

function initialState(): SimState & { _rng: () => number; _seed: number } {
  const seed = INITIAL_SEED;
  return {
    simTime: 0,
    incidents: [] as Incident[],
    patients: [],
    hospitals: cloneHospitals(),
    childFlags: {},
    unassigned: [],
    tickLog: [],
    occupancyHistory: [],
    _rng: seededRng(seed),
    _seed: seed,
  };
}

/**
 * Mergt detektierte Alert-Kandidaten in die bestehende Alerts-Liste.
 * - Ein aktiver Alert mit gleichem scope+scopeRef+rule wird nicht erneut
 *   gefeuert, solange er noch nicht resolved ist.
 * - Wenn ein bestehender Alert nicht mehr in den Kandidaten auftaucht und
 *   noch nicht resolved ist, wird sein resolvedAt auf simTime gesetzt.
 * - Resolvierte Alerts werden 30 min nach Resolve gepurged.
 */
function mergeAlerts(
  existing: Alert[],
  candidates: AlertCandidate[],
  simTime: number,
): Alert[] {
  const byKey = new Map<string, Alert>();
  for (const a of existing) byKey.set(alertKey(a), a);

  const activeNow = new Set<string>();
  for (const cand of candidates) {
    const key = alertKey(cand);
    activeNow.add(key);
    const prev = byKey.get(key);
    if (prev && prev.resolvedAt == null) {
      // aktiv und nicht resolved -> Titel/Detail aktualisieren, aber firedAt halten
      prev.title = cand.title;
      prev.detail = cand.detail;
      prev.severity = cand.severity;
      continue;
    }
    // Neuer Alert (oder reaktiviert nach Resolve)
    byKey.set(key, {
      ...cand,
      id: `A-${key}-${simTime}`,
      firedAt: simTime,
    });
  }

  // Resolve: alles was aktuell nicht mehr in activeNow aber noch nicht resolved ist
  for (const [key, a] of byKey) {
    if (!activeNow.has(key) && a.resolvedAt == null) {
      a.resolvedAt = simTime;
    }
  }

  // Purge: resolvierte Alerts aelter als 30 sim-min weg
  return Array.from(byKey.values()).filter(
    (a) => a.resolvedAt == null || simTime - a.resolvedAt < 30,
  );
}

export const useSimStore = create<Store>()(
  subscribeWithSelector((set, get) => ({
    ...initialState(),
    isPaused: true,
    speed: 1,
    alerts: [],
    recommendations: [],
    selection: null,
    filters: { ...DEFAULT_FILTERS, sk: { ...DEFAULT_FILTERS.sk } },

    setSelection: (sel) => set({ selection: sel }),

    escalateHospital: (hospitalId) => {
      const s = get();
      const h = s.hospitals[hospitalId];
      if (!h) return;
      const order = ['normal', 'erhoeht', 'manv-1', 'manv-2', 'katastrophe'] as const;
      const idx = order.indexOf(h.escalationLevel);
      const next = order[Math.min(order.length - 1, idx + 1)];
      set({
        hospitals: {
          ...s.hospitals,
          [hospitalId]: { ...h, escalationLevel: next! },
        },
      });
    },

    executeRecommendation: (rec) => {
      const s = get();
      const newHospitals: Record<string, Hospital> = { ...s.hospitals };
      let newPatients = [...s.patients];

      switch (rec.action) {
        case 'activate-surge': {
          const h = newHospitals[rec.targetHospitalIds[0] ?? ''];
          if (h) {
            const newDiscs = { ...h.disciplines };
            for (const [d, cap] of Object.entries(newDiscs) as Array<
              [keyof typeof newDiscs, (typeof newDiscs)[keyof typeof newDiscs]]
            >) {
              if (!cap || cap.surgeActive || cap.surgeCapacity <= 0) continue;
              newDiscs[d] = {
                ...cap,
                surgeActive: true,
                bedsTotal: cap.bedsTotal + cap.surgeCapacity,
                surgeCapacity: 0,
              };
            }
            newHospitals[h.id] = { ...h, disciplines: newDiscs };
          }
          break;
        }
        case 'alert-adjacent': {
          for (const id of rec.targetHospitalIds) {
            const h = newHospitals[id];
            if (h && h.escalationLevel === 'normal') {
              newHospitals[id] = { ...h, escalationLevel: 'erhoeht' };
            }
          }
          break;
        }
        case 'reroute': {
          const [targetId, sourceId] = rec.targetHospitalIds;
          if (!targetId || !sourceId) break;
          newPatients = newPatients.map((p) => {
            if (p.assignedHospitalId !== sourceId) return p;
            if (p.status !== 'transport') return p;
            return {
              ...p,
              assignedHospitalId: targetId,
              arrivedAt: s.simTime + 15,
            };
          });
          break;
        }
        case 'transfer-stable': {
          const [sourceId] = rec.targetHospitalIds;
          if (!sourceId) break;
          const source = newHospitals[sourceId];
          if (!source) break;
          const newDiscs = {
            ...source.disciplines,
          } as typeof source.disciplines;
          let freed = 0;
          const maxFree = rec.expectedImpact.bedsGained ?? 3;
          newPatients = newPatients.map((p) => {
            if (freed >= maxFree) return p;
            if (p.assignedHospitalId !== sourceId) return p;
            if (p.status !== 'inTreatment') return p;
            const pzc = PZC_BY_CODE[p.pzc];
            if (!pzc || pzc.triage === 'T1') return p;
            const cap = newDiscs[pzc.primaryDiscipline];
            if (cap) {
              newDiscs[pzc.primaryDiscipline] = {
                ...cap,
                bedsOccupied: Math.max(0, cap.bedsOccupied - 1),
              };
            }
            freed += 1;
            return { ...p, status: 'discharged' as const };
          });
          newHospitals[sourceId] = { ...source, disciplines: newDiscs };
          break;
        }
        case 'activate-kv-notdienst': {
          const h = newHospitals[rec.targetHospitalIds[0] ?? ''];
          if (h) {
            const newDiscs = { ...h.disciplines };
            const notCap = newDiscs['notaufnahme'];
            if (notCap) {
              const free = rec.expectedImpact.bedsGained ?? 4;
              newDiscs['notaufnahme'] = {
                ...notCap,
                bedsOccupied: Math.max(0, notCap.bedsOccupied - free),
              };
              newHospitals[h.id] = { ...h, disciplines: newDiscs };
            }
          }
          break;
        }
        case 'request-cross-region': {
          // Informational only — no state mutation
          break;
        }
      }

      // Recommendation als ausgefuehrt markieren
      const newRecs = s.recommendations.map((r) =>
        r.id === rec.id ? { ...r, executable: false } : r,
      );
      set({
        hospitals: newHospitals,
        patients: newPatients,
        recommendations: newRecs,
      });
    },

    togglePause: () => set({ isPaused: !get().isPaused }),

    setFilter: (key, value) => set({ filters: { ...get().filters, [key]: value } }),

    toggleSK: (sk) => {
      const cur = get().filters.sk;
      set({
        filters: { ...get().filters, sk: { ...cur, [sk]: !cur[sk] } },
      });
    },

    resetFilters: () => set({
      filters: { ...DEFAULT_FILTERS, sk: { ...DEFAULT_FILTERS.sk } },
    }),

    setSpeed: (speed) => set({ speed: Math.max(0.5, Math.min(10, speed)) }),

    stepForward: (minutes) => {
      const s = get();
      const steps = Math.max(1, Math.round(minutes));
      const next: SimState = {
        simTime: s.simTime,
        incidents: s.incidents,
        patients: s.patients,
        hospitals: s.hospitals,
        childFlags: s.childFlags,
        unassigned: s.unassigned,
        tickLog: s.tickLog,
        occupancyHistory: s.occupancyHistory,
      };
      for (let i = 0; i < steps; i++) {
        engineTick(next, s._rng);
      }
      const newAlerts = mergeAlerts(s.alerts, detectAll(next), next.simTime);
      const newRecs = mergeRecommendations(
        s.recommendations,
        generateRecommendations(next, newAlerts),
        next.simTime,
      );
      set({
        simTime: next.simTime,
        patients: [...next.patients],
        incidents: [...next.incidents],
        hospitals: { ...next.hospitals },
        unassigned: [...next.unassigned],
        occupancyHistory: [...next.occupancyHistory],
        alerts: newAlerts,
        recommendations: newRecs,
      });
    },

    launchScenario: (scenarioId) => {
      const scenario = SCENARIOS_BY_ID[scenarioId];
      if (!scenario) return;
      const s = get();
      const inc = scenarioToIncident(scenario, s.simTime);
      set({
        incidents: [...s.incidents, inc],
        isPaused: false,
      });
      if (typeof window !== 'undefined') {
        console.log(`[sim] launched: ${inc.label} @T+${s.simTime}min`);
      }
    },

    reset: () => {
      const fresh = initialState();
      set({
        simTime: fresh.simTime,
        incidents: fresh.incidents,
        patients: fresh.patients,
        hospitals: fresh.hospitals,
        childFlags: fresh.childFlags,
        unassigned: fresh.unassigned,
        tickLog: fresh.tickLog,
        occupancyHistory: fresh.occupancyHistory,
        alerts: [],
        recommendations: [],
        selection: null,
        _rng: fresh._rng,
        _seed: fresh._seed,
        isPaused: true,
      });
    },

    runTick: () => {
      const s = get();
      if (s.isPaused) return;
      const next: SimState = {
        simTime: s.simTime,
        incidents: s.incidents,
        patients: s.patients,
        hospitals: s.hospitals,
        childFlags: s.childFlags,
        unassigned: s.unassigned,
        tickLog: s.tickLog,
        occupancyHistory: s.occupancyHistory,
      };
      engineTick(next, s._rng);
      if (next.simTime % 10 === 0) {
        console.log(`[sim] ${stateSummary(next)}`);
      }
      const newAlerts = mergeAlerts(s.alerts, detectAll(next), next.simTime);
      const newRecs = mergeRecommendations(
        s.recommendations,
        generateRecommendations(next, newAlerts),
        next.simTime,
      );
      set({
        simTime: next.simTime,
        patients: [...next.patients],
        unassigned: [...next.unassigned],
        hospitals: { ...next.hospitals },
        incidents: [...next.incidents],
        occupancyHistory: [...next.occupancyHistory],
        alerts: newAlerts,
        recommendations: newRecs,
      });
    },

    patientsByStatus: () => {
      const counts: Record<string, number> = {
        onScene: 0,
        transport: 0,
        inTreatment: 0,
        discharged: 0,
        deceased: 0,
      };
      for (const p of get().patients) {
        counts[p.status] = (counts[p.status] ?? 0) + 1;
      }
      return counts;
    },
  })),
);
