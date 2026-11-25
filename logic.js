// Reine Logik ohne DOM – testbar mit `node --test`.

export const URGENCY = { RED: 'rot', ORANGE: 'orange', NORMAL: 'normal' };

export function missionIndexById(missions, id) {
  return missions.findIndex((m) => m.id === id);
}

/** Index der nächsten (noch nicht abgeschlossenen) Mission; == missions.length, wenn alles fertig. */
export function nextIndex(missions, lastCompletedId) {
  if (!lastCompletedId) return 0;
  const i = missionIndexById(missions, lastCompletedId);
  return i < 0 ? 0 : i + 1;
}

/** Letzter Missionsindex, bis zu dem der Eintrag noch machbar ist (Verlust bei Start/Ende dieser Mission). */
export function deadlineIndex(item, missions) {
  if (!item.lostAt) return Infinity;
  const i = missionIndexById(missions, item.lostAt.mission);
  return i < 0 ? Infinity : i;
}

/** Eintrag ist frei, sobald availableFrom abgeschlossen ist (null = sofort). */
export function isAvailable(item, missions, next) {
  if (!item.availableFrom) return true;
  const i = missionIndexById(missions, item.availableFrom);
  return i >= 0 && i < next;
}

export function nextPonrIndex(missions, next) {
  for (let i = next; i < missions.length; i++) if (missions[i].pointOfNoReturn) return i;
  return -1;
}

export function itemStatus(item, state, missions) {
  if (state.doneItems[item.id]) return 'erledigt';
  if (state.missedItems[item.id]) return 'verpasst';
  const next = nextIndex(missions, state.lastCompletedMissionId);
  return deadlineIndex(item, missions) < next ? 'verpasst' : 'offen';
}

export function urgency(item, missions, next) {
  const d = deadlineIndex(item, missions);
  if (d === next) return URGENCY.RED;
  const ponr = nextPonrIndex(missions, next);
  if (ponr >= 0 && d <= ponr) return URGENCY.ORANGE;
  return URGENCY.NORMAL;
}

const URGENCY_RANK = { [URGENCY.RED]: 0, [URGENCY.ORANGE]: 1, [URGENCY.NORMAL]: 2 };
const IMPORTANCE_RANK = { kritisch: 0, wichtig: 1, 'nice-to-have': 2 };

export function sortOpen(items, missions, next) {
  return [...items].sort((a, b) => {
    const u = URGENCY_RANK[urgency(a, missions, next)] - URGENCY_RANK[urgency(b, missions, next)];
    if (u) return u;
    const da = deadlineIndex(a, missions);
    const db = deadlineIndex(b, missions);
    if (da !== db) return da - db;
    return IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance];
  });
}

/** Offene Einträge, die jetzt machbar sind. */
export function openNow(items, state, missions) {
  const next = nextIndex(missions, state.lastCompletedMissionId);
  const currentChapter = missions[Math.min(next, missions.length - 1)].chapter;
  // Einträge ohne Verlustpunkt aus früheren Kapiteln nicht mehr aufdrängen (bleiben unter „Einträge“).
  const stale = (i) => !i.lostAt && itemChapter(i, missions) < currentChapter;
  return sortOpen(
    items.filter((i) => itemStatus(i, state, missions) === 'offen' && isAvailable(i, missions, next) && !stale(i)),
    missions,
    next,
  );
}

/** Offene Einträge, die mit Abschluss der nächsten Mission verloren gehen. */
export function redItems(items, state, missions) {
  const next = nextIndex(missions, state.lastCompletedMissionId);
  return openNow(items, state, missions).filter((i) => urgency(i, missions, next) === URGENCY.RED);
}

/** Kapitel eines Eintrags: Kapitel der Verlust-Mission, sonst der Verfügbarkeit. */
export function itemChapter(item, missions) {
  if (item.lostAt) {
    const m = missions.find((x) => x.id === item.lostAt.mission);
    return m ? m.chapter : 0;
  }
  // Ohne Verlustpunkt: Kapitel der Mission, die nach der Freischaltung kommt.
  const i = missionIndexById(missions, item.availableFrom);
  const m = missions[i + 1] || missions[i];
  return m ? m.chapter : 0;
}

export function defaultState() {
  return {
    lastCompletedMissionId: null,
    doneItems: {},
    doneSide: {},
    missedItems: {},
    gtabaseUrls: {},
    settings: { spoilerProtection: true, helpSeen: false },
  };
}

/** Importierte/gespeicherte Daten prüfen und auf bekannte Felder reduzieren. */
export function sanitizeState(raw, missions) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const ids = new Set(missions.map((m) => m.id));
  const last = ids.has(raw.lastCompletedMissionId) ? raw.lastCompletedMissionId : null;
  const bools = (o) =>
    Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([, v]) => v === true));
  const urls = {};
  for (const [k, v] of Object.entries(raw.gtabaseUrls && typeof raw.gtabaseUrls === 'object' ? raw.gtabaseUrls : {})) {
    const safe = safeHttpsUrl(v);
    if (safe) urls[k] = safe;
  }
  return {
    lastCompletedMissionId: last,
    doneItems: bools(raw.doneItems),
    doneSide: bools(raw.doneSide),
    missedItems: bools(raw.missedItems),
    gtabaseUrls: urls,
    settings: { spoilerProtection: raw.settings?.spoilerProtection !== false, helpSeen: raw.settings?.helpSeen === true },
  };
}

/** Nur https-URLs zulassen (Schutz vor javascript:-Links aus Import/Eingabe). */
export function safeHttpsUrl(value) {
  if (typeof value !== 'string') return '';
  try {
    const u = new URL(value.trim());
    return u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}

export const MAP_URL = 'https://www.gtabase.com/de/gta-6/karte/';
const FEATURE_BASE = `${MAP_URL}?feature=`;

/** Karten-Ziel: eigener Link > hinterlegter Marker > passende Kategorie > allgemeine Karte. */
export function mapTarget(item, state) {
  const exact = safeHttpsUrl(state.gtabaseUrls[item.id]) || safeHttpsUrl(item.gtabaseUrl);
  if (exact) return { url: exact, kind: 'marker' };
  if (typeof item.mapFeature === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(item.mapFeature)) {
    return { url: FEATURE_BASE + item.mapFeature, kind: 'category' };
  }
  return { url: MAP_URL, kind: 'map' };
}

/* ---------- Geld vor Kapitelende ---------- */

export const FAMILY_SAVINGS_CAP = 5000;

const money = (v) => {
  if (String(v ?? '').trim().startsWith('-')) return 0;
  const n = Math.floor(Number(String(v ?? '').replace(/[^\d]/g, '')));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1e9) : 0;
};

/**
 * Plan für das Ende von Kapitel 1: Nur Family Savings (max. 5.000 $) überlebt.
 * Bargeld muss zuerst am ATM aufs Girokonto, von dort ins Family Savings.
 */
export function moneyPlan({ cash, checking, savings }) {
  const c = money(cash);
  const k = money(checking);
  const s = Math.min(money(savings), FAMILY_SAVINGS_CAP);
  const room = FAMILY_SAVINGS_CAP - s;
  const toSavings = Math.min(room, c + k);
  const depositCash = Math.max(0, toSavings - k); // so viel Bargeld muss erst an den ATM
  const spend = c + k - toSavings;
  return { toSavings, depositCash, spend, kept: s + toSavings, full: s + toSavings >= FAMILY_SAVINGS_CAP };
}

/* ---------- Trophäen / 100 % ---------- */

/** Zählt der Eintrag (sicher oder laut einem Teil der Quellen) für Trophäen bzw. 100 %? */
export function goalMatch(item, goal) {
  const v = goal === 'trophy' ? item.trophy : goal === 'completion' ? item.completion100 : null;
  if (goal === 'any') return goalMatch(item, 'trophy') || goalMatch(item, 'completion');
  return v === true || v === 'umstritten';
}

/* ---------- Fortschritt teilen (Link / QR) ---------- */

const MAP_PREFIX = 'https://www.gtabase.com/de/gta-6/karte/#';

function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Kompakter Text für Link/QR-Code. */
export function encodeShare(state) {
  const u = {};
  for (const [k, v] of Object.entries(state.gtabaseUrls)) u[k] = v.startsWith(MAP_PREFIX) ? `#${v.slice(MAP_PREFIX.length)}` : v;
  const data = {
    v: 1,
    m: state.lastCompletedMissionId,
    d: Object.keys(state.doneItems),
    n: Object.keys(state.doneSide || {}),
    x: Object.keys(state.missedItems),
    s: [state.settings.spoilerProtection ? 1 : 0, state.settings.helpSeen ? 1 : 0],
  };
  if (Object.keys(u).length) data.u = u;
  return b64urlEncode(JSON.stringify(data));
}

/** Gegenstück zu encodeShare; liefert einen geprüften Zustand oder wirft bei kaputten Daten. */
export function decodeShare(text, missions) {
  if (typeof text !== 'string' || text.length > 20000 || !/^[A-Za-z0-9_-]+$/.test(text)) throw new Error('Ungültiger Link');
  const d = JSON.parse(b64urlDecode(text));
  if (!d || d.v !== 1) throw new Error('Unbekanntes Format');
  const flags = (arr) => Object.fromEntries((Array.isArray(arr) ? arr : []).filter((k) => typeof k === 'string').map((k) => [k, true]));
  const urls = {};
  for (const [k, v] of Object.entries(d.u && typeof d.u === 'object' ? d.u : {})) {
    if (typeof v === 'string') urls[k] = v.startsWith('#') ? MAP_PREFIX + v.slice(1) : v;
  }
  return sanitizeState({
    lastCompletedMissionId: d.m,
    doneItems: flags(d.d),
    doneSide: flags(d.n),
    missedItems: flags(d.x),
    gtabaseUrls: urls,
    settings: { spoilerProtection: d.s?.[0] !== 0, helpSeen: d.s?.[1] === 1 },
  }, missions);
}

/* ---------- Nebenmissionen ---------- */

/** Kapitel einer Nebenmission: eigenes Kapitel, sonst Kapitel der Story-Mission, nach der sie kommt. */
export function sideChapter(sm, missions) {
  if (Number.isInteger(sm.chapter)) return sm.chapter;
  const m = missions.find((x) => x.id === sm.after);
  return m ? m.chapter : null;
}

/** Ist die Nebenmission schon freigeschaltet (Story-Mission davor gespielt)? */
export function sideUnlocked(sm, missions, next) {
  if (!sm.after) return true;
  const i = missionIndexById(missions, sm.after);
  return i < 0 || i < next;
}
