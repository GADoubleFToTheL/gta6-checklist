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
// Gebiete, wie man sie aus dem Spiel kennt (aus den Landkreisen der GTABase-Karte abgeleitet)
const REGIONS = [
  { id: 'vice', name: 'Vice City', county: 'vice-dale' },
  { id: 'keys', name: 'Leonida Keys', county: 'mariana', anchors: ['Leonida Keys', 'Key Lento', 'Goose Key'] },
  { id: 'grassrivers', name: 'Grassrivers', county: 'mariana', anchors: ['Grassrivers', 'Capri'] },
  { id: 'gellhorn', name: 'Port Gellhorn & Ambrosia', county: 'kelly' },
  { id: 'leonida', name: 'Lake Leonida', county: 'leonard' },
  { id: 'kalaga', name: 'Mount Kalaga', county: 'lummox' },
];
const PLACE_RADIUS = 1600;

/** Klammer-genaues Herausschneiden eines JSON-Arrays aus dem Kartenskript. */
function grabArray(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']' && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  throw new Error('Array nicht gefunden');
}

function inside(x, y, poly) {
  let n = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) n = !n;
  }
  return n;
}

const GROUP_ORDER = ['secrets', 'collectibles', 'collectible-cards', 'weapons', 'vehicles', 'activities', 'robberies', 'properties', 'style', 'food-drink', 'local-places'];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(MAP, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
  await page.waitForFunction(() => window.GTAB && window.GTAB.entries && Object.keys(window.GTAB.entries).length > 100, null, { timeout: 60000 });
  const raw = await page.evaluate(async () => {
    const src = [...document.scripts].map((s) => s.src).find((u) => /gtab-map\/map\.js/.test(u));
    return {
      groups: window.GTAB_CATEGORIES.groups,
      categories: window.GTAB_CATEGORIES.categories,
      entries: Object.values(window.GTAB.entries).map((e) => [e.data.id, String(e.data.name || '').trim(), e.category.id, e.data.x, e.data.y, !!(e.data.image || e.data.image_small)]),
      mapJs: src ? await (await fetch(src)).text() : '',
    };
  });
  await browser.close();

  // Landkreise (Polygone) und Ortsnamen aus dem Kartenskript
  const cStart = raw.mapJs.search(/\[\["[a-z-]+","[^"]+",\[-?[\d.]+,-?[\d.]+\],\[\[\[/);
  const pStart = raw.mapJs.search(/\[\["[^"]+",-?\d+,-?\d+,"(?:region|city|town|district)"\]/);
  if (cStart < 0 || pStart < 0) throw new Error('Landkreise/Orte im Kartenskript nicht gefunden');
  const counties = grabArray(raw.mapJs, cStart).map(([id, name, , polys]) => ({ id, name, polys: polys.map((p) => (Array.isArray(p[0][0]) ? p[0] : p)) }));
  const allPlaces = grabArray(raw.mapJs, pStart).map(([name, x, y, type]) => ({ name, x, y, type }));
  const countyOf = (x, y) => counties.find((c) => c.polys.some((poly) => inside(x, y, poly)))?.id || null;
  const dist = (a, x, y) => Math.hypot(a.x - x, a.y - y);
  for (const pl of allPlaces) pl.county = countyOf(pl.x, pl.y);
  const nearestPlace = (x, y, filter) => allPlaces.filter(filter).reduce((best, pl) => (!best || dist(pl, x, y) < dist(best, x, y) ? pl : best), null);
  const regionOf = (x, y) => {
    let county = countyOf(x, y);
    if (!county) county = nearestPlace(x, y, (pl) => pl.county)?.county; // auf dem Meer: nächster Ort an Land
    const cands = REGIONS.filter((r) => r.county === county);
    if (cands.length < 2) return REGIONS.indexOf(cands[0] || REGIONS[0]);
    const best = nearestPlace(x, y, (pl) => cands.some((r) => r.anchors.includes(pl.name)));
    return REGIONS.indexOf(cands.find((r) => r.anchors.includes(best.name)));
  };
  const places = allPlaces.filter((pl) => pl.type !== 'region');
  const placeOf = (x, y, region) => {
    const pl = nearestPlace(x, y, (q) => q.type !== 'region' && (REGIONS[region].county === q.county || !q.county));
    return pl && dist(pl, x, y) <= PLACE_RADIUS ? places.indexOf(pl) : -1;
  };

  const groups = [{ id: 'secrets', name: 'Geheimnisse & Legendäres' }, ...raw.groups.map((g) => ({ id: g.id, name: g.name }))]
    .sort((a, b) => GROUP_ORDER.indexOf(a.id) - GROUP_ORDER.indexOf(b.id));
  const byCat = new Map();
  for (const [id, name, cat, x, y, photo] of raw.entries) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*-\d{3}$/.test(id) || !name) continue;
    if (!byCat.has(cat)) byCat.set(cat, []);
    const region = regionOf(x, y);
    // Eintrag: [Marker-ID, Name, Gebiet, Ort (-1 = keiner in der Nähe), Foto auf GTABase vorhanden (1/0)]
    byCat.get(cat).push([id, name, region, placeOf(x, y, region), photo ? 1 : 0]);
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
  const out = {
    source: 'GTABase – interaktive GTA-6-Karte', map: MAP, updated: new Date().toISOString().slice(0, 10), total, groups,
    regions: REGIONS.map(({ id, name }) => ({ id, name })), places: places.map((pl) => pl.name), categories,
  };
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'spots.json'), `${JSON.stringify(out)}\n`);
  console.log(`${total} Fundorte in ${categories.length} Kategorien geschrieben.`);
})().catch((err) => { console.error(err); process.exit(1); });
