import type { Capacity, Hospital, ResourceType } from '@/lib/types';
import { RESOURCE_TYPES } from '@/lib/data/resources';

// Deterministische Baseline-Auslastung 65–80 % pro Klinik und Ressource.
// Laut DATA_GENERATION.md §3.7 fuellt der Store diese Werte beim App-Start,
// bzw. bereits Phase 3 fuer die Karten-Einfaerbung. Seed + Klinik-ID +
// Ressource geben reproduzierbare Werte.

const DEFAULT_SEED = 42;

// Sehr einfacher, deterministischer Hash → [0, 1). Fuer Demo-Zwecke ausreichend.
function hash01(parts: Array<string | number>): number {
  let h = 2166136261; // FNV-1a 32-bit offset
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    // FNV-1a prime
    h = Math.imul(h, 16777619) >>> 0;
  }
  // Normalisieren auf [0, 1)
  return h / 0xffffffff;
}

// Auslastung fuer genau eine Klinik+Ressource (0..1).
export function baselineOccupancyRatio(
  hospitalId: string,
  resource: ResourceType,
  seed: number = DEFAULT_SEED
): number {
  const r = hash01([seed, hospitalId, resource]);
  return 0.65 + r * 0.15;
}

// Berechnete Auslastung pro Ressource einer Klinik (rund, nie > total+surge).
export function baselineCapacity(
  hospital: Hospital,
  seed: number = DEFAULT_SEED
): Record<ResourceType, Capacity> {
  const out = {} as Record<ResourceType, Capacity>;
  for (const res of RESOURCE_TYPES) {
    const cap = hospital.capacity[res];
    const ratio = baselineOccupancyRatio(hospital.id, res, seed);
    const occupied = Math.min(cap.total, Math.round(cap.total * ratio));
    out[res] = { ...cap, occupied };
  }
  return out;
}

// Gesamt-Auslastung einer Klinik ueber alle 4 Toepfe (Betten-gewichtet).
export function overallOccupancyRatio(
  capacity: Record<ResourceType, Capacity>
): number {
  let totalBeds = 0;
  let occ = 0;
  for (const res of RESOURCE_TYPES) {
    const c = capacity[res];
    const effective = c.total + (c.surgeActive ? c.surgeReserve : 0);
    totalBeds += effective;
    occ += c.occupied;
  }
  if (totalBeds === 0) return 0;
  return occ / totalBeds;
}

// DESIGN.md §6 — Klinik-Marker-Farbe nach Gesamt-Auslastung.
export function occupancyColorVar(ratio: number): string {
  if (ratio >= 0.95) return 'var(--accent-red)';
  if (ratio >= 0.8) return 'var(--accent-orange)';
  if (ratio >= 0.6) return 'var(--accent-yellow)';
  return 'var(--accent-green)';
}

// DESIGN.md §6 — Kliniken-Marker-Radius nach Tier (8–14 px).
export function tierRadiusPx(tier: Hospital['tier']): number {
  switch (tier) {
    case 'maximal':
      return 14;
    case 'schwerpunkt':
      return 12;
    case 'regel':
      return 10;
    case 'grund':
    default:
      return 8;
  }
}
