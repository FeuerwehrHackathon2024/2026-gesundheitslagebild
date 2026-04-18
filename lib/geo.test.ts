import { describe, it, expect } from 'vitest';
import {
  haversine,
  bboxFromPoints,
  bboxContains,
  centerOf,
  FLUGHAFEN_MUC_COORDS,
  MARIENPLATZ_COORDS,
  MUC_REGION_BBOX,
  type LngLat,
} from './geo';

describe('haversine', () => {
  it('Distanz zu sich selbst ist 0', () => {
    expect(haversine([11, 48], [11, 48])).toBe(0);
  });

  it('Muenchen-Marienplatz <-> Flughafen MUC liegt bei ~28 km (Gate)', () => {
    const d = haversine(MARIENPLATZ_COORDS, FLUGHAFEN_MUC_COORDS);
    expect(d).toBeGreaterThan(27);
    expect(d).toBeLessThan(30);
  });

  it('ist symmetrisch', () => {
    const a: LngLat = [11, 48];
    const b: LngLat = [12, 49];
    expect(haversine(a, b)).toBeCloseTo(haversine(b, a), 6);
  });

  it('1 Grad Laengengrad-Differenz am Aequator entspricht ca. 111 km', () => {
    const d = haversine([0, 0], [1, 0]);
    expect(d).toBeGreaterThan(111);
    expect(d).toBeLessThan(112);
  });
});

describe('bboxFromPoints', () => {
  it('umschliesst alle gegebenen Punkte', () => {
    const pts: LngLat[] = [
      [10, 48],
      [12, 49],
      [11, 47],
    ];
    const bb = bboxFromPoints(pts);
    expect(bb).toEqual({ minLng: 10, minLat: 47, maxLng: 12, maxLat: 49 });
  });

  it('wirft bei leerem Array', () => {
    expect(() => bboxFromPoints([])).toThrow();
  });
});

describe('bboxContains', () => {
  const bb = { minLng: 10, minLat: 47, maxLng: 12, maxLat: 49 };

  it('true fuer innen liegende Punkte', () => {
    expect(bboxContains(bb, [11, 48])).toBe(true);
  });

  it('true fuer Randpunkte', () => {
    expect(bboxContains(bb, [10, 47])).toBe(true);
    expect(bboxContains(bb, [12, 49])).toBe(true);
  });

  it('false fuer aussen liegende Punkte', () => {
    expect(bboxContains(bb, [13, 48])).toBe(false);
    expect(bboxContains(bb, [11, 50])).toBe(false);
  });

  it('Marienplatz und Flughafen liegen in der MUC-Region', () => {
    expect(bboxContains(MUC_REGION_BBOX, MARIENPLATZ_COORDS)).toBe(true);
    expect(bboxContains(MUC_REGION_BBOX, FLUGHAFEN_MUC_COORDS)).toBe(true);
  });
});

describe('centerOf', () => {
  it('Mittelpunkt zweier Punkte', () => {
    const c = centerOf([
      [10, 48],
      [12, 48],
    ]);
    expect(c).toEqual([11, 48]);
  });

  it('wirft bei leerem Array', () => {
    expect(() => centerOf([])).toThrow();
  });
});
