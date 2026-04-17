import type { Discipline } from '@/lib/data/disciplines';

export type Versorgungsstufe = 'grund' | 'regel' | 'schwerpunkt' | 'maximal';

export type EscalationLevel =
  | 'normal'
  | 'erhoeht'
  | 'manv-1'
  | 'manv-2'
  | 'katastrophe';

export type TriageCategory = 'T1' | 'T2' | 'T3' | 'T4';

export interface PZC {
  code: string;
  label: string;
  triage: TriageCategory;
  primaryDiscipline: Discipline;
  requiredDisciplines: Discipline[];
  requiresOP: boolean;
  requiresITS: boolean;
  requiresBurnCenter: boolean;
  minVersorgungsstufe: Versorgungsstufe;
  avgTreatmentMin: number;
  stabilizationMin: number;
}

export interface DisciplineCapacity {
  bedsTotal: number;
  bedsOccupied: number;
  surgeCapacity: number;
  surgeActive: boolean;
  staffOnDuty: number;
  staffOnCall: number;
}

export interface HospitalAddress {
  street: string;
  city: string;
  plz: string;
  bundesland: string;
}

export interface Hospital {
  id: string;
  name: string;
  traeger: 'oeffentlich' | 'freigemeinnuetzig' | 'privat';
  versorgungsstufe: Versorgungsstufe;
  coords: [number, number]; // [lng, lat]
  address: HospitalAddress;
  disciplines: Partial<Record<Discipline, DisciplineCapacity>>;
  opSlots: { total: number; inUse: number };
  /**
   * Statisch vorgehaltene Notfallbetten (~10 % der Gesamtbetten).
   * Nur gesetzt bei Haeusern mit echter Notaufnahme-Abteilung aus der Quelldatei;
   * reine Fachkliniken haben 0.
   */
  emergencyBeds: number;
  escalationLevel: EscalationLevel;
  canEscalateTo: EscalationLevel;
}

/**
 * Leichtes Haus ohne Abteilungsdaten. Nur fuer Karten-Kontext, nicht simuliert.
 */
export interface ContextHospital {
  id: string;
  name: string;
  coords: [number, number];
  art?: string;
  betten?: number;
  ort?: string;
  bundesland?: string;
}

export interface HospitalsPayload {
  generatedAt: string;
  simulated: Hospital[];
  context: ContextHospital[];
}

export type IncidentType =
  | 'verkehrsunfall'
  | 'industriebrand'
  | 'amoklauf'
  | 'fluechtlingsstrom'
  | 'naturkatastrophe';

export type ArrivalCurve = 'immediate' | 'gauss' | 'plateau' | 'cascade';

export interface Incident {
  id: string;
  type: IncidentType;
  label: string;
  location: [number, number];
  radius?: number;
  startedAt: number;
  estimatedCasualties: number;
  pzcDistribution: Record<string, number>;
  arrivalCurve: ArrivalCurve;
}

export type PatientStatus =
  | 'onScene'
  | 'transport'
  | 'inTreatment'
  | 'discharged'
  | 'deceased';

export interface Patient {
  id: string;
  pzc: string;
  incidentId: string;
  isChild: boolean;
  spawnedAt: number;
  arrivedAt?: number;
  assignedHospitalId?: string;
  status: PatientStatus;
  dischargeAt?: number;
}

export type AlertSeverity = 'info' | 'warn' | 'critical';
export type AlertScope = 'hospital' | 'region' | 'system';

export interface Alert {
  id: string;
  severity: AlertSeverity;
  scope: AlertScope;
  scopeRef: string;
  firedAt: number;
  title: string;
  detail: string;
  linkedRecommendations: string[];
}

export type RecommendationAction =
  | 'activate-surge'
  | 'reroute'
  | 'activate-kv-notdienst'
  | 'alert-adjacent'
  | 'request-cross-region'
  | 'transfer-stable';

export interface Recommendation {
  id: string;
  triggeredBy: string[];
  action: RecommendationAction;
  targetHospitalIds: string[];
  title: string;
  rationale: string;
  expectedImpact: {
    bedsGained?: number;
    timeBoughtMin?: number;
    patientsRerouted?: number;
  };
  effortLevel: 'low' | 'medium' | 'high';
  executable: boolean;
}
