// Excel-Parser fuer doc/Krankenhaeuser_Muenchen.xlsx → lib/data/hospitals.json.
// Aufruf: pnpm tsx scripts/gen-hospitals.ts
// Spezifikation: doc/DATA_GENERATION.md

import ExcelJS from 'exceljs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {
  Capacity,
  Hospital,
  HospitalAddress,
  HospitalFlags,
  HospitalStaff,
  HospitalTier,
  ResourceType,
} from '../lib/types';

const REPO_ROOT = path.resolve(__dirname, '..');
const XLSX_PATH = path.join(REPO_ROOT, 'doc', 'Krankenhäuser_München.xlsx');
const OUT_PATH = path.join(REPO_ROOT, 'lib', 'data', 'hospitals.json');
const SHEET_NAME = 'Krankenhäuser_voll';

interface RawRow {
  name: string;
  ort: string;
  art: string;
  adresse: string;
  telefon: string;
  url: string;
  abteilungen: string[];
  ausstattung: string[];
  beds: number;
  itsBeds: number;
  lat: number;
  lng: number;
}

function cellString(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') {
    // ExcelJS Rich-Text und Hyperlink-Zellen
    const r = v as { text?: string; result?: unknown };
    if (typeof r.text === 'string') return r.text.trim();
    if (r.result != null) return cellString(r.result);
  }
  return String(v).trim();
}

function cellNumber(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const s = cellString(v).replace(/[^\d.,-]/g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function splitCsv(v: string): string[] {
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseAddress(raw: string, fallbackCity: string): HospitalAddress {
  const s = raw.trim();
  const m = s.match(/^(.+?),?\s*(\d{5})\s+(.+)$/);
  if (m) {
    return {
      street: m[1].trim().replace(/,+$/, '').trim(),
      plz: m[2],
      city: m[3].trim(),
    };
  }
  return { street: s, plz: '', city: fallbackCity || '' };
}

function deriveTier(kind: string, beds: number): HospitalTier {
  if (/Universitätsklinikum/i.test(kind)) return 'maximal';
  if (beds >= 500) return 'schwerpunkt';
  if (beds >= 200) return 'regel';
  return 'grund';
}

function deriveFlags(abteilungen: string[]): HospitalFlags {
  const joined = abteilungen.join(' | ').toLowerCase();
  return {
    hasOP: /\bop\b|operation/.test(joined),
    hasITS: /intensiv/.test(joined),
    hasNotaufnahme: /notaufnahme|notfall/.test(joined),
    hasBurnCenter: /verbrenn|plastische\s+chirurgie/.test(joined),
    hasNeurochir: /neurochirurg/.test(joined),
    hasPaediatrie: /pädiatr|kinder|neonatol/.test(joined),
  };
}

function mkCap(total: number, surgeRatio = 0.2): Capacity {
  const safeTotal = Math.max(0, Math.round(total));
  return {
    total: safeTotal,
    occupied: 0,
    surgeReserve: Math.round(safeTotal * surgeRatio),
    surgeActive: false,
  };
}

function deriveCapacity(
  beds: number,
  itsBeds: number,
  flags: HospitalFlags
): Record<ResourceType, Capacity> {
  const normalBeds = Math.max(0, beds - itsBeds);
  const hasITS = itsBeds > 0 || flags.hasITS;
  const opSlots = flags.hasOP ? Math.max(2, Math.round(beds / 60)) : 0;
  const naSlots = flags.hasNotaufnahme ? Math.max(2, Math.round(beds / 80)) : 0;

  return {
    notaufnahme: mkCap(naSlots),
    op_saal: mkCap(opSlots),
    its_bett: mkCap(hasITS ? itsBeds : 0),
    normal_bett: mkCap(normalBeds),
  };
}

function deriveStaff(beds: number, tier: HospitalTier): HospitalStaff {
  const base = Math.round(beds * 0.65);
  const factor =
    tier === 'maximal' ? 1.2 : tier === 'schwerpunkt' ? 1.0 : 0.8;
  const onDuty = Math.round(base * factor);
  const onCall = Math.round(onDuty * 0.4);
  return { onDuty, onCall };
}

async function parseRows(): Promise<RawRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX_PATH);
  const sheet = wb.getWorksheet(SHEET_NAME);
  if (!sheet) {
    throw new Error(`Sheet "${SHEET_NAME}" nicht gefunden in ${XLSX_PATH}`);
  }

  const rows: RawRow[] = [];
  // Row 1 ist Header, Daten ab Row 2. ExcelJS nutzt 1-basierte Indizes und Spalte A=1.
  // Echte Spalten-Struktur (abweichend von DATA_GENERATION.md §1 — siehe
  // doc/DECISIONS.md): col 1=Name, 2=Ort, 3=Art, 4=Adresse, 5=Bundesland,
  // 6=Land, 7=Telefon, 8=URL, 9=Abteilungen, 10=Ausstattung, 11=Betten,
  // 12=Intensivbetten, 13=Latitude, 14=Longitude.
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // Header
    const name = cellString(row.getCell(1).value);
    if (!name) return; // Leere Zeile ignorieren

    rows.push({
      name,
      ort: cellString(row.getCell(2).value),
      art: cellString(row.getCell(3).value),
      adresse: cellString(row.getCell(4).value),
      telefon: cellString(row.getCell(7).value),
      url: cellString(row.getCell(8).value),
      abteilungen: splitCsv(cellString(row.getCell(9).value)),
      ausstattung: splitCsv(cellString(row.getCell(10).value)),
      beds: cellNumber(row.getCell(11).value),
      itsBeds: cellNumber(row.getCell(12).value),
      lat: cellNumber(row.getCell(13).value),
      lng: cellNumber(row.getCell(14).value),
    });
  });
  return rows;
}

function toHospital(raw: RawRow, idx: number): Hospital {
  const id = `H-MUC-${String(idx + 1).padStart(2, '0')}`;
  const tier = deriveTier(raw.art, raw.beds);
  const flags = deriveFlags(raw.abteilungen);
  const capacity = deriveCapacity(raw.beds, raw.itsBeds, flags);
  const staff = deriveStaff(raw.beds, tier);
  return {
    id,
    name: raw.name,
    kind: raw.art,
    tier,
    coords: [raw.lng, raw.lat],
    address: parseAddress(raw.adresse, raw.ort),
    capacity,
    abteilungen: raw.abteilungen,
    flags,
    staff,
    escalation: 'normal',
    electiveActive: true,
    divertActive: false,
  };
}

async function main() {
  const raws = await parseRows();
  if (raws.length === 0) {
    throw new Error('Keine Zeilen aus Excel gelesen — Pfad oder Sheet-Name pruefen');
  }
  const hospitals = raws.map((r, i) => toHospital(r, i));

  // Sanity warnings (nicht fatal)
  const coordKey = (h: Hospital) => `${h.coords[0].toFixed(4)},${h.coords[1].toFixed(4)}`;
  const seen = new Map<string, string>();
  for (const h of hospitals) {
    const k = coordKey(h);
    if (seen.has(k)) {
      // eslint-disable-next-line no-console
      console.warn(`[warn] Doppelte Koordinaten: ${h.name} und ${seen.get(k)}`);
    } else {
      seen.set(k, h.name);
    }
    if (!Number.isFinite(h.coords[0]) || !Number.isFinite(h.coords[1])) {
      // eslint-disable-next-line no-console
      console.warn(`[warn] Ungueltige Koordinaten: ${h.name} → ${h.coords}`);
    }
  }

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(hospitals, null, 2) + '\n', 'utf8');
  // eslint-disable-next-line no-console
  console.log(`[ok] ${hospitals.length} Kliniken → ${path.relative(REPO_ROOT, OUT_PATH)}`);
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
