// Geografische Helfer. Alle Koordinaten sind [lng, lat] (GeoJSON-Konvention,
// identisch zu MapLibre und doc/DATA_MODEL.md).

export type LngLat = [number, number];

export interface BBox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

// Referenz-Punkte laut SPEC §3 bzw. DATA_MODEL.md §6.
export const MARIENPLATZ_COORDS: LngLat = [11.5755, 48.1374];
export const FLUGHAFEN_MUC_COORDS: LngLat = [11.7861, 48.3538];

// Muenchen-BBox als konservative Clamp-Region (Grossraum inkl. Umland bis
// ~Ingolstadt/Augsburg/Rosenheim — siehe SPEC §3).
export const MUC_REGION_BBOX: BBox = {
  minLng: 10.8,
  minLat: 47.6,
  maxLng: 12.3,
  maxLat: 48.9,
};

const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// Grosskreis-Distanz in Kilometern. Eingabe in [lng, lat].
export function haversine(a: LngLat, b: LngLat): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h =
    s1 * s1 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * s2 * s2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_KM * c;
}

// Minimale achsen-parallele BBox, die alle Punkte einschliesst.
// Wirft bei leerem Array.
export function bboxFromPoints(points: readonly LngLat[]): BBox {
  if (points.length === 0) {
    throw new Error('bboxFromPoints: mindestens ein Punkt erforderlich');
  }
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const [lng, lat] of points) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLng, minLat, maxLng, maxLat };
}

export function bboxContains(bbox: BBox, point: LngLat): boolean {
  const [lng, lat] = point;
  return (
    lng >= bbox.minLng &&
    lng <= bbox.maxLng &&
    lat >= bbox.minLat &&
    lat <= bbox.maxLat
  );
}

// Geometrischer Mittelpunkt (Durchschnitt). Fuer kleine Gebiete ausreichend;
// fuer weltweite Mittelpunkte waere ein echter Spherical-Mean noetig.
export function centerOf(points: readonly LngLat[]): LngLat {
  if (points.length === 0) {
    throw new Error('centerOf: mindestens ein Punkt erforderlich');
  }
  let sumLng = 0;
  let sumLat = 0;
  for (const [lng, lat] of points) {
    sumLng += lng;
    sumLat += lat;
  }
  return [sumLng / points.length, sumLat / points.length];
}
