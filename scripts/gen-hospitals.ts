/**
 * Parst doc/Krankenhaeuser_D.xlsx und erzeugt lib/data/hospitals.json.
 *
 * - Zeilen MIT Abteilungen-Feld werden zu `Hospital` (simulated, ~192).
 * - Zeilen OHNE Abteilungen werden zu `ContextHospital` (nur Karte, ~2060).
 *
 * Determinismus: seeded PRNG (mulberry32) pro Haus-ID, damit erneute
 * Generierung identische Betten-Verteilung und Anfangsauslastung liefert.
 */
import ExcelJS from 'exceljs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DISCIPLINES, type Discipline } from '../lib/data/disciplines';
import { extractDisciplines } from '../lib/data/discipline-mapping';
import type {
  ContextHospital,
  DisciplineCapacity,
  Hospital,
  HospitalsPayload,
  Versorgungsstufe,
} from '../lib/types';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const XLSX_PATH = join(REPO_ROOT, 'doc', 'Krankenhäuser_D.xlsx');
const OUT_PATH = join(REPO_ROOT, 'lib', 'data', 'hospitals.json');

/** mulberry32 deterministic PRNG */
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface Row {
  name: string;
  ort?: string;
  art?: string;
  adresse?: string;
  bundesland?: string;
  abteilungen?: string;
  betten?: number;
  intensivbetten?: number;
  lat?: number;
  lng?: number;
}

function cleanCell(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string') {
    const t = v.trim();
    return t.length ? t : undefined;
  }
  if (typeof v === 'object' && 'text' in (v as Record<string, unknown>)) {
    const t = String((v as { text: string }).text).trim();
    return t.length ? t : undefined;
  }
  return String(v);
}

function numCell(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * Parst "Straßenname 12\n12345 Stadt" oder "Straße 12, 12345 Stadt".
 */
function parseAddress(raw: string | undefined): {
  street: string;
  plz: string;
  city: string;
} {
  if (!raw) return { street: '', plz: '', city: '' };
  const norm = raw.replace(/\n/g, ', ').replace(/\s+/g, ' ').trim();
  const parts = norm.split(',').map((p) => p.trim());
  if (parts.length >= 2) {
    const last = parts[parts.length - 1] ?? '';
    const m = last.match(/(\d{5})\s+(.+)/);
    if (m) {
      return {
        street: parts.slice(0, -1).join(', '),
        plz: m[1] ?? '',
        city: m[2] ?? '',
      };
    }
  }
  const m2 = norm.match(/(\d{5})\s+([^,]+)/);
  if (m2) {
    const before = norm.substring(0, (m2.index ?? 0)).replace(/,\s*$/, '').trim();
    return { street: before, plz: m2[1] ?? '', city: m2[2] ?? '' };
  }
  return { street: norm, plz: '', city: '' };
}

function deriveTraeger(
  name: string,
  art: string | undefined,
): Hospital['traeger'] {
  const lc = (name + ' ' + (art ?? '')).toLowerCase();
  if (lc.includes('privat')) return 'privat';
  if (
    /(diakonie|caritas|marien|st\.?\s|sankt|evangelisch|katholisch|barmherzig|franziskus|johanniter|vincentius)/i.test(
      lc,
    )
  ) {
    return 'freigemeinnuetzig';
  }
  return 'oeffentlich';
}

function deriveStufe(
  betten: number,
  disciplines: Set<Discipline>,
  art: string | undefined,
): Versorgungsstufe {
  const isUni = /universit/i.test(art ?? '');
  const hasBurn = disciplines.has('verbrennung');
  const hasNeurochir = disciplines.has('neurochir');
  const hasIts = disciplines.has('its');
  const hasOp = disciplines.has('op');

  if (isUni || hasBurn || betten >= 1200) return 'maximal';
  if (hasNeurochir || betten >= 600) return 'schwerpunkt';
  if ((hasIts && hasOp) || betten >= 250) return 'regel';
  return 'grund';
}

/** Relative Gewichte fuer die Bettenverteilung auf Disciplines. */
const DISCIPLINE_WEIGHT: Partial<Record<Discipline, number>> = {
  notaufnahme: 1,
  chirurgie: 6,
  innere: 6,
  neurochir: 2,
  verbrennung: 2,
  paediatrie: 3,
  // its, op werden separat behandelt
};

function buildDisciplines(
  present: Set<Discipline>,
  totalBetten: number,
  intensivBetten: number | undefined,
  rng: () => number,
): { map: Partial<Record<Discipline, DisciplineCapacity>>; op?: number } {
  const map: Partial<Record<Discipline, DisciplineCapacity>> = {};

  // ITS zuerst: falls Intensivbetten-Spalte da, nimm die. Sonst ~5 % der Gesamt.
  let itsBeds = 0;
  if (present.has('its')) {
    itsBeds =
      intensivBetten && intensivBetten > 0
        ? intensivBetten
        : Math.max(2, Math.round(totalBetten * 0.05));
  }

  // OP-Slots separat: 1 OP pro ~40 Betten, min 2 falls op da
  let opSlots = 0;
  if (present.has('op')) {
    opSlots = Math.max(2, Math.round(totalBetten / 40));
  }

  const otherBeds = Math.max(0, totalBetten - itsBeds);

  // Gewichtsbasierte Verteilung auf die uebrigen vorhandenen Disciplines
  const weighted = DISCIPLINES.filter(
    (d) => present.has(d) && d !== 'its' && d !== 'op',
  );
  const totalWeight = weighted.reduce(
    (sum, d) => sum + (DISCIPLINE_WEIGHT[d] ?? 1),
    0,
  );

  const mkCap = (bedsTotal: number): DisciplineCapacity => {
    const occupancyRatio = 0.65 + rng() * 0.15; // 65-80 %
    const bedsOccupied = Math.round(bedsTotal * occupancyRatio);
    const bedsReservedMANV = Math.max(1, Math.round(bedsTotal * 0.1));
    const surgeCapacity = Math.round(bedsTotal * 0.2);
    const staffOnDuty = Math.max(1, Math.round(bedsTotal * 0.25));
    const staffOnCall = Math.max(1, Math.round(bedsTotal * 0.15));
    return {
      bedsTotal,
      bedsOccupied: Math.min(bedsOccupied, bedsTotal),
      bedsReservedMANV,
      surgeCapacity,
      surgeActive: false,
      staffOnDuty,
      staffOnCall,
    };
  };

  if (itsBeds > 0) {
    map['its'] = mkCap(itsBeds);
  }

  let distributed = 0;
  for (const d of weighted) {
    const w = DISCIPLINE_WEIGHT[d] ?? 1;
    const share = totalWeight > 0 ? w / totalWeight : 0;
    const beds = Math.max(5, Math.round(otherBeds * share));
    map[d] = mkCap(beds);
    distributed += beds;
  }

  // Falls Rundungsluecke: korrigiere Innere (Haupttraeger)
  if (map['innere']) {
    const diff = otherBeds - distributed;
    if (diff !== 0) {
      map['innere'] = mkCap(Math.max(5, (map['innere'] as DisciplineCapacity).bedsTotal + diff));
    }
  }

  return { map, op: opSlots };
}

async function main() {
  console.log(`[gen-hospitals] reading ${XLSX_PATH}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX_PATH);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('No worksheet in Excel');

  const rows: Row[] = [];
  ws.eachRow((rowObj, rowIndex) => {
    if (rowIndex === 1) return; // header
    const cell = (i: number) => rowObj.getCell(i).value;
    const name = cleanCell(cell(1));
    if (!name) return;
    rows.push({
      name,
      ort: cleanCell(cell(2)),
      art: cleanCell(cell(3)),
      adresse: cleanCell(cell(4)),
      bundesland: cleanCell(cell(5)),
      abteilungen: cleanCell(cell(10)),
      betten: numCell(cell(12)),
      intensivbetten: numCell(cell(13)),
      lat: numCell(cell(14)),
      lng: numCell(cell(15)),
    });
  });

  console.log(`[gen-hospitals] total rows: ${rows.length}`);

  const simulated: Hospital[] = [];
  const context: ContextHospital[] = [];

  let idx = 0;
  for (const r of rows) {
    idx++;
    if (r.lat == null || r.lng == null) continue;
    const id = `H-DE-${String(idx).padStart(5, '0')}`;
    const coords: [number, number] = [r.lng, r.lat];

    const hasFullData =
      !!r.abteilungen && typeof r.betten === 'number' && r.betten > 0;

    if (!hasFullData) {
      context.push({
        id,
        name: r.name,
        coords,
        art: r.art,
        betten: r.betten,
        ort: r.ort,
        bundesland: r.bundesland,
      });
      continue;
    }

    const disciplines = extractDisciplines(r.abteilungen!);
    // Jedes Haus hat mindestens Notaufnahme (Akutkrankenhaus-Basis).
    disciplines.add('notaufnahme');

    const rng = seededRng(hashStr(id));
    const { map, op } = buildDisciplines(
      disciplines,
      r.betten!,
      r.intensivbetten,
      rng,
    );

    const stufe = deriveStufe(r.betten!, disciplines, r.art);
    const traeger = deriveTraeger(r.name, r.art);
    const addr = parseAddress(r.adresse);

    const opSlots = {
      total: op ?? 0,
      inUse: op ? Math.round(op * (0.3 + rng() * 0.3)) : 0,
    };

    simulated.push({
      id,
      name: r.name,
      traeger,
      versorgungsstufe: stufe,
      coords,
      address: {
        street: addr.street,
        plz: addr.plz,
        city: addr.city || r.ort || '',
        bundesland: r.bundesland ?? '',
      },
      disciplines: map,
      opSlots,
      escalationLevel: 'normal',
      canEscalateTo: 'katastrophe',
    });
  }

  console.log(
    `[gen-hospitals] simulated=${simulated.length}  context=${context.length}`,
  );

  // Kurzstatistik Stufe-Verteilung
  const byStufe: Record<string, number> = {};
  for (const h of simulated) {
    byStufe[h.versorgungsstufe] = (byStufe[h.versorgungsstufe] ?? 0) + 1;
  }
  console.log('[gen-hospitals] Stufen:', byStufe);

  // Kurzstatistik Discipline-Praesenz
  const discCount: Record<string, number> = {};
  for (const h of simulated) {
    for (const d of Object.keys(h.disciplines)) {
      discCount[d] = (discCount[d] ?? 0) + 1;
    }
  }
  console.log('[gen-hospitals] Disciplines:', discCount);

  const payload: HospitalsPayload = {
    generatedAt: new Date().toISOString(),
    simulated,
    context,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`[gen-hospitals] wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error('[gen-hospitals] FAILED:', err);
  process.exit(1);
});
