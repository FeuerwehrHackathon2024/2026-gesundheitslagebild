# UI — Layout, Komponenten, shadcn-Nutzung

Verbindliche Layout- und Komponenten-Struktur. Alles in Einklang mit `DESIGN.md`.

## 1. Layout (Root `app/page.tsx`)

```tsx
<main className="h-screen w-screen overflow-hidden relative bg-[var(--bg-base)]">
  <MapContainer className="absolute inset-0" />   {/* Vollfläche */}

  <Header className="absolute top-4 left-4 right-4 h-14" />

  <LeftPanel  className="absolute top-24 left-4 bottom-[188px] w-[320px]" />
  <RightPanel className="absolute top-24 right-4 bottom-[188px] w-[380px]" />

  <TimelineStrip className="absolute bottom-4 left-4 right-4 h-[160px]" />

  <Toaster />  {/* shadcn toast */}
</main>
```

Abstände/Positionen sind final — keine Abweichung ohne Begründung.

## 2. Header

```
╔══════════════════════════════════════════════════════════════════════╗
║ [🛡] Rettungsleitstelle  München   T+ 03:42  ▶  1×  ⟲    [Demo]     ║
╚══════════════════════════════════════════════════════════════════════╝
```

- Link `H1` "Rettungsleitstelle" + sekundär "München".
- Sim-Clock in `text-mono-lg`, Format `T+ HH:MM` (Sim-Stunden seit Start).
- Play/Pause-Button, Speed-Selector (shadcn Dropdown: 0.5× / 1× / 2× / 5× / 10×).
- Reset-Button mit Confirm-Dialog.
- **Demo-Button** primary, startet den Showcase (siehe `SCENARIOS.md §5`).

## 3. LeftPanel

Glass-Panel mit 3 Akkordeon-Sektionen (shadcn Accordion, alle default expanded):

### 3.1 Sektion "Lage auslösen"

- Dropdown-Menü mit 5 MANV-Szenarien aus `SCENARIOS.md §1`.
- Primary-Button "Starten".
- Kleiner Ghost-Button "Zufällig" → startet ein zufälliges Szenario an einem Ort aus `RANDOM_PLACES_MUC`.
- Liste laufender Incidents (Chip-Reihe) mit X zum Abbrechen.

### 3.2 Sektion "Geplante Aufnahme"

- Kurzzusammenfassung laufender Intakes (wenn vorhanden).
- Button "Neu ankündigen" → öffnet `PlannedIntakeForm` in einem shadcn Dialog.
- `PlannedIntakeForm`-Felder aus `SCENARIOS.md §2.2`.
- Nach Ankündigung erscheint Karte mit Countdown bis `firstArrivalAt` und Vorbereitungsstatus.

### 3.3 Sektion "Filter"

- Slider "Bett-Auslastung: X bis Y %".
- Vier Switches "T1 / T2 / T3 / T4" (alle default an).
- Toggle "Nur kritische Häuser zeigen".
- "Zurücksetzen"-Link.

## 4. RightPanel (shadcn Tabs)

Vier Tabs:

### 4.1 Tab "Alarme" (`AlertList`)

- Sortierung: critical > warn > info > resolved. Innerhalb Severity neueste oben.
- Jeder Alert als Karte mit linkem 3-px-Severity-Strich.
- Resolved-Alerts ausgegraut, collapsed unten.
- Filter-Chips oben: "Alle / Nur kritische / Nur aktive".

### 4.2 Tab "Empfehlungen" (`RecommendationList`)

- Sortierung: executable oben, nach Effort + erwartetem Impact.
- Kartenformat siehe `MEASURES.md` Abschnitt "UI-Karten".
- Unten separate Sektion "Ausgeführt" (collapsed), zeigt ausgeführte Maßnahmen chronologisch.

### 4.3 Tab "Klinik" (`HospitalDetailPanel`)

- Leer wenn keine Klinik selektiert ("Klinik auf der Karte auswählen").
- Sonst: Name, Tier, Adresse, 4 Ressourcen-Balken mit Soll/Ist/Surge-Reserve, Sparkline 4 h (Recharts), Eskalations-Select, Liste eingehender & ausgehender Patienten, Kontaktzeile (Telefon, URL aus Excel).

### 4.4 Tab "Audit"

- Tabelle, neueste oben, Spalten: Zeit, Kind, Scope, Payload-Excerpt.
- Filter: `kind`-Multi-Select, Datumsbereich.
- Buttons "JSONL exportieren" / "CSV exportieren" / "Audit leeren" (mit Confirm-Dialog).
- Suchfeld rechts oben.

## 5. TimelineStrip

Siehe `TIMELINE.md` für Detail-Spezifikation.

## 6. Map

`components/map/MapContainer.tsx`.

- MapLibre mit hellem Style.
- Layer-Reihenfolge (unten nach oben):
  1. `basemap`
  2. `hospitals` (circle)
  3. `hospitals-critical-pulse` (circle, pulsierend bei > 95 %)
  4. `routes` (line) — `hospital-transfer`, `manv-transport`, `planned-arrival`
  5. `route-markers` (circle) — animiert entlang Routes
  6. `incidents` (symbol) — Marker ohne Kreisradius, Größe ~ √casualties
  7. `intake-airport` (symbol) — Plane-Icon + Trichter
- Interaktion:
  - Klick Klinik → selected, öffnet `HospitalDetailPanel`-Tab.
  - Klick Incident → Popover mit Meta (Label, Anteil versorgt, Link "Alarme anzeigen").
  - Scroll-Zoom normal, Pan normal, Rotate deaktiviert.

## 7. shadcn-Nutzung (Liste der Komponenten)

Zu installieren via `pnpm dlx shadcn@latest add …`:

```
accordion alert alert-dialog avatar badge button card command
dialog dropdown-menu form input label popover progress radio-group
scroll-area select separator skeleton slider sonner switch tabs
textarea toast toggle tooltip
```

Spezialadaptionen:
- **Toast/Sonner** für Kurzmeldungen bei Events (`Maßnahme aktiviert`, `Intake angekündigt`).
- **Dialog** für `PlannedIntakeForm`, Reset-Confirm, Audit-Clear-Confirm.
- **Popover** für Incident-Detail auf der Karte.
- **Scroll-Area** für lange Alert- und Audit-Listen.

## 8. Zustand-Bindings (Hooks)

```ts
const simTime = useSim(s => s.simTime);
const alerts  = useSim(s => s.alerts);
const recs    = useSim(s => s.recommendations);
const hospitals = useSim(s => s.hospitals);
```

Verwende `shallow` selector wo mehrere Felder geteilt werden, um unnötige Re-Renders zu vermeiden.

## 9. Responsive-Regeln

- Minimum 1280 Breite. Darunter: Warnung "Bitte größeres Display nutzen".
- 1920 Breite: Spacing skaliert leicht auf, Panels bleiben fix.
- 4K: `html { font-size: 17px; }` statt 16 px.

## 10. Beispiel-Komponenten-Tree

```
app/
├── layout.tsx                         // Font-Imports, Toaster-Mount
└── page.tsx                           // Root-Layout, siehe §1

components/
├── panels/
│   ├── Header.tsx
│   ├── LeftPanel.tsx
│   ├── RightPanel.tsx
│   ├── IncidentLauncher.tsx
│   ├── PlannedIntakeForm.tsx
│   ├── FilterPanel.tsx
│   ├── AlertList.tsx
│   ├── RecommendationList.tsx
│   ├── HospitalDetailPanel.tsx
│   ├── AuditLogPanel.tsx
│   └── TimelineStrip.tsx
├── map/
│   ├── MapContainer.tsx
│   ├── HospitalLayer.tsx
│   ├── IncidentLayer.tsx
│   ├── PlannedIntakeLayer.tsx
│   ├── RouteLayer.tsx
│   └── mapStyle.ts
├── charts/
│   ├── TimelineChart.tsx
│   ├── HospitalSparkline.tsx
│   └── ForkPreviewOverlay.tsx
└── ui/                                // shadcn
    ├── button.tsx
    ├── card.tsx
    ├── …
```

## 11. Loading States

- Initial-Ladung von `hospitals.json`: 300 ms Skelett in LeftPanel.
- OSRM-Pending-Routen: Pille zeigt sich erst, wenn Route bereit (max 300 ms Wartezeit visuell akzeptabel).
- Fork-Preview-Berechnung: im Recommendation-Card rechts unten kleiner Spinner mit Text "Preview berechnet…" (max 200 ms bis Start der Kurve).
