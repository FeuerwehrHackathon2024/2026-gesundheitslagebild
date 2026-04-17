# DATA_GENERATION — Excel-Parser & Hospital-JSON-Erzeugung

## 1. Input

`doc/Krankenhäuser_München.xlsx` — eine Sheet `Krankenhäuser_voll` mit **49 Datenzeilen** (Zeile 1 = Header).

**Spalten (exakt so in der Excel):**

| Col | Name              | Typ      | Hinweis                                    |
|-----|-------------------|----------|--------------------------------------------|
| A   | (leer)            | —        | Spalte 0 ist leer (exceljs-Quirk)          |
| B   | Name              | string   | Pflicht                                    |
| C   | Ort               | string   | meist "München", Umland möglich            |
| D   | Art               | string   | "Universitätsklinikum", "Fachklinik", …    |
| E   | Adresse           | string   | z. B. "Marchioninistraße 15, 81377 München"|
| F   | Bundesland        | string?  | oft leer                                   |
| G   | Land              | string   | "Deutschland"                              |
| H   | Telefon           | string   | nicht simulationsrelevant, mitführen       |
| I   | URL               | string   | nicht simulationsrelevant, mitführen       |
| J   | Abteilungen       | string   | kommagetrennt, lang                        |
| K   | Ausstattung       | string   | kommagetrennt, lang                        |
| L   | Betten            | number   | Gesamt-Bettenzahl                          |
| M   | Intensivbetten    | number   | ITS-Bettenzahl                             |
| N   | Latitude          | number   | WGS84                                      |
| O   | Longitude         | number   | WGS84                                      |

## 2. Output

`lib/data/hospitals.json` — Array von 49 `Hospital`-Objekten gemäß `DATA_MODEL.md §4`.

## 3. Script

`scripts/gen-hospitals.ts`, ausführbar via `pnpm tsx scripts/gen-hospitals.ts`.

### 3.1 Parse-Schritte

1. `ExcelJS.readFile('doc/Krankenhäuser_München.xlsx')`.
2. Sheet `Krankenhäuser_voll` iterieren ab Row 2.
3. Pro Row:
   - String-Felder **trimmen** und Entity-Dekodierung (Umlaute bleiben roh).
   - `Abteilungen` und `Ausstattung` per `.split(',').map(s => s.trim()).filter(Boolean)`.
   - `Adresse` parsen: Regex `^(.+?),?\s*(\d{5})\s+(.+)$` → `{ street, plz, city }`. Wenn nicht matcht: `street = raw`, `city = ort`, `plz = ''`.

### 3.2 Tier-Ableitung

```ts
function deriveTier(kind: string, beds: number): HospitalTier {
  if (/Universitätsklinikum/i.test(kind)) return 'maximal';
  if (beds >= 500) return 'schwerpunkt';
  if (beds >= 200) return 'regel';
  return 'grund';
}
```

### 3.3 Flags-Ableitung

```ts
function deriveFlags(abteilungen: string[]) {
  const joined = abteilungen.join(' | ').toLowerCase();
  return {
    hasOP:           /\bop\b|operation/.test(joined),
    hasITS:          /intensiv/.test(joined),
    hasNotaufnahme:  /notaufnahme|notfall/.test(joined),
    hasBurnCenter:   /verbrenn|plastische\s+chirurgie/.test(joined),
    hasNeurochir:    /neurochirurg/.test(joined),
    hasPaediatrie:   /pädiatr|kinder|neonatol/.test(joined),
  };
}
```

### 3.4 Capacity-Ableitung

Die Excel liefert nur Gesamt-`Betten` und `Intensivbetten`. Wir teilen in 4 Töpfe auf:

```ts
function deriveCapacity(beds: number, itsBeds: number, flags, tier) {
  const hasOP = flags.hasOP;
  const hasNA = flags.hasNotaufnahme;
  const hasITS = itsBeds > 0 || flags.hasITS;

  const normalBeds = Math.max(0, beds - itsBeds);

  // OP-Slots: grob 1 pro 60 Betten bei Häusern mit OP, sonst 0
  const opSlots = hasOP ? Math.max(2, Math.round(beds / 60)) : 0;

  // Notaufnahme-Slots: ~ Betten/80 bei Häusern mit NA, sonst 0
  const naSlots = hasNA ? Math.max(2, Math.round(beds / 80)) : 0;

  // Surge-Reserve: 20 % der jeweiligen Basis
  const mk = (total: number, surgeRatio = 0.2): Capacity => ({
    total,
    occupied: 0,                           // in Store-Init mit Baseline-Auslastung gefüllt
    surgeReserve: Math.round(total * surgeRatio),
    surgeActive: false,
  });

  return {
    notaufnahme: mk(naSlots),
    op_saal:     mk(opSlots),
    its_bett:    mk(itsBeds),
    normal_bett: mk(normalBeds),
  };
}
```

### 3.5 Staff-Ableitung

```ts
function deriveStaff(beds: number, tier: HospitalTier) {
  // Faustformel: 1 Pflegekraft/2 Normalbetten, 1/1 ITS, +20 % für Maximalversorger
  const base = Math.round(beds * 0.65);
  const factor = tier === 'maximal' ? 1.2 : tier === 'schwerpunkt' ? 1.0 : 0.8;
  const onDuty = Math.round(base * factor);
  const onCall = Math.round(onDuty * 0.4);
  return { onDuty, onCall };
}
```

### 3.6 Initial Escalation & Flags

```ts
escalation: 'normal',
electiveActive: true,
divertActive: false,
```

### 3.7 Baseline-Auslastung

**Nicht** im Script, sondern im Store-Init bei App-Start:
- Seeded RNG mit `state.seed`.
- Pro Ressource pro Klinik: `occupied = round(total * (0.65 + rng() * 0.15))` → 65–80 %.

Das Script liefert `occupied: 0` — der Store füllt auf.

## 4. Tests

`tests/unit/data-generation.test.ts`:

- `hospitals.json` existiert, length = 49.
- Alle Koordinaten liegen in Bayern-BBox (lng 10–13, lat 47–49).
- LMU Großhadern: `tier === 'maximal'`, `flags.hasITS === true`, `capacity.its_bett.total === 94`.
- Klinikum Rechts der Isar: `flags.hasOP === true`, `flags.hasNeurochir === true`.
- Mindestens 3 Häuser mit `tier === 'maximal'`.
- Mindestens 8 Häuser mit `flags.hasNotaufnahme === true`.

## 5. Edge-Cases

- **Zellen leer**: `undefined` → defensive Default (`''` oder `0`).
- **Nicht-numerische Betten-Werte**: in Number umwandeln, bei `NaN` → überspringen mit Warnung.
- **Doppelte Koordinaten**: akzeptieren, aber im Lint-Output warnen.
- **Umlaute in Dateiname**: sicherstellen dass `ExcelJS.readFile` auf Windows UTF-8-Pfad funktioniert — falls nicht, `Buffer`-Pfad via `fs.readFileSync` + `xlsx.load`.
