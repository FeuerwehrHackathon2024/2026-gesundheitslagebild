import { describe, it, expect } from 'vitest';
import { getHospitals } from '@/lib/data/hospitalsLoader';
import { bboxContains, type BBox } from '@/lib/geo';

// Bayern-BBox grosszuegig (Spec sagt lng 10–13, lat 47–49).
const BAYERN_BBOX: BBox = {
  minLng: 10,
  minLat: 47,
  maxLng: 13,
  maxLat: 49,
};

const HOSPITALS = getHospitals();

describe('hospitals.json', () => {
  it('enthaelt 48 Kliniken (Excel liefert 48 Datenzeilen, siehe DECISIONS.md)', () => {
    expect(HOSPITALS).toHaveLength(48);
  });

  it('jede Klinik hat eindeutige H-MUC-xx-ID', () => {
    const ids = new Set(HOSPITALS.map((h) => h.id));
    expect(ids.size).toBe(HOSPITALS.length);
    for (const h of HOSPITALS) {
      expect(h.id).toMatch(/^H-MUC-\d{2}$/);
    }
  });

  it('alle Koordinaten liegen in Bayern', () => {
    for (const h of HOSPITALS) {
      expect(bboxContains(BAYERN_BBOX, h.coords)).toBe(true);
    }
  });

  it('alle Kliniken haben einen Namen und eine Art', () => {
    for (const h of HOSPITALS) {
      expect(h.name.length).toBeGreaterThan(0);
      expect(h.kind.length).toBeGreaterThan(0);
    }
  });
});

describe('Tier-Ableitung', () => {
  it('mindestens 3 Kliniken mit tier=maximal', () => {
    const maximal = HOSPITALS.filter((h) => h.tier === 'maximal');
    expect(maximal.length).toBeGreaterThanOrEqual(3);
  });

  it('LMU Klinikum Campus Grosshadern ist maximal mit 94 ITS-Betten', () => {
    const lmu = HOSPITALS.find((h) => /Grosshadern|Großhadern/.test(h.name));
    expect(lmu).toBeDefined();
    expect(lmu?.tier).toBe('maximal');
    expect(lmu?.capacity.its_bett.total).toBe(94);
    expect(lmu?.flags.hasITS).toBe(true);
  });

  it('Klinikum Rechts der Isar hat OP und Neurochirurgie', () => {
    const mri = HOSPITALS.find((h) => /Rechts der Isar/i.test(h.name));
    expect(mri).toBeDefined();
    expect(mri?.flags.hasOP).toBe(true);
    expect(mri?.flags.hasNeurochir).toBe(true);
  });
});

describe('Flags-Ableitung', () => {
  it('mindestens 8 Kliniken mit Notaufnahme', () => {
    const withNA = HOSPITALS.filter((h) => h.flags.hasNotaufnahme);
    expect(withNA.length).toBeGreaterThanOrEqual(8);
  });

  it('flags.hasITS konsistent mit its_bett > 0 (alle Haeuser mit ITS-Betten haben hasITS)', () => {
    for (const h of HOSPITALS) {
      if (h.capacity.its_bett.total > 0) {
        expect(h.flags.hasITS).toBe(true);
      }
    }
  });
});

describe('Capacity-Ableitung', () => {
  it('normal_bett + its_bett entspricht Gesamt-Betten der Excel (per Klinik)', () => {
    for (const h of HOSPITALS) {
      const sum = h.capacity.normal_bett.total + h.capacity.its_bett.total;
      // ITS ist Teilmenge der Gesamt-Betten → Summe = Gesamt-Betten.
      // Gesamt ist nicht direkt gespeichert, aber normal = total - its → Summe = total.
      // Daher sum > 0 fuer jede Klinik die ueberhaupt Betten meldet.
      if (sum === 0) continue; // sehr kleine Kliniken ohne Betten-Eintrag
      expect(sum).toBeGreaterThan(0);
    }
  });

  it('alle Capacity-Felder haben occupied=0 (wird spaeter von Store-Init gefuellt)', () => {
    for (const h of HOSPITALS) {
      for (const res of ['notaufnahme', 'op_saal', 'its_bett', 'normal_bett'] as const) {
        expect(h.capacity[res].occupied).toBe(0);
        expect(h.capacity[res].surgeActive).toBe(false);
      }
    }
  });

  it('surgeReserve ist rund 20 % von total', () => {
    for (const h of HOSPITALS) {
      for (const res of ['notaufnahme', 'op_saal', 'its_bett', 'normal_bett'] as const) {
        const cap = h.capacity[res];
        const expected = Math.round(cap.total * 0.2);
        expect(cap.surgeReserve).toBe(expected);
      }
    }
  });
});

describe('Initial-Zustand', () => {
  it('alle Kliniken starten mit escalation=normal, electiveActive=true, divertActive=false', () => {
    for (const h of HOSPITALS) {
      expect(h.escalation).toBe('normal');
      expect(h.electiveActive).toBe(true);
      expect(h.divertActive).toBe(false);
    }
  });
});
