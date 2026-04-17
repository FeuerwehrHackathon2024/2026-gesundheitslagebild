/**
 * 5 MANV-Szenarien per SPEC §8.
 * Startkoordinaten, PZC-Verteilung, Ankunftskurve.
 */
import type { Incident, IncidentType, ArrivalCurve } from '@/lib/types';

export interface Scenario {
  id: string;
  label: string;
  type: IncidentType;
  location: [number, number];
  durationMin: number;
  arrivalCurve: ArrivalCurve;
  estimatedCasualties: number;
  /** PZC-Verteilung in %; Summe sollte 100 sein. */
  pzcDistribution: Record<string, number>;
  /** Anteil Kinder unter den Patienten (0..1). */
  childRatio: number;
  /** Radius der Lage in Metern (optional). */
  radiusM?: number;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'bab-a7-hamburg',
    label: 'BAB-Busunglueck A7 bei Hamburg',
    type: 'verkehrsunfall',
    location: [9.9375, 53.3556], // A7 Hamburg-Sued
    durationMin: 90,
    arrivalCurve: 'gauss',
    estimatedCasualties: 80,
    pzcDistribution: {
      'PZC-POLY-T1': 10,
      'PZC-SHT-T1': 10,
      'PZC-ABDO-T2': 20,
      'PZC-EXT-T2': 25,
      'PZC-MINOR-T3': 30,
      'PZC-EXPECT-T4': 5,
    },
    childRatio: 0.08,
    radiusM: 1500,
  },
  {
    id: 'industrie-ludwigshafen',
    label: 'Industriebrand Ludwigshafen',
    type: 'industriebrand',
    location: [8.4249, 49.5113], // BASF-Werk Ludwigshafen
    durationMin: 180,
    arrivalCurve: 'plateau',
    estimatedCasualties: 45,
    pzcDistribution: {
      'PZC-BURN-T1': 20,
      'PZC-BURN-T2': 30,
      'PZC-INHAL-T2': 40,
      'PZC-MINOR-T3': 10,
    },
    childRatio: 0.02,
    radiusM: 2500,
  },
  {
    id: 'amok-muenchen',
    label: 'Amoklauf Muenchen Innenstadt',
    type: 'amoklauf',
    location: [11.5755, 48.1374], // Marienplatz
    durationMin: 15,
    arrivalCurve: 'immediate',
    estimatedCasualties: 35,
    pzcDistribution: {
      'PZC-PENET-T1': 25,
      'PZC-POLY-T1': 15,
      'PZC-ABDO-T2': 20,
      'PZC-EXT-T2': 20,
      'PZC-PSYCH-T3': 15,
      'PZC-EXPECT-T4': 5,
    },
    childRatio: 0.06,
    radiusM: 800,
  },
  {
    id: 'fluechtlinge-goerlitz',
    label: 'Fluechtlingsstrom Goerlitz',
    type: 'fluechtlingsstrom',
    location: [14.9873, 51.1526],
    durationMin: 720,
    arrivalCurve: 'cascade',
    estimatedCasualties: 500,
    pzcDistribution: {
      'PZC-POLY-T1': 5,
      'PZC-PENET-T1': 5,
      'PZC-EXT-T2': 10,
      'PZC-ABDO-T2': 15,
      'PZC-MINOR-T3': 55,
      'PZC-PSYCH-T3': 10,
    },
    childRatio: 0.25,
    radiusM: 4000,
  },
  {
    id: 'hochwasser-passau',
    label: 'Hochwasser-Evakuierung Passau',
    type: 'naturkatastrophe',
    location: [13.4637, 48.5665],
    durationMin: 240,
    arrivalCurve: 'plateau',
    estimatedCasualties: 120,
    pzcDistribution: {
      'PZC-POLY-T1': 5,
      'PZC-INHAL-T2': 20,
      'PZC-EXT-T2': 15,
      'PZC-MINOR-T3': 50,
      'PZC-PSYCH-T3': 10,
    },
    childRatio: 0.15,
    radiusM: 3500,
  },
];

export const SCENARIOS_BY_ID: Record<string, Scenario> = Object.fromEntries(
  SCENARIOS.map((s) => [s.id, s]),
);

/**
 * Konvertiert ein Szenario zu einem Incident-Objekt fuer den Engine.
 * Startet zur aktuellen Sim-Zeit.
 */
export function scenarioToIncident(
  scenario: Scenario,
  simTime: number,
): Incident {
  // Verteilung absolut: aus Prozenten Anzahl der Patienten pro PZC errechnen
  const absolute: Record<string, number> = {};
  let assigned = 0;
  const entries = Object.entries(scenario.pzcDistribution);
  entries.forEach(([code, pct], i) => {
    if (i < entries.length - 1) {
      const n = Math.round((scenario.estimatedCasualties * pct) / 100);
      absolute[code] = n;
      assigned += n;
    } else {
      absolute[code] = scenario.estimatedCasualties - assigned;
    }
  });

  return {
    id: `I-${scenario.id}-${simTime}`,
    type: scenario.type,
    label: scenario.label,
    location: scenario.location,
    radius: scenario.radiusM,
    startedAt: simTime,
    estimatedCasualties: scenario.estimatedCasualties,
    pzcDistribution: absolute,
    arrivalCurve: scenario.arrivalCurve,
  };
}
