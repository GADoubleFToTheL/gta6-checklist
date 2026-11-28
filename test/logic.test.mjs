import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  nextIndex, urgency, openNow, redItems, itemStatus, defaultState,
  sanitizeState, safeHttpsUrl, nextPonrIndex, missionIndexById, itemChapter, mapTarget,
  moneyPlan, goalMatch, encodeShare, decodeShare, encodeFound, decodeFound, spotFlags, spotLink,
} from '../logic.js';

const missions = JSON.parse(readFileSync(new URL('../data/missions.json', import.meta.url)));
const items = JSON.parse(readFileSync(new URL('../data/items.json', import.meta.url)));
const stateAt = (id, extra = {}) => ({ ...defaultState(), lastCompletedMissionId: id, ...extra });

test('Daten: Missions-IDs eindeutig, Reihenfolge lückenlos', () => {
  assert.equal(new Set(missions.map((m) => m.id)).size, missions.length);
  missions.forEach((m, i) => assert.equal(m.order, i + 1));
});

test('Daten: alle Item-Referenzen zeigen auf bekannte Missionen', () => {
  for (const it of items) {
    if (it.availableFrom) assert.ok(missionIndexById(missions, it.availableFrom) >= 0, it.id);
    if (it.lostAt) assert.ok(missionIndexById(missions, it.lostAt.mission) >= 0, it.id);
  }
});

test('Daten: Item-IDs eindeutig, Quellen gültige https-URLs', () => {
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
  for (const it of items) for (const s of it.sources) assert.ok(safeHttpsUrl(s), `${it.id}: ${s}`);
});

test('Points of no Return: Tourist Trap, Checking Out, Sunset, Unfinished Business', () => {
  const ids = missions.filter((m) => m.pointOfNoReturn).map((m) => m.id);
  assert.deepEqual(ids, ['tourist-trap', 'checking-out', 'sunset', 'unfinished-business']);
});

test('Eintrag ohne Verlustpunkt: Kapitel folgt der Freischaltung, alte erscheinen nicht mehr in „Jetzt“', () => {
  const race = items.find((i) => i.id === 'race-against-yago');
  assert.equal(itemChapter(race, missions), 3);
  const cigars = items.find((i) => i.id === 'macizo-cigars');
  assert.ok(openNow(items, stateAt('pipework'), missions).some((i) => i.id === cigars.id));
  assert.ok(!openNow(items, stateAt('ambulance-chaser'), missions).some((i) => i.id === cigars.id));
});

test('Eintrag ohne Verlustpunkt bleibt offen und ist nie rot', () => {
  const it = items.find((i) => i.lostAt === null);
  assert.ok(it);
  assert.equal(itemStatus(it, stateAt('sunset'), missions), 'offen');
  assert.equal(urgency(it, missions, nextIndex(missions, 'prologue')), 'normal');
});

test('nextIndex: ohne Fortschritt 0, sonst Folgemission', () => {
  assert.equal(nextIndex(missions, null), 0);
  assert.equal(nextIndex(missions, 'prologue'), 1);
});

test('Tourist Trap ist der erste Point of no Return', () => {
  const next = nextIndex(missions, 'prologue');
  assert.equal(missions[nextPonrIndex(missions, next)].id, 'tourist-trap');
});

test('rot: Eintrag, der mit der nächsten Mission verschwindet', () => {
  const s = stateAt('feng-shui'); // nächste = Coming Home
  const red = redItems(items, s, missions).map((i) => i.id);
  assert.ok(red.includes('lucia-necklace'));
  assert.ok(red.includes('house-repairs'));
});

test('orange: verschwindet bis zum nächsten PoNR', () => {
  const next = nextIndex(missions, 'prologue');
  const rum = items.find((i) => i.id === 'shirleys-rum');
  assert.equal(urgency(rum, missions, next), 'orange');
});

test('noch nicht verfügbare Einträge fehlen in openNow', () => {
  const ids = openNow(items, stateAt('prologue'), missions).map((i) => i.id);
  assert.ok(!ids.includes('meditation-lucia'));
  assert.ok(ids.includes('manual-save'));
});

test('abgehakte Einträge verschwinden aus openNow, Status erledigt', () => {
  const s = stateAt('prologue', { doneItems: { 'manual-save': true } });
  assert.ok(!openNow(items, s, missions).some((i) => i.id === 'manual-save'));
  assert.equal(itemStatus(items.find((i) => i.id === 'manual-save'), s, missions), 'erledigt');
});

test('nach dem Verlustpunkt ist ein offener Eintrag verpasst (nicht gelöscht)', () => {
  const it = items.find((i) => i.id === 'lucia-necklace');
  assert.equal(itemStatus(it, stateAt('coming-home'), missions), 'verpasst');
  assert.equal(itemStatus(it, stateAt('feng-shui'), missions), 'offen');
});

test('Rücksprung im Fortschritt stellt verpasste Einträge wieder her', () => {
  const it = items.find((i) => i.id === 'lucia-necklace');
  assert.equal(itemStatus(it, stateAt('hey-arnold'), missions), 'offen');
});

test('safeHttpsUrl blockt javascript: und http:', () => {
  assert.equal(safeHttpsUrl('javascript:alert(1)'), '');
  assert.equal(safeHttpsUrl('http://x.de'), '');
  assert.ok(safeHttpsUrl('https://www.gtabase.com/x'));
});

test('sanitizeState verwirft Müll und unbekannte Missionen', () => {
  const s = sanitizeState(
    { lastCompletedMissionId: 'nope', doneItems: { a: true, b: 'x' }, gtabaseUrls: { a: 'javascript:1', b: 'https://e.de/' } },
    missions,
  );
  assert.equal(s.lastCompletedMissionId, null);
  assert.deepEqual(s.doneItems, { a: true });
  assert.deepEqual(Object.keys(s.gtabaseUrls), ['b']);
  assert.equal(sanitizeState(null, missions).settings.spoilerProtection, true);
});

test('mapTarget: eigener Link > Marker > Kategorie > Karte', () => {
  assert.equal(mapTarget({ id: 'x' }, defaultState()).kind, 'map');
  assert.equal(mapTarget({ id: 'x', mapFeature: 'gym' }, defaultState()).url, 'https://www.gtabase.com/de/gta-6/karte/?feature=gym');
  assert.equal(mapTarget({ id: 'x', mapFeature: 'a/../b' }, defaultState()).kind, 'map');
  assert.equal(mapTarget({ id: 'x', gtabaseUrl: 'javascript:alert(1)' }, defaultState()).kind, 'map');
  const own = { ...defaultState(), gtabaseUrls: { x: 'https://www.gtabase.com/de/gta-6/karte/#pool-005' } };
  assert.equal(mapTarget({ id: 'x', gtabaseUrl: 'https://www.gtabase.com/de/gta-6/karte/#gym-001' }, own).url, own.gtabaseUrls.x);
});

test('Hinterlegte Karten-Links zeigen auf einen GTABase-Marker', () => {
  for (const it of items) {
    if (it.gtabaseUrl) assert.match(it.gtabaseUrl, /^https:\/\/www\.gtabase\.com\/de\/gta-6\/karte\/#[a-z0-9-]+$/, it.id);
    if (it.mapFeature) assert.equal(mapTarget(it, defaultState()).kind, it.gtabaseUrl ? 'marker' : 'category', it.id);
  }
});

test('moneyPlan: füllt Family Savings bis 5.000 $, Rest ausgeben', () => {
  assert.deepEqual(moneyPlan({ cash: '3.000', checking: 1000, savings: 0 }),
    { toSavings: 4000, depositCash: 3000, spend: 0, kept: 4000, full: false });
  const p = moneyPlan({ cash: 8000, checking: 2000, savings: 1000 });
  assert.equal(p.toSavings, 4000); assert.equal(p.depositCash, 2000); assert.equal(p.spend, 6000); assert.ok(p.full);
  assert.equal(moneyPlan({ cash: 500, checking: 0, savings: 5000 }).spend, 500);
  assert.equal(moneyPlan({ cash: 'abc', checking: -5, savings: '' }).toSavings, 0);
});

test('goalMatch: Trophäe/100 % inkl. umstrittener Einträge', () => {
  assert.ok(goalMatch({ trophy: 'umstritten', completion100: false }, 'trophy'));
  assert.ok(!goalMatch({ trophy: false, completion100: false }, 'any'));
  assert.ok(goalMatch({ trophy: false, completion100: true }, 'any'));
  assert.ok(items.some((i) => goalMatch(i, 'trophy')));
});

test('Teilen: encode/decode ergibt denselben Zustand, Müll wird abgelehnt', () => {
  const s = { ...stateAt('feng-shui'), doneItems: { 'lucia-necklace': true }, missedItems: { 'prologue-jetski': true },
    gtabaseUrls: { a: 'https://www.gtabase.com/de/gta-6/karte/#pool-005', b: 'https://example.com/x' },
    settings: { spoilerProtection: false, helpSeen: true } };
  const code = encodeShare(s);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeShare(code, missions), s);
  assert.throws(() => decodeShare('<script>', missions));
  const evil = Buffer.from(JSON.stringify({ v: 1, m: 'nope', d: [1, 'x'], u: { a: 'javascript:alert(1)' } })).toString('base64url');
  const r = decodeShare(evil, missions);
  assert.equal(r.lastCompletedMissionId, null); assert.deepEqual(r.gtabaseUrls, {}); assert.deepEqual(r.doneItems, { x: true });
});

test('index.html: Kulisse, Logo und vier Reiter vorhanden', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="scene"/);
  assert.match(html, /icons\/logo\.svg/);
  for (const t of ['now', 'story', 'side', 'spots', 'more']) assert.match(html, new RegExp(`data-tab="${t}"`));
  const art = readFileSync(new URL('../art.js', import.meta.url), 'utf8');
  for (const loc of ['keys', 'gellhorn', 'vice']) assert.match(art, new RegExp(`loc === '${loc}'`));
  assert.match(art, /class: animated \? `sway/);
});

test('Jede Mission und Nebenmission hat ein Bild-Motiv und eine Beschreibung', async () => {
  const { MOTIFS, LOCATIONS } = await import('../art.js');
  const side = JSON.parse(readFileSync(new URL('../data/sidemissions.json', import.meta.url)));
  for (const x of [...missions, ...side]) {
    assert.ok(x.art && MOTIFS.includes(x.art.motif) && LOCATIONS.includes(x.art.loc), `${x.id}: ${JSON.stringify(x.art)}`);
  }
  for (const m of missions) assert.ok(m.desc && m.desc.length > 10, m.id);
});

test('Missionen: jede hat einen deutschen Titel', () => {
  for (const m of missions) assert.ok(typeof m.nameDe === 'string' && m.nameDe.trim(), m.id);
  assert.equal(missions.find((m) => m.id === 'girls-trip').nameDe, 'Mädelsausflug');
});

test('Nebenmissionen: IDs eindeutig, Verweise gültig, nur https-Links', () => {
  const side = JSON.parse(readFileSync(new URL('../data/sidemissions.json', import.meta.url)));
  assert.ok(side.length > 30);
  assert.ok(!side.some((x) => x.kind === 'step'), 'Story-Aufgaben gehören in missions.json');
  assert.equal(new Set(side.map((x) => x.id)).size, side.length);
  for (const x of side) {
    assert.ok(['optional', 'stranger'].includes(x.kind), x.id);
    assert.ok(x.nameDe && x.name, x.id);
    if (x.after) assert.ok(missionIndexById(missions, x.after) >= 0, `${x.id}: ${x.after}`);
    assert.ok(safeHttpsUrl(x.url), x.id);
  }
});

test('Story-Reihenfolge folgt GTABase: Schritte zwischen den Missionen, Kapitel nie rückwärts', () => {
  const i = (id) => missionIndexById(missions, id);
  assert.ok(i('girls-trip') < i('painkiller-supplier') && i('painkiller-supplier') < i('daily-driver'));
  assert.ok(missions.find((m) => m.id === 'painkiller-supplier').step);
  for (let k = 1; k < missions.length; k++) assert.ok(missions[k].chapter >= missions[k - 1].chapter, missions[k].id);
});

test('Jede Aufgabe ist vor ihrem Verlust freigeschaltet', () => {
  for (const it of items) {
    if (!it.availableFrom || !it.lostAt) continue;
    assert.ok(missionIndexById(missions, it.availableFrom) + 1 <= missionIndexById(missions, it.lostAt.mission), it.id);
  }
});

test('Fundorte: Daten gültig, IDs eindeutig, Links auf GTABase-Marker', () => {
  const spots = JSON.parse(readFileSync(new URL('../data/spots.json', import.meta.url)));
  assert.ok(spots.total > 1000 && spots.categories.length > 50);
  const ids = spots.categories.flatMap((c) => c.items.map(([id]) => id));
  assert.equal(ids.length, spots.total);
  assert.equal(new Set(ids).size, ids.length);
  const groups = new Set(spots.groups.map((g) => g.id));
  for (const c of spots.categories) {
    assert.ok(groups.has(c.group), c.id);
    for (const [id, name, region, place, photo] of c.items) {
      assert.match(spotLink(id), /^https:\/\/www\.gtabase\.com\/de\/gta-6\/karte\/#[a-z0-9-]+-\d{3}$/, id);
      assert.ok(name, id);
      assert.ok(Number.isInteger(region) && region >= 0 && region < spots.regions.length, `${id} Gebiet`);
      assert.ok(Number.isInteger(place) && place >= -1 && place < spots.places.length, `${id} Ort`);
      assert.ok(photo === 0 || photo === 1, `${id} Foto`);
    }
  }
  assert.ok(spots.categories.find((c) => c.id === 'unique-weapon' && c.group === 'secrets'));
  assert.deepEqual(spots.regions.map((r) => r.id), ['vice', 'keys', 'grassrivers', 'gellhorn', 'leonida', 'kalaga']);
  const shirley = spots.categories.flatMap((c) => c.items).find((it) => it[1] === 'Shirley, the Neighbor');
  assert.equal(spots.regions[shirley[2]].id, 'keys');
});

test('Fundorte: gefunden-Liste übersteht Link/QR und Import, Müll wird verworfen', () => {
  const found = { 'unique-weapon-039': true, 'unique-weapon-001': true, 'hidden-package-124': true, 'easter-egg-000': true };
  assert.deepEqual(decodeFound(encodeFound(found)), found);
  assert.deepEqual(spotFlags({ 'unique-weapon-039': true, 'javascript:x': true, 'a-1': true, 'b-002': 'yes' }), { 'unique-weapon-039': true });
  const s = { ...stateAt('girls-trip'), found };
  assert.deepEqual(decodeShare(encodeShare(s), missions).found, found);
  assert.deepEqual(decodeFound({ '../x': 'AAAA', ok: 12 }), {});
});
