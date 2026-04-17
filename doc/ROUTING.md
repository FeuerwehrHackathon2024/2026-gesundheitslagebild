# ROUTING — OSRM-Integration, Cache, Fallbacks

Alle Patientenbewegungen laufen auf **echten Straßen-Routen** und werden animiert. Keine Luftlinien im UI.

## 1. Routen-Typen

| Typ                 | Farbe     | Auslöser                                    |
|---------------------|-----------|---------------------------------------------|
| `manv-transport`    | `#007AFF` | MANV-Patient onScene → Klinik               |
| `hospital-transfer` | `#AF52DE` | Inter-Hospital-Verlegung                    |
| `planned-arrival`   | `#34C759` | Flug landet am arrivalPoint → Zielkliniken  |

## 2. OSRM-Client

`lib/routing/osrm-client.ts`.

### 2.1 Endpoint

```
https://router.project-osrm.org/route/v1/driving/{fromLng},{fromLat};{toLng},{toLat}
  ?overview=full
  &geometries=geojson
  &steps=false
```

### 2.2 Response-Shape

```ts
interface OSRMResponse {
  code: string;
  routes: Array<{
    geometry: { coordinates: [number, number][]; type: 'LineString' };
    duration: number;   // seconds
    distance: number;   // meters
  }>;
}
```

### 2.3 Client-Funktion

```ts
export async function fetchRoute(
  from: [number, number],
  to: [number, number],
  signal?: AbortSignal,
): Promise<Route> { ... }
```

- **Timeout**: 8 s via `AbortController`.
- **Retry**: 1 Retry bei 5xx / Network-Error. Kein Retry bei 4xx.
- **Rate-Limit**: globale `await rateLimit(1000 / 2)` = max 2 Requests/Sekunde gegen den öffentlichen Server.
- **Error-Handling**: bei Fehler → Fallback (§4).

## 3. Cache

`lib/routing/route-cache.ts` via `idb`.

### 3.1 Struktur

```ts
interface CachedRoute {
  id: string;                   // "R-<fromRounded>-<toRounded>"
  from: [number, number];
  to: [number, number];
  polyline: [number, number][];
  durationSec: number;
  distanceM: number;
  computedAt: string;           // ISO
  source: 'osrm' | 'haversine-fallback';
}
```

**ID-Key**: Koordinaten auf 3 Dezimalstellen gerundet (~100 m Granularität), um Cache-Hits bei minimal abweichenden Startpunkten zu maximieren:

```ts
function routeId(from: [number,number], to: [number,number]) {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return `R-${r(from[0])},${r(from[1])}-${r(to[0])},${r(to[1])}`;
}
```

### 3.2 IndexedDB-Schema

Database: `rettungsleitstelle`.
Object Store: `routes`, Key = `route.id`.

### 3.3 Flow

```
getRoute(from, to):
  id = routeId(from, to)
  hit = await db.get('routes', id)
  if (hit) return hit
  try:
    osrm = await fetchRoute(from, to)
    cached = { id, ...osrm, source: 'osrm', computedAt: now }
    await db.put('routes', cached)
    return cached
  catch:
    fb = fallbackRoute(from, to)
    cached = { id, ...fb, source: 'haversine-fallback', computedAt: now }
    await db.put('routes', cached)
    return cached
```

### 3.4 Cache-Eviction

Keine automatische Eviction; der Cache darf wachsen. Im App-Header ein kleiner Button "Cache leeren" (im Settings-Menü), der nur `routes` löscht, nicht das Audit-Log.

## 4. Fallback (OSRM nicht verfügbar)

```ts
function fallbackRoute(from, to): Route {
  const distM = haversineKm(from, to) * 1000;
  const durSec = (distM / 1000) / 50 * 3600; // 50 km/h
  const polyline = interpolate(from, to, 20); // 20 Punkte gerade Linie
  return { polyline, durationSec: durSec, distanceM: distM, source: 'haversine-fallback' };
}
```

Fallback-Routen sind **visuell unterscheidbar**: gestrichelte statt durchgezogene Linie auf der Karte.

## 5. Animation

`components/map/RouteLayer.tsx`.

### 5.1 Marker-Pille

Kleine runde Kapsel (Radius 5 px), Farbe nach Routentyp (§1). Label optional mit Patientenzahl (bei Sammel-Transporten z. B. Flug-Landungen: "50").

### 5.2 Progress

Pro Tick wird der Fortschritt eines Transportes aktualisiert:

```ts
progressFraction = (simTime - startSimTime) / (route.durationSec / 60)
```

Begrenzt auf `[0, 1]`. Position = Linear-Interpolation entlang der Polyline.

### 5.3 Performance

- Route-Layer rendert als MapLibre GeoJSON Source, wird bei jedem Tick aktualisiert (nicht jeden Frame).
- Für viele parallele Routen (>100): Aggregation in einen Source + `circle` Paint-Layer mit per-feature Color.

### 5.4 Fade-Out

Abgeschlossene Routen (Patient angekommen) fade-out über 2 s und werden aus `state.routes` entfernt nach weiteren 3 s (damit Cache-Eintrag aber bleibt).

## 6. Spezialfall: Flug-Landung

Flüge landen am `arrivalPoint`. Die Patienten aus einem Flug werden dann per **separaten Landrouten** von `arrivalPoint` → Zielkliniken verteilt. Das sind mehrere Routen parallel — ein großer Punkt "stöbert" auseinander. Visuell effektiv.

Die Flug-Bewegung selbst (zwischen Horizont und Flughafen) ist **nicht** als OSRM-Route modelliert — stattdessen eine gerade Linie vom Kartenrand zum `arrivalPoint`, animiert in den letzten 60 Sim-min vor Landung, als subtiler Flugzeug-Pfeil (lucide-react `Plane`-Icon).

## 7. Tests

`tests/unit/routing.test.ts`:

- `routeId`-Rundung identisch für `(11.5751, 48.1372)` und `(11.5753, 48.1371)`.
- `fallbackRoute` liefert korrekte Distanz.
- Cache-Mock: zweiter Aufruf mit gleichen Koordinaten liefert gecachetes Ergebnis.
- Timeout-Test: wenn Netz blockt, fallback wird aktiv.

`tests/integration/routing-live.test.ts` (optional, skip wenn offline):
- Echte Anfrage an OSRM für München-Zentrum → Flughafen, `distanceM` zwischen 30 000 und 45 000.
