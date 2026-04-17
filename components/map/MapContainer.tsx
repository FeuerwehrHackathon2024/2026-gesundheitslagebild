'use client';

import { useEffect, useRef, useState } from 'react';
import maplibregl, {
  type MapGeoJSONFeature,
  type MapLayerMouseEvent,
  type MapMouseEvent,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { DARK_STYLE_URL } from './mapStyle';
import { HOSPITALS } from '@/lib/data/hospitalsLoader';
import { PZC_BY_CODE } from '@/lib/data/pzc';
import { useSimStore, type Filters } from '@/lib/store';
import type { Hospital, ContextHospital, Incident } from '@/lib/types';

const GERMANY_CENTER: [number, number] = [10.4515, 51.1657];
const INITIAL_ZOOM = 5.6;

type SimFeatureProps = {
  id: string;
  name: string;
  stufe: Hospital['versorgungsstufe'];
  occupancy: number;
  incoming: number;
  betten: number;
  bettenFrei: number;
  bettenBelegt: number;
  passes: number;
  excluded: number; // 1 = Operator-Exclude
  city: string;
};

type CtxFeatureProps = {
  id: string;
  name: string;
  art?: string;
  city?: string;
};

type IncFeatureProps = {
  id: string;
  label: string;
  casualties: number;
  radius: number;
};

/**
 * Gesamt-Auslastung: Summe belegt / Summe gesamt ueber alle Disciplines.
 * Konsistent mit frei/belegt in der Tooltip-Anzeige.
 */
function overallOccupancy(h: Hospital): number {
  let total = 0;
  let occ = 0;
  for (const e of Object.values(h.disciplines)) {
    if (!e) continue;
    total += e.bedsTotal;
    occ += e.bedsOccupied;
  }
  return total > 0 ? occ / total : 0;
}

function totalBeds(h: Hospital): number {
  let t = 0;
  for (const e of Object.values(h.disciplines)) if (e) t += e.bedsTotal;
  return t;
}

function sumDisciplines(
  h: Hospital,
): { total: number; occupied: number; free: number } {
  let total = 0;
  let occupied = 0;
  for (const e of Object.values(h.disciplines)) {
    if (!e) continue;
    total += e.bedsTotal;
    occupied += e.bedsOccupied;
  }
  const free = Math.max(0, total - occupied);
  return { total, occupied, free };
}

function hospitalPassesFilter(h: Hospital, filters: Filters): boolean {
  const { free, occupied } = sumDisciplines(h);
  if (filters.freeMin > 0 && free < filters.freeMin) return false;
  if (filters.occupiedMax > 0 && occupied > filters.occupiedMax) return false;
  if (filters.emergencyMin > 0 && h.emergencyBeds < filters.emergencyMin)
    return false;
  return true;
}

function simFC(
  list: Hospital[],
  inflow: Record<string, number>,
  filters: Filters,
): GeoJSON.FeatureCollection<GeoJSON.Point, SimFeatureProps> {
  return {
    type: 'FeatureCollection',
    features: list.map((h) => {
      const s = sumDisciplines(h);
      const passes = hospitalPassesFilter(h, filters);
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: h.coords },
        properties: {
          id: h.id,
          name: h.name,
          stufe: h.versorgungsstufe,
          occupancy: overallOccupancy(h),
          incoming: inflow[h.id] ?? 0,
          betten: totalBeds(h),
          bettenFrei: s.free,
          bettenBelegt: s.occupied,
          passes: passes ? 1 : 0,
          excluded: h.excludedFromAllocation ? 1 : 0,
          city: h.address.city,
        },
      };
    }),
  };
}

function ctxFC(
  list: ContextHospital[],
): GeoJSON.FeatureCollection<GeoJSON.Point, CtxFeatureProps> {
  return {
    type: 'FeatureCollection',
    features: list.map((h) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: h.coords },
      properties: { id: h.id, name: h.name, art: h.art, city: h.ort },
    })),
  };
}

/**
 * Pseudo-Isochrone: einfache geografische Kreise um einen Punkt in km.
 * Keine echten Routing-Isochronen — 30 km entsprechen grob 10-20 min
 * Fahrzeit mit Blaulicht auf Autobahn, 5-10 min in der Stadt (SPEC §12).
 */
function ringPolygon(
  center: [number, number],
  radiusKm: number,
): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  const R = 6371;
  const lat0 = (center[1] * Math.PI) / 180;
  const lng0 = (center[0] * Math.PI) / 180;
  const d = radiusKm / R;
  for (let i = 0; i <= 64; i++) {
    const bearing = (i / 64) * 2 * Math.PI;
    const lat = Math.asin(
      Math.sin(lat0) * Math.cos(d) +
        Math.cos(lat0) * Math.sin(d) * Math.cos(bearing),
    );
    const lng =
      lng0 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(d) * Math.cos(lat0),
        Math.cos(d) - Math.sin(lat0) * Math.sin(lat),
      );
    points.push([(lng * 180) / Math.PI, (lat * 180) / Math.PI]);
  }
  return points;
}

function isochroneFC(list: Incident[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const inc of list) {
    for (const km of [10, 20, 30]) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [ringPolygon(inc.location, km)],
        },
        properties: { incidentId: inc.id, radiusKm: km },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

function incFC(
  list: Incident[],
): GeoJSON.FeatureCollection<GeoJSON.Point, IncFeatureProps> {
  return {
    type: 'FeatureCollection',
    features: list.map((i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: i.location },
      properties: {
        id: i.id,
        label: i.label,
        casualties: i.estimatedCasualties,
        radius: i.radius ?? 1000,
      },
    })),
  };
}

export function MapContainer() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const lastIncidentIdRef = useRef<string | null>(null);

  const [hover, setHover] = useState<{
    kind: 'sim' | 'ctx' | 'incident';
    id: string;
    x: number;
    y: number;
  } | null>(null);

  // Mount
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK_STYLE_URL,
      center: GERMANY_CENTER,
      zoom: INITIAL_ZOOM,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      'top-right',
    );
    map.addControl(
      new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 120 }),
      'bottom-left',
    );

    map.on('load', () => {
      map.resize();
      map.addSource('hospitals-context', {
        type: 'geojson',
        data: ctxFC(HOSPITALS.context),
      });
      map.addSource('hospitals-sim', {
        type: 'geojson',
        data: simFC(HOSPITALS.simulated, {}, useSimStore.getState().filters),
      });
      map.addSource('incidents', {
        type: 'geojson',
        data: incFC([]),
      });
      map.addSource('isochrones', {
        type: 'geojson',
        data: isochroneFC([]),
      });

      // Isochronen zuerst (unter allen Haeusern)
      map.addLayer({
        id: 'isochrones-fill',
        type: 'fill',
        source: 'isochrones',
        paint: {
          'fill-color': '#f5a623',
          'fill-opacity': [
            'interpolate',
            ['linear'],
            ['get', 'radiusKm'],
            10,
            0.08,
            30,
            0.02,
          ],
        },
      });
      map.addLayer({
        id: 'isochrones-line',
        type: 'line',
        source: 'isochrones',
        paint: {
          'line-color': '#f5a623',
          'line-opacity': 0.4,
          'line-width': 1,
          'line-dasharray': [2, 3],
        },
      });

      map.addLayer({
        id: 'hospitals-context-layer',
        type: 'circle',
        source: 'hospitals-context',
        paint: {
          'circle-radius': 2,
          'circle-color': '#6b7687',
          'circle-opacity': 0.55,
          'circle-stroke-width': 0,
        },
      });

      // Halo-Layer fuer Haeuser mit aktivem Patienten-Zulauf (cyan ring).
      // Nur bei Haeusern, die den Filter passieren.
      map.addLayer({
        id: 'hospitals-sim-halo',
        type: 'circle',
        source: 'hospitals-sim',
        filter: [
          'all',
          ['>', ['get', 'incoming'], 0],
          ['==', ['get', 'passes'], 1],
        ],
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'incoming'],
            1,
            12,
            5,
            18,
            15,
            28,
          ],
          'circle-color': '#38bdf8',
          'circle-opacity': 0.15,
          'circle-stroke-color': '#38bdf8',
          'circle-stroke-width': 1.5,
          'circle-stroke-opacity': 0.7,
        },
      });

      map.addLayer({
        id: 'hospitals-sim-layer',
        type: 'circle',
        source: 'hospitals-sim',
        paint: {
          'circle-radius': [
            'match',
            ['get', 'stufe'],
            'maximal',
            9,
            'schwerpunkt',
            7,
            'regel',
            5,
            'grund',
            4,
            4,
          ],
          'circle-color': [
            'interpolate',
            ['linear'],
            ['get', 'occupancy'],
            0,
            '#22c55e',
            0.7,
            '#22c55e',
            0.85,
            '#f5a623',
            0.95,
            '#e5484d',
            1,
            '#e5484d',
          ],
          'circle-stroke-width': [
            'case',
            ['>', ['get', 'incoming'], 0],
            2.5,
            1,
          ],
          'circle-stroke-color': [
            'case',
            ['>', ['get', 'incoming'], 0],
            '#38bdf8',
            '#a9b3c3',
          ],
          // Ausgefilterte Haeuser werden gedimmt (aber bleiben sichtbar).
          'circle-opacity': [
            'case',
            ['==', ['get', 'passes'], 1],
            0.95,
            0.18,
          ],
          'circle-stroke-opacity': [
            'case',
            ['==', ['get', 'passes'], 1],
            1,
            0.2,
          ],
        },
      });

      // Operator-Exclude Overlay: roter durchgestrichener Kreis
      map.addLayer({
        id: 'hospitals-sim-excluded',
        type: 'circle',
        source: 'hospitals-sim',
        filter: ['==', ['get', 'excluded'], 1],
        paint: {
          'circle-radius': [
            'match',
            ['get', 'stufe'],
            'maximal',
            14,
            'schwerpunkt',
            12,
            'regel',
            10,
            'grund',
            9,
            9,
          ],
          'circle-color': '#e5484d',
          'circle-opacity': 0.15,
          'circle-stroke-color': '#e5484d',
          'circle-stroke-width': 2,
          'circle-stroke-opacity': 0.9,
        },
      });

      // Incident: Ring mit Radius (Pseudo-Ausbreitungsgebiet)
      map.addLayer({
        id: 'incidents-ring',
        type: 'circle',
        source: 'incidents',
        paint: {
          'circle-radius': 22,
          'circle-color': '#e5484d',
          'circle-opacity': 0.12,
          'circle-stroke-color': '#e5484d',
          'circle-stroke-width': 2,
          'circle-stroke-opacity': 0.8,
        },
      });
      map.addLayer({
        id: 'incidents-core',
        type: 'circle',
        source: 'incidents',
        paint: {
          'circle-radius': 7,
          'circle-color': '#f5a623',
          'circle-stroke-color': '#e6eaf2',
          'circle-stroke-width': 1.5,
        },
      });

      readyRef.current = true;

      const LAYER_KIND: Record<string, 'sim' | 'ctx' | 'incident'> = {
        'hospitals-sim-layer': 'sim',
        'hospitals-context-layer': 'ctx',
        'incidents-core': 'incident',
      };

      const onEnterForLayer = (layerId: string) =>
        (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
          map.getCanvas().style.cursor = 'pointer';
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties as Partial<
            SimFeatureProps & CtxFeatureProps & IncFeatureProps
          >;
          if (!p.id) return;
          setHover({
            kind: LAYER_KIND[layerId] ?? 'sim',
            id: String(p.id),
            x: e.point.x,
            y: e.point.y,
          });
        };
      const onLeave = () => {
        map.getCanvas().style.cursor = '';
        setHover(null);
      };
      const onMove = (e: MapMouseEvent) => {
        setHover((prev) =>
          prev ? { ...prev, x: e.point.x, y: e.point.y } : prev,
        );
      };

      const onClick = (
        e: MapMouseEvent & { features?: MapGeoJSONFeature[] },
      ) => {
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as Partial<SimFeatureProps & IncFeatureProps>;
        if (!p.id) return;
        if (f.source === 'hospitals-sim') {
          useSimStore
            .getState()
            .setSelection({ kind: 'hospital', id: String(p.id) });
        } else if (f.source === 'incidents') {
          useSimStore
            .getState()
            .setSelection({ kind: 'incident', id: String(p.id) });
        }
      };

      for (const layer of Object.keys(LAYER_KIND)) {
        map.on(
          'mouseenter',
          layer,
          onEnterForLayer(layer) as (e: MapLayerMouseEvent) => void,
        );
        map.on('mousemove', layer, onMove as (e: MapLayerMouseEvent) => void);
        map.on('mouseleave', layer, onLeave);
        // Klick auf sim/incident layers selektiert das Feature
        if (layer !== 'hospitals-context-layer') {
          map.on('click', layer, onClick as (e: MapLayerMouseEvent) => void);
        }
      }
    });

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
  }, []);

  // Subscribe: Hospital-Auslastung + Patienten + Filter -> Source updaten
  const hospitals = useSimStore((s) => s.hospitals);
  const patients = useSimStore((s) => s.patients);
  const filters = useSimStore((s) => s.filters);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const src = map.getSource('hospitals-sim') as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!src) return;
    // Inflow: Patienten die aktiv im Haus bzw. auf dem Weg sind,
    // gefiltert auf aktive SK-Auswahl. T4 (palliativ) zaehlt immer mit.
    const inflow: Record<string, number> = {};
    for (const p of patients) {
      if (!p.assignedHospitalId) continue;
      if (p.status !== 'transport' && p.status !== 'inTreatment') continue;
      const pzc = PZC_BY_CODE[p.pzc];
      if (!pzc) continue;
      if (pzc.triage !== 'T4' && !filters.sk[pzc.triage as 'T1' | 'T2' | 'T3'])
        continue;
      inflow[p.assignedHospitalId] = (inflow[p.assignedHospitalId] ?? 0) + 1;
    }
    const list = Object.values(hospitals);
    src.setData(simFC(list, inflow, filters) as GeoJSON.GeoJSON);
  }, [hospitals, patients, filters]);

  // Subscribe: Incidents geaendert -> Layer updaten, bei neuem fliegen
  const incidents = useSimStore((s) => s.incidents);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const src = map.getSource('incidents') as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!src) return;
    src.setData(incFC(incidents) as GeoJSON.GeoJSON);

    const isoSrc = map.getSource('isochrones') as
      | maplibregl.GeoJSONSource
      | undefined;
    if (isoSrc) {
      isoSrc.setData(isochroneFC(incidents) as GeoJSON.GeoJSON);
    }

    const latest = incidents[incidents.length - 1];
    if (latest && latest.id !== lastIncidentIdRef.current) {
      lastIncidentIdRef.current = latest.id;
      map.flyTo({
        center: latest.location,
        zoom: 9,
        speed: 1.2,
      });
    }
  }, [incidents]);

  return (
    <div className="flex-1 relative bg-bg-0 min-h-0">
      <div ref={containerRef} className="h-full w-full" />
      {hover && (
        <div
          className="pointer-events-none absolute z-10 bg-bg-2 border border-border-2 px-2 py-1 text-[12px] max-w-[320px]"
          style={{
            left: Math.min(hover.x + 12, 10000),
            top: Math.max(hover.y - 28, 0),
          }}
        >
          {hover.kind === 'sim' && <SimTooltip id={hover.id} />}
          {hover.kind === 'ctx' && <CtxTooltip id={hover.id} />}
          {hover.kind === 'incident' && <IncidentTooltip id={hover.id} />}
        </div>
      )}
      <div className="absolute top-2 left-2 z-10 flex gap-2 text-[11px]">
        <span className="section-label bg-bg-1 border border-border-1 px-2 py-1">
          <span className="text-text-0 num">{HOSPITALS.simulated.length}</span>{' '}
          simuliert
        </span>
        <span className="section-label bg-bg-1 border border-border-1 px-2 py-1">
          <span className="text-text-0 num">{HOSPITALS.context.length}</span>{' '}
          Kontext
        </span>
      </div>
    </div>
  );
}

/**
 * Tooltip fuer simulierte Haeuser — subscribed den Store, aktualisiert live.
 */
function SimTooltip({ id }: { id: string }) {
  const hospital = useSimStore((s) => s.hospitals[id]);
  const counts = useSimStore((s) => {
    const c = { planned: 0, transport: 0, inTreatment: 0, done: 0 };
    for (const p of s.patients) {
      if (p.assignedHospitalId !== id) continue;
      if (p.status === 'onScene') c.planned += 1;
      else if (p.status === 'transport') c.transport += 1;
      else if (p.status === 'inTreatment') c.inTreatment += 1;
      else if (p.status === 'discharged' || p.status === 'deceased') c.done += 1;
    }
    return c;
  });
  if (!hospital) return null;

  const s = sumDisciplines(hospital);
  const totalOcc = s.total > 0 ? (s.occupied / s.total) * 100 : 0;
  const effective =
    s.total > 0
      ? Math.min(100, ((s.occupied + counts.transport) / s.total) * 100)
      : 0;

  return (
    <>
      <div className="text-text-0 font-medium">{hospital.name}</div>
      {hospital.excludedFromAllocation && (
        <div className="text-accent-red num text-[10px] mt-0.5">
          ◯ Aus Zuteilung genommen
        </div>
      )}
      <div className="text-text-1 num mt-0.5">
        Stufe: {hospital.versorgungsstufe} · Betten: {s.total}
      </div>
      <div className="text-text-1 num">
        frei <span className="text-accent-green">{s.free}</span> · belegt{' '}
        <span className="text-text-0">{s.occupied}</span>
      </div>
      <div className="text-text-1 num">
        Auslastung: <span className="text-text-0">{totalOcc.toFixed(0)} %</span>
        {counts.transport > 0 && (
          <span className="text-accent-cyan">
            {' '}
            → mit Zulauf {effective.toFixed(0)} %
          </span>
        )}
      </div>
      <div className="text-text-1 num">
        Notfallbetten:{' '}
        <span
          className={
            hospital.emergencyBeds > 0 ? 'text-accent-amber' : 'text-text-2'
          }
        >
          {hospital.emergencyBeds}
        </span>
      </div>
      {(counts.planned > 0 ||
        counts.transport > 0 ||
        counts.inTreatment > 0 ||
        counts.done > 0) && (
        <div className="mt-1 num text-[11px]">
          <span className="text-text-2">Geplant </span>
          <span className="text-text-0">{counts.planned}</span>
          <span className="text-text-2"> · Zulauf </span>
          <span className="text-accent-cyan">{counts.transport}</span>
          <span className="text-text-2"> · Behandlung </span>
          <span className="text-text-0">{counts.inTreatment}</span>
          <span className="text-text-2"> · Abgeschlossen </span>
          <span className="text-text-2">{counts.done}</span>
        </div>
      )}
      {hospital.address.city && (
        <div className="text-text-2 num">{hospital.address.city}</div>
      )}
    </>
  );
}

function CtxTooltip({ id }: { id: string }) {
  const ctx = HOSPITALS.context.find((h) => h.id === id);
  if (!ctx) return null;
  return (
    <>
      <div className="text-text-0 font-medium">{ctx.name}</div>
      {ctx.art && (
        <div className="text-text-1 num mt-0.5">Art: {ctx.art}</div>
      )}
      {typeof ctx.betten === 'number' && (
        <div className="text-text-1 num">Betten: {ctx.betten}</div>
      )}
      {ctx.ort && <div className="text-text-2 num">{ctx.ort}</div>}
    </>
  );
}

function IncidentTooltip({ id }: { id: string }) {
  const incident = useSimStore((s) => s.incidents.find((i) => i.id === id));
  const counts = useSimStore((s) => {
    const out = { assigned: 0, transport: 0, treated: 0, done: 0 };
    for (const p of s.patients) {
      if (p.incidentId !== id) continue;
      if (p.status === 'onScene') continue;
      if (p.status === 'transport') out.transport += 1;
      else if (p.status === 'inTreatment') out.treated += 1;
      else if (p.status === 'discharged' || p.status === 'deceased') out.done += 1;
      if (p.assignedHospitalId) out.assigned += 1;
    }
    return out;
  });
  if (!incident) return null;
  return (
    <>
      <div className="text-text-0 font-medium">{incident.label}</div>
      <div className="text-text-1 num mt-0.5">
        {incident.estimatedCasualties} Patienten · Start T+{incident.startedAt}min
      </div>
      <div className="text-text-1 num">
        Transport: {counts.transport} · in Behandlung: {counts.treated} ·
        abgeschlossen: {counts.done}
      </div>
    </>
  );
}
