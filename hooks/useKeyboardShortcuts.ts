'use client';

import { useEffect } from 'react';
import { useSimStore } from '@/lib/store';

// Globale Tastatur-Shortcuts laut DESIGN.md §9 / PHASES.md Phase 11.
// Space = Pause/Resume, 1..5 = Speed, R = Reset, D = Demo-Showcase.
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Eingabefelder nicht stoeren.
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (target?.isContentEditable) return;

      const api = useSimStore.getState();
      switch (e.code) {
        case 'Space': {
          e.preventDefault();
          if (api.isRunning) api.pause();
          else api.resume();
          return;
        }
        case 'Digit1':
          api.setSpeed(0.5);
          return;
        case 'Digit2':
          api.setSpeed(1);
          return;
        case 'Digit3':
          api.setSpeed(2);
          return;
        case 'Digit4':
          api.setSpeed(5);
          return;
        case 'Digit5':
          api.setSpeed(10);
          return;
        case 'KeyR':
          api.reset();
          return;
        case 'KeyD':
          api.runShowcase();
          return;
        case 'Escape':
          api.selectHospital(undefined);
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
