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

/* ---------- Typ je Waffe / Fahrzeug (aus den GTABase-Datenbanken, nur die Klasse wird übernommen) ---------- */

const TYPE_CATS = { weapons: ['unique-weapon', 'weapon-spawn'], vehicles: ['standout-vehicle', 'wyman-car', 'vehicle-spawn', 'vehicle-request'] };
const VEH_CLASS = {
  Super: 'Supersportwagen', Sports: 'Sportwagen', Muscle: 'Muscle-Car', Coupes: 'Coupé', Sedans: 'Limousine', SUVs: 'SUV',
  'Off-Road': 'Geländewagen', Pickups: 'Pick-up', Vans: 'Transporter', Commercial: 'Lkw', Industrial: 'Industriefahrzeug',
  Utility: 'Nutzfahrzeug', Service: 'Servicefahrzeug', Emergency: 'Einsatzfahrzeug', Military: 'Militärfahrzeug',
  Motorcycles: 'Motorrad', Cycles: 'Fahrrad', Boats: 'Boot', Planes: 'Flugzeug', Helicopters: 'Hubschrauber',
};
// Grobe Art für den Filter: alle Autoklassen → „Auto“
const VEH_KIND = (label) => (['Motorrad', 'Fahrrad', 'Boot', 'Flugzeug', 'Hubschrauber'].includes(label) ? label : 'Auto');
const WEP_CLASS = {
  'Assault Rifles': 'Sturmgewehr', SMG: 'Maschinenpistole', LMG: 'Maschinengewehr', Shotguns: 'Schrotflinte',
  'Sniper Rifles': 'Scharfschützengewehr', 'Tactical Rifles': 'Taktisches Gewehr', Launchers: 'Werfer', Throwable: 'Wurfwaffe', Melee: 'Nahkampfwaffe',
};
const normName = (s) => ` ${String(s).toLowerCase()
  .replace(/\([^)]*\)/g, ' ').replace(/\bpart \d+\s*\/\s*\d+/g, ' ').replace(/[’']\d{2}\b/g, ' ').replace(/\b(19|20)\d{2}\b/g, ' ')
  .replace(/[’']/g, '').replace(/\.(?!\d)/g, ' ').replace(/[^a-z0-9.]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
// Kurzwaffen: Revolver nach dem realen Vorbild (S&W Model 10/642/629, Taurus Raging Hunter, Colt Python)
const handgunLabel = (name) => {
  const n = normName(name);
  if (/akulus|wcr|mustang \.?357|morgan|h l \.?38|^ \.?38 $/.test(n)) return 'Revolver';
  if (/shocker/.test(n)) return 'Elektroschocker';
  return 'Pistole';
};
const WEP_WORDS = [
  [/revolver|wcr/, 'Revolver'], [/flare gun/, 'Signalpistole'], [/pistol/, 'Pistole'], [/shotgun|gorse/, 'Schrotflinte'], [/sniper/, 'Scharfschützengewehr'],
  [/assault rifle|\b556\b|kz.?59/, 'Sturmgewehr'], [/\bsmg\b|w.?10/, 'Maschinenpistole'], [/\blmg\b|machine gun/, 'Maschinengewehr'],
  [/launcher|\bat.?t\b|\brpg\b/, 'Werfer'], [/grenade|molotov|pipe bomb|explosive|\bc4\b|sticky bomb|tear gas/, 'Wurfwaffe'],
  [/\bbat\b|golf club|machete|knife|shovel|spade|wrench|crowbar|hammer|baton|\baxe\b|hatchet|katana|pool cue|bottle|knuckle/, 'Nahkampfwaffe'],
];
const VEH_WORDS = [
  [/boat|yacht|jet ski|seashark|dinghy|kayak|canoe|\btug\b|squalo|speeder|jetmax|marquis|airboat/, 'Boot'],
  [/heli|maverick|buzzard|frogger/, 'Hubschrauber'], [/plane|dodo|cuban 800|duster|\bjets?\b|mallard/, 'Flugzeug'],
  [/\bbmx\b|bicycle|scorcher|tribike/, 'Fahrrad'], [/motorcycle|dirt bike|enduro|sanchez|faggio|\bquad\b/, 'Motorrad'],
  [/\btanks?\b/, 'Militärfahrzeug'], [/truck/, 'Lkw'],
];

function buildTypeIndex(rawDb, kind) {
  const items = Object.values(JSON.parse(Buffer.from(rawDb.trim(), 'base64').toString('utf8'))).filter((v) => v && v.name);
  const fv = (it, k) => { const a = it.attr?.[k]; const v = a && typeof a === 'object' ? a.frontend_value : a; return Array.isArray(v) ? v : v ? [v] : []; };
  return items.map((it) => {
    const cls = fv(it, kind === 'weapons' ? 'ct55' : 'ct1')[0];
    const label = kind === 'weapons' ? (cls === 'Handguns' ? handgunLabel(it.name) : WEP_CLASS[cls]) : VEH_CLASS[cls];
    return { keys: [normName(`${fv(it, 'ct2')[0] || ''} ${it.name}`), normName(it.name)], label };
  }).filter((d) => d.label);
}

function classify(name, index, kind) {
  const n = normName(name);
  const exact = index.find((d) => d.keys.includes(n));
  if (exact) return exact.label;
  let best = null;
  for (const d of index) for (const k of d.keys) if (k.trim().length >= 3 && n.includes(k) && (!best || k.length > best.len)) best = { len: k.length, label: d.label };
  if (best) return best.label;
  const raw = String(name).toLowerCase();
  for (const [re, label] of kind === 'weapons' ? WEP_WORDS : VEH_WORDS) if (re.test(raw)) return label;
  return null;
}

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
  // Waffen- und Fahrzeug-Datenbank (für die Typen)
  const dbRaw = {};
  page.on('response', async (r) => {
    const m = r.url().match(/com_jamegafilter\/en_gb\/(\d+)\.json/);
    if (m) dbRaw[m[1]] = await r.text().catch(() => '');
  });
  const raw = await page.evaluate(async () => {
    const src = [...document.scripts].map((s) => s.src).find((u) => /gtab-map\/map\.js/.test(u));
    return {
      groups: window.GTAB_CATEGORIES.groups,
      categories: window.GTAB_CATEGORIES.categories,
      entries: Object.values(window.GTAB.entries).map((e) => [e.data.id, String(e.data.name || '').trim(), e.category.id, e.data.x, e.data.y, !!(e.data.image || e.data.image_small)]),
      mapJs: src ? await (await fetch(src)).text() : '',
    };
  });
  const dbPage = await browser.newPage();
  const typeIndex = {};
  for (const [kind, url] of [['vehicles', 'https://www.gtabase.com/gta-6/vehicles/'], ['weapons', 'https://www.gtabase.com/gta-6/weapons/']]) {
    const before = new Set(Object.keys(dbRaw));
    dbPage.on('response', async (r) => {
      const m = r.url().match(/com_jamegafilter\/en_gb\/(\d+)\.json/);
      if (m && !before.has(m[1])) dbRaw[`${kind}`] = await r.text().catch(() => '');
    });
    await dbPage.goto(url, { waitUntil: 'networkidle', timeout: 90000 }).catch(() => {});
    await dbPage.waitForTimeout(1500);
    dbPage.removeAllListeners('response');
    if (!dbRaw[kind]) throw new Error(`Datenbank ${kind} nicht geladen`);
    typeIndex[kind] = buildTypeIndex(dbRaw[kind], kind);
  }
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
  const types = [];
  const typeOf = (cat, name) => {
    const kind = TYPE_CATS.weapons.includes(cat) ? 'weapons' : TYPE_CATS.vehicles.includes(cat) ? 'vehicles' : null;
    if (!kind) return -1;
    const label = classify(name, typeIndex[kind], kind);
    if (!label) return -1;
    let i = types.findIndex((t) => t.name === label);
    if (i < 0) { types.push({ name: label, kind: kind === 'vehicles' ? VEH_KIND(label) : label }); i = types.length - 1; }
    return i;
  };
  const byCat = new Map();
  for (const [id, name, cat, x, y, photo] of raw.entries) {
    if (!/^[a-z0-9]+(-[a-z0-9]+)*-\d{3}$/.test(id) || !name) continue;
    if (!byCat.has(cat)) byCat.set(cat, []);
    const region = regionOf(x, y);
    // Eintrag: [Marker-ID, Name, Gebiet, Ort (-1 = keiner), Foto auf GTABase (1/0), Typ (-1 = keiner)]
    byCat.get(cat).push([id, name, region, placeOf(x, y, region), photo ? 1 : 0, typeOf(cat, name)]);
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
    regions: REGIONS.map(({ id, name }) => ({ id, name })), places: places.map((pl) => pl.name), types, categories,
  };
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'spots.json'), `${JSON.stringify(out)}\n`);
  console.log(`${total} Fundorte in ${categories.length} Kategorien geschrieben.`);
  for (const ids of Object.values(TYPE_CATS)) for (const id of ids) {
    const c = categories.find((x) => x.id === id);
    if (c) console.log(`  Typ erkannt: ${id} ${c.items.filter((it) => it[5] >= 0).length}/${c.items.length}`);
  }
})().catch((err) => { console.error(err); process.exit(1); });
