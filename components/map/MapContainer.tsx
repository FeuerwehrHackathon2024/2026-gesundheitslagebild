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
import type { Hospital, ContextHospital } from '@/lib/types';

const GERMANY_CENTER: [number, number] = [10.4515, 51.1657];
const INITIAL_ZOOM = 5.6;

type SimFeatureProps = {
  id: string;
  name: string;
  stufe: Hospital['versorgungsstufe'];
  occupancy: number; // 0..1 primary-discipline occupancy
  betten: number;
  city: string;
};

type CtxFeatureProps = {
  id: string;
  name: string;
  art?: string;
  city?: string;
};

function primaryOccupancy(h: Hospital): number {
  const entries = Object.values(h.disciplines);
  if (!entries.length) return 0;
  let total = 0;
  let occ = 0;
  for (const e of entries) {
    if (!e) continue;
    total += e.bedsTotal;
    occ += e.bedsOccupied;
  }
  return total > 0 ? occ / total : 0;
}

function totalBeds(h: Hospital): number {
  let t = 0;
  for (const e of Object.values(h.disciplines)) {
    if (e) t += e.bedsTotal;
  }
  return t;
}

function toSimFeatures(
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

function toCtxFeatures(
  list: ContextHospital[],
): GeoJSON.FeatureCollection<GeoJSON.Point, CtxFeatureProps> {
  return {
    type: 'FeatureCollection',
    features: list.map((h) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: h.coords },
      properties: {
        id: h.id,
        name: h.name,
        art: h.art,
        city: h.ort,
      },
    })),
  };
}

export function MapContainer() {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [hover, setHover] = useState<{
    name: string;
    detail: string;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: ref.current,
      style: DARK_STYLE_URL,
      center: GERMANY_CENTER,
      zoom: INITIAL_ZOOM,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(
      new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 120 }),
      'bottom-left',
    );

    map.on('load', () => {
      map.addSource('hospitals-context', {
        type: 'geojson',
        data: toCtxFeatures(HOSPITALS.context),
      });

      map.addSource('hospitals-sim', {
        type: 'geojson',
        data: toSimFeatures(HOSPITALS.simulated),
      });

      map.addLayer({
        id: 'hospitals-context-layer',
        type: 'circle',
        source: 'hospitals-context',
        paint: {
          'circle-radius': 2,
          'circle-color': '#6b7687', // text-2
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
            '#22c55e', // green
            0.7,
            '#22c55e',
            0.85,
            '#f5a623', // amber
            0.95,
            '#e5484d', // red
            1,
            '#e5484d',
          ],
          'circle-stroke-width': 1,
          'circle-stroke-color': '#a9b3c3',
          'circle-opacity': 0.95,
        },
      });

      const onEnter = (
        e: MapMouseEvent & { features?: MapGeoJSONFeature[] },
      ) => {
        map.getCanvas().style.cursor = 'pointer';
        const f = e.features?.[0];
        if (!f) return;
        const p = f.properties as Partial<SimFeatureProps & CtxFeatureProps>;
        const detailLines: string[] = [];
        if (p.stufe) {
          detailLines.push(`Stufe: ${p.stufe}`);
        }
        if (typeof p.betten === 'number') {
          detailLines.push(`Betten: ${p.betten}`);
        }
        if (typeof p.occupancy === 'number') {
          detailLines.push(`Auslastung: ${Math.round(p.occupancy * 100)} %`);
        }
        if (p.art) detailLines.push(`Art: ${p.art}`);
        if (p.city) detailLines.push(p.city);
        setHover({
          name: p.name ?? '—',
          detail: detailLines.join(' · '),
          x: e.point.x,
          y: e.point.y,
        });
      };
      const onLeave = () => {
        map.getCanvas().style.cursor = '';
        setHover(null);
      };
      const onMove = (
        e: MapMouseEvent & { features?: MapGeoJSONFeature[] },
      ) => {
        const f = e.features?.[0];
        if (!f) return;
        setHover((prev) =>
          prev ? { ...prev, x: e.point.x, y: e.point.y } : prev,
        );
      };

      for (const layerId of ['hospitals-sim-layer', 'hospitals-context-layer']) {
        map.on('mouseenter', layerId, onEnter as (e: MapLayerMouseEvent) => void);
        map.on('mousemove', layerId, onMove as (e: MapLayerMouseEvent) => void);
        map.on('mouseleave', layerId, onLeave);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="flex-1 relative bg-bg-0">
      <div ref={ref} className="absolute inset-0" />
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

