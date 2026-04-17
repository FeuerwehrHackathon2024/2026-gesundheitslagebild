/**
 * Patient-Router nach SPEC §4.3.
 *
 * Die schwere Verteil-Logik sitzt in `lib/simulation/allocation.ts`. Dieser
 * Router wird nur noch fuer Ein-Patient-Pfade genutzt (z. B. Reroute-
 * Recommendation). Die Konstanten (Distanz-Cutoffs, Stufe-Ordnung) und
 * Helfer (findCandidates, scoreCandidate, effectiveLoad, jitterFromId)
 * werden re-exportiert, damit der Allokator sie wiederverwendet.
 */
import type { Discipline } from '@/lib/data/disciplines';
import { haversineKm } from '@/lib/geo';
import type { Hospital, PZC, TriageCategory, Versorgungsstufe } from '@/lib/types';

export const STUFE_ORDER: Versorgungsstufe[] = [
  'grund',
  'regel',
  'schwerpunkt',
  'maximal',
];

export function stufeIndex(s: Versorgungsstufe): number {
  return STUFE_ORDER.indexOf(s);
}

/** Hartes Distanz-Cutoff je Triage-Kategorie (SPEC §4.3). */
export const DISTANCE_CUTOFF_KM: Record<TriageCategory, number> = {
  T1: 150,
  T2: 80,
  T3: 40,
  T4: 20,
};

export function hospitalHasFreeBed(
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

export function effectiveLoad(h: Hospital, inTransit: number): number {
  let total = 0;
  let occ = 0;
  for (const cap of Object.values(h.disciplines)) {
    if (!cap) continue;
    total += cap.bedsTotal;
    occ += cap.bedsOccupied;
  }
  occ += inTransit;
  return total > 0 ? Math.min(1, occ / total) : 0;
}

/**
 * Freies Bett-Anteil auf der engsten required Discipline (Flaschenhals).
 */
export function freeBedFractionMin(
  h: Hospital,
  disciplines: Discipline[],
): number {
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

/** Freie Betten (absolut) in der Primaerdiscipline. */
export function freeBedsPrimary(h: Hospital, primary: Discipline): number {
  const cap = h.disciplines[primary];
  if (!cap) return 0;
  return Math.max(0, cap.bedsTotal - cap.bedsOccupied);
}

/**
 * Deterministischer Jitter (+/- 1.5 %) aus String-Hash.
 * Bricht Monopol-Bildung bei sehr nahen Score-Ergebnissen, bleibt
 * reproduzierbar (gleicher Seed -> gleiche Ergebnisse).
 */
export function jitterFromId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const norm = ((h >>> 0) / 0xffffffff) * 2 - 1;
  return norm * 0.015;
}

export interface Candidate {
  h: Hospital;
  km: number;
}

export interface FindCandidatesOptions {
  from: [number, number];
  pzc: PZC;
  hospitals: Hospital[];
  isChild?: boolean;
  /** Ueberschreibt das Default-Cutoff fuer Cascade-Stufen im Allokator. */
  distanceCutoffKm?: number;
  /**
   * Erlaubt Kandidaten ohne freies Bett in required-Disciplines.
   * Wird vom Allokator in Cascade-Stufe D ("surge", Flur-Patienten) gesetzt.
   * Discipline-Abdeckung, Stufe, Burn-Center bleiben hart.
   */
  allowFull?: boolean;
}

/**
 * Pruefen der Hard-Constraints (SPEC §4.3) und Distanz-Cutoff.
 * Liefert alle Kandidaten-Haeuser plus Distanz.
 */
export function findCandidates(opts: FindCandidatesOptions): Candidate[] {
  const { from, pzc, hospitals, isChild = false, allowFull = false } = opts;

  const required: Discipline[] = [...pzc.requiredDisciplines];
  if (isChild && !required.includes('paediatrie')) {
    required.unshift('paediatrie');
  }

  let minStufe = pzc.minVersorgungsstufe;
  if (isChild) {
    const idx = Math.min(STUFE_ORDER.length - 1, stufeIndex(minStufe) + 1);
    minStufe = STUFE_ORDER[idx] ?? minStufe;
  }

  const cutoff = opts.distanceCutoffKm ?? DISTANCE_CUTOFF_KM[pzc.triage];

  const out: Candidate[] = [];
  for (const h of hospitals) {
    if (h.excludedFromAllocation) continue;
    if (h.escalationLevel === 'katastrophe') continue;

    // Discipline-Abdeckung
    const offersAll = required.every((d) => h.disciplines[d] !== undefined);
    if (!offersAll) continue;

    // Stufe
    if (stufeIndex(h.versorgungsstufe) < stufeIndex(minStufe)) continue;

    // Freies Bett in einer required Discipline — bei allowFull uebersprungen
    if (!allowFull && !hospitalHasFreeBed(h, required)) continue;

    // Burn-Center-Anforderung
    if (pzc.requiresBurnCenter && !h.disciplines['verbrennung']) continue;

    const km = haversineKm(from, h.coords);
    if (km > cutoff) continue;

    out.push({ h, km });
  }
  return out;
}

/**
 * Extrahiert die required-Discipline-Liste fuer einen PZC (inkl. Kind).
 * Wird vom Allokator gebraucht fuer Kapazitaets-Rechnungen.
 */
export function resolveRequiredDisciplines(
  pzc: PZC,
  isChild: boolean,
): Discipline[] {
  const required: Discipline[] = [...pzc.requiredDisciplines];
  if (isChild && !required.includes('paediatrie')) {
    required.unshift('paediatrie');
  }
  return required;
}

export interface RouteResult {
  hospital: Hospital;
  distanceKm: number;
  score: number;
}

export interface RouteOptions extends FindCandidatesOptions {
  patientId?: string;
  inTransit?: Record<string, number>;
}

/**
 * Ein-Patient-Router. Wird nur noch fuer Reroute-Recommendations genutzt.
 * Die MANV-Batch-Verteilung laeuft ueber `allocateBatch` in allocation.ts.
 */
export function routePatient(opts: RouteOptions): RouteResult | null {
  const { pzc, inTransit = {}, patientId, isChild = false } = opts;
  const candidates = findCandidates(opts);
  if (candidates.length === 0) return null;

  const required = resolveRequiredDisciplines(pzc, isChild);
  const maxKm = Math.max(...candidates.map((c) => c.km), 1);
  const idealStufe = stufeIndex(pzc.minVersorgungsstufe);
  const jitter = patientId ? jitterFromId(patientId) : 0;

  let best: RouteResult | null = null;
  for (const { h, km } of candidates) {
    const transit = inTransit[h.id] ?? 0;
    const effLoad = effectiveLoad(h, transit);
    if (effLoad >= 0.99) continue;

    const wDistance = 0.2 * (1 - km / maxKm);
    const wCapacity = 0.3 * freeBedFractionMin(h, required);
    const overshoot = Math.max(0, stufeIndex(h.versorgungsstufe) - idealStufe);
    const wStufe = 0.1 * (1 / (1 + overshoot));
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
