'use client';

import { useEffect, useMemo } from 'react';
import type {
  Map as MaplibreMap,
  GeoJSONSource,
} from 'maplibre-gl';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { Incident, Patient } from '@/lib/types';
import { useSimStore } from '@/lib/store';
import { flowPath, flowPosition, flowDurationMin } from '@/lib/flow';
import type { LngLat } from '@/lib/geo';

interface LineProps {
  key: string;
  color: string;
  width: number;
  count: number;
  midLng: number;
  midLat: number;
  kind: string;
}

interface DotProps {
  key: string;
  color: string;
  radius: number;
  count: number;
}

interface LabelProps {
  key: string;
  text: string;
}

interface DotLabelProps {
  key: string;
  text: string;
  color: string;
}

const SRC_LINES = 'rl-routes-lines';
const SRC_DOTS = 'rl-routes-dots';
const SRC_LABELS = 'rl-routes-labels';
const SRC_DOT_LABELS = 'rl-routes-dot-labels';
const LAYER_LINES_HALO = 'rl-routes-lines-halo';
const LAYER_LINES = 'rl-routes-lines';
const LAYER_DOTS = 'rl-routes-dots';
const LAYER_LABELS = 'rl-routes-labels';
const LAYER_DOT_LABELS = 'rl-routes-dot-labels';

const COLOR_MANV = '#007AFF';
const COLOR_TRANSFER = '#AF52DE';
const COLOR_PLANNED = '#00C853'; // kraeftiges Gruen, deutlicher als Mint-Default

type FlowKind = 'manv' | 'transfer' | 'planned';

function flowKind(p: Patient): FlowKind {
  if (p.status === 'transferring') return 'transfer';
  if (p.source === 'planned-intake') return 'planned';
  return 'manv';
}

function colorForKind(k: FlowKind): string {
  switch (k) {
    case 'transfer':
      return COLOR_TRANSFER;
    case 'planned':
      return COLOR_PLANNED;
    default:
      return COLOR_MANV;
  }
}

function incidentLoc(patient: Patient, incidents: Incident[]): LngLat | null {
  if (patient.source === 'incident' && patient.sourceRefId) {
    const inc = incidents.find((i) => i.id === patient.sourceRefId);
    if (inc) return inc.location;
  }
  return null;
}

interface AggregatedFlow {
  key: string;
  from: LngLat;
  to: LngLat;
  kind: FlowKind;
  patients: Patient[];
}

interface RouteLayerProps {
  map: MaplibreMap;
}

export function RouteLayer({ map }: RouteLayerProps) {
  const simTime = useSimStore((s) => s.simTime);
  const patients = useSimStore((s) => s.patients);
  const hospitals = useSimStore((s) => s.hospitals);
  const incidents = useSimStore((s) => s.incidents);

  useEffect(() => {
    const ensure = () => {
      if (!map.getSource(SRC_LINES)) {
        map.addSource(SRC_LINES, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }
      if (!map.getSource(SRC_DOTS)) {
        map.addSource(SRC_DOTS, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }
      if (!map.getSource(SRC_LABELS)) {
        map.addSource(SRC_LABELS, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }
      if (!map.getSource(SRC_DOT_LABELS)) {
        map.addSource(SRC_DOT_LABELS, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }
      // Halo-Layer fuer Soldaten-/Intake-Fluesse: breite, transparente Linie
      // unter der Hauptlinie → der Fluss ist auch neben dichten Marker-
      // Clustern am Flughafen sofort erkennbar.
      if (!map.getLayer(LAYER_LINES_HALO)) {
        map.addLayer({
          id: LAYER_LINES_HALO,
          type: 'line',
          source: SRC_LINES,
          filter: ['==', ['get', 'kind'], 'planned'],
          paint: {
            'line-color': ['get', 'color'],
            'line-width': ['+', ['get', 'width'], 10],
            'line-opacity': 0.18,
            'line-blur': 2,
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
      }
      if (!map.getLayer(LAYER_LINES)) {
        map.addLayer({
          id: LAYER_LINES,
          type: 'line',
          source: SRC_LINES,
          paint: {
            'line-color': ['get', 'color'],
            'line-width': ['get', 'width'],
            'line-opacity': 0.9,
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
      }
      if (!map.getLayer(LAYER_DOTS)) {
        map.addLayer({
          id: LAYER_DOTS,
          type: 'circle',
          source: SRC_DOTS,
          paint: {
            'circle-color': ['get', 'color'],
            'circle-radius': ['get', 'radius'],
            'circle-stroke-color': '#FFFFFF',
            'circle-stroke-width': 2,
            'circle-opacity': 0.98,
          },
        });
      }
      if (!map.getLayer(LAYER_LABELS)) {
        map.addLayer({
          id: LAYER_LABELS,
          type: 'symbol',
          source: SRC_LABELS,
          layout: {
            'text-field': ['get', 'text'],
            'text-size': 11,
            'text-offset': [0, -1.6],
            'text-allow-overlap': true,
            'text-ignore-placement': true,
            'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold', 'sans-serif'],
          },
          paint: {
            'text-color': '#1D1D1F',
            'text-halo-color': '#FFFFFF',
            'text-halo-width': 2,
          },
        });
      }
      // Pillen-Label: Patientenzahl DIREKT auf der Batch-Pille, damit klar
      // erkennbar wie viele Patienten in diesem Konvoi unterwegs sind.
      if (!map.getLayer(LAYER_DOT_LABELS)) {
        map.addLayer({
          id: LAYER_DOT_LABELS,
          type: 'symbol',
          source: SRC_DOT_LABELS,
          layout: {
            'text-field': ['get', 'text'],
            'text-size': 11,
            'text-allow-overlap': true,
            'text-ignore-placement': true,
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold', 'sans-serif'],
          },
          paint: {
            'text-color': '#FFFFFF',
            'text-halo-color': ['get', 'color'],
            'text-halo-width': 1,
          },
        });
      }
    };
    ensure();
  }, [map]);

  const { lineFC, dotFC, labelFC, dotLabelFC } = useMemo(() => {
    // Gruppiere Patient-Flows nach (from-hospital|incident) → to-hospital.
    const groups = new Map<string, AggregatedFlow>();
    for (const p of patients) {
      if (p.status !== 'transport' && p.status !== 'transferring') continue;

      let from: LngLat | null = null;
      let to: LngLat | null = null;

      if (p.status === 'transport') {
        from = incidentLoc(p, incidents);
        const targetId = p.assignedHospitalId;
        if (targetId) to = hospitals[targetId]?.coords ?? null;
      } else {
        const srcId = p.assignedHospitalId;
        const tgtId = p.transferTargetHospitalId;
        if (srcId) from = hospitals[srcId]?.coords ?? null;
        if (tgtId) to = hospitals[tgtId]?.coords ?? null;
      }
      if (!from || !to || p.arrivedAt == null) continue;

      const kind = flowKind(p);
      const key = `${kind}|${from[0].toFixed(4)},${from[1].toFixed(4)}|${to[0].toFixed(4)},${to[1].toFixed(4)}`;
      let group = groups.get(key);
      if (!group) {
        group = { key, from, to, kind, patients: [] };
        groups.set(key, group);
      }
      group.patients.push(p);
    }

    const lines: Array<Feature<LineString, LineProps>> = [];
    const dots: Array<Feature<Point, DotProps>> = [];
    const labels: Array<Feature<Point, LabelProps>> = [];
    const dotLabels: Array<Feature<Point, DotLabelProps>> = [];

    // Batch-Groesse: so viele Patienten teilen sich eine Transport-Pille.
    // Damit entsteht eine ueberschaubare Anzahl von "Konvoi-Fahrzeugen"
    // pro Fluss statt hunderter winziger Pillen.
    const BATCH_SIZE = 30;

    for (const [, g] of groups) {
      const poly = flowPath(g.from, g.to);
      const color = colorForKind(g.kind);
      const count = g.patients.length;
      const kindBoost = g.kind === 'planned' ? 1.5 : 0;
      const width = Math.min(12, 2.5 + 1.5 * Math.sqrt(count) + kindBoost);

      lines.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: poly },
        properties: {
          key: g.key,
          color,
          width,
          count,
          kind: g.kind,
          midLng: poly[Math.floor(poly.length / 2)][0],
          midLat: poly[Math.floor(poly.length / 2)][1],
        },
      });

      // Start-/End-Label mit Gesamtzahl (Mitte der Linie).
      if (count > 1) {
        const mid = poly[Math.floor(poly.length / 2)];
        labels.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: mid },
          properties: { key: g.key, text: `${count} Patienten` },
        });
      }

      // Patienten in Batches zerlegen. Jeder Batch ist ein "Konvoi" mit
      // einer einzigen Pille + Patient-Zahl drauf, die sich entlang der
      // Bezier bewegt. Mehrere Batches = mehrere Konvois hintereinander.
      const batches: Patient[][] = [];
      for (let i = 0; i < g.patients.length; i += BATCH_SIZE) {
        batches.push(g.patients.slice(i, i + BATCH_SIZE));
      }

      for (let bIdx = 0; bIdx < batches.length; bIdx++) {
        const batch = batches[bIdx];
        const batchCount = batch.length;
        // Progress: Mittelwert des Batches — so rollen Batches natuerlich
        // staggered (spaetere Batches spawnen spaeter → geringerer progress).
        let progressSum = 0;
        for (const p of batch) {
          const durMin = flowDurationMin(g.from, g.to);
          const startSim = (p.arrivedAt ?? 0) - durMin;
          progressSum += durMin <= 0 ? 1 : Math.max(0, Math.min(1, (simTime - startSim) / durMin));
        }
        const avgProgress = progressSum / batchCount;
        const pos = flowPosition(g.from, g.to, avgProgress);
        const radius = Math.min(22, 9 + 1.8 * Math.sqrt(batchCount));
        const dotKey = `${g.key}|batch-${bIdx}`;

        dots.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: pos },
          properties: { key: dotKey, color, radius, count: batchCount },
        });
        dotLabels.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: pos },
          properties: { key: dotKey, text: String(batchCount), color },
        });
      }
    }

    const lineFC: FeatureCollection<LineString, LineProps> = {
      type: 'FeatureCollection',
      features: lines,
    };
    const dotFC: FeatureCollection<Point, DotProps> = {
      type: 'FeatureCollection',
      features: dots,
    };
    const labelFC: FeatureCollection<Point, LabelProps> = {
      type: 'FeatureCollection',
      features: labels,
    };
    const dotLabelFC: FeatureCollection<Point, DotLabelProps> = {
      type: 'FeatureCollection',
      features: dotLabels,
    };
    return { lineFC, dotFC, labelFC, dotLabelFC };
  }, [patients, incidents, hospitals, simTime]);

  useEffect(() => {
    const srcLines = map.getSource(SRC_LINES) as GeoJSONSource | undefined;
    const srcDots = map.getSource(SRC_DOTS) as GeoJSONSource | undefined;
    const srcLabels = map.getSource(SRC_LABELS) as GeoJSONSource | undefined;
    const srcDotLabels = map.getSource(SRC_DOT_LABELS) as GeoJSONSource | undefined;
    if (srcLines) srcLines.setData(lineFC);
    if (srcDots) srcDots.setData(dotFC);
    if (srcLabels) srcLabels.setData(labelFC);
    if (srcDotLabels) srcDotLabels.setData(dotLabelFC);
  }, [map, lineFC, dotFC, labelFC, dotLabelFC]);

  return null;
}
