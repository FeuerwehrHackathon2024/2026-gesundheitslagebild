# MEASURES — Maßnahmenkatalog & Execute-Semantik

10 Maßnahmen-Typen. Jede hat Titel, Rationale, Impact-Schätzung, Effort-Level, Execute-Funktion.

## Format

```ts
interface MeasureDefinition {
  action: MeasureAction;
  titleTemplate: (ctx) => string;       // DE, 1 kurze Zeile
  rationaleTemplate: (ctx) => string;   // DE, 1–2 Sätze, nennt konkrete Zahlen
  estimateImpact: (state, targets) => ExpectedImpact;
  apply: (state, rec) => void;          // deterministische Mutation
  effortLevel: 'low' | 'medium' | 'high';
  executable: boolean;
}
```

---

## 1. `activate-surge`

**Trigger:** `HospitalSaturation` und `surgeReserve > 0` irgendwo in den Kapazitäten.

- **Titel:** `Surge aktivieren: {Klinikname}`
- **Rationale:** "Das Haus ist ausgelastet. Durch Aktivierung der Surge-Reserve werden ca. {surgeReserveTotal} zusätzliche Betten verfügbar. Personal bereits on-call."
- **Impact:** `bedsGained = Σ surgeReserve`, `timeBoughtMin = 30`.
- **Apply:** für alle Ressourcen der Zielklinik `surgeActive = true`. Über 30 Sim-Min rampen die effektiven Totals linear hoch.
- **Effort:** `low`.

## 2. `reroute-manv`

**Trigger:** `HospitalSaturation` critical + mindestens ein MANV aktiv, dessen Patienten dorthin transportiert werden.

- **Titel:** `Umleiten: {Quelle} → {Ziel}`
- **Rationale:** "{N} Patienten in Anfahrt; Zielhaus {Ziel} ({km} km weiter) hat {freeBeds} freie Plätze. Umleitung spart {timeBoughtMin} min bis zur Überlastung."
- **Impact:** `patientsRerouted = N`, `timeBoughtMin = geschätzt`.
- **Apply:** Für 60 Sim-Min nach Ausführung bekommen neue Patienten des betroffenen Incidents mit passenden Needs einen Scoring-Bonus für `targetHospitalId`. Patienten in bereits laufendem Transport werden **nicht** umgedreht.
- **Effort:** `medium`.

## 3. `relocate-stable-batch`

**Trigger:** bei aktiver `PlannedIntake` mit `shortfall > 0`, oder bei `HospitalSaturation` + verfügbare stabile T2/T3.

- **Titel:** `{N} stabile Patienten verlegen: {Source} → {Target}`
- **Rationale:** "{N} stabile T2/T3-Patienten können in {Target} verlegt werden; schafft {bedsGained} Kapazität für {purpose}."
- **Impact:** `patientsRelocated = N`, `bedsGained = N`.
- **Apply:** Ruft `relocation.planAndExecuteBatch(state, source, target, N)` auf. Schreibt `relocation.planned`-Event pro Patient + `relocation.executed` pro tatsächlich gestarteter Bewegung.
- **Effort:** `medium`.

## 4. `prepare-reception`

**Trigger:** neue `PlannedIntake` im Status `announced`.

- **Titel:** `Vorbereitung aktivieren: {IntakeLabel}`
- **Rationale:** "Aufnahmepuffer für {totalPatients} Patienten in {N} Flügen schaffen. System identifiziert automatisch stabile T2/T3 in flughafennahen Kliniken und verlegt sie in entferntere Häuser. Vorlauf: {prepWindowMin / 60} h."
- **Impact:** `bedsGained = targetFreeBeds.sum`, `timeBoughtMin = prepWindowMin`.
- **Apply:** `intake.status = 'preparing'`. Relocation-Engine übernimmt ab nächstem Tick.
- **Effort:** `high`.

## 5. `staff-callup`

**Trigger:** `HospitalSaturation` warn + `staff.onCall > 10`.

- **Titel:** `Zusatzpersonal aktivieren: {Klinikname}`
- **Rationale:** "{N} Pflegekräfte werden aus dem On-Call-Pool einberufen. Verfügbar in ~60 min."
- **Impact:** `timeBoughtMin = 60`, `occupancyDeltaPp = -3`.
- **Apply:** `staff.onDuty += staff.onCall; staff.onCall = 0`. In v1 Effekt: effektive `normal_bett.total` um `ceil(onCallAdded / 4)` erhöhen (proxy für mehr Versorgungskapazität).
- **Effort:** `medium`.

## 6. `cancel-elective`

**Trigger:** `HospitalSaturation` warn + `electiveActive === true`.

- **Titel:** `Elektivbetrieb stoppen: {Klinikname}`
- **Rationale:** "Stopp der elektiven OPs setzt ca. {N} OP-Slots frei und stabilisiert die Normalstation."
- **Impact:** `bedsGained = ~25 % op_saal.total`, `timeBoughtMin = 120`.
- **Apply:** `electiveActive = false`. `capacity.op_saal.surgeReserve += round(capacity.op_saal.total * 0.25)`. `surgeActive`-Flag pro Ressource entsprechend setzen.
- **Effort:** `medium`.

## 7. `divert-normal-admissions`

**Trigger:** `RegionalLoad` warn.

- **Titel:** `Plan-Einweisungen umleiten: Region {X}`
- **Rationale:** "Normale Einweisungen werden in umliegende Kliniken umgeleitet, um Kapazität zu sichern."
- **Impact:** `occupancyDeltaPp = -2`, `timeBoughtMin = 240`.
- **Apply:** `divertActive = true` für alle Ziel-Kliniken. In v1 kosmetisch (statische Baseline, keine laufenden Admissions).
- **Effort:** `low`.

## 8. `activate-reserve-hospital`

**Trigger:** `ConflictLoad` critical oder `PlannedIntakeShortfall` critical.

- **Titel:** `Reserveklinik aktivieren: Sanitätszentrum Fürstenfeldbruck`
- **Rationale:** "Sanitätszentrum Fürstenfeldbruck wird als Reserve-Aufnahme mit 200 Betten geöffnet. Aktivierung binnen 4 Sim-h abgeschlossen."
- **Impact:** `bedsGained = 200`, `timeBoughtMin = 240`.
- **Apply:** Fügt Reserve-Klinik in `state.hospitals` hinzu (hardcoded: `Fürstenfeldbruck`-Koords ~ `[11.2490, 48.1787]`, 200 Normalbetten, 20 ITS, 6 OP, 5 NA, alle `occupied: 0`). Setzt sich nach 240 Sim-min voll "bereit".
- **Effort:** `high`.

## 9. `alert-adjacent`

**Trigger:** `RegionalLoad` warn.

- **Titel:** `Nachbarhäuser alarmieren: {Namen}`
- **Rationale:** "Die 3 nächsten Häuser außerhalb des 50-km-Rings werden auf Eskalations-Stufe 'erhöht' gesetzt, um Personal zu mobilisieren."
- **Impact:** `timeBoughtMin = 60`.
- **Apply:** Ziel-Kliniken `escalation = 'erhoeht'`, `staff.onCall → onDuty` um je 10 %.
- **Effort:** `low`.

## 10. `request-cross-region`

**Trigger:** `RegionalLoad` critical oder `ConflictLoad` critical.

- **Titel:** `Überregionale Unterstützung anfordern`
- **Rationale:** "Katastrophenschutzabkommen mit Nachbar-Bundesländern aktivieren. Lange Entscheidungskette, informative Maßnahme."
- **Impact:** `timeBoughtMin = 0` (informational).
- **Apply:** Setzt Banner oben in UI: "Überregionale Unterstützung angefordert um {simTime}". Keine Sim-Mutation.
- **Effort:** `high`.
- **Executable:** `true`, aber ohne Sim-Effekt.

---

## Ausführung: gemeinsames Pattern

```ts
export function executeRecommendation(state: SimState, rec: Recommendation) {
  if (!rec.executable) return;
  const before = snapshotState(state);
  logEvent(state, {
    kind: 'measure.applied',
    scope: ...,
    payload: { recommendationId: rec.id, action: rec.action, targets: rec.targetHospitalIds },
    triggeredBy: 'operator',
  });
  MEASURES[rec.action].apply(state, rec);
  rec.executable = false;
  rec.executedAt = state.simTime;
  logEvent(state, {
    kind: 'recommendation.executed',
    scope: ...,
    payload: { recommendationId: rec.id, before: summarize(before), after: summarize(state) },
    triggeredBy: 'operator',
  });
}
```

Der Event-Log hält **Vorher/Nachher-Summary** je ausgeführter Maßnahme. Das ist der Kern der Nachvollziehbarkeit.

## UI-Karten (Recommendation-Card)

```
┌──────────────────────────────────────────────────────────┐
│ [Icon] {title}                                 {effort}  │
│                                                          │
│ {rationale}                                              │
│                                                          │
│ [+28 Betten] [+45 min] [3 Pat. umgeleitet]              │
│                                                          │
│ [ Preview ]                          [ Aktivieren ]      │
└──────────────────────────────────────────────────────────┘
```

- **Preview-Button** löst `computeForkPreview` aus → Overlay-Linie in Timeline.
- **Aktivieren-Button** zündet `executeRecommendation`, fügt Event in Audit-Log, Karte rutscht in "Ausgeführt"-Sektion.

## Preview-Semantik

- Hover auf Karte (100 ms delay) → Preview-Berechnung startet (Debounce).
- Mouse-Leave → Preview bleibt noch 500 ms, dann Overlay-Linie ausblenden.
- Click auf Preview-Button → Overlay-Linie **bleibt sichtbar** bis Aktivieren oder Dismiss.
- Nach Aktivieren: Overlay-Linie wird zur **tatsächlichen** Kurve, Marker auf Timeline-Achse zeigt Zeitpunkt.

## Nicht-triviale Maßnahmen mit Parameter-Eingabe

`relocate-stable-batch` mit N: Default N = min(10, transferableCount). Klick "Parameter anpassen" öffnet kleinen Slider für N (1..transferableCount).

`prepare-reception`: kein Parameter — bezieht sich auf die gesamte Intake.

`cancel-elective`: kein Parameter.

Alle anderen: keine Parameter.
