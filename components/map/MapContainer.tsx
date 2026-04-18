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
    });

    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    instance.on('load', () => {
      setMap(instance);
    });

    mapRef.current = instance;

    return () => {
      instance.remove();
      mapRef.current = null;
      setMap(null);
    };
  }, []);

  return (
    <div
      ref={nodeRef}
      data-testid="map-container"
      className="absolute inset-0 z-map"
      style={{ background: 'var(--bg-base)' }}
    >
      {map && children ? children(map) : null}
    </div>
  );
}
