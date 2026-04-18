'use client';

import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MaplibreMap, type Marker } from 'maplibre-gl';
import { useSimStore } from '@/lib/store';
import type { Patient, PlannedIntake } from '@/lib/types';

interface IntakeCounts {
  total: number;
  spawned: number;
  onScene: number;
  transport: number;
  inTreatment: number;
  discharged: number;
}

function countsFor(intake: PlannedIntake, patients: Patient[]): IntakeCounts {
  let spawned = 0,
    onScene = 0,
    transport = 0,
    inTreatment = 0,
    discharged = 0;
  for (const p of patients) {
    if (p.sourceRefId !== intake.id || p.source !== 'planned-intake') continue;
    spawned++;
    switch (p.status) {
      case 'onScene':
        onScene++;
        break;
      case 'transport':
        transport++;
        break;
      case 'inTreatment':
      case 'transferring':
        inTreatment++;
        break;
      case 'discharged':
      case 'deceased':
        discharged++;
        break;
    }
  }
  return { total: intake.totalPatients, spawned, onScene, transport, inTreatment, discharged };
}

function applyMarkerState(
  el: HTMLDivElement,
  intake: PlannedIntake,
  counts: IntakeCounts
): void {
  const notYet = Math.max(0, counts.total - counts.spawned);
  // "Noch zu transportieren" = bereits am Flughafen + noch im Anflug.
  const remaining = counts.onScene + counts.transport + notYet;
  const resolved = remaining === 0 && counts.total > 0;

  el.setAttribute('data-intake-status', intake.status);

  const countEl = el.querySelector<HTMLDivElement>('.rl-intake-count');
  if (countEl) countEl.textContent = resolved ? '✓' : String(remaining);

  el.title = `${intake.label} — ${remaining}/${counts.total} noch nicht versorgt`;
}

function createIntakeElement(intake: PlannedIntake, counts: IntakeCounts): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'rl-intake-marker';
  wrap.setAttribute('data-testid', 'intake-marker');
  wrap.setAttribute('data-intake-id', intake.id);
  wrap.innerHTML = `
    <div class="rl-intake-plane">&#9992;</div>
    <div class="rl-intake-count">${intake.totalPatients}</div>
  `;
  applyMarkerState(wrap, intake, counts);
  return wrap;
}

interface PlannedIntakeLayerProps {
  map: MaplibreMap;
}

export function PlannedIntakeLayer({ map }: PlannedIntakeLayerProps) {
  const intakes = useSimStore((s) => s.plannedIntakes);
  const patients = useSimStore((s) => s.patients);
  const markersRef = useRef<Map<string, Marker>>(new Map());

  useEffect(() => {
    const active = new Set(intakes.map((i) => i.id));
    for (const [id, m] of markersRef.current) {
      if (!active.has(id)) {
        m.remove();
        markersRef.current.delete(id);
      }
    }
    for (const intake of intakes) {
      const counts = countsFor(intake, patients);
      let m = markersRef.current.get(intake.id);
      if (!m) {
        const el = createIntakeElement(intake, counts);
        m = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(intake.arrivalPoint)
          .addTo(map);
        markersRef.current.set(intake.id, m);
      } else {
        applyMarkerState(m.getElement() as HTMLDivElement, intake, counts);
      }
    }
    return undefined;
  }, [map, intakes, patients]);

  useEffect(() => {
    const snap = markersRef.current;
    return () => {
      for (const m of snap.values()) m.remove();
      snap.clear();
    };
  }, []);

  return null;
}
