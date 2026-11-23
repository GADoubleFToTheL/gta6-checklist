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
