# DESIGN — Apple Liquid-Glass Design-System

Hell, modern, professionell. Inspiriert von Apple macOS/iOS Liquid-Glass (ab 2024) und visionOS. Fokus auf Ruhe, Tiefe durch Blur, sparsamer Farbeinsatz, präzise Daten-Typografie.

**Absolutes NoGo:** Dark-Mode-Erbe des Alt-Projekts, Gotham-Styling, rounded-corner-Excess, schrille Farben.

## 1. Farbtokens (CSS-Variablen in `app/globals.css`)

```css
:root {
  /* Backgrounds */
  --bg-base:        #F5F6F8;        /* App-Hintergrund */
  --bg-elevated:    rgba(255,255,255,0.72);   /* Glass-Panel */
  --bg-elevated-2:  rgba(255,255,255,0.88);   /* Modal / Popover */
  --bg-subtle:      #ECEEF2;
  --bg-hover:       rgba(0,0,0,0.035);
  --bg-active:      rgba(0,0,0,0.06);

  /* Hierarchy lines */
  --border-1:       rgba(0,0,0,0.06);
  --border-2:       rgba(0,0,0,0.12);
  --border-strong:  rgba(0,0,0,0.22);

  /* Text */
  --text-primary:   #1D1D1F;         /* Apple SF near-black */
  --text-secondary: #3C3C43CC;       /* 80% */
  --text-tertiary:  #6E6E73;
  --text-disabled:  #AEAEB2;
  --text-on-color:  #FFFFFF;

  /* Accents (Apple System Colors) */
  --accent-blue:    #007AFF;
  --accent-blue-soft: #007AFF1A;     /* 10% */
  --accent-indigo:  #5856D6;
  --accent-purple:  #AF52DE;
  --accent-teal:    #30B0C7;
  --accent-green:   #34C759;
  --accent-yellow:  #FFCC00;
  --accent-orange:  #FF9500;
  --accent-red:     #FF3B30;
  --accent-pink:    #FF2D55;

  /* Semantic */
  --status-ok:        var(--accent-green);
  --status-notice:    var(--accent-blue);
  --status-warn:      var(--accent-orange);
  --status-critical:  var(--accent-red);

  /* Charts (Tableau-like, accessible) */
  --chart-1: #007AFF;    /* Overall */
  --chart-2: #5856D6;    /* ITS */
  --chart-3: #FF9500;    /* OP */
  --chart-4: #30B0C7;    /* Notaufnahme */
  --chart-5: #AF52DE;    /* Verlegungen */

  /* Shadows (subtil, Apple-like) */
  --shadow-sm: 0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06);
  --shadow-md: 0 4px 6px -1px rgba(16,24,40,0.06), 0 2px 4px -2px rgba(16,24,40,0.05);
  --shadow-lg: 0 12px 24px -6px rgba(16,24,40,0.10), 0 4px 8px -3px rgba(16,24,40,0.06);
  --shadow-panel: 0 0 0 1px rgba(0,0,0,0.05), 0 20px 40px -12px rgba(16,24,40,0.12);

  /* Glass */
  --glass-blur: blur(24px) saturate(1.6);
  --glass-blur-strong: blur(40px) saturate(1.8);

  /* Radii */
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 20px;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;

  /* Typography */
  --font-sans: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', system-ui, sans-serif;
  --font-display: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', system-ui, sans-serif;
  --font-mono: 'SF Mono', 'JetBrains Mono', ui-monospace, Menlo, monospace;

  /* Z-Indizes */
  --z-map: 1;
  --z-route: 10;
  --z-marker: 20;
  --z-panel: 40;
  --z-tooltip: 60;
  --z-modal: 80;
  --z-toast: 90;
}
```

## 2. Typografie

| Token           | Family         | Size | Weight | Tracking | Use                                    |
|-----------------|----------------|------|--------|----------|----------------------------------------|
| `text-display`  | SF Pro Display | 28px | 600    | -0.02em  | Headline im Demo-Modal                 |
| `text-h1`       | SF Pro Display | 22px | 600    | -0.01em  | Panel-Überschriften                    |
| `text-h2`       | SF Pro Display | 18px | 600    | -0.01em  | Sektionen                              |
| `text-h3`       | SF Pro Text    | 15px | 600    | 0        | Karten-Titel                           |
| `text-body`     | SF Pro Text    | 14px | 400    | 0        | Fließtext                              |
| `text-label`    | SF Pro Text    | 13px | 500    | 0.01em   | Formularlabel                          |
| `text-caption`  | SF Pro Text    | 12px | 400    | 0.01em   | Meta, Zeitstempel                      |
| `text-micro`    | SF Pro Text    | 11px | 500    | 0.04em uppercase | Sektionsheader klein           |
| `text-mono`     | SF Mono        | 13px | 450    | 0        | Zahlen, IDs, Monospace                 |
| `text-mono-lg`  | SF Mono        | 22px | 500    | -0.02em  | Sim-Uhr im Header                      |

**Regel:** Alle Zahlen (Bettenzahlen, Distanzen, Uhrzeiten, Auslastung) in `text-mono`. Keine proportionalen Ziffern für Daten.

## 3. Glass-Panel-Komponente

```tsx
export function GlassPanel({ children, className, strong }: Props) {
  return (
    <div
      className={cn(
        'relative isolate overflow-hidden rounded-[var(--radius-lg)]',
        'border border-[var(--border-1)]',
        'shadow-[var(--shadow-panel)]',
        className,
      )}
      style={{
        background: strong ? 'var(--bg-elevated-2)' : 'var(--bg-elevated)',
        backdropFilter: strong ? 'var(--glass-blur-strong)' : 'var(--glass-blur)',
        WebkitBackdropFilter: strong ? 'var(--glass-blur-strong)' : 'var(--glass-blur)',
      }}
    >
      {children}
    </div>
  );
}
```

Für Fallback auf Browsern ohne `backdrop-filter`: weniger transparente `background`. Mit `@supports (backdrop-filter: blur(1px))`:

```css
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass { background: #FFFFFFEE; }
}
```

## 4. Layout (Desktop min 1440×900)

```
┌───────────────────────────────────────────────────────────────────────┐
│ HEADER  (56 px)  sim-clock  ·  speed  ·  play/pause  ·  Demo-Btn      │
├──────────────────┬───────────────────────────────┬────────────────────┤
│                  │                               │                    │
│  LEFT (320 px)   │            MAP                │  RIGHT (380 px)    │
│                  │                               │                    │
│ - IncidentLauncher                               │ - Tabs:            │
│ - PlannedIntake  │        MapLibre Positron      │   Alarme           │
│ - Filter         │                               │   Empfehlungen     │
│ - Legend         │                               │   Klinik           │
│                  │                               │   Audit            │
├──────────────────┴───────────────────────────────┴────────────────────┤
│  TIMELINE STRIP  (160 px)  Multi-Curves · Events · Scrubber           │
└───────────────────────────────────────────────────────────────────────┘
```

- Panels sind **Glass**, liegen *auf* der Karte (Map rendert Bildschirm-weit, Panels overlay).
- Zwischen Panels 12 px Gap. Abstand zum Viewport-Rand 16 px.
- Header und Timeline liegen ebenfalls als Glass-Leisten top/bottom.

## 5. Komponenten-Richtlinien

### 5.1 Buttons (shadcn Button + Override)

- **Primary:** `background: var(--accent-blue); color: white; shadow-sm`.
- **Secondary:** Glass look, `background: var(--bg-elevated)`, `border: var(--border-2)`.
- **Ghost:** no background, hover `var(--bg-hover)`.
- **Destructive:** `background: var(--accent-red); color: white`.
- Größen: `sm (28px)`, `md (32px)`, `lg (40px)`.
- Radius immer `var(--radius-md)`.

### 5.2 Tabs

- Unterstrich-Stil, kein Filled. Active-Indikator als 2px-Line in `var(--accent-blue)`.

### 5.3 Karten (Recommendation / Hospital / Alert)

- Radius `var(--radius-md)`, Border `var(--border-1)`, Hover-Bg `var(--bg-hover)`.
- Interne Padding `var(--space-4)`.
- Impact-Chips: pill-shaped, `background: var(--accent-blue-soft)`, 11px Mono.

### 5.4 Tooltips

- `background: var(--bg-elevated-2)`, Blur strong, kleine Schatten.
- Radius `var(--radius-sm)`. Max-Width 280 px.

### 5.5 Inputs / Sliders (shadcn)

- Label oben, Caption darunter (error ggf rot).
- Slider-Thumb weiß mit Schatten, Track `var(--accent-blue)` für Filled, sonst `var(--bg-subtle)`.

## 6. Map-Stil

- **Tiles:** CartoDB Positron (hell, reduziert) oder MapLibre Demo. Wenn verfügbar: Positron-Labels leicht desaturiert.
- **Straßen:** feine Linien, neutral grau.
- **Wasser:** `#E3EBF2`, **Grün:** `#E6EEDE`.
- **Kliniken-Marker:**
  - Kreis `8–14 px` nach Tier.
  - Fill nach Gesamt-Auslastung:
    - ≤ 60 %: `var(--accent-green)`
    - 60–80 %: `var(--accent-yellow)`
    - 80–95 %: `var(--accent-orange)`
    - ≥ 95 %: `var(--accent-red)` + Pulse
  - Stroke: `2px weiß` + `1px rgba(0,0,0,0.15)`.
  - Hover: `scale(1.15)` + Tooltip.
- **MANV-Marker:** siehe `SCENARIOS.md §4`. Größe ~ √casualties, kein Radiuskreis.
- **PlannedIntake-Marker:** großer Flugzeug-Icon + Trichter-Visualisierung der Erwartungen.
- **Routen:**
  - `manv-transport`: durchgezogen, `#007AFF`, 2 px.
  - `hospital-transfer`: durchgezogen, `#AF52DE`, 2 px.
  - `planned-arrival`: durchgezogen, `#34C759`, 2 px.
  - `fallback (haversine)`: gleiche Farbe, **gestrichelt** `4,4`.
  - Animierte Pille entlang der Linie, Radius 5 px, gleiche Farbe, Schatten-Glow.

## 7. Motion

- Transitions: `180 ms cubic-bezier(.2,.7,.2,1)` als Default.
- Enter von Panels: `opacity 0 → 1` über 120 ms, kein Translate.
- Alert-Card-Insertion: kurzer Pulse-Stroke.
- Map-Marker-Pulse (critical): 1.5 s ease-in-out Loop.

## 8. Iconografie

- **lucide-react**, Stroke 1.6.
- Icon-Größen: 14 / 16 / 20 / 24 px.
- Semantische Paarung: `AlertTriangle` für Warnung, `ShieldAlert` critical, `CheckCircle2` ok, `Plane` intake, `ArrowRightLeft` relocation, `Activity` sim laufend, `Pause` pausiert.

## 9. Accessibility

- Kontrast Text auf Background immer ≥ 4.5:1 (primary > 7:1).
- Fokus-Ring 2 px `var(--accent-blue)` + 2 px transparent offset.
- Interaktive Elemente min 32 px Höhe.
- Keyboard: Space=Pause, 1..5=Speed, Esc=schließen.

## 10. shadcn/ui-Konfiguration

`components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "app/globals.css",
    "baseColor": "zinc",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

Installiere **mindestens** die folgenden Komponenten:
```
button card dialog dropdown-menu input label popover select separator
slider switch tabs textarea toast tooltip scroll-area badge
```

Ergänzende Token-Anpassung in `app/globals.css`: die shadcn-Tokens (`--primary`, `--background`, etc.) auf die obigen Werte mappen, so dass shadcn-Komponenten automatisch im Liquid-Glass-Look erscheinen.

## 11. Qualitäts-Checkliste

- [ ] Kein Komponenten-Border oberhalb 1px.
- [ ] Kein Schatten außer den drei Tokens.
- [ ] Keine eigene Border-Farbe außer den drei Tokens.
- [ ] Alle Zahlen in `font-mono`.
- [ ] Keine Emoji im UI außer in User-Input.
- [ ] Kein Gradient außer sehr subtil in Map-Legend-Balken.
- [ ] Panels sehen bei weißen und farbigen Map-Hintergründen gleich gut lesbar aus.
