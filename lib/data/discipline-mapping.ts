import type { Discipline } from '@/lib/data/disciplines';

/**
 * Mapping Excel-Abteilungstoken -> SPEC-Discipline (SPEC §3.2).
 *
 * Die Excel fuehrt ~130 unique Abteilungs-Bezeichnungen. Die SPEC fordert 8 grobe
 * Disciplines. Hier die Zusammenfassung.
 *
 * Tokens werden lowercase normalisiert und gegen den Schluessel gematcht. Ein
 * Token kann auf mehrere Disciplines mappen (z.B. Kinderchirurgie -> paediatrie
 * und chirurgie).
 */
export const ABTEILUNG_TO_DISCIPLINE: Record<string, Discipline[]> = {
  // --- notaufnahme ---
  notaufnahme: ['notaufnahme'],
  rettungsstelle: ['notaufnahme'],
  'zentrale notaufnahme': ['notaufnahme'],

  // --- chirurgie (Sammelbegriff fuer alle chirurgischen Faecher) ---
  allgemeinchirurgie: ['chirurgie'],
  unfallchirurgie: ['chirurgie'],
  viszeralchirurgie: ['chirurgie'],
  gefaesschirurgie: ['chirurgie'],
  'gefaess-chirurgie': ['chirurgie'],
  thoraxchirurgie: ['chirurgie'],
  herzchirurgie: ['chirurgie'],
  orthopaedie: ['chirurgie'],
  'orthopaedische chirurgie': ['chirurgie'],
  'plastische chirurgie': ['chirurgie'],
  handchirurgie: ['chirurgie'],
  'mund-kiefer-gesichtschirurgie': ['chirurgie'],
  kopfchirurgie: ['chirurgie'],
  transplantationschirurgie: ['chirurgie'],

  // --- neurochir (eigene Discipline, NICHT in chirurgie mergen) ---
  neurochirurgie: ['neurochir'],

  // --- innere (inkl. Spezialisierungen) ---
  'innere medizin': ['innere'],
  kardiologie: ['innere'],
  gastroenterologie: ['innere'],
  pneumologie: ['innere'],
  nephrologie: ['innere'],
  onkologie: ['innere'],
  haematologie: ['innere'],
  geriatrie: ['innere'],
  rheumatologie: ['innere'],
  endokrinologie: ['innere'],
  infektiologie: ['innere'],
  immunologie: ['innere'],
  tropenmedizin: ['innere'],
  neurologie: ['innere'], // Schlaganfall etc. -> innere, nicht neurochir
  diabetologie: ['innere'],

  // --- its (Intensivmedizin) ---
  intensivstation: ['its'],
  intensivmedizin: ['its'],
  'interdisziplinaere intensivstation': ['its'],

  // --- verbrennung (6 Haeuser in D) ---
  verbrennungsmedizin: ['verbrennung'],
  schwerbrandverletzte: ['verbrennung'],

  // --- paediatrie (inkl. Kinderchirurgie als kombiniert) ---
  paediatrie: ['paediatrie'],
  kinderheilkunde: ['paediatrie'],
  neonatologie: ['paediatrie'],
  kinderchirurgie: ['paediatrie', 'chirurgie'],
  kinderkardiologie: ['paediatrie'],

  // --- op (OP-Saal-Kapazitaet) ---
  op: ['op'],
  'op-saal': ['op'],
  anaesthesie: ['op'], // Anaesthesie impliziert OP-Betrieb
  anaesthesiologie: ['op'],

  // --- explizit NICHT gemappt (in UI nicht Teil der 8 SPEC-Disciplines) ---
  // radiologie, labor, physiotherapie, palliativmedizin, strahlentherapie,
  // gynaekologie, geburtshilfe, urologie, hno, augenheilkunde, dermatologie,
  // zahnmedizin, nuklearmedizin, venerologie, ambulanz, endoskopie -> ignore
};

/**
 * Normalisiert ein Excel-Abteilungs-Token fuer den Lookup:
 * lowercase, trim, Umlaute-Ersatz, Sonderzeichen weg.
 */
export function normalizeToken(tok: string): string {
  return tok
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ');
}

/**
 * Parsed das kommagetrennte Abteilungs-Feld einer Excel-Zeile und mappt auf das
 * Set der 8 SPEC-Disciplines. Unbekannte Tokens werden stillschweigend
 * uebergangen (nicht alle Abteilungen sind fuer MANV-Routing relevant).
 */
export function extractDisciplines(abteilungenField: string): Set<Discipline> {
  const out = new Set<Discipline>();
  for (const raw of abteilungenField.split(',')) {
    const norm = normalizeToken(raw);
    if (!norm) continue;
    const mapped = ABTEILUNG_TO_DISCIPLINE[norm];
    if (mapped) {
      for (const d of mapped) out.add(d);
    }
  }
  return out;
}
