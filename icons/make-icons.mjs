// Erzeugt icon-192.png / icon-512.png aus icon.svg (braucht Playwright mit Chromium).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
const svg = readFileSync(`${dir}icon.svg`, 'utf8');
const browser = await chromium.launch();
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: `${dir}icon-${size}.png` });
  await page.close();
}
await browser.close();
