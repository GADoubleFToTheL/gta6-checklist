import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  nextIndex, urgency, openNow, redItems, itemStatus, defaultState,
  sanitizeState, safeHttpsUrl, nextPonrIndex, missionIndexById, itemChapter, mapTarget,
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

test('Points of no Return: Tourist Trap, Checking Out, Sunset', () => {
  const ids = missions.filter((m) => m.pointOfNoReturn).map((m) => m.id);
  assert.deepEqual(ids, ['tourist-trap', 'checking-out', 'sunset']);
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
