// Event-Log: Events im State + Export als JSONL / CSV.
// IndexedDB-Persistenz fuer v1 optional — Memory-Liste reicht als Source.

import type { Event, EventKind, EventScope } from '@/lib/types';

let counter = 0;
export function mkEventId(simTime: number): string {
  // Einfache, monoton aufsteigende ID. ULID ist overkill fuer MVP.
  counter += 1;
  return `E-${simTime.toString(36)}-${counter.toString(36).padStart(4, '0')}`;
}

export function mkEvent(input: {
  simTime: number;
  kind: EventKind;
  scope: EventScope;
  scopeRef?: string;
  payload?: Record<string, unknown>;
  triggeredBy?: Event['triggeredBy'];
  causedBy?: string;
}): Event {
  return {
    id: mkEventId(input.simTime),
    t: input.simTime,
    wallClockISO: new Date().toISOString(),
    kind: input.kind,
    scope: input.scope,
    scopeRef: input.scopeRef,
    payload: input.payload ?? {},
    triggeredBy: input.triggeredBy,
    causedBy: input.causedBy,
  };
}

// JSONL: ein Event pro Zeile, kompakt.
export function exportJsonl(events: Event[]): string {
  return events.map((e) => JSON.stringify(e)).join('\n') + '\n';
}

// CSV: flache Spalten, komplexer payload als JSON-String.
export function exportCsv(events: Event[]): string {
  const header = ['id', 't', 'wallClockISO', 'kind', 'scope', 'scopeRef', 'triggeredBy', 'causedBy', 'payload'];
  const rows = events.map((e) =>
    [
      e.id,
      String(e.t),
      e.wallClockISO,
      e.kind,
      e.scope,
      e.scopeRef ?? '',
      e.triggeredBy ?? '',
      e.causedBy ?? '',
      JSON.stringify(e.payload),
    ]
      .map((v) => csvEscape(v))
      .join(',')
  );
  return [header.join(','), ...rows].join('\n') + '\n';
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// Download als Datei (nur Browser).
export function downloadBlob(content: string, filename: string, mime = 'application/octet-stream'): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
