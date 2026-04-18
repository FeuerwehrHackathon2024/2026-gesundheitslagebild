import { chromium } from '@playwright/test';

const URL = process.env.URL ?? 'http://localhost:3005';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

const chain = await page.evaluate(() => {
  const m = document.querySelector('[data-testid="map-container"]');
  if (!m) return { error: 'no map-container' };
  const out = [];
  let node = m;
  while (node && node !== document) {
    const cs = getComputedStyle(node);
    const r = node.getBoundingClientRect();
    out.push({
      tag: node.tagName,
      id: node.id || null,
      cls: node.className?.slice(0, 60) ?? null,
      w: r.width,
      h: r.height,
      pos: cs.position,
      display: cs.display,
      heightCss: cs.height,
      flex: cs.flex,
    });
    node = node.parentElement;
  }
  return { chain: out };
});

console.log(JSON.stringify(chain, null, 2));

await browser.close();
