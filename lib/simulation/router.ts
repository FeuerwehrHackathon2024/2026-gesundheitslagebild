/**
 * Patient-Router nach SPEC §4.3.
 * Hard constraints filtern, Score waehlt das beste Haus aus.
 */
import type { Discipline } from '@/lib/data/disciplines';
import { haversineKm } from '@/lib/geo';
import type { Hospital, PZC, TriageCategory, Versorgungsstufe } from '@/lib/types';

const STUFE_ORDER: Versorgungsstufe[] = [
  'grund',
  'regel',
  'schwerpunkt',
  'maximal',
];

function stufeIndex(s: Versorgungsstufe): number {
  return STUFE_ORDER.indexOf(s);
}

/** Hartes Distanz-Cutoff je Triage-Kategorie (SPEC §4.3). */
const DISTANCE_CUTOFF_KM: Record<TriageCategory, number> = {
  T1: 150,
  T2: 80,
  T3: 40,
  T4: 20,
};

function hospitalHasFreeBed(
  h: Hospital,
  disciplines: Discipline[],
): boolean {
  for (const d of disciplines) {
    const cap = h.disciplines[d];
    if (!cap) continue;
    if (cap.bedsTotal - cap.bedsOccupied > 0) return true;
  }
  return false;
}

function overallLoad(h: Hospital, inTransit: number): number {
  let total = 0;
  let occ = 0;
  for (const cap of Object.values(h.disciplines)) {
    if (!cap) continue;
    total += cap.bedsTotal;
    occ += cap.bedsOccupied;
  }
  // Patienten, die bereits zugewiesen aber noch nicht angekommen sind,
  // zaehlen als effektive Belegung. Das spreizt den Zulauf.
  occ += inTransit;
  return total > 0 ? Math.min(1, occ / total) : 0;
}

/**
 * Freies Bett-Anteil auf der engsten required Discipline (Flaschenhals).
 */
function freeBedFractionMin(h: Hospital, disciplines: Discipline[]): number {
  let min = 1;
  for (const d of disciplines) {
    const cap = h.disciplines[d];
    if (!cap || cap.bedsTotal === 0) continue;
    const free = Math.max(0, cap.bedsTotal - cap.bedsOccupied);
    const frac = free / cap.bedsTotal;
    if (frac < min) min = frac;
  }
  return min;
}

/**
 * Deterministischer Jitter (+/- 1.5 %) aus Patient-ID-Hash.
 * Bricht Monopol-Bildung bei sehr nahen Score-Ergebnissen, bleibt
 * reproduzierbar (gleicher Seed -> gleiche Ergebnisse).
 */
function jitterFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const norm = ((h >>> 0) / 0xffffffff) * 2 - 1; // in [-1, 1]
  return norm * 0.015;
}

export interface RouteResult {
  hospital: Hospital;
  distanceKm: number;
  score: number;
}

export interface RouteOptions {
  /**
   * Incident-Location fuer Distanz-Berechnung (Patientenstandort naeherungsweise).
   */
  from: [number, number];
  /** PZC des Patienten. */
  pzc: PZC;
  /** Alle simulierten Krankenhaeuser. */
  hospitals: Hospital[];
  /** Wenn Kind: paediatrie in required + stufe +1. */
  isChild?: boolean;
  /** Patient-ID fuer deterministischen Score-Jitter. */
  patientId?: string;
  /** Pro Krankenhaus: Patienten in transport/inTreatment = effektive Last. */
  inTransit?: Record<string, number>;
}

export function routePatient(opts: RouteOptions): RouteResult | null {
  const {
    from,
    pzc,
    hospitals,
    isChild = false,
    patientId,
    inTransit = {},
  } = opts;

  const required: Discipline[] = [...pzc.requiredDisciplines];
  if (isChild && !required.includes('paediatrie')) {
    required.unshift('paediatrie');
  }

  let minStufe = pzc.minVersorgungsstufe;
  if (isChild) {
    const idx = Math.min(STUFE_ORDER.length - 1, stufeIndex(minStufe) + 1);
    minStufe = STUFE_ORDER[idx] ?? minStufe;
  }

  const cutoff = DISTANCE_CUTOFF_KM[pzc.triage];

  // Hard-Constraint-Filter
  type Candidate = { h: Hospital; km: number };
  const candidates: Candidate[] = [];
  for (const h of hospitals) {
    // Discipline-Abdeckung
    const offersAll = required.every((d) => h.disciplines[d] !== undefined);
    if (!offersAll) continue;

    // Stufe
    if (stufeIndex(h.versorgungsstufe) < stufeIndex(minStufe)) continue;

    // Freies Bett in einer required Discipline
    if (!hospitalHasFreeBed(h, required)) continue;

    // Burn-Center-Anforderung
    if (pzc.requiresBurnCenter && !h.disciplines['verbrennung']) continue;

    const km = haversineKm(from, h.coords);
    if (km > cutoff) continue;

    candidates.push({ h, km });
  }

  if (candidates.length === 0) return null;

  // Score — Gewichte auf gleichmaessigere Verteilung ausgelegt:
  // Distanz weniger dominant, Lastpenalty deutlich staerker.
  const maxKm = Math.max(...candidates.map((c) => c.km), 1);
  const idealStufe = stufeIndex(pzc.minVersorgungsstufe);
  const jitter = patientId ? jitterFromId(patientId) : 0;

  let best: RouteResult | null = null;
  for (const { h, km } of candidates) {
    const transit = inTransit[h.id] ?? 0;
    const effLoad = overallLoad(h, transit);
    // Haeuser mit >=95 % effektiver Last grundsaetzlich meiden.
    if (effLoad >= 0.99) continue;

    const wDistance = 0.2 * (1 - km / maxKm);
    const wCapacity = 0.3 * freeBedFractionMin(h, required);
    const overshoot = Math.max(0, stufeIndex(h.versorgungsstufe) - idealStufe);
    const wStufe = 0.1 * (1 / (1 + overshoot));
    // Quadratischer Load-Penalty: Haeuser nahe am Limit werden stark abgestraft.
    const wLoad = 0.6 * effLoad * effLoad;
    const raw = wDistance + wCapacity + wStufe - wLoad;
    const score = raw * (1 + jitter);

    if (!best || score > best.score) {
      best = { hospital: h, distanceKm: km, score };
    }
  }

  return best;
}

/** ETA in Minuten: 60 km/h fix + Stabilisierungszeit (SPEC §4.3). */
export function etaMinutes(distanceKm: number, pzc: PZC): number {
  const drive = (distanceKm / 60) * 60;
  return Math.round(drive + pzc.stabilizationMin);
}
