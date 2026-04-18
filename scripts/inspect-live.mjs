import { chromium } from '@playwright/test';

const URL = process.env.URL ?? 'http://localhost:3004';
const SCREENSHOT = 'scripts/_inspect-screenshot.png';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();

const consoleEvents = [];
const pageErrors = [];
const tilesResponses = [];

page.on('console', (msg) => {
  consoleEvents.push({ type: msg.type(), text: msg.text() });
});
page.on('pageerror', (err) => pageErrors.push(String(err)));
page.on('response', async (resp) => {
  const u = resp.url();
  if (u.includes('basemaps.cartocdn.com')) {
    tilesResponses.push({ status: resp.status(), url: u });
  }
});

console.log('Navigating to', URL);
const resp = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
console.log('HTTP', resp?.status());

// Lange warten: Map hat Zeit zu initialisieren + Tiles zu laden.
await page.waitForTimeout(8000);

await page.screenshot({ path: SCREENSHOT, fullPage: false });

const info = await page.evaluate(() => {
  const mapEl = document.querySelector('[data-testid="map-container"]');
  const canvas = document.querySelector('.maplibregl-canvas');
  const hasCanvas = !!canvas;
  const canvasRect = canvas?.getBoundingClientRect();
  const tileImages = document.querySelectorAll('.maplibregl-canvas-container img, .maplibregl-tile');
  // Canvas-Pixel-Test: sampling a few spots — sind die alle weiss?
  let canvasSample = null;
  if (canvas instanceof HTMLCanvasElement) {
    try {
      const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
      canvasSample = gl ? { hasGL: true, w: canvas.width, h: canvas.height } : { hasGL: false };
    } catch (e) {
      canvasSample = { err: String(e) };
    }
  }
  return {
    mapRect: mapEl?.getBoundingClientRect(),
    hasCanvas,
    canvasRect,
    canvasSample,
    tileCount: tileImages.length,
  };
});

console.log('--- map info ---');
console.log(JSON.stringify(info, null, 2));

console.log('--- tile responses ---');
console.log('count:', tilesResponses.length);
for (const t of tilesResponses.slice(0, 5)) console.log(t.status, t.url);

console.log('--- console (ALL) ---');
for (const e of consoleEvents) console.log(`[${e.type}]`, e.text);

console.log('--- pageErrors ---');
for (const e of pageErrors) console.log(e);

await browser.close();
