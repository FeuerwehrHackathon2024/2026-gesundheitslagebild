// Showcase-Demo: 5 Key-Moments eines Soldaten-Intakes.
import { chromium } from '@playwright/test';

const URL = process.env.URL ?? 'http://localhost:3000';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1920, height: 1080 } }).then((c) => c.newPage());

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);

// Konfiguration: 400 Soldaten in 2 Flügen, 30 Min Abstand, 30 Min Vorlauf.
await page.fill('[data-testid="intake-prep"]', '30');
await page.fill('[data-testid="intake-interval"]', '30');
await page.fill('[data-testid="intake-patients"]', '400');
await page.fill('[data-testid="intake-flights"]', '2');
await page.click('[data-testid="btn-announce-intake"]');
await page.waitForTimeout(400);

// Baseline: Marker VOR dem Start (announced/preparing → Relocation laeuft)
await page.screenshot({ path: 'scripts/_demo-1-announced.png' });
console.log('[1] T+00:00 — Intake angekuendigt (Marker gruen), Relocation startet');

await page.selectOption('[data-testid="speed-select"]', '2');
await page.click('[data-testid="btn-play"]');

// Phase: Relocation laeuft (bis T+28)
await page.waitForTimeout(7500);
let clock = await page.textContent('[data-testid="sim-clock"]');
await page.screenshot({ path: 'scripts/_demo-2-relocation.png' });
console.log(`[2] ${clock?.trim()} — Relocation: violette Linien raeumen Kliniken am Flughafen`);

// Flug 1 landet T+30, Deplane 10 Min → Peak ca T+35-38
await page.waitForTimeout(4000);
clock = await page.textContent('[data-testid="sim-clock"]');
await page.screenshot({ path: 'scripts/_demo-3-flight1.png' });
console.log(`[3] ${clock?.trim()} — Flug 1 landet, gruene Transport-Fluesse zu Kliniken`);

// Zweite Welle mit Flug 2 bei T+60
await page.waitForTimeout(12000);
clock = await page.textContent('[data-testid="sim-clock"]');
await page.screenshot({ path: 'scripts/_demo-4-flight2.png' });
console.log(`[4] ${clock?.trim()} — Flug 2 landet, zweite gruene Welle`);

// Spaeter Zustand
await page.waitForTimeout(10000);
clock = await page.textContent('[data-testid="sim-clock"]');
await page.screenshot({ path: 'scripts/_demo-5-late.png' });
console.log(`[5] ${clock?.trim()} — Spaeter Zustand, die meisten Soldaten in Behandlung`);

await browser.close();
