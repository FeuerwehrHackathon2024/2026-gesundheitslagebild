import { chromium } from '@playwright/test';

const URL = process.env.URL ?? 'http://localhost:3007';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();

const errors = [];
const pageErrs = [];

page.on('console', (msg) => {
  const t = msg.type();
  if (t === 'error' || t === 'warning') errors.push({ t, text: msg.text() });
});
page.on('pageerror', (err) => pageErrs.push(String(err)));
page.on('requestfailed', (req) =>
  errors.push({ t: 'netfail', text: `${req.url()} ${req.failure()?.errorText}` })
);

const step = async (name, fn) => {
  console.log(`\n=== ${name} ===`);
  const beforeErr = errors.length;
  const beforePageErr = pageErrs.length;
  await fn();
  await page.waitForTimeout(1500);
  const newErrs = errors.slice(beforeErr);
  const newPage = pageErrs.slice(beforePageErr);
  if (newPage.length) {
    console.log(`  ⚠ PAGE ERRORS (${newPage.length}):`);
    for (const e of newPage) console.log(`    ${e.slice(0, 400)}`);
  }
  if (newErrs.length) {
    console.log(`  Console errors (${newErrs.length}):`);
    for (const e of newErrs) console.log(`    [${e.t}] ${e.text.slice(0, 300)}`);
  }
  if (newPage.length === 0 && newErrs.length === 0) console.log('  keine neuen Errors');
  const fname = `scripts/_inspect-${name.replace(/\s/g, '-')}.png`;
  await page.screenshot({ path: fname });
};

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);

await step('00-load', async () => {});

// Klinik-Hover: Mouse auf einen der Klinik-Punkte bewegen.
await step('05-hover-hospital', async () => {
  const canvas = await page.$('.maplibregl-canvas');
  if (!canvas) return;
  const box = await canvas.boundingBox();
  if (!box) return;
  // Marienplatz-Area ist in der Map-Mitte (Zoom 9.5, center auf Marienplatz).
  // Bewege Mouse langsam ueber die Map-Mitte — trifft mit Glueck eine Klinik.
  for (let dx = -60; dx <= 60; dx += 10) {
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2);
    await page.waitForTimeout(50);
  }
});

await step('10-launch-amok', async () => {
  await page.click('[data-testid="btn-launch-incident"]');
});

await step('20-play', async () => {
  await page.click('[data-testid="btn-play"]');
});

await step('30-wait-sim', async () => {
  await page.waitForTimeout(3000);
});

await step('40-tab-recs', async () => {
  await page.click('[data-testid="tab-recs"]');
});

await step('50-hover-rec', async () => {
  const rec = await page.$('[data-testid="recommendation-card"]');
  if (rec) await rec.hover();
});

await step('60-click-hospital-on-map', async () => {
  const canvas = await page.$('.maplibregl-canvas');
  if (canvas) {
    const box = await canvas.boundingBox();
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
});

await step('70-pause', async () => {
  const pauseBtn = await page.$('[data-testid="btn-pause"]');
  if (pauseBtn) await pauseBtn.click();
});

console.log('\n=== GESAMT ===');
console.log(`pageErrors: ${pageErrs.length}`);
console.log(`console errors/warnings: ${errors.length}`);

const uniq = new Map();
for (const e of errors) {
  const k = `${e.t}|${e.text.slice(0, 160)}`;
  uniq.set(k, (uniq.get(k) ?? 0) + 1);
}
console.log('\nuniq errors:');
for (const [k, c] of [...uniq.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  [×${c}] ${k.slice(0, 220)}`);
}

for (const e of pageErrs) console.log('PAGEERROR:', e);

await browser.close();
