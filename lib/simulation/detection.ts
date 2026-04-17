/**
 * Rule-basierte Detection Engine (SPEC §5).
 * Jede Rule ist eine reine Funktion (state) => AlertCandidate[].
 * Die Dedup-Logik laeuft im Store: Alerts werden erst gemergt, wenn kein
 * gleicher scope+scopeRef+ruleName-Alert innerhalb der letzten 10 sim min
 * gefeuert wurde.
 */
import type { Discipline } from '@/lib/data/disciplines';
import { PZC_BY_CODE } from '@/lib/data/pzc';
import { haversineKm } from '@/lib/geo';
import type { SimState } from '@/lib/simulation/engine';
import type { Alert, Hospital } from '@/lib/types';

export type AlertCandidate = Omit<Alert, 'id' | 'firedAt'>;

function sumOccupancy(h: Hospital): number {
  let total = 0;
  let occ = 0;
  for (const cap of Object.values(h.disciplines)) {
    if (!cap) continue;
    total += cap.bedsTotal;
    occ += cap.bedsOccupied;
  }
  return total > 0 ? occ / total : 0;
}

function disciplineOccupancy(h: Hospital, d: Discipline): number {
  const cap = h.disciplines[d];
  if (!cap || cap.bedsTotal === 0) return 0;
  return cap.bedsOccupied / cap.bedsTotal;
}

function totalBeds(h: Hospital): number {
  let t = 0;
  for (const cap of Object.values(h.disciplines)) if (cap) t += cap.bedsTotal;
  return t;
}

function freeBeds(h: Hospital, d: Discipline): number {
  const cap = h.disciplines[d];
  if (!cap) return 0;
  return Math.max(0, cap.bedsTotal - cap.bedsOccupied);
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** 1. Jede Discipline mit occ>=85% → warn, >=95% → critical. */
function ruleHospitalSaturation(state: SimState): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const h of Object.values(state.hospitals)) {
    const max = sumOccupancy(h);
    if (max >= 0.95) {
      out.push({
        ruleName: 'HospitalSaturation',
        severity: 'critical',
        scope: 'hospital',
        scopeRef: h.id,
        title: `${h.name} am Limit`,
        detail: `Gesamtauslastung ${Math.round(max * 100)} %.`,
        linkedRecommendations: [],
      });
    } else if (max >= 0.85) {
      out.push({
        ruleName: 'HospitalSaturation',
        severity: 'warn',
        scope: 'hospital',
        scopeRef: h.id,
        title: `${h.name} stark ausgelastet`,
        detail: `Gesamtauslastung ${Math.round(max * 100)} %.`,
        linkedRecommendations: [],
      });
    }
  }
  return out;
}

/** 2. Wenn Auslastung in 30 min um >=15pp stieg → warn mit ETA-to-full. */
function ruleCapacityTrend(state: SimState): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  const past = state.occupancyHistory.find(
    (s) => s.simTime === state.simTime - 30,
  );
  if (!past) return out;
  for (const h of Object.values(state.hospitals)) {
    const now = sumOccupancy(h);
    const then = past.occupancy[h.id];
    if (then == null) continue;
    const delta = now - then;
    if (delta < 0.15) continue;
    const remaining = Math.max(0, 1 - now);
    const ratePerMin = delta / 30;
    const etaMin = ratePerMin > 0 ? Math.round(remaining / ratePerMin) : 999;
    out.push({
      ruleName: 'CapacityTrend',
      severity: 'warn',
      scope: 'hospital',
      scopeRef: h.id,
      title: `${h.name} faellt schnell voll`,
      detail: `Auslastung +${Math.round(delta * 100)}pp in 30 min, voll in ca. ${etaMin} min.`,
      linkedRecommendations: [],
    });
  }
  return out;
}

/** 3. Patient >20 min onScene ohne Zuweisung → critical. */
function ruleUnassignedPatients(state: SimState): AlertCandidate[] {
  let count = 0;
  for (const p of state.patients) {
    if (p.status !== 'onScene') continue;
    if (state.simTime - (p.spawnedAt ?? state.simTime) > 20) count++;
  }
  if (count === 0) return [];
  return [
    {
      ruleName: 'UnassignedPatients',
      severity: 'critical',
      scope: 'system',
      scopeRef: 'system',
      title: `${count} Patient(en) unvermittelt > 20 min`,
      detail: 'Kein Haus passt die Hard-Constraints oder alle Ziele sind voll.',
      linkedRecommendations: [],
    },
  ];
}

/**
 * 4. Alle Haeuser in 50 km um Incident; Gesamt-Auslastung in den
 * primaeren Disciplines: >=80 % → warn, >=90 % → critical.
 */
function ruleRegionalLoad(state: SimState): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  const hospitals = Object.values(state.hospitals);
  for (const inc of state.incidents) {
    const near = hospitals.filter(
      (h) => haversineKm(inc.location, h.coords) <= 50,
    );
    if (near.length === 0) continue;
    // Primaere Disciplines der Patienten dieses Incidents
    const discs = new Set<Discipline>();
    for (const [code] of Object.entries(inc.pzcDistribution)) {
      const pzc = PZC_BY_CODE[code];
      if (pzc) discs.add(pzc.primaryDiscipline);
    }
    let total = 0;
    let occ = 0;
    for (const h of near) {
      for (const d of discs) {
        const cap = h.disciplines[d];
        if (!cap) continue;
        total += cap.bedsTotal;
        occ += cap.bedsOccupied;
      }
    }
    if (total === 0) continue;
    const ratio = occ / total;
    if (ratio >= 0.9) {
      out.push({
        ruleName: 'RegionalLoad',
        severity: 'critical',
        scope: 'region',
        scopeRef: inc.id,
        title: `Region um ${inc.label.split(' ')[0]} kritisch`,
        detail: `${near.length} Haeuser in 50 km, Auslastung in Primaerfaechern ${Math.round(ratio * 100)} %.`,
        linkedRecommendations: [],
      });
    } else if (ratio >= 0.8) {
      out.push({
        ruleName: 'RegionalLoad',
        severity: 'warn',
        scope: 'region',
        scopeRef: inc.id,
        title: `Region um ${inc.label.split(' ')[0]} angespannt`,
        detail: `${near.length} Haeuser in 50 km, Auslastung in Primaerfaechern ${Math.round(ratio * 100)} %.`,
        linkedRecommendations: [],
      });
    }
  }
  return out;
}

/**
 * 5. Erwarteter Bedarf aus Incident.pzcDistribution > verfuegbare Kapazitaet
 * fuer eine Primaerdiscipline in Cutoff-Radius (150km) → critical.
 */
function ruleDisciplineMismatch(state: SimState): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  const hospitals = Object.values(state.hospitals);
  for (const inc of state.incidents) {
    const demand: Record<string, number> = {};
    for (const [code, n] of Object.entries(inc.pzcDistribution)) {
      const pzc = PZC_BY_CODE[code];
      if (!pzc) continue;
      demand[pzc.primaryDiscipline] = (demand[pzc.primaryDiscipline] ?? 0) + n;
    }
    const supply: Record<string, number> = {};
    for (const h of hospitals) {
      if (haversineKm(inc.location, h.coords) > 150) continue;
      for (const d of Object.keys(h.disciplines) as Discipline[]) {
        supply[d] = (supply[d] ?? 0) + freeBeds(h, d);
      }
    }
    for (const [disc, need] of Object.entries(demand)) {
      const avail = supply[disc] ?? 0;
      if (need > avail && need > 0) {
        out.push({
          ruleName: `DisciplineMismatch-${disc}`,
          severity: 'critical',
          scope: 'region',
          scopeRef: inc.id,
          title: `Kapazitaetsluecke: ${disc}`,
          detail: `Erwartet: ${need} Patienten · verfuegbar in 150 km: ${avail} Betten.`,
          linkedRecommendations: [],
        });
      }
    }
  }
  return out;
}

/** 6. Haus >=80 % und surgeCapacity>0 und !surgeActive → info. */
function ruleEscalationOpportunity(state: SimState): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const h of Object.values(state.hospitals)) {
    if (sumOccupancy(h) < 0.8) continue;
    // surge verfuegbar auf einer Discipline?
    let canSurge = false;
    for (const cap of Object.values(h.disciplines)) {
      if (!cap) continue;
      if (cap.surgeCapacity > 0 && !cap.surgeActive) {
        canSurge = true;
        break;
      }
    }
    if (!canSurge) continue;
    out.push({
      ruleName: 'EscalationOpportunity',
      severity: 'info',
      scope: 'hospital',
      scopeRef: h.id,
      title: `${h.name}: Surge verfuegbar`,
      detail: 'Surge-Kapazitaet kann aktiviert werden.',
      linkedRecommendations: [],
    });
  }
  return out;
}

export function detectAll(state: SimState): AlertCandidate[] {
  return [
    ...ruleHospitalSaturation(state),
    ...ruleCapacityTrend(state),
    ...ruleUnassignedPatients(state),
    ...ruleRegionalLoad(state),
    ...ruleDisciplineMismatch(state),
    ...ruleEscalationOpportunity(state),
  ];
}

/** Dedup-Key fuer eine Rule-Instanz. */
export function alertKey(a: AlertCandidate | Alert): string {
  return `${a.scope}|${a.scopeRef}|${a.ruleName}`;
}

// re-export helper fuer Store
export { disciplineOccupancy, freeBeds, sumOccupancy, totalBeds };
