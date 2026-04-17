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
import { useSimStore } from '@/lib/store';
import type { Hospital, ContextHospital, Incident } from '@/lib/types';

const GERMANY_CENTER: [number, number] = [10.4515, 51.1657];
const INITIAL_ZOOM = 5.6;

type SimFeatureProps = {
  id: string;
  name: string;
  stufe: Hospital['versorgungsstufe'];
  occupancy: number;
  betten: number;
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

function primaryOccupancy(h: Hospital): number {
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

function simFC(
  list: Hospital[],
): GeoJSON.FeatureCollection<GeoJSON.Point, SimFeatureProps> {
  return {
    type: 'FeatureCollection',
    features: list.map((h) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: h.coords },
      properties: {
        id: h.id,
        name: h.name,
        stufe: h.versorgungsstufe,
        occupancy: primaryOccupancy(h),
        betten: totalBeds(h),
        city: h.address.city,
      },
    })),
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
    name: string;
    detail: string;
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
        data: simFC(HOSPITALS.simulated),
      });
      map.addSource('incidents', {
        type: 'geojson',
        data: incFC([]),
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
          'circle-stroke-width': 1,
          'circle-stroke-color': '#a9b3c3',
          'circle-opacity': 0.95,
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

      const onEnter = (
        e: MapMouseEvent & { features?: MapGeoJSONFeature[] },
      ) => {
        map.getCanvas().style.cursor = 'pointer';
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as Partial<
          SimFeatureProps & CtxFeatureProps & IncFeatureProps
        >;
        const lines: string[] = [];
        if (p.stufe) lines.push(`Stufe: ${p.stufe}`);
        if (typeof p.betten === 'number') lines.push(`Betten: ${p.betten}`);
        if (typeof p.occupancy === 'number')
          lines.push(`Auslastung: ${Math.round(p.occupancy * 100)} %`);
        if (p.art) lines.push(`Art: ${p.art}`);
        if (typeof p.casualties === 'number')
          lines.push(`${p.casualties} Patienten`);
        if (p.city) lines.push(p.city);
        setHover({
          name: p.name ?? p.label ?? '—',
          detail: lines.join(' · '),
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

      for (const layer of [
        'hospitals-sim-layer',
        'hospitals-context-layer',
        'incidents-core',
      ]) {
        map.on(
          'mouseenter',
          layer,
          onEnter as (e: MapLayerMouseEvent) => void,
        );
        map.on('mousemove', layer, onMove as (e: MapLayerMouseEvent) => void);
        map.on('mouseleave', layer, onLeave);
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

  // Subscribe: Hospital-Auslastung aendert sich jeden Tick
  const hospitals = useSimStore((s) => s.hospitals);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const src = map.getSource('hospitals-sim') as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!src) return;
    const list = Object.values(hospitals);
    src.setData(simFC(list) as GeoJSON.GeoJSON);
  }, [hospitals]);

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
          className="pointer-events-none absolute z-10 bg-bg-2 border border-border-2 px-2 py-1 text-[12px] max-w-[280px]"
          style={{
            left: Math.min(hover.x + 12, 10000),
            top: Math.max(hover.y - 28, 0),
          }}
        >
          <div className="text-text-0 font-medium">{hover.name}</div>
          {hover.detail && (
            <div className="text-text-1 num mt-0.5">{hover.detail}</div>
          )}
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
