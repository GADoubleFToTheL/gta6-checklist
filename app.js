import {
  nextIndex, itemStatus, urgency, openNow, redItems, itemChapter,
  defaultState, sanitizeState, safeHttpsUrl, isAvailable,
} from './logic.js';

const STORAGE_KEY = 'gta6-checklist-v1';
const MAP_URL = 'https://www.gtabase.com/de/gta-6/karte/';
const CATEGORIES = ['Vorbereitung', 'Geld', 'Missable', 'Beziehung Lucia', 'Waffe', 'Kleidung', 'Sammelobjekt', 'Fahrzeug'];

let missions = [];
let items = [];
let chapters = {};
let state = defaultState();
let tab = 'now';
let filters = { chapter: '', category: '', status: '', q: '' };
const revealed = new Set(); // nur für diese Sitzung aufgedeckte Spoiler

/* ---------- Hilfsfunktionen ---------- */

/** Sicherer DOM-Builder: Text immer als textContent, nie als HTML. */
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

function loadState() {
  try {
    return sanitizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)), missions);
  } catch {
    return defaultState();
  }
}

function save(next) {
  state = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    toast('Speichern fehlgeschlagen (Speicher voll oder gesperrt).');
  }
  render();
}

function toast(msg) {
  alert(msg);
}

const nextIdx = () => nextIndex(missions, state.lastCompletedMissionId);
const status = (it) => itemStatus(it, state, missions);
const ponrBanner = (m) => m && m.pointOfNoReturn;

function setDone(id, done) {
  const doneItems = { ...state.doneItems };
  if (done) doneItems[id] = true; else delete doneItems[id];
  save({ ...state, doneItems });
}

function setMissed(id, missed) {
  const missedItems = { ...state.missedItems };
  if (missed) missedItems[id] = true; else delete missedItems[id];
  save({ ...state, missedItems });
}

function setProgress(missionId) {
  save({ ...state, lastCompletedMissionId: missionId });
}

/* ---------- Dialoge ---------- */

const dlg = () => document.getElementById('dlg');

function openDialog(...content) {
  const d = dlg();
  d.replaceChildren(...content);
  if (!d.open) d.showModal();
}
const closeDialog = () => dlg().close();

function confirmDialog(title, body, okLabel) {
  return new Promise((resolve) => {
    const d = dlg();
    const finish = (v) => { d.removeEventListener('close', onClose); if (d.open) d.close(); resolve(v); };
    const onClose = () => resolve(false);
    d.addEventListener('close', onClose, { once: true });
    openDialog(
      h('h1', {}, title), body,
      h('div', { class: 'actions' },
        h('button', { onclick: () => finish(false) }, 'Abbrechen'),
        h('button', { class: 'primary', onclick: () => { d.removeEventListener('close', onClose); d.close(); resolve(true); } }, okLabel)),
    );
  });
}

/* ---------- Bausteine ---------- */

function itemRow(it, { showUrgency = true } = {}) {
  const next = nextIdx();
  const st = status(it);
  const urg = st === 'offen' && showUrgency ? urgency(it, missions, next) : 'normal';
  const blurred = isFutureItem(it);
  const done = st === 'erledigt';
  return h('div', { class: `row card ${urg === 'normal' ? '' : urg} ${done ? 'done' : ''}`, role: 'button', tabindex: 0,
      onclick: () => showDetail(it.id),
      onkeydown: (e) => { if (e.key === 'Enter') showDetail(it.id); } },
    h('div', { class: 'check', role: 'checkbox', 'aria-checked': done, 'aria-label': 'Erledigt',
        onclick: (e) => { e.stopPropagation(); if (st === 'verpasst') return; setDone(it.id, !done); } }, done ? '✓' : ''),
    h('div', { class: 'body' },
      h('div', { class: `title ${blurred ? 'blur' : ''}` }, it.title),
      h('div', { class: 'meta' },
        urg === 'rot' && h('span', { class: 'tag rot' }, 'weg nach nächster Mission'),
        urg === 'orange' && h('span', { class: 'tag orange' }, 'weg vor Point of no Return'),
        it.confidence === 'umstritten' && h('span', { class: 'tag disp' }, 'umstritten'),
        it.category, ' · ', it.importance, st === 'verpasst' && ' · verpasst')));
}

function isFutureItem(it) {
  if (!state.settings.spoilerProtection || revealed.has(`i:${it.id}`)) return false;
  const cur = missions[Math.min(nextIdx(), missions.length - 1)];
  return itemChapter(it, missions) > cur.chapter;
}

/* ---------- Tab: Jetzt ---------- */

function viewNow() {
  const next = nextIdx();
  const root = h('div');
  if (next >= missions.length) {
    root.append(h('div', { class: 'card next' }, h('div', { class: 'name' }, 'Story abgeschlossen 🎉')));
    root.append(h('button', { class: 'block', onclick: () => setProgress(missions[missions.length - 2].id) }, 'Letzte Mission zurücksetzen'));
    return root;
  }
  const m = missions[next];
  root.append(h('div', { class: 'card next' },
    h('div', { class: 'label' }, `Nächste Mission · ${chapterLabel(m.chapter)}`),
    h('div', { class: 'name' }, m.name),
    h('div', { class: 'meta' }, m.character !== 'unbekannt' && `Charakter: ${m.character} · `, `Mission ${m.order} von ${missions.length}`),
    m.orderNote && h('div', { class: 'meta' }, `Hinweis: ${m.orderNote}`)));

  if (ponrBanner(m)) {
    root.append(h('div', { class: 'banner', role: 'alert' },
      h('h2', {}, '⚠ Point of no Return – nächste Mission'),
      h('p', {}, m.ponrNote),
      h('p', {}, h('strong', {}, 'Vorher: '), 'Manueller Save in eigenem Slot · 5.000 $ ins Family Savings · Restgeld ausgeben (Waffen bei Ammu-Nation, kein Tuning).')));
  } else if (missions[next + 1]?.pointOfNoReturn) {
    root.append(h('div', { class: 'banner soft' },
      h('h2', {}, 'Achtung: danach kommt der Point of no Return'),
      h('p', {}, 'Mach jetzt einen manuellen Save in einem eigenen Slot und erledige alles Wichtige.')));
  }

  const list = openNow(items, state, missions);
  const reds = redItems(items, state, missions);
  root.append(h('h2', {}, `Offen (${list.length})`));
  if (!list.length) root.append(h('p', { class: 'muted' }, 'Nichts offen. Gut.'));
  list.forEach((it) => root.append(itemRow(it)));

  const soon = items.filter((it) => status(it) === 'offen' && !isAvailable(it, missions, next)
    && itemChapter(it, missions) === m.chapter);
  if (soon.length) {
    root.append(h('h2', {}, 'Wird später in diesem Kapitel frei'));
    soon.forEach((it) => root.append(itemRow(it, { showUrgency: false })));
  }

  root.append(h('button', { class: 'primary block', style: 'margin-top:16px', onclick: () => completeMission(reds) }, 'Mission erledigt'));
  if (state.lastCompletedMissionId) {
    root.append(h('button', { class: 'block', style: 'margin-top:8px', onclick: undoMission }, 'Rückgängig (eine Mission zurück)'));
  }
  return root;
}

async function completeMission(reds) {
  if (reds.length) {
    const ok = await confirmDialog('Diese Dinge sind danach weg:',
      h('ul', {}, reds.map((it) => h('li', {}, it.title))), 'Trotzdem weiter');
    if (!ok) return;
  }
  const next = nextIdx();
  if (next < missions.length) setProgress(missions[next].id);
}

function undoMission() {
  const i = nextIdx() - 1;
  setProgress(i > 0 ? missions[i - 1].id : null);
}

const chapterLabel = (c) => (c === 0 ? 'Prolog' : `Kapitel ${c}`);

/* ---------- Tab: Missionen ---------- */

function viewMissions() {
  const next = nextIdx();
  const cur = missions[Math.min(next, missions.length - 1)];
  const root = h('div', {}, h('h1', {}, 'Missionen'),
    h('p', { class: 'muted small' }, 'Tippe eine Mission an, um sie als zuletzt abgeschlossen zu setzen.'));
  let lastChapter = -1;
  missions.forEach((m, i) => {
    if (m.chapter !== lastChapter) {
      lastChapter = m.chapter;
      const hidden = state.settings.spoilerProtection && m.chapter > cur.chapter && !revealed.has(`c:${m.chapter}`);
      root.append(h('h2', {}, chapterLabel(m.chapter), ' · ', h('span', { class: hidden ? 'blur' : '' }, chapters[m.chapter] || '')));
    }
    const isDone = i < next;
    const hidden = state.settings.spoilerProtection && i > next && !revealed.has(`m:${m.id}`);
    root.append(h('button', { class: `row card ${m.pointOfNoReturn ? 'rot' : ''} ${isDone ? 'done' : ''}`,
        style: i === next ? 'border-color:var(--accent)' : '',
        onclick: async () => {
          if (hidden) { revealed.add(`m:${m.id}`); render(); return; }
          if (await confirmDialog('Fortschritt setzen', h('p', {}, `„${m.name}“ als zuletzt abgeschlossen setzen?`), 'Setzen')) setProgress(m.id);
        } },
      h('div', { class: 'check' }, isDone ? '✓' : ''),
      h('div', { class: 'body' },
        h('div', { class: `title ${hidden ? 'blur' : ''}` }, m.name),
        h('div', { class: 'meta' }, `#${m.order}`, m.character !== 'unbekannt' && ` · ${m.character}`,
          m.pointOfNoReturn && ' · Point of no Return', i === next && ' · nächste'))));
  });
  root.append(h('button', { class: 'block', onclick: () => setProgress(null) }, 'Fortschritt auf Anfang'));
  return root;
}

/* ---------- Tab: Alle Einträge ---------- */

function viewItems() {
  const set = (k) => (e) => { filters = { ...filters, [k]: e.target.value }; renderKeepFocus(k); };
  const sel = (k, opts, label) => h('select', { 'aria-label': label, onchange: set(k) },
    h('option', { value: '' }, label), opts.map(([v, t]) => h('option', { value: v, selected: filters[k] === v }, t)));
  const root = h('div', {}, h('h1', {}, 'Alle Einträge'),
    h('div', { class: 'filters' },
      h('input', { type: 'search', id: 'q', placeholder: 'Suche …', value: filters.q, oninput: set('q') }),
      sel('chapter', [...new Set(missions.map((m) => m.chapter))].map((c) => [String(c), chapterLabel(c)]), 'Kapitel'),
      sel('category', CATEGORIES.map((c) => [c, c]), 'Kategorie'),
      sel('status', ['offen', 'erledigt', 'verpasst'].map((s) => [s, s]), 'Status')));
  const q = filters.q.trim().toLowerCase();
  const list = items.filter((it) =>
    (!filters.chapter || String(itemChapter(it, missions)) === filters.chapter)
    && (!filters.category || it.category === filters.category)
    && (!filters.status || status(it) === filters.status)
    && (!q || `${it.title} ${it.description} ${it.location}`.toLowerCase().includes(q)));
  if (!list.length) root.append(h('p', { class: 'muted' }, 'Keine Treffer.'));
  list.forEach((it) => root.append(itemRow(it)));
  return root;
}

function renderKeepFocus(key) {
  render();
  if (key === 'q') { const q = document.getElementById('q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
}

/* ---------- Detailansicht ---------- */

function showDetail(id) {
  const it = items.find((x) => x.id === id);
  if (!it) return;
  const st = status(it);
  const url = state.gtabaseUrls[id] || safeHttpsUrl(it.gtabaseUrl) || '';
  const lost = missions.find((m) => m.id === it.lostAt?.mission);
  const from = missions.find((m) => m.id === it.availableFrom);
  const input = h('input', { type: 'url', placeholder: 'GTABase-Teilen-Link einfügen (https://…)', value: state.gtabaseUrls[id] || '' });
  const flag = (v) => (v === true ? 'ja' : v === false ? 'nein' : 'umstritten');
  const hide = isFutureItem(it) ? 'blur' : '';
  openDialog(
    h('h1', { class: hide }, it.title),
    h('p', { class: 'meta' }, `${it.category} · ${it.importance} · Status: ${st}`),
    h('p', { class: hide }, it.description),
    h('p', {}, h('strong', {}, 'Ort: '), it.location || '–'),
    h('p', {}, h('strong', {}, 'Zeitfenster: '), from ? `ab Abschluss „${from.name}“` : 'sofort',
      lost ? `, bis ${it.lostAt.when === 'start' ? 'Start' : 'Ende'} „${lost.name}“` : ''),
    h('p', {}, h('strong', {}, 'Trophäe: '), flag(it.trophy), ' · ', h('strong', {}, '100 %: '), flag(it.completion100)),
    h('p', {}, h('strong', {}, 'Sicherheit: '), it.confidence, it.note && ` – ${it.note}`),
    h('p', { class: 'small' }, h('strong', {}, 'Quellen: '),
      it.sources.map((s) => { const u = safeHttpsUrl(s); return u ? h('div', {}, h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, new URL(u).hostname)) : null; })),
    h('a', { href: url || MAP_URL, target: '_blank', rel: 'noopener noreferrer' }, h('button', { class: 'block' }, 'Auf GTABase-Karte öffnen')),
    h('p', { class: 'meta' }, url ? 'Direktlink zum Marker' : 'Kein Marker-Link gespeichert – öffnet die Kartenseite.'),
    input,
    h('div', { class: 'actions' },
      h('button', { onclick: () => {
        const v = input.value.trim();
        const safe = safeHttpsUrl(v);
        if (v && !safe) { toast('Nur https-Links erlaubt.'); return; }
        const gtabaseUrls = { ...state.gtabaseUrls };
        if (safe) gtabaseUrls[id] = safe; else delete gtabaseUrls[id];
        closeDialog(); save({ ...state, gtabaseUrls });
      } }, 'Link speichern'),
      st !== 'verpasst' && h('button', { class: 'primary', onclick: () => { closeDialog(); setDone(id, st !== 'erledigt'); } }, st === 'erledigt' ? 'Rückgängig' : 'Erledigt'),
      h('button', { class: 'danger', onclick: () => { closeDialog(); setMissed(id, !state.missedItems[id]); } },
        state.missedItems[id] ? 'Nicht verpasst' : 'Als verpasst markieren'),
      h('button', { onclick: () => { revealed.add(`i:${id}`); closeDialog(); render(); } }, hide ? 'Spoiler zeigen' : 'Schließen')));
}

/* ---------- Einstellungen ---------- */

function viewSettings() {
  const fileInput = h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: importFile });
  return h('div', {}, h('h1', {}, 'Einstellungen'),
    h('label', { class: 'card row' },
      h('input', { type: 'checkbox', style: 'width:32px;min-height:32px;flex:none', checked: state.settings.spoilerProtection,
        onchange: (e) => save({ ...state, settings: { ...state.settings, spoilerProtection: e.target.checked } }) }),
      h('div', { class: 'body' }, h('div', { class: 'title' }, 'Spoiler-Schutz'),
        h('div', { class: 'meta' }, 'Künftige Missionen und Einträge aus späteren Kapiteln sind unscharf.'))),
    h('button', { class: 'block', onclick: exportJson }, 'Fortschritt exportieren (JSON)'),
    h('button', { class: 'block', style: 'margin-top:8px', onclick: () => fileInput.click() }, 'Fortschritt importieren'),
    fileInput,
    h('button', { class: 'block danger', style: 'margin-top:8px', onclick: resetAll }, 'Alles zurücksetzen'),
    h('p', { class: 'muted small', style: 'margin-top:20px' },
      'Privates Fan-Tool, nicht mit Rockstar verbunden. Kein Zugriff auf Spielstände – der Fortschritt ist, was du hier einträgst. Daten aus Guides, siehe Quellen je Eintrag.'));
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `gta6-fortschritt-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > 1_000_000) throw new Error('Datei zu groß');
    const raw = JSON.parse(await file.text());
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Ungültiges Format');
    if (await confirmDialog('Import', h('p', {}, 'Aktuellen Fortschritt durch die Datei ersetzen?'), 'Ersetzen')) save(sanitizeState(raw, missions));
  } catch (err) {
    toast(`Import fehlgeschlagen: ${err.message}`);
  }
  e.target.value = '';
}

async function resetAll() {
  if (await confirmDialog('Zurücksetzen', h('p', {}, 'Fortschritt, Haken und eigene Links werden gelöscht. Vorher exportieren?'), 'Alles löschen')) save(defaultState());
}

/* ---------- Rendering / Start ---------- */

function render() {
  const view = document.getElementById('view');
  const fn = { now: viewNow, missions: viewMissions, items: viewItems, settings: viewSettings }[tab];
  view.replaceChildren(fn());
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
}

async function init() {
  try {
    const [m, i, c] = await Promise.all(['missions', 'items', 'chapters'].map((n) => fetch(`data/${n}.json`).then((r) => {
      if (!r.ok) throw new Error(`${n}.json: ${r.status}`);
      return r.json();
    })));
    missions = m; items = i; chapters = c;
  } catch (err) {
    document.getElementById('view').replaceChildren(h('p', {}, `Daten konnten nicht geladen werden: ${err.message}`));
    return;
  }
  state = loadState();
  document.getElementById('tabs').addEventListener('click', (e) => {
    const t = e.target.closest('button')?.dataset.tab;
    if (t) { tab = t; window.scrollTo(0, 0); render(); }
  });
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
