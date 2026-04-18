// Gezielter Peak-Screenshot direkt nach der Flug-Landung,
// wenn die gruenen Batch-Pillen unterwegs sind.
import { chromium } from '@playwright/test';

const URL = process.env.URL ?? 'http://localhost:3000';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1920, height: 1080 } }).then((c) => c.newPage());

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);

await page.fill('[data-testid="intake-prep"]', '15');
await page.fill('[data-testid="intake-interval"]', '20');
await page.fill('[data-testid="intake-patients"]', '300');
await page.fill('[data-testid="intake-flights"]', '2');
await page.click('[data-testid="btn-announce-intake"]');
await page.waitForTimeout(400);

// Speed 1x — langsamer fuer klare Sichtbarkeit
await page.selectOption('[data-testid="speed-select"]', '1');
await page.click('[data-testid="btn-play"]');

// Shots alle 2 Sim-Min (2 s real @ 1x) waehrend Flug 1 Deplane + Transport.
// Flug 1 landet bei T+15, Deplane 10 Min (T+15-25), Transport 5-20 Min
// → komplett sichtbar bis ca. T+40.
await page.waitForTimeout(15500); // bis T+15 (Flug 1 landet)

for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(2000);
  const clock = await page.textContent('[data-testid="sim-clock"]');
  await page.screenshot({ path: `scripts/_peak-${String(i).padStart(2, '0')}.png` });
  console.log(`peak ${i}: ${clock?.trim()}`);
}

await browser.close();
