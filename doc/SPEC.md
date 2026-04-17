# SPEC — Rettungsleitstelle (MANV/Großlage-Dashboard Raum München)

## 1. Mission

Ein Map-zentriertes Entscheidungs-Dashboard für die Einsatzleitung im Raum München. Das System zeigt *gleichzeitig* drei Belastungsquellen der Kliniklandschaft und wie sie sich gegenseitig beeinflussen:

1. **Normalbetrieb** — statische Start-Auslastung (65–80 % je Haus), im Betrieb nur durch Großlagen-Effekte verändert.
2. **MANV-Fälle** — akute Großschadensereignisse, Patienten werden per Allocation-Engine auf Kliniken verteilt; bei Erschöpfung wird der Verteilungsradius erweitert (Cascade).
3. **Geplante Belegungen** — angekündigte Großeinweisungen mit konfigurierbarem Vorlauf, in der Kliniken *präventiv* stabile Patienten in entferntere Häuser verlegen.

Das System muss:

1. **Visualisieren** — Karte mit Kliniken, MANVs, geplanten Aufnahmen, laufenden Patiententransporten und Inter-Hospital-Verlegungen. Alle Bewegungen animiert auf echten Straßen-Routen.
2. **Detektieren** — drohende und akute Kapazitätsengpässe so früh wie möglich erkennen (regelbasiert).
3. **Empfehlen** — konkrete, quantifizierte Maßnahmen mit *Was-wäre-wenn-Preview* auf der Timeline vorschlagen; Einsatzleitung zündet per Klick.
4. **Protokollieren** — jede Operator-Aktion und systemseitige Verlegung im Audit-Log (IndexedDB), exportierbar.

Kein Backend. Kein Auth. Client-only, deterministisch bei gleichem Seed + gleicher Aktionsfolge.

## 2. Tech-Stack (gesperrt)

| Layer | Wahl |
|---|---|
| Framework | Next.js 14+ (App Router), TypeScript strict |
| Styling | Tailwind CSS 3 + CSS-Variablen (Liquid-Glass-Tokens) |
| UI-Primitives | shadcn/ui (New York Style, helles Theme) |
| Map | MapLibre GL JS |
| Karten-Tiles | MapLibre Demo oder CartoDB Positron (hell) |
| Routen | OSRM öffentlicher Demo-Server (`router.project-osrm.org`) + IndexedDB-Cache |
| State | Zustand |
| Charts | Recharts |
| Persistenz (Audit) | IndexedDB via `idb` |
| Excel | `exceljs` |
| Tests | Vitest + Playwright |
| Paketmanager | pnpm |

## 3. Scope und Geografie

- **Zielgebiet:** Großraum München (Landeshauptstadt + Umland bis ~Ingolstadt/Augsburg/Rosenheim). Default-Map-Center: `[11.5755, 48.1374]` (Marienplatz), Zoom 9–10.
- **Datenquelle:** `doc/Krankenhäuser_München.xlsx` mit **49 Kliniken** — Spalten `Name, Ort, Art, Adresse, Telefon, URL, Abteilungen, Ausstattung, Betten, Intensivbetten, Latitude, Longitude`.

## 4. Domänen-Modell

### 4.1 Ressourcen-Typen (statt PZC)

Nur **4 Ressourcen-Töpfe** pro Klinik — radikale Vereinfachung gegenüber dem Alt-System:

```ts
type ResourceType = 'notaufnahme' | 'op_saal' | 'its_bett' | 'normal_bett';
```

Jede Klinik hält eine Map `Record<ResourceType, Capacity>` mit den Feldern:

```ts
interface Capacity {
  total: number;           // Basis-Kapazität
  occupied: number;        // live
  surgeReserve: number;    // zusätzlich aktivierbar über Maßnahme "activate-surge"
  surgeActive: boolean;
}
```

### 4.2 Patient

```ts
type Triage = 'T1' | 'T2' | 'T3' | 'T4';
type PatientStatus =
  | 'onScene' | 'transport' | 'inTreatment'
  | 'transferring' | 'discharged' | 'deceased';

interface Patient {
  id: string;
  triage: Triage;
  needs: Record<ResourceType, boolean>;  // welche Ressourcen benötigt werden
  treatmentMin: number;                  // Behandlungsdauer im Bett
  source: 'baseline' | 'incident' | 'planned-intake';
  sourceRefId?: string;                  // incident.id oder plannedIntake.id
  spawnedAt: number;                     // sim time
  status: PatientStatus;
  assignedHospitalId?: string;
  transferTargetHospitalId?: string;     // bei Verlegung
  routeId?: string;                      // Referenz auf Route im RoutesStore
  arrivedAt?: number;
  dischargeAt?: number;
  isStableForTransfer: boolean;          // computed, siehe SIMULATION.md
}
```

### 4.3 Hospital

```ts
type HospitalTier = 'maximal' | 'schwerpunkt' | 'regel' | 'grund';

interface Hospital {
  id: string;
  name: string;
  kind: string;                          // raw "Art"-Feld aus Excel
  tier: HospitalTier;                    // abgeleitet, siehe DATA_GENERATION.md
  coords: [number, number];              // [lng, lat]
  address: { street: string; city: string; plz: string };
  capacity: Record<ResourceType, Capacity>;
  abteilungen: string[];                 // raw, gefiltert
  flags: {
    hasOP: boolean;
    hasITS: boolean;
    hasNotaufnahme: boolean;
    hasBurnCenter: boolean;
    hasNeurochir: boolean;
    hasPaediatrie: boolean;
  };
  staff: { onDuty: number; onCall: number };
  escalation: 'normal' | 'erhoeht' | 'manv-1' | 'manv-2' | 'katastrophe';
  electiveActive: boolean;               // elektive OPs laufen normal → kann gestoppt werden
  divertActive: boolean;                 // Normal-Admissions umgeleitet
}
```

### 4.4 Incident (MANV)

```ts
type IncidentType =
  | 'verkehrsunfall' | 'amoklauf' | 'industriebrand'
  | 'naturkatastrophe' | 'panik';

type ArrivalCurve = 'immediate' | 'gauss' | 'plateau';

interface Incident {
  id: string;
  type: IncidentType;
  label: string;
  location: [number, number];
  startedAt: number;
  estimatedCasualties: number;
  arrivalCurve: ArrivalCurve;
  durationMin: number;
  triageMix: Record<Triage, number>;     // anteilig, Summe = 1
  needsProfile: {
    opShare: number; itsShare: number;
    notaufnahmeShare: number; normalBedShare: number;
  };
  // Visualisierung: Marker-Radius ~ sqrt(estimatedCasualties) * factor;
  // KEIN Kreisradius auf der Karte.
}
```

### 4.5 PlannedIntake (geplante Belegung)

```ts
interface FlightArrival {
  idx: number;
  etaMin: number;           // sim time, absolute
  patientCount: number;
  triageMix: Record<Triage, number>;
  needsProfile: Incident['needsProfile'];
}

interface PlannedIntake {
  id: string;
  label: string;             // z.B. "Medizinische Evakuierung Soldaten"
  arrivalPoint: [number, number]; // z.B. Flughafen München [11.7861, 48.3538]
  announcedAt: number;       // sim time, Ankündigungs-Zeitpunkt
  firstArrivalAt: number;    // sim time, erster Flug landet
  flights: FlightArrival[];  // individuelle Flüge, gestaffelt
  totalPatients: number;     // Summe
  prepWindowMin: number;     // firstArrivalAt - announcedAt (Vorlauf)
  status: 'announced' | 'preparing' | 'arriving' | 'complete' | 'cancelled';
  bufferRatio: number;       // default 0.15 (15 % Puffer über totalPatients)
  // Ableitbar: targetFreeBeds per ResourceType, siehe SIMULATION.md
}
```

### 4.6 Event (Audit-Log)

Siehe `doc/AUDIT.md`. Jeder Zustands-relevante Vorgang (Operator-Aktion, systemseitige Verlegung, Eskalation, MANV-Start, Flug-Landung) wird als immutables Event im IndexedDB-Audit-Log persistiert.

## 5. Simulation (Engine, Allocation, Relocation, Fork-Preview)

Details in `doc/SIMULATION.md`.

**Zusammenfassung:**

- Tick-Loop, 1 Sim-Minute pro Tick, einstellbar 0.5×–10×, pause + step.
- **Allocation-Engine** für MANV-Patienten: Triage-First Water-Filling mit Cascade (Radius/Quote/Load) → Verteilung auf nächstgelegene Kliniken, Überlauf in entferntere.
- **Relocation-Engine** (neu): Aus `PlannedIntake` wird ein Bedarfs-Profil berechnet; das System identifiziert stabile **T2/T3-Patienten** in flughafennahen Kliniken und verlegt sie in entferntere Häuser mit freier Kapazität. Verlegungen werden als eigene Patientenbewegungen animiert.
- **Normalbetrieb**: statisch initialisiert, keine dynamische Routine-Entstehung/Entlassung. Nur durch Großlage beeinflusst.
- **Fork-Preview**: Beim Hover über eine Recommendation im UI forkt das System den Zustand, simuliert N Minuten mit aktivierter Maßnahme, und zeigt den Unterschied in der Timeline als gestrichelte Overlay-Kurve.
- **Konflikt-Priorisierung**: Wenn MANV während laufender `PlannedIntake`-Vorbereitung auftritt, gewichtet das System die Allokation zulasten der Vorbereitung — proportional zur Restzeit bis Flugankunft und zur MANV-Dringlichkeit. Siehe `SIMULATION.md §6`.

## 6. Detection

Siehe `doc/SIMULATION.md §7`. Regeln:

1. **HospitalSaturation** — pro Ressource `occupied / total ≥ 0.85` → warn, `≥ 0.95` → critical.
2. **CapacityTrend** — Anstieg ≥ 15 pp in 30 Sim-Min → warn mit ETA-to-full.
3. **UnassignedPatients** — Patient > 20 Sim-Min `onScene` ohne Zuweisung → critical.
4. **RegionalLoad** — Kliniken in 50 km um MANV: kombinierte Auslastung ≥ 80 % warn, ≥ 90 % critical.
5. **PlannedIntakeShortfall** (neu) — bis Flugankunft wird das Soll nicht erreicht → critical mit fehlender Bettenzahl.
6. **RelocationStalled** (neu) — Verlegungen ins Stocken geraten (Ziel-Kliniken keine Kapazität mehr) → warn.
7. **ConflictLoad** (neu) — MANV überlagert laufende Intake-Vorbereitung → critical mit Prioritäten-Hinweis.
8. **EscalationOpportunity** — Haus ≥ 80 % mit verfügbarem Surge → info.

## 7. Maßnahmenkatalog

Siehe `doc/MEASURES.md`. Zur Einsatz-Zündung per Klick:

- `activate-surge` — Surge-Betten für ein Haus aktivieren.
- `reroute-manv` — kommende MANV-Patienten auf Ausweich-Haus lenken.
- `relocate-stable-batch` — N stabile T2/T3 aus Quellhaus in Zielhaus verlegen.
- `prepare-reception` — Vorbereitungsmodus für geplante Aufnahme aktivieren (löst Relocation-Engine aus).
- `staff-callup` — Zusatzpersonal anfordern (`onCall` → `onDuty`, erweitert Betreuungsrate).
- `cancel-elective` — Elektivbetrieb stoppen, setzt OP-Kapazität frei.
- `divert-normal-admissions` — Plan-Einweisungen in betroffener Region pausieren.
- `activate-reserve-hospital` — Reserve-/Bundeswehrklinik als zusätzlichen Knoten aktivieren.
- `alert-adjacent` — Nachbarkliniken auf Stufe `erhoeht` setzen.
- `request-cross-region` — überregionale Unterstützung anfordern (informational).

Jede Maßnahme: `title`, `rationale`, `expectedImpact`, `effortLevel`, `executable`. Ausgeführte Maßnahmen landen im Audit-Log und verändern den Sim-Zustand deterministisch.

## 8. Szenarien

Siehe `doc/SCENARIOS.md`. 5 MANV-Szenarien:

1. **Amoklauf Innenstadt** (bleibt aus Alt-System) — 35, immediate 15 min.
2. **Busunglück A9 bei Ingolstadt** — 60, gauss 90 min.
3. **S-Bahn-Auffahrunfall Ostbahnhof** — 180, immediate 20 min. *(Showcase-Kern)*
4. **Explosion BMW-Werk Milbertshofen** — 70, plateau 3 h.
5. **Fußball-Unglück Allianz Arena** — 220, gauss 60 min.

Plus **1 PlannedIntake-Template**: *"Medizinische Evakuierung — Soldaten Flughafen MUC"*, default 750 Patienten, 3 Flüge à 250 im Abstand von 45 min, 24 h Vorlauf. Alles vom Operator konfigurierbar (Anzahl, Flüge, Abstand, Vorlauf).

Szenarien sind **parallel aktivierbar**; bei Mehrfachwahl spawnen Incidents an leicht zufällig variierten, aber realistischen Orten (siehe `SCENARIOS.md §3`).

## 9. UI / Design

Siehe `doc/DESIGN.md` und `doc/UI.md`.

- **Design-Sprache:** Apple Liquid Glass — Off-White-Background mit subtilen Blur-Panels, SF Pro / Inter, System-Blue-Akzent, feine Ränder.
- **Layout:** Header (48px) · Left-Panel (320px) · Map · Right-Panel (360px) · Timeline-Strip (160px, deutlich ausgebaut).
- **Alle Panels** nutzen `backdrop-filter: blur(24px) saturate(1.6)` mit semi-transparentem Weiß.

## 10. Timeline (zentrales Instrument)

Siehe `doc/TIMELINE.md`. Die Timeline ist nicht nur Scrubber, sondern das wichtigste Lagebild-Element:

- **Multi-Kurven** für Gesamt-Auslastung, Durchschnitt, ITS, OP, Notaufnahme.
- **Prognose-Band** mit geplanten Flügen als Marker mit Trichter.
- **Kritisch-Zonen** rot eingefärbt wenn Auslastung > 90 %.
- **Hover-Highlight** hebt eine einzelne Kurve und zeigt Werte in Tooltip.
- **Fork-Preview**: Wenn Operator eine Maßnahme hovert, erscheint eine gestrichelte Preview-Linie mit dem geforkten Verlauf.
- **Maßnahmen-Marker** auf Timeline-Achse zeigen wann eine Aktion ausgeführt wurde.

## 11. Routing

Siehe `doc/ROUTING.md`. Alle Patientenbewegungen (MANV-Einsatzfahrten, Inter-Hospital-Verlegungen, Transfer vom Flughafen in Zielkliniken) nutzen **OSRM-Routen** (öffentlicher Demo-Server) mit **IndexedDB-Cache**. Animation: Marker entlang der Polyline, Geschwindigkeit aus OSRM-Duration (inkl. Straßenklasse), Farbkodierung je Bewegungstyp.

## 12. Audit

Siehe `doc/AUDIT.md`. Jede Operator-Aktion, jede system-ausgelöste Verlegung, jede Eskalation wird als immutable Event persistiert (IndexedDB). Panel in der UI zeigt die Einträge live. Export als JSONL und CSV.

## 13. Qualitätskriterien

- Keine Console-Errors/Warnings im Normalbetrieb.
- Tick-Loop hält 5× Speed bei 49 Kliniken + 500 aktiven Patienten + 3 parallelen MANV.
- TypeScript strict. `any` nur mit Begründungskommentar.
- Deterministisch: gleicher Seed + gleiche Aktionsfolge = identischer Endzustand.
- Desktop-Ziel: min. 1440×900, optimiert für 1920×1080.

## 14. Non-Goals

- Mobil / Responsive unter 1280 Breite.
- Mehrbenutzer / Auth / Session-Übergreifende Persistenz (außer Audit-Log).
- Reale Echtzeit-Datenfeeds.
- Internationalisierung (UI-Strings deutsch, Code-Identifier englisch).
- ML/AI-basierte Detection — rein regelbasiert.

## 15. Showcase-Ablauf (Demo-Button)

Reproduzierbarer Ein-Klick-Demo-Ablauf in `~6 Minuten Echtzeit` bei 10× Speed:

```
T+0 min    : Normalbetrieb läuft, ~70 % Auslastung
T+30 min   : PlannedIntake "Soldaten MUC" angekündigt (750 Pat., 24 h Vorlauf)
             → Relocation-Engine startet, Verlegungen werden auf Karte sichtbar
T+12 h     : S-Bahn-Unglück Ostbahnhof (180 Verletzte, immediate)
             → Allocation-Engine verteilt, Konflikt-Alert feuert
T+14 h     : (optional) zusätzlich Fußball-Unglück zufällig
T+24 h     : Flüge treffen am MUC ein, Verteilung in vorbereitete Kliniken
T+26 h     : Endbild, Export-Log als JSONL verfügbar
```

Timeline zeigt den ganzen Verlauf; der Operator kann jederzeit in den Lauf eingreifen und Maßnahmen zünden.

Ende SPEC.
