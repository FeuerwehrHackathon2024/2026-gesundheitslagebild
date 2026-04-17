/**
 * Die 8 Disciplines per SPEC §3.2.
 * Grob gehalten; jedes Haus fuehrt pro Discipline eine DisciplineCapacity.
 */
export const DISCIPLINES = [
  'notaufnahme',
  'chirurgie',
  'innere',
  'its', // Intensivmedizin
  'neurochir',
  'verbrennung',
  'paediatrie',
  'op', // OP-Saal-Kapazitaet
] as const;

export type Discipline = (typeof DISCIPLINES)[number];

/** Anzeige-Label fuer die UI (de-DE). */
export const DISCIPLINE_LABEL: Record<Discipline, string> = {
  notaufnahme: 'Notaufnahme',
  chirurgie: 'Chirurgie',
  innere: 'Innere Medizin',
  its: 'Intensivmedizin',
  neurochir: 'Neurochirurgie',
  verbrennung: 'Verbrennung',
  paediatrie: 'Paediatrie',
  op: 'OP-Saal',
};
