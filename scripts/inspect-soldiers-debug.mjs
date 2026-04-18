// Debug: lese aus der Browser-Console die RouteLayer-Breakdown-Logs
// um herauszufinden ob Soldaten-Patienten tatsaechlich ins transport
// state kommen.
import { chromium } from '@playwright/test';

const URL = process.env.URL ?? 'http://localhost:3000';
const browser = await chromium.launch();
const page = await browser.newContext({ viewport: { width: 1920, height: 1080 } }).then((c) => c.newPage());

const logs = [];
page.on('console', (msg) => {
  const t = msg.text();
  if (t.startsWith('[RouteLayer DEBUG]')) logs.push(t);
});

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.evaluate(() => { window.__RL_DEBUG_FLOWS = true; });

await page.fill('[data-testid="intake-prep"]', '15');
await page.fill('[data-testid="intake-interval"]', '20');
await page.fill('[data-testid="intake-patients"]', '300');
await page.fill('[data-testid="intake-flights"]', '2');
await page.click('[data-testid="btn-announce-intake"]');
await page.waitForTimeout(300);

await page.selectOption('[data-testid="speed-select"]', '1');
await page.click('[data-testid="btn-play"]');

// 30 Sekunden real = 30 Sim-Min
await page.waitForTimeout(30000);

console.log('--- Alle [RouteLayer DEBUG] logs ---');
for (const l of logs) console.log(l);

await browser.close();
