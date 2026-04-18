import { describe, it, expect } from 'vitest';
import {
  baselineOccupancyRatio,
  baselineCapacity,
  overallOccupancyRatio,
  occupancyColorVar,
  tierRadiusPx,
} from './baseline';
import type { Capacity, Hospital, ResourceType } from '@/lib/types';

function mkCap(total: number, occupied = 0): Capacity {
  return { total, occupied, surgeReserve: Math.round(total * 0.2), surgeActive: false };
}

function mkHospital(partial?: Partial<Hospital>): Hospital {
  const capacity: Record<ResourceType, Capacity> = {
    notaufnahme: mkCap(10),
    op_saal: mkCap(5),
    its_bett: mkCap(20),
    normal_bett: mkCap(200),
  };
  return {
    id: 'H-TEST',
    name: 'Test',
    kind: 'Regelversorger',
    tier: 'regel',
    coords: [11.5, 48.1],
    address: { street: '', city: '', plz: '' },
    capacity,
    abteilungen: [],
    flags: {
      hasOP: true,
      hasITS: true,
      hasNotaufnahme: true,
      hasBurnCenter: false,
      hasNeurochir: false,
      hasPaediatrie: false,
    },
    staff: { onDuty: 100, onCall: 40 },
    escalation: 'normal',
    electiveActive: true,
    divertActive: false,
    ...partial,
  };
}

describe('baselineOccupancyRatio', () => {
  it('liegt immer zwischen 0.65 und 0.80', () => {
    for (const id of ['H-1', 'H-2', 'H-17', 'H-48']) {
      for (const res of ['notaufnahme', 'op_saal', 'its_bett', 'normal_bett'] as const) {
        const r = baselineOccupancyRatio(id, res);
        expect(r).toBeGreaterThanOrEqual(0.65);
        expect(r).toBeLessThan(0.8);
      }
    }
  });

  it('ist deterministisch (gleiches Input → gleiches Output)', () => {
    const a = baselineOccupancyRatio('H-1', 'notaufnahme', 42);
    const b = baselineOccupancyRatio('H-1', 'notaufnahme', 42);
    expect(a).toBe(b);
  });

  it('unterscheidet sich bei unterschiedlichem Seed', () => {
    const a = baselineOccupancyRatio('H-1', 'notaufnahme', 1);
    const b = baselineOccupancyRatio('H-1', 'notaufnahme', 2);
    expect(a).not.toBe(b);
  });
});

describe('baselineCapacity', () => {
  it('occupied liegt fuer jede Ressource in 0.65-0.80 * total', () => {
    const h = mkHospital();
    const cap = baselineCapacity(h);
    for (const res of ['notaufnahme', 'op_saal', 'its_bett', 'normal_bett'] as const) {
      const c = cap[res];
      expect(c.occupied).toBeGreaterThanOrEqual(Math.floor(c.total * 0.65));
      expect(c.occupied).toBeLessThanOrEqual(Math.ceil(c.total * 0.8));
    }
  });
});

describe('overallOccupancyRatio', () => {
  it('ist 0 bei leerer Klinik', () => {
    const cap: Record<ResourceType, Capacity> = {
      notaufnahme: mkCap(0),
      op_saal: mkCap(0),
      its_bett: mkCap(0),
      normal_bett: mkCap(0),
    };
    expect(overallOccupancyRatio(cap)).toBe(0);
  });

  it('ist 1 bei voller Klinik', () => {
    const cap: Record<ResourceType, Capacity> = {
      notaufnahme: mkCap(10, 10),
      op_saal: mkCap(5, 5),
      its_bett: mkCap(20, 20),
      normal_bett: mkCap(200, 200),
    };
    expect(overallOccupancyRatio(cap)).toBeCloseTo(1, 6);
  });

  it('beruecksichtigt aktivierte Surge-Reserve', () => {
    const cap: Record<ResourceType, Capacity> = {
      notaufnahme: mkCap(0),
      op_saal: mkCap(0),
      its_bett: mkCap(0),
      normal_bett: { total: 100, occupied: 100, surgeReserve: 20, surgeActive: true },
    };
    // 100 / (100 + 20) = 0.833
    expect(overallOccupancyRatio(cap)).toBeCloseTo(100 / 120, 6);
  });
});

describe('occupancyColorVar', () => {
  it('gruen bei niedriger Auslastung', () => {
    expect(occupancyColorVar(0.4)).toBe('var(--accent-green)');
    expect(occupancyColorVar(0.59)).toBe('var(--accent-green)');
  });
  it('gelb 60-80 %', () => {
    expect(occupancyColorVar(0.6)).toBe('var(--accent-yellow)');
    expect(occupancyColorVar(0.79)).toBe('var(--accent-yellow)');
  });
  it('orange 80-95 %', () => {
    expect(occupancyColorVar(0.8)).toBe('var(--accent-orange)');
    expect(occupancyColorVar(0.94)).toBe('var(--accent-orange)');
  });
  it('rot ab 95 %', () => {
    expect(occupancyColorVar(0.95)).toBe('var(--accent-red)');
    expect(occupancyColorVar(1)).toBe('var(--accent-red)');
  });
});

describe('tierRadiusPx', () => {
  it('steigt mit Tier', () => {
    expect(tierRadiusPx('grund')).toBe(8);
    expect(tierRadiusPx('regel')).toBe(10);
    expect(tierRadiusPx('schwerpunkt')).toBe(12);
    expect(tierRadiusPx('maximal')).toBe(14);
  });
});
