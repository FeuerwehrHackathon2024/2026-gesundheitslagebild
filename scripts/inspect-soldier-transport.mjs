import { chromium } from '@playwright/test';

const URL = process.env.URL ?? 'http://localhost:3000';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1920, height: 1080 } }).then((c) => c.newPage());

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

await page.fill('[data-testid="intake-prep"]', '30');
await page.fill('[data-testid="intake-interval"]', '30');
await page.fill('[data-testid="intake-patients"]', '400');
await page.fill('[data-testid="intake-flights"]', '2');
await page.click('[data-testid="btn-announce-intake"]');
await page.waitForTimeout(400);

// Speed 2x: Transport-Phase deutlich sichtbar.
await page.selectOption('[data-testid="speed-select"]', '2');
await page.click('[data-testid="btn-play"]');

// Bis T+28 warten (2x speed = 14s real), dann eng getaktete Shots waehrend
// der Transport-Phase T+30 bis T+50.
await page.waitForTimeout(14000);
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(1000);
  const clock = await page.textContent('[data-testid="sim-clock"]');
  const marker = await page.$('[data-testid="intake-marker"]');
  const status = marker ? await marker.getAttribute('data-intake-status') : '-';
  await page.screenshot({ path: `scripts/_inspect-soldiers-step${i}.png` });
  console.log(`step ${i}: ${clock?.trim()} status=${status}`);
}

await browser.close();
