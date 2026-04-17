'use client';

/**
 * Globale Keyboard-Shortcuts fuer das Dashboard (SPEC §11.8):
 *   Space      Pause/Resume
 *   1/2/3/4/5  Speed 0.5/1/2/5/10
 *   r          Reset (mit Bestaetigung)
 *   Escape     Selection schliessen
 */
import { useEffect } from 'react';

import { useSimStore } from '@/lib/store';

const SPEED_MAP: Record<string, number> = {
  '1': 0.5,
  '2': 1,
  '3': 2,
  '4': 5,
  '5': 10,
};

export function KeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Eingaben in Inputs/Textareas nicht abfangen
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        if (target.isContentEditable) return;
      }

      const store = useSimStore.getState();

      if (e.code === 'Space') {
        e.preventDefault();
        store.togglePause();
        return;
      }
      if (e.key in SPEED_MAP) {
        store.setSpeed(SPEED_MAP[e.key]!);
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        if (confirm('Simulation zuruecksetzen?')) {
          store.reset();
        }
        return;
      }
      if (e.key === 'Escape') {
        store.setSelection(null);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return null;
}
