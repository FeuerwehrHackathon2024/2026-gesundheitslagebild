/**
 * Great-circle distance (haversine) zwischen zwei [lng, lat]-Punkten in km.
 * SPEC §4.3 committed sich auf haversine, kein echtes Routing.
 */
export function haversineKm(
  a: [number, number],
  b: [number, number],
): number {
  const R = 6371;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const la1 = toRad(lat1);
  const la2 = toRad(lat2);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
