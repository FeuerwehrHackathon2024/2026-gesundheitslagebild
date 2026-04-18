// System-aggregierte Empfehlungen.
//
// Neu-Entwurf: Statt pro-Klinik-Alert eine Rec zu generieren, analysieren wir
// den Gesamt-Systemzustand und liefern 4-8 aggregierte Maßnahmen mit
// spuerbarem Impact (mehrere Ziele pro Rec, Impact-Chips zeigen reale
// System-Effekte wie "+140 Betten in 6 Häusern").

import type {
  Hospital,
  MeasureAction,
  Recommendation,
  ResourceType,
  SimState,
} from '@/lib/types';
import { RESOURCE_TYPES, RESOURCE_DISPLAY_LONG } from '@/lib/data/resources';
import { effectiveTotal } from './router';
import { haversine } from '@/lib/geo';
import { RESOURCE_THRESHOLDS } from './detection';

const TITLE: Record<MeasureAction, string> = {
  'activate-surge': 'Surge-Welle aktivieren',
  'reroute-manv': 'MANV-Zustrom umleiten',
  'relocate-stable-batch': 'Stabile Patienten verlegen',
  'prepare-reception': 'Intake vorbereiten',
  'staff-callup': 'Personal-Mobilisierung',
  'cancel-elective': 'Elektivbetrieb regional stoppen',
  'divert-normal-admissions': 'Normal-Aufnahmen umleiten',
  'activate-reserve-hospital': 'Reserveklinik aktivieren',
  'alert-adjacent': 'Umliegende Haeuser vorwarnen',
  'request-cross-region': 'Ueberregionale Unterstuetzung',
};

const EFFORT: Record<MeasureAction, 'low' | 'medium' | 'high'> = {
  'activate-surge': 'low',
  'reroute-manv': 'low',
  'relocate-stable-batch': 'medium',
  'prepare-reception': 'low',
  'staff-callup': 'medium',
  'cancel-elective': 'medium',
  'divert-normal-admissions': 'low',
  'activate-reserve-hospital': 'high',
  'alert-adjacent': 'low',
  'request-cross-region': 'high',
};

// Max. Ziel-Kliniken pro aggregierter Rec. Hält UI lesbar.
const MAX_TARGETS_PER_REC = 8;

function ratioOf(h: Hospital, r: ResourceType): number {
  const cap = h.capacity[r];
  const eff = effectiveTotal(cap);
  return eff === 0 ? 0 : cap.occupied / eff;
}

function overallLoad(h: Hospital): number {
  let tot = 0,
    occ = 0;
  for (const r of RESOURCE_TYPES) {
    tot += effectiveTotal(h.capacity[r]);
    occ += h.capacity[r].occupied;
  }
  return tot === 0 ? 0 : occ / tot;
}

function sumSurgeReserve(h: Hospital): number {
  let s = 0;
  for (const r of RESOURCE_TYPES) {
    const c = h.capacity[r];
    if (!c.surgeActive) s += c.surgeReserve;
  }
  return s;
}

function hasOverloadedCoreResource(h: Hospital): boolean {
  return (
    ratioOf(h, 'notaufnahme') >= RESOURCE_THRESHOLDS.notaufnahme.warn ||
    ratioOf(h, 'op_saal') >= RESOURCE_THRESHOLDS.op_saal.warn
  );
}

function formatTargetList(hs: Hospital[]): string {
  const names = hs.slice(0, 3).map((h) => h.name.split(' — ')[0].split(',')[0]);
  if (hs.length <= 3) return names.join(', ');
  return `${names.join(', ')} und ${hs.length - 3} weitere`;
}

interface Ctx {
  state: SimState;
  hospitals: Hospital[];
  now: number;
}

// Helfer: existiert bereits eine offene Rec dieser Action in state?
function alreadyOpen(state: SimState, action: MeasureAction): boolean {
  return state.recommendations.some((r) => r.action === action && r.executedAt == null);
}

function mkRec(
  action: MeasureAction,
  targets: Hospital[],
  impact: Recommendation['expectedImpact'],
  rationale: string,
  simTime: number,
  extras: Partial<Recommendation> = {}
): Recommendation {
  return {
    id: `R-${simTime}-${action}-${targets.map((h) => h.id).join(',') || 'system'}`,
    triggeredBy: [],
    action,
    targetHospitalIds: targets.map((h) => h.id),
    title: TITLE[action],
    rationale,
    expectedImpact: impact,
    effortLevel: EFFORT[action],
    executable: true,
    ...extras,
  };
}

function recSurgeWave(ctx: Ctx): Recommendation | null {
  if (alreadyOpen(ctx.state, 'activate-surge')) return null;
  // Kliniken die ueberlastet sind UND noch Surge-Reserve haben.
  const candidates = ctx.hospitals
    .filter(
      (h) => (hasOverloadedCoreResource(h) || overallLoad(h) >= 0.85) && sumSurgeReserve(h) > 0
    )
    .sort((a, b) => sumSurgeReserve(b) - sumSurgeReserve(a))
    .slice(0, MAX_TARGETS_PER_REC);
  if (candidates.length < 2) return null;
  const beds = candidates.reduce((s, h) => s + sumSurgeReserve(h), 0);
  return mkRec(
    'activate-surge',
    candidates,
    { bedsGained: beds, occupancyDeltaPp: -Math.min(15, candidates.length * 2) },
    `${candidates.length} Haeuser mit ueberlasteter Kern-Ressource: ${formatTargetList(candidates)}. Surge-Reserve freischalten schafft sofort Kapazitaet.`,
    ctx.now
  );
}

function recCancelElective(ctx: Ctx): Recommendation | null {
  if (alreadyOpen(ctx.state, 'cancel-elective')) return null;
  // Kliniken mit OP-Auslastung ≥ Schwellwert UND elektivActive.
  const candidates = ctx.hospitals
    .filter((h) => h.electiveActive && ratioOf(h, 'op_saal') >= RESOURCE_THRESHOLDS.op_saal.warn)
    .sort((a, b) => ratioOf(b, 'op_saal') - ratioOf(a, 'op_saal'))
    .slice(0, MAX_TARGETS_PER_REC);
  if (candidates.length < 1) return null;
  const opGain = candidates.reduce(
    (s, h) => s + Math.round(h.capacity.op_saal.total * 0.25),
    0
  );
  return mkRec(
    'cancel-elective',
    candidates,
    { bedsGained: opGain, timeBoughtMin: 120 },
    `${candidates.length} Haeuser mit ueberlasteten OP-Saelen: ${formatTargetList(candidates)}. Elektivbetrieb stoppen schafft ca. ${opGain} zusaetzliche OP-Slots binnen 2 h.`,
    ctx.now
  );
}

function recStaffCallup(ctx: Ctx): Recommendation | null {
  if (alreadyOpen(ctx.state, 'staff-callup')) return null;
  // Kliniken mit kritischer Notaufnahme ODER Gesamt-Auslastung >= 85%
  // und noch Personal im On-Call-Pool.
  const candidates = ctx.hospitals
    .filter(
      (h) =>
        h.staff.onCall > 10 &&
        (ratioOf(h, 'notaufnahme') >= RESOURCE_THRESHOLDS.notaufnahme.warn ||
          overallLoad(h) >= 0.85)
    )
    .sort((a, b) => b.staff.onCall - a.staff.onCall)
    .slice(0, MAX_TARGETS_PER_REC);
  if (candidates.length < 2) return null;
  const staff = candidates.reduce((s, h) => s + h.staff.onCall, 0);
  return mkRec(
    'staff-callup',
    candidates,
    { timeBoughtMin: 60, occupancyDeltaPp: -5 },
    `${candidates.length} Haeuser in kritischem Personalbedarf: ${formatTargetList(candidates)}. On-Call-Pool (${staff} Kraefte) binnen 60 min aktivieren.`,
    ctx.now
  );
}

function recRerouteManv(ctx: Ctx): Recommendation | null {
  if (alreadyOpen(ctx.state, 'reroute-manv')) return null;
  const activeIncidents = ctx.state.incidents.filter((i) => {
    // Incident gilt aktiv wenn Spawn-Phase laueft (first durationMin nach Start).
    return ctx.now - i.startedAt < i.durationMin + 60;
  });
  if (activeIncidents.length === 0) return null;
  // Entferntere, entlastete Max-/Schwerpunkt-Versorger als Ausweich-Ziel.
  const inc = activeIncidents[0];
  const candidates = ctx.hospitals
    .filter(
      (h) =>
        (h.tier === 'maximal' || h.tier === 'schwerpunkt') &&
        overallLoad(h) < 0.8 &&
        haversine(inc.location, h.coords) > 15 &&
        haversine(inc.location, h.coords) < 60
    )
    .sort((a, b) => overallLoad(a) - overallLoad(b))
    .slice(0, 3);
  if (candidates.length < 1) return null;
  return mkRec(
    'reroute-manv',
    candidates,
    { patientsRerouted: 20 * candidates.length, occupancyDeltaPp: -8 },
    `Neue MANV-Patienten zu ${formatTargetList(candidates)} umleiten — entfernter, aber noch Kapazitaet.`,
    ctx.now
  );
}

function recReserveHospital(ctx: Ctx): Recommendation | null {
  if (alreadyOpen(ctx.state, 'activate-reserve-hospital')) return null;
  if (ctx.state.hospitals['H-RESERVE-FFB']) return null;
  const criticalCount = ctx.hospitals.filter(
    (h) => overallLoad(h) >= 0.9 || hasOverloadedCoreResource(h)
  ).length;
  if (criticalCount < 6) return null;
  return mkRec(
    'activate-reserve-hospital',
    [],
    { bedsGained: 231, timeBoughtMin: 240 },
    `${criticalCount} Haeuser regional kritisch. Sanitaetszentrum Fuerstenfeldbruck als Reserveknoten aktivieren (+200 Normal, +20 ITS, +6 OP, +5 Notaufnahme).`,
    ctx.now
  );
}

function recCrossRegion(ctx: Ctx): Recommendation | null {
  if (alreadyOpen(ctx.state, 'request-cross-region')) return null;
  const criticalCount = ctx.hospitals.filter((h) => overallLoad(h) >= 0.95).length;
  if (criticalCount < 10) return null;
  return mkRec(
    'request-cross-region',
    [],
    { timeBoughtMin: 0 },
    `${criticalCount} Haeuser bei >= 95 % Auslastung. Katastrophenschutz-Abkommen mit Nachbar-Bundeslaendern aktivieren.`,
    ctx.now
  );
}

function recAlertAdjacent(ctx: Ctx): Recommendation | null {
  if (alreadyOpen(ctx.state, 'alert-adjacent')) return null;
  // Haeuser mit escalation='normal' in Naehe (< 50 km) eines Incident, die
  // noch Kapazitaet haben.
  const inc = ctx.state.incidents[0];
  if (!inc) return null;
  const candidates = ctx.hospitals
    .filter(
      (h) =>
        h.escalation === 'normal' &&
        overallLoad(h) < 0.8 &&
        haversine(inc.location, h.coords) <= 50
    )
    .sort((a, b) => haversine(inc.location, a.coords) - haversine(inc.location, b.coords))
    .slice(0, 5);
  if (candidates.length < 3) return null;
  return mkRec(
    'alert-adjacent',
    candidates,
    { timeBoughtMin: 60 },
    `${candidates.length} Nachbarhaeuser auf Stufe "erhoeht" setzen: ${formatTargetList(candidates)}.`,
    ctx.now
  );
}

function recIntake(ctx: Ctx): Recommendation[] {
  const out: Recommendation[] = [];
  for (const intake of ctx.state.plannedIntakes) {
    if (intake.status !== 'announced') continue;
    if (alreadyOpen(ctx.state, 'prepare-reception')) continue;
    out.push(
      mkRec(
        'prepare-reception',
        [],
        { bedsGained: Math.round(intake.totalPatients * 0.4), timeBoughtMin: intake.prepWindowMin },
        `Geplante Aufnahme "${intake.label}" (${intake.totalPatients} Patienten, ${Math.round(intake.prepWindowMin / 60)} h Vorlauf). Relocation-Engine startet stabile T2/T3 proaktiv zu verlegen.`,
        ctx.now,
        { intakeRefId: intake.id }
      )
    );
  }
  return out;
}

export function generateRecommendations(
  state: SimState,
  _newAlerts: unknown
): Recommendation[] {
  const ctx: Ctx = {
    state,
    hospitals: Object.values(state.hospitals),
    now: state.simTime,
  };
  const recs: Recommendation[] = [];
  const maybeAdd = (r: Recommendation | null) => {
    if (r) recs.push(r);
  };

  maybeAdd(recSurgeWave(ctx));
  maybeAdd(recCancelElective(ctx));
  maybeAdd(recStaffCallup(ctx));
  maybeAdd(recRerouteManv(ctx));
  maybeAdd(recAlertAdjacent(ctx));
  maybeAdd(recReserveHospital(ctx));
  maybeAdd(recCrossRegion(ctx));
  recs.push(...recIntake(ctx));

  return recs;
}

// Merge-Helper: bestehende Recommendations + neue. Natuerliche Dedup ueber
// (action, targets, intakeRefId). Cap auf MAX_OPEN_RECOMMENDATIONS offene.
export const MAX_OPEN_RECOMMENDATIONS = 8;

function recKey(
  action: Recommendation['action'],
  targets: string[],
  intakeRefId?: string
): string {
  const sortedTargets = [...targets].sort().join('|');
  return `${action}::${sortedTargets}::${intakeRefId ?? ''}`;
}

export function mergeRecommendations(
  existing: Recommendation[],
  incoming: Recommendation[]
): Recommendation[] {
  const byKey = new Map<string, Recommendation>();
  for (const r of existing) byKey.set(recKey(r.action, r.targetHospitalIds, r.intakeRefId), r);
  for (const r of incoming) {
    const k = recKey(r.action, r.targetHospitalIds, r.intakeRefId);
    if (!byKey.has(k)) byKey.set(k, r);
  }
  const all = Array.from(byKey.values());
  const open = all.filter((r) => r.executedAt == null);
  const done = all.filter((r) => r.executedAt != null);
  const cappedOpen = open.slice(-MAX_OPEN_RECOMMENDATIONS);
  return [...cappedOpen, ...done];
}

export { TITLE as RECOMMENDATION_TITLE };
