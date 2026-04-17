'use client';

/**
 * Unsichtbarer Treiber: startet setInterval fuer die Sim, passt Frequenz
 * an `speed` und `isPaused` an.
 */
import { useEffect, useRef } from 'react';

import { useSimStore } from '@/lib/store';

export function SimEngine() {
  const speed = useSimStore((s) => s.speed);
  const isPaused = useSimStore((s) => s.isPaused);
  const runTick = useSimStore((s) => s.runTick);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (isPaused) return;
    const periodMs = Math.max(50, 1000 / speed);
    const id = window.setInterval(runTick, periodMs);
    intervalRef.current = id;
    return () => {
      window.clearInterval(id);
      intervalRef.current = null;
    };
  }, [speed, isPaused, runTick]);

  return null;
}
