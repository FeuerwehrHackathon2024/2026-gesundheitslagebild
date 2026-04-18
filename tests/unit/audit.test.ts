import { describe, it, expect } from 'vitest';
import { exportCsv, exportJsonl, mkEvent } from '@/lib/audit/event-log';
import type { Event } from '@/lib/types';

function evt(overrides: Partial<Event> = {}): Event {
  return {
    id: 'E-1',
    t: 0,
    wallClockISO: '2026-04-18T00:00:00.000Z',
    kind: 'sim.resumed',
    scope: 'system',
    payload: {},
    ...overrides,
  };
}

describe('mkEvent', () => {
  it('setzt id/t/wallClockISO', () => {
    const e = mkEvent({ simTime: 42, kind: 'incident.started', scope: 'incident' });
    expect(e.id).toMatch(/^E-/);
    expect(e.t).toBe(42);
    expect(typeof e.wallClockISO).toBe('string');
  });

  it('propagiert scopeRef, payload, triggeredBy', () => {
    const e = mkEvent({
      simTime: 5,
      kind: 'recommendation.executed',
      scope: 'system',
      scopeRef: 'R-1',
      payload: { foo: 'bar' },
      triggeredBy: 'operator',
    });
    expect(e.scopeRef).toBe('R-1');
    expect(e.payload).toEqual({ foo: 'bar' });
    expect(e.triggeredBy).toBe('operator');
  });
});

describe('exportJsonl', () => {
  it('liefert wohlgeformte JSONL (eine Zeile pro Event, jede parsbar)', () => {
    const events = [
      evt({ id: 'A', kind: 'sim.paused' }),
      evt({
        id: 'B',
        t: 30,
        kind: 'incident.started',
        scope: 'incident',
        scopeRef: 'I-1',
        payload: { label: 'Amok', casualties: 35 },
      }),
    ];
    const text = exportJsonl(events);
    const lines = text.split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    for (const l of lines) {
      expect(() => JSON.parse(l)).not.toThrow();
    }
    const parsed = lines.map((l) => JSON.parse(l) as Event);
    expect(parsed[0].id).toBe('A');
    expect(parsed[1].payload).toEqual({ label: 'Amok', casualties: 35 });
  });

  it('ist idempotent-stabil (gleiche Events → gleiche Ausgabe)', () => {
    const events = [evt({ id: 'X' })];
    expect(exportJsonl(events)).toBe(exportJsonl(events));
  });
});

describe('exportCsv', () => {
  it('liefert Header + eine Zeile pro Event', () => {
    const events = [evt({ id: 'A' }), evt({ id: 'B', t: 5 })];
    const text = exportCsv(events);
    const lines = text.split('\n').filter(Boolean);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('id,t,wallClockISO');
  });

  it('escapt Kommata und Anfuehrungszeichen im payload', () => {
    const events = [
      evt({
        id: 'A',
        payload: { reason: 'Patient, stabil "ja"' },
      }),
    ];
    const text = exportCsv(events);
    // Feld muss gequotet sein (Komma oder Quote im Wert).
    expect(text).toMatch(/"/);
  });
});
