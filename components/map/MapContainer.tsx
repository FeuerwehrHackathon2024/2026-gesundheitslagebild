'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import maplibregl, { type Map as MaplibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  MAP_INITIAL_CENTER,
  MAP_INITIAL_ZOOM,
  POSITRON_STYLE,
} from './mapStyle';

interface MapContainerProps {
  children?: (map: MaplibreMap) => ReactNode;
}

export function MapContainer({ children }: MapContainerProps) {
  const nodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const [map, setMap] = useState<MaplibreMap | null>(null);

  useEffect(() => {
    if (!nodeRef.current || mapRef.current) return;

    const instance = new maplibregl.Map({
      container: nodeRef.current,
      style: POSITRON_STYLE,
      center: MAP_INITIAL_CENTER,
      zoom: MAP_INITIAL_ZOOM,
      attributionControl: { compact: true },
      // Fallback fuer GPUs/Treiber mit unvollstaendigem WebGL2-Support:
      // erzwingt WebGL1 — vermeidet "Could not compile fragment shader"-Error.
      canvasContextAttributes: { contextType: 'webgl' },
    });

    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    instance.on('load', () => {
      setMap(instance);
      // Initial-Resize: bei Mount kann der Container noch nicht seine finale
      // Groesse haben (Layout-Pass, absolute inset-0 + ueberlappende Panels).
      instance.resize();
    });

    // ResizeObserver fuer spaetere Layout-Aenderungen (Panel-Ein-/Ausblenden,
    // Window-Resize innerhalb eines Layout-Containers).
    const ro = new ResizeObserver(() => {
      instance.resize();
    });
    ro.observe(nodeRef.current);

    mapRef.current = instance;

    return () => {
      ro.disconnect();
      instance.remove();
      mapRef.current = null;
      setMap(null);
    };
  }, []);

  return (
    <div
      ref={nodeRef}
      data-testid="map-container"
      // MapLibre setzt `.maplibregl-map { position: relative }` mit hoher
      // Spezifitaet und ueberschreibt Tailwind's `absolute inset-0`. Daher
      // inline-style mit position/inset, das Tailwind-Class fuer z-map reicht.
      className="z-map"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'var(--bg-base)',
      }}
    >
      {map && children ? children(map) : null}
    </div>
  );
}
