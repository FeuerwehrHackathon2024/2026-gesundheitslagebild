// Map-Style fuer MapLibre. Helles, reduziertes CartoDB Positron — passt
// zur Liquid-Glass-Aesthetik laut doc/DESIGN.md §6.
// Style-URL ist eine oeffentliche Raster-Tile-Quelle (kein API-Key noetig).

import type { StyleSpecification } from 'maplibre-gl';

export const POSITRON_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'carto-positron': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
        'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'carto-positron-layer',
      type: 'raster',
      source: 'carto-positron',
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};

export const MAP_INITIAL_CENTER: [number, number] = [11.5755, 48.1374];
export const MAP_INITIAL_ZOOM = 9.5;
