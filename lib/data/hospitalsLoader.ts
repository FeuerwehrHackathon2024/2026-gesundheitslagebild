import type { Hospital } from '@/lib/types';
import hospitalsJson from './hospitals.json';

// Typisierter Zugriff auf die generierten Klinik-Daten.
// Erzeugung: `pnpm tsx scripts/gen-hospitals.ts`.
const hospitals: Hospital[] = hospitalsJson as Hospital[];

export function getHospitals(): Hospital[] {
  return hospitals;
}

export function getHospitalById(id: string): Hospital | undefined {
  return hospitals.find((h) => h.id === id);
}
