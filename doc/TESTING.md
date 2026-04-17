# TESTING — Strategie, Gates, Beispiele

Tests sind nicht optional. Ohne grüne Tests keine Phase bestanden.

## 1. Stack

| Layer         | Framework       | Runner                 |
|---------------|-----------------|-------------------------|
| Unit          | Vitest          | `pnpm test`            |
| Integration   | Vitest + jsdom  | `pnpm test`            |
| E2E           | Playwright      | `pnpm test:e2e`        |
| Type-Check    | tsc             | `pnpm typecheck`       |
| Lint          | eslint-config-next | `pnpm lint`        |

## 2. Verzeichnis

```
tests/
├── unit/
│   ├── geo.test.ts
│   ├── resources.test.ts
│   ├── data-generation.test.ts
│   ├── allocation.test.ts
│   ├── relocation.test.ts
│   ├── router.test.ts
│   ├── detection.test.ts
│   ├── recommendations.test.ts
│   ├── fork-preview.test.ts
│   ├── routing-client.test.ts
│   ├── route-cache.test.ts
│   ├── audit.test.ts
│   └── measures.test.ts
├── integration/
│   ├── engine-tick-flow.test.ts
│   ├── relocation-flow.test.ts
│   ├── conflict-priorisation.test.ts
│   └── audit-flow.test.ts
└── e2e/
    ├── smoke.spec.ts
    ├── demo-showcase.spec.ts
    ├── incident-launch.spec.ts
    ├── planned-intake.spec.ts
    └── timeline-preview.spec.ts
```

## 3. Vitest-Konfiguration

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    environmentMatchGlobs: [['tests/**/*.dom.test.ts', 'jsdom']],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['lib/**/*.ts'],
      exclude: ['lib/**/*.d.ts', 'lib/data/hospitals.json'],
      lines: 60, branches: 50, functions: 60, statements: 60,
    },
  },
});
```

**Coverage-Gate**: Lines ≥ 60 %, Functions ≥ 60 %.

## 4. Unit-Test-Beispiele

### 4.1 allocation.test.ts

```ts
describe('allocateBatch', () => {
  it('places 30 T1/T2/T3 on 5 hospitals without overload', () => {
    const state = buildState({ hospitals: 5, beds: 100 });
    const patients = makePatients(30, mixDefault);
    const { results, unassignedIds, summary } = allocateBatch(state, patients);
    expect(unassignedIds).toHaveLength(0);
    expect(summary.cascadeUsed).toBe('none');
    for (const h of Object.values(state.hospitals)) {
      expect(h.capacity.normal_bett.occupied).toBeLessThan(h.capacity.normal_bett.total);
    }
  });

  it('cascades to D-surge when hospitals are tiny', () => {
    const state = buildState({ hospitals: 3, beds: 10 });
    const patients = makePatients(200);
    const { unassignedIds, summary } = allocateBatch(state, patients);
    expect(unassignedIds).toHaveLength(0);     // alle versorgt
    expect(summary.cascadeUsed).toBe('D-surge');
  });
});
```

### 4.2 relocation.test.ts

```ts
it('frees 115 beds near airport when intake 100 with 15% buffer announced', () => {
  const state = buildStateWithIntake();
  state.plannedIntakes[0].status = 'preparing';
  for (let m = 0; m < 720; m++) tick(state, seededRng(1));
  const nearCluster = hospitalsWithin(30, state.plannedIntakes[0].arrivalPoint);
  const freed = sumFreeBeds(nearCluster);
  expect(freed).toBeGreaterThanOrEqual(115);
});
```

### 4.3 fork-preview.test.ts

```ts
it('activate-surge reduces peakLoad by at least 5 pp in overloaded hospital', () => {
  const state = buildOverloadedState();
  const rec = recForSurge(state);
  const result = computeForkPreview(state, rec, 240);
  expect(result.diff.peakLoadDelta).toBeLessThanOrEqual(-5);
});
```

### 4.4 detection.test.ts

Alle 8 Regeln mit konstruierten Mini-States.

### 4.5 routing-client.test.ts

```ts
it('falls back to haversine when OSRM rejects', async () => {
  vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('network'));
  const r = await getRoute(from, to);
  expect(r.source).toBe('haversine-fallback');
});
```

## 5. Integration-Tests

### 5.1 engine-tick-flow.test.ts

- Initial-State (49 Kliniken, Baseline) → tick 60 Minuten ohne Incidents → Auslastungen stabil.
- Launch Amok → tick 20 Minuten → mindestens 5 Kliniken mit `occupied > 0` aus Incident-Patienten.

### 5.2 conflict-priorisation.test.ts

- Intake announced bei T+0 (24 h Vorlauf), `prepare-reception` executed.
- Nach 23 h: MANV S-Bahn (180) → Allocation priorisiert MANV, Relocation-Engine pausiert.
- Nach 10 weiteren Minuten: mindestens eine `recommendation.executed` gegen MANV-Overload.

## 6. E2E-Tests (Playwright)

### 6.1 playwright.config.ts

```ts
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  use: { baseURL: 'http://localhost:3000', trace: 'on-first-retry' },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'desktop', use: { viewport: { width: 1600, height: 900 } } }],
});
```

### 6.2 smoke.spec.ts

```ts
test('home renders header, map, panels', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Rettungsleitstelle')).toBeVisible();
  await expect(page.locator('[data-testid=map-container]')).toBeVisible();
  await expect(page.getByText('Lage auslösen')).toBeVisible();
  await expect(page.getByText('Empfehlungen')).toBeVisible();
});
```

### 6.3 demo-showcase.spec.ts

```ts
test('demo showcase runs to completion', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Demo/ }).click();
  // Warte auf Ende (T+26h bei 10× = ~156 s), mit Puffer 240 s
  await page.waitForFunction(
    () => window.__SIM__?.showcaseStatus === 'complete',
    { timeout: 240_000 }
  );
  // Audit-Log enthält relevante Events
  await page.getByRole('tab', { name: /Audit/ }).click();
  await expect(page.getByText(/incident\.started/)).toBeVisible();
  await expect(page.getByText(/intake\.announced/)).toBeVisible();
  await expect(page.getByText(/recommendation\.executed/)).toBeVisible();
});
```

### 6.4 timeline-preview.spec.ts

```ts
test('hovering recommendation shows preview curve', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Starten/ }).click();       // Amok
  await page.waitForTimeout(3000);
  await page.getByRole('tab', { name: /Empfehlungen/ }).click();
  const first = page.locator('[data-testid^=rec-card]').first();
  await first.hover();
  await expect(page.locator('[data-testid=fork-overlay]')).toBeVisible({ timeout: 2000 });
});
```

## 7. Gates pro Phase (siehe PHASES.md)

Ein Gate ist nur bestanden, wenn:
- `pnpm typecheck` exit 0
- `pnpm lint` exit 0
- `pnpm test` exit 0
- ggf. `pnpm test:e2e` exit 0
- Phase-spezifischer manueller Check durchgeführt

## 8. CI-Freundlichkeit

- Netzabhängige Tests (OSRM live) laufen mit `.skip()` wenn `process.env.CI === 'true'`.
- Playwright mit `--reporter=list,html`.
- GitHub Actions-Datei optional (nicht Scope dieser Initial-Phase).

## 9. Mocks & Fixtures

```
tests/
└── fixtures/
    ├── mini-hospitals.ts        // 5-Kliniken-Sim-State
    ├── patients-factory.ts      // makePatients(n, mix)
    └── build-state.ts           // buildState(opts)
```

Patterns aus Fixtures wiederverwenden, keine Inline-Konstruktion in jedem Test.

## 10. Anti-Patterns

- Keine Tests mit echten OSRM-Aufrufen außer `routing-live`-Tests (markiert `.skipIf(process.env.CI)`).
- Kein `sleep(Math.random())`; nutze Sim-Ticks oder deterministisches Timing.
- Keine UI-Assertions auf Pixelwerte oder Animationen; stattdessen `data-testid` und textuelle/ARIA-Selektoren.
- Keine Test-Duplikate aus Unit in Integration — Integration testet Abläufe, Unit einzelne Funktionen.
