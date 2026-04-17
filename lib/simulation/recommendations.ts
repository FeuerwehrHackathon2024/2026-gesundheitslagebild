/**
 * Recommendation-Generator per SPEC §6.
 * Aus aktiven Alerts werden konkrete, ausfuehrbare Handlungsempfehlungen
 * abgeleitet. Jede Recommendation ist ein deterministischer Vorschlag mit
 * rationale und quantifiziertem Impact.
 */
import { PZC_BY_CODE } from '@/lib/data/pzc';
import { haversineKm } from '@/lib/geo';
import type { SimState } from '@/lib/simulation/engine';
import type { Alert, Hospital, Recommendation } from '@/lib/types';

export type RecommendationCandidate = Omit<Recommendation, 'id'>;

function surgeCapacity(h: Hospital): number {
  let sum = 0;
  for (const cap of Object.values(h.disciplines)) {
    if (!cap) continue;
    if (!cap.surgeActive) sum += cap.surgeCapacity;
  }
  return sum;
}

function freeBedsTotal(h: Hospital): number {
  let free = 0;
  for (const cap of Object.values(h.disciplines)) {
    if (!cap) continue;
    free += Math.max(0, cap.bedsTotal - cap.bedsOccupied);
  }
  return free;
}

function sortByDistance(
  hospitals: Hospital[],
  point: [number, number],
): Hospital[] {
  return [...hospitals].sort(
    (a, b) => haversineKm(point, a.coords) - haversineKm(point, b.coords),
  );
}

export function generateRecommendations(
  state: SimState,
  alerts: Alert[],
): RecommendationCandidate[] {
  const out: RecommendationCandidate[] = [];
  const activeAlerts = alerts.filter((a) => a.resolvedAt == null);
  const hospitals = Object.values(state.hospitals);

  // Index-Hospitals nach id
  const byId: Record<string, Hospital> = state.hospitals;

  // 1. activate-surge: HospitalSaturation + Surge verfuegbar
  for (const alert of activeAlerts) {
    if (alert.ruleName !== 'HospitalSaturation') continue;
    const h = byId[alert.scopeRef];
    if (!h) continue;
    const gain = surgeCapacity(h);
    if (gain <= 0) continue;
    out.push({
      triggeredBy: [alert.id],
      action: 'activate-surge',
      targetHospitalIds: [h.id],
      title: `Surge aktivieren: ${h.name}`,
      rationale: `Das Haus ist ueberlastet. Aktivierung der Surge-Kapazitaet erhoeht die Bettenzahl um ca. ${gain}. Effort gering (Personal schon on-call).`,
      expectedImpact: {
        bedsGained: gain,
        timeBoughtMin: 30,
      },
      effortLevel: 'low',
      executable: true,
    });
  }

  // 2. alert-adjacent: RegionalLoad warn -> 3 naechste Haeuser ausserhalb 50km
  for (const alert of activeAlerts) {
    if (alert.ruleName !== 'RegionalLoad' || alert.severity !== 'warn')
      continue;
    const inc = state.incidents.find((i) => i.id === alert.scopeRef);
    if (!inc) continue;
    const outsideRing = hospitals.filter(
      (h) => haversineKm(inc.location, h.coords) > 50,
    );
    const near3 = sortByDistance(outsideRing, inc.location).slice(0, 3);
    if (near3.length === 0) continue;
    out.push({
      triggeredBy: [alert.id],
      action: 'alert-adjacent',
      targetHospitalIds: near3.map((h) => h.id),
      title: `3 angrenzende Haeuser alarmieren`,
      rationale: `Region um den Einsatzort ist angespannt. Die drei naechsten Haeuser ausserhalb des 50-km-Rings (${near3.map((h) => h.name.split(' ')[0]).join(', ')}) werden auf Stufe "erhoeht" gesetzt, um Kapazitaet vorzubereiten.`,
      expectedImpact: {
        timeBoughtMin: 60,
      },
      effortLevel: 'medium',
      executable: true,
    });
  }

  // 3. request-cross-region: RegionalLoad critical
  for (const alert of activeAlerts) {
    if (alert.ruleName !== 'RegionalLoad' || alert.severity !== 'critical')
      continue;
    out.push({
      triggeredBy: [alert.id],
      action: 'request-cross-region',
      targetHospitalIds: [],
      title: 'Ueberregionale Unterstuetzung anfordern',
      rationale:
        'Die Region ist kritisch ausgelastet. Nachbar-Bundeslaender anfragen (KatS-Abkommen), um ueberregionale Kapazitaet zu aktivieren. Hohes Effort, politische/operative Koordination.',
      expectedImpact: {},
      effortLevel: 'high',
      executable: false,
    });
  }

  // 4. reroute: HospitalSaturation critical + Patienten im Transport dorthin
  for (const alert of activeAlerts) {
    if (alert.ruleName !== 'HospitalSaturation' || alert.severity !== 'critical')
      continue;
    const overloaded = byId[alert.scopeRef];
    if (!overloaded) continue;
    const inTransport = state.patients.filter(
      (p) => p.assignedHospitalId === overloaded.id && p.status === 'transport',
    );
    if (inTransport.length === 0) continue;

    // Bestes Ausweichhaus: naechstes mit genug Platz
    const alternatives = hospitals
      .filter((h) => h.id !== overloaded.id)
      .filter((h) => freeBedsTotal(h) >= inTransport.length)
      .sort(
        (a, b) =>
          haversineKm(overloaded.coords, a.coords) -
          haversineKm(overloaded.coords, b.coords),
      );
    const target = alternatives[0];
    if (!target) continue;

    out.push({
      triggeredBy: [alert.id],
      action: 'reroute',
      targetHospitalIds: [target.id, overloaded.id],
      title: `Umleiten: ${overloaded.name.split(' ')[0]} -> ${target.name.split(' ')[0]}`,
      rationale: `${inTransport.length} Patient(en) sind in Anfahrt auf das kritische Haus. Umleitung ${target.name} (${Math.round(haversineKm(overloaded.coords, target.coords))} km Differenz) hat ${freeBedsTotal(target)} freie Betten.`,
      expectedImpact: {
        patientsRerouted: inTransport.length,
        timeBoughtMin: 45,
      },
      effortLevel: 'medium',
      executable: true,
    });
  }

  // 5. activate-kv-notdienst: T3-Fluten bei Notaufnahme-Saturation
  for (const alert of activeAlerts) {
    if (alert.ruleName !== 'HospitalSaturation') continue;
    const h = byId[alert.scopeRef];
    if (!h) continue;
    const notCap = h.disciplines['notaufnahme'];
    if (!notCap) continue;
    const notOcc = notCap.bedsTotal > 0
      ? notCap.bedsOccupied / notCap.bedsTotal
      : 0;
    if (notOcc < 0.9) continue;
    // pruefen ob T3-Patienten im Zulauf sind
    const t3Incoming = state.patients.filter((p) => {
      if (p.assignedHospitalId !== h.id) return false;
      if (p.status !== 'transport' && p.status !== 'inTreatment') return false;
      const pzc = PZC_BY_CODE[p.pzc];
      return pzc?.triage === 'T3';
    }).length;
    if (t3Incoming < 3) continue;
    out.push({
      triggeredBy: [alert.id],
      action: 'activate-kv-notdienst',
      targetHospitalIds: [h.id],
      title: `KV-Notdienst aktivieren: ${h.address.city || h.name}`,
      rationale: `Notaufnahme bei ${Math.round(notOcc * 100)} %, ${t3Incoming} T3-Patienten im Zulauf. KV-Notdienst in der PLZ-Region leitet leichte Faelle aus dem Krankenhaus-Pfad ab (~40 % T3-Diversion).`,
      expectedImpact: {
        patientsRerouted: Math.round(t3Incoming * 0.4),
        bedsGained: Math.round(t3Incoming * 0.4),
      },
      effortLevel: 'medium',
      executable: true,
    });
  }

  // 6. transfer-stable: Haus ueberlastet + hat stabile Patienten
  for (const alert of activeAlerts) {
    if (alert.ruleName !== 'HospitalSaturation' || alert.severity !== 'critical')
      continue;
    const h = byId[alert.scopeRef];
    if (!h) continue;
    // stabile Patienten = in Behandlung, T2/T3
    const stable = state.patients.filter((p) => {
      if (p.assignedHospitalId !== h.id) return false;
      if (p.status !== 'inTreatment') return false;
      const pzc = PZC_BY_CODE[p.pzc];
      return pzc?.triage === 'T2' || pzc?.triage === 'T3';
    });
    if (stable.length < 3) continue;
    const nearOthers = sortByDistance(
      hospitals.filter(
        (x) => x.id !== h.id && freeBedsTotal(x) > stable.length,
      ),
      h.coords,
    ).slice(0, 2);
    if (nearOthers.length === 0) continue;
    out.push({
      triggeredBy: [alert.id],
      action: 'transfer-stable',
      targetHospitalIds: [h.id, ...nearOthers.map((n) => n.id)],
      title: `Stabile Patienten verlegen`,
      rationale: `${stable.length} stabile T2/T3-Patienten in ${h.name} koennen in ${nearOthers.map((n) => n.name.split(' ')[0]).join(', ')} verlegt werden, um Kapazitaet fuer akute Faelle zu schaffen.`,
      expectedImpact: {
        bedsGained: stable.length,
        patientsRerouted: stable.length,
      },
      effortLevel: 'medium',
      executable: true,
    });
  }

  return out;
}

/** Dedup-Key: gleiche Action + gleiche Targets = dieselbe Empfehlung. */
export function recommendationKey(r: RecommendationCandidate): string {
  return `${r.action}|${r.targetHospitalIds.slice().sort().join(',')}`;
}

/** Bestehende + neue mergen, Stale entfernen (die nicht mehr generiert werden). */
export function mergeRecommendations(
  existing: Recommendation[],
  candidates: RecommendationCandidate[],
  simTime: number,
): Recommendation[] {
  const byKey = new Map<string, Recommendation>();
  for (const r of existing) byKey.set(recommendationKey(r), r);

  const activeNow = new Set<string>();
  for (const cand of candidates) {
    const key = recommendationKey(cand);
    activeNow.add(key);
    const prev = byKey.get(key);
    if (prev && prev.executable) {
      // aktualisieren
      prev.title = cand.title;
      prev.rationale = cand.rationale;
      prev.expectedImpact = cand.expectedImpact;
      prev.triggeredBy = cand.triggeredBy;
      continue;
    }
    if (prev && !prev.executable) continue; // schon ausgefuehrt - nicht anfassen
    byKey.set(key, { ...cand, id: `R-${key}-${simTime}` });
  }

  // Nicht mehr aktive Empfehlungen, die noch executable sind, werden entfernt.
  // Ausgefuehrte (executable=false) bleiben als Protokoll bestehen.
  return Array.from(byKey.values()).filter((r) => {
    if (!r.executable) return true;
    return activeNow.has(recommendationKey(r));
  });
}

