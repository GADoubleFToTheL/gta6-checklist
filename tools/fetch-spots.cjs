// Holt die Fundorte von der GTABase-Karte und schreibt data/spots.json.
// Übernommen werden nur ID (für den Direktlink auf den Marker), Name und Kategorie.
// Aufruf: node tools/fetch-spots.cjs   (braucht Playwright mit Chromium)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const MAP = 'https://www.gtabase.com/de/gta-6/karte/';

// Eigene deutsche Namen, wo GTABase englisch bleibt
const NAME_DE = {
  'cocaine-flamingo': 'Kokain-Flamingos', 'luxury-watch': 'Luxusuhren', 'style-magazine': 'Style-Magazine',
  meditation: 'Meditationsorte', 'yellow-loot-box': 'Gelbe Beutekisten', 'scoop-container': 'SCOOP-Container',
  'race-challenge': 'Renn-Herausforderungen', 'ev-charger': 'Ladesäulen', 'public-transport': 'Bahn- & Metrostationen',
  airport: 'Flughäfen & Flugplätze', ferry: 'Fährterminals', 'unique-weapon': 'Einzigartige Waffen',
  'hidden-package': 'Versteckte Pakete', 'easter-egg': 'Easter Eggs', 'collectible-card': 'Weitere Sammelkarten',
  'ahol-street-art': 'Ahol Street Art', nightclub: 'Nachtclubs', 'pay-n-spray': "Pay 'n' Spray",
  'smash-n-grab': "Smash 'n' Grab", strangers: 'Fremde & Freaks (Auftraggeber)',
};

// Eigene Gruppe „Geheimnisse & Legendäres“ zuerst
const HIGHLIGHTS = ['easter-egg', 'unique-weapon', 'standout-vehicle', 'wyman-car', 'treasure', 'shipwreck', 'underwater', 'message-bottle'];
const GROUP_ORDER = ['secrets', 'collectibles', 'collectible-cards', 'weapons', 'vehicles', 'activities', 'robberies', 'properties', 'style', 'food-drink', 'local-places'];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(MAP, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
  await page.waitForFunction(() => window.GTAB && window.GTAB.entries && Object.keys(window.GTAB.entries).length > 100, null, { timeout: 60000 });
  const raw = await page.evaluate(() => ({
    groups: window.GTAB_CATEGORIES.groups,
    categories: window.GTAB_CATEGORIES.categories,
    entries: Object.values(window.GTAB.entries).map((e) => [e.data.id, String(e.data.name || '').trim(), e.category.id]),
  }));
  await browser.close();

  const groups = [{ id: 'secrets', name: 'Geheimnisse & Legendäres' }, ...raw.groups.map((g) => ({ id: g.id, name: g.name }))]
    .sort((a, b) => GROUP_ORDER.indexOf(a.id) - GROUP_ORDER.indexOf(b.id));
  const byCat = new Map();
  for (const [id, name, cat] of raw.entries) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*-\d{3}$/.test(id) || !name) continue;
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push([id, name]);
  }
  const categories = raw.categories
    .filter((c) => byCat.has(c.id))
    .map((c) => ({
      id: c.id,
      name: NAME_DE[c.id] || c.name,
      group: HIGHLIGHTS.includes(c.id) ? 'secrets' : c.group,
      feature: c.slug || c.id,
      items: byCat.get(c.id).sort((a, b) => a[1].localeCompare(b[1], 'de', { numeric: true })),
    }))
    .sort((a, b) => (GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group))
      || (a.group === 'secrets' ? HIGHLIGHTS.indexOf(a.id) - HIGHLIGHTS.indexOf(b.id) : a.name.localeCompare(b.name, 'de')));
  const total = categories.reduce((n, c) => n + c.items.length, 0);
  const out = { source: 'GTABase – interaktive GTA-6-Karte', map: MAP, updated: new Date().toISOString().slice(0, 10), total, groups, categories };
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'spots.json'), `${JSON.stringify(out)}\n`);
  console.log(`${total} Fundorte in ${categories.length} Kategorien geschrieben.`);
})().catch((err) => { console.error(err); process.exit(1); });
