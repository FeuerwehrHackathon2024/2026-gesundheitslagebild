# AUDIT — Event-Log, IndexedDB-Persistenz, Export

Jede Zustandsveränderung, die auf eine Entscheidung zurückgeht (Operator-Klick, systemseitige Verlegung, Eskalation), wird als Event persistiert. Das Audit-Log ist die Nachvollziehbarkeits-Grundlage.

## 1. Event-Schema

```ts
export interface Event {
  id: string;                         // ULID — monoton + sortierbar
  t: number;                          // sim time (min)
  wallClockISO: string;               // reale Zeitstempelung (ISO-8601)
  kind: EventKind;                    // siehe DATA_MODEL §9
  scope: 'system' | 'hospital' | 'patient' | 'incident' | 'intake';
  scopeRef?: string;                  // id des Scope-Objekts
  payload: Record<string, unknown>;
  causedBy?: string;                  // event.id, das dieses ausgelöst hat
  triggeredBy?: 'operator' | 'simulation' | 'rule';
  sessionSeed: number;                // zur Reproduzierbarkeit
}
```

## 2. Welche Kinds werden persistiert?

**Pflicht-Events (alles persistieren):**

| Kind                            | Zweck                                            |
|---------------------------------|--------------------------------------------------|
| `incident.started`              | MANV wurde ausgelöst                             |
| `incident.ended`                | MANV-Phase durch, Casualties versorgt            |
| `intake.announced`              | Geplante Aufnahme angekündigt                    |
| `intake.flight-landed`          | einzelner Flug gelandet                          |
| `intake.completed`              | alle Flüge abgearbeitet                          |
| `patient.assigned`              | Erstes Hospital zugewiesen                       |
| `patient.arrived`               | Transport-Ende, Bett belegt                      |
| `patient.discharged`            | Behandlung abgeschlossen                         |
| `patient.deceased`              | keine rechtzeitige Versorgung                    |
| `relocation.planned`            | Verlegung geplant                                |
| `relocation.executed`           | Verlegung gestartet                              |
| `relocation.cancelled`          | Verlegung rückgängig                             |
| `recommendation.generated`      | Neue Handlungsoption erzeugt                     |
| `recommendation.executed`       | Operator hat aktiviert                           |
| `measure.applied`               | Innerer Sim-Effekt einer Maßnahme                |
| `hospital.escalated`            | escalation-Level geändert                        |
| `hospital.surge-activated`      | Surge für Klinik aktiv                           |
| `forkPreview.computed`          | Preview berechnet (payload: recId, diff)         |
| `user.showcase-started`         | Demo-Modus gestartet                             |
| `sim.paused` / `sim.resumed`    | Operator hat gesteuert                           |
| `sim.speed-changed`             | Geschwindigkeit verändert                        |

**Nicht persistiert:** `sim.tick`, `patient.spawned` (Massenereignis; zählt nur in Metriken).

## 3. Payload-Beispiele

```jsonc
// recommendation.executed
{
  id: "01JHXK0NRFK...",
  t: 12420,
  wallClockISO: "2026-04-18T08:44:11.012Z",
  kind: "recommendation.executed",
  scope: "hospital",
  scopeRef: "H-MUC-12",
  payload: {
    recommendationId: "R-activate-surge|H-MUC-12-12410",
    action: "activate-surge",
    before: { occupied: 412, total: 500, freeBeds: 88 },
    after:  { occupied: 412, total: 600, freeBeds: 188 },
    rationale: "Das Haus ist ausgelastet ..."
  },
  triggeredBy: "operator",
  sessionSeed: 20260418
}
```

```jsonc
// relocation.executed
{
  id: "01JHXK0NRTY...",
  t: 12430,
  kind: "relocation.executed",
  scope: "patient",
  scopeRef: "P-baseline-0042",
  payload: {
    fromHospital: "H-MUC-03",
    toHospital:   "H-MUC-27",
    triage: "T2",
    routeId: "R-11.576,48.137-11.249,48.179",
    distanceKm: 34.2,
    etaMin: 41,
    reason: "planned-intake-prep",
    intakeId: "I-evac-soldiers-muc-1440"
  },
  causedBy: "01JHXK0NJZ…",        // das recommendation.executed zum prepare-reception
  triggeredBy: "simulation"
}
```

## 4. Persistenz

`lib/audit/event-log.ts` nutzt `idb`.

### 4.1 DB-Schema

- Database: `rettungsleitstelle`
- Object Store: `events`, Key = `event.id` (ULID lexikographisch sortierbar).
- Index: `by-sessionSeed` (für Session-Partitionierung), `by-kind`, `by-t`.

### 4.2 Schreibpfad

```ts
export async function logEvent(
  state: SimState,
  input: Omit<Event, 'id' | 'wallClockISO' | 'sessionSeed'>,
): Promise<string> {
  const event: Event = {
    ...input,
    id: ulid(),
    wallClockISO: new Date().toISOString(),
    sessionSeed: state.seed,
  };
  await db.add('events', event);
  emit('audit:new', event);   // triggert UI-Update
  return event.id;
}
```

Schreiben ist **async fire-and-forget** — die Sim-Engine wartet nicht. Bei Schreibfehlern: `console.warn` und weiter. Das Log ist robust gegen Lücken.

### 4.3 Batch-Read

Für die Tabelle (Audit-Tab + Export):

```ts
export async function listEvents(
  filter: { sessionSeed?: number; since?: number; kinds?: EventKind[] } = {},
  limit = 1000,
): Promise<Event[]>
```

Implementierung mit Cursor + LRU-basiertem Rendering in der UI.

### 4.4 Export

```ts
export async function exportJSONL(filter): Promise<Blob>
export async function exportCSV(filter): Promise<Blob>
```

- **JSONL**: eine Zeile pro Event, vollständiges JSON.
- **CSV**: flattened (payload als JSON-String in einer Zelle), Columns `id,t,wallClockISO,kind,scope,scopeRef,triggeredBy,causedBy,payload`.

Download-Button erzeugt `Blob` + `URL.createObjectURL` + `<a download>`.

### 4.5 Audit-Leeren

Nur per Confirm-Dialog, löscht nur Events mit `sessionSeed === state.seed` (aktuelle Session). Reset der Sim löscht **nicht** Audit automatisch — der Operator entscheidet.

## 5. UI-Integration

`components/panels/AuditLogPanel.tsx`:

- Tabelle mit ScrollArea, 28 px Zeilenhöhe, alternating row backgrounds.
- Spalten: Zeit (Sim `T+HH:MM`), Real (relativ), Kind (mit Icon), Scope, Kurz-Payload.
- Klick auf Zeile → Detail-Popover mit vollem JSON.
- Filter-Toolbar: Kind-Multiselect, Free-Text-Suche (full-text über Payload-JSON-String), Range-Picker für `t`.
- Buttons JSONL/CSV-Export, Clear.

## 6. Live-Sichtbarkeit

Kleine Toast-Messages in rechter unterer Ecke (shadcn Sonner) bei besonders relevanten Events:
- `recommendation.executed` → "Maßnahme aktiviert: {title}"
- `intake.flight-landed` → "Flug {idx} gelandet, {patientCount} Patienten"
- `incident.started` → "Neue Lage: {label}"
- `hospital.escalated` → nur bei Eskalation auf `manv-2` oder höher

Toasts sind nicht-blockierend, 4 s Auto-Dismiss.

## 7. Reproduzierbarkeit

Der Audit-Log reicht, zusammen mit `sessionSeed`, um eine Session vollständig nachzuvollziehen:
1. Gleicher `seed` + gleiche Operator-Events in gleicher Reihenfolge = identischer Endzustand.
2. Das E2E-Test-Setup replayed eine bekannte Sequenz und vergleicht Endzustand.

## 8. Tests

`tests/unit/audit.test.ts`:

- ULID-Generation liefert monoton steigende IDs.
- `logEvent` persistiert und emittiert.
- `listEvents` filtert nach `kinds` und `since`.

`tests/integration/audit-flow.test.ts`:

- Starte MANV, execute "activate-surge", erwarte mindestens 2 Events (`measure.applied`, `recommendation.executed`).
- Exportiere JSONL, parse zurück, erwarte identische Payload.
