import {
  nextIndex, itemStatus, urgency, openNow, redItems, itemChapter,
  defaultState, sanitizeState, safeHttpsUrl,
} from './logic.js';

const STORAGE_KEY = 'gta6-checklist-v1';
const MAP_URL = 'https://www.gtabase.com/de/gta-6/karte/';
const CATEGORIES = ['Vorbereitung', 'Geld', 'Missable', 'Beziehung Lucia', 'Waffe', 'Kleidung', 'Sammelobjekt', 'Fahrzeug'];

let missions = [];
let items = [];
let chapters = {};
let state = defaultState();
let tab = 'now';
let filters = { chapter: '', category: '', status: 'offen', q: '' };
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
  animateNext = true;
  save({ ...state, lastCompletedMissionId: missionId });
}

/* ---------- Dialoge ---------- */

const dlg = () => document.getElementById('dlg');

function openDialog(...content) {
  const d = dlg();
  d.replaceChildren(...content.filter(Boolean));
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

const HINTS = {
  rot: 'Geht nach der nächsten Mission verloren',
  orange: 'Geht vor dem Point of no Return verloren',
};

const chapterLabel = (c) => (c === 0 ? 'Prolog' : `Kapitel ${c}`);

function isFutureItem(it) {
  if (!state.settings.spoilerProtection || revealed.has(`i:${it.id}`)) return false;
  const cur = missions[Math.min(nextIdx(), missions.length - 1)];
  return itemChapter(it, missions) > cur.chapter;
}

function itemRow(it, showHint = true) {
  const st = status(it);
  const urg = st === 'offen' ? urgency(it, missions, nextIdx()) : 'normal';
  const done = st === 'erledigt';
  const hint = st === 'verpasst' ? 'Verpasst' : showHint ? HINTS[urg] : '';
  const unsure = it.confidence === 'umstritten';
  return h('div', { class: `row card ${urg === 'normal' ? '' : urg} ${done ? 'done' : ''}`, role: 'button', tabindex: 0,
      onclick: () => showDetail(it.id),
      onkeydown: (e) => { if (e.key === 'Enter') showDetail(it.id); } },
    h('div', { class: 'check', role: 'checkbox', 'aria-checked': done, 'aria-label': 'Erledigt',
        onclick: (e) => {
          e.stopPropagation();
          if (st === 'verpasst') return;
          if (!done) { const r = e.currentTarget.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2); }
          setDone(it.id, !done);
        } }, done ? '✓' : ''),
    h('div', { class: 'body' },
      h('div', { class: `title ${isFutureItem(it) ? 'blur' : ''}` }, it.title),
      (hint || unsure) && h('div', { class: 'meta' }, hint, hint && unsure && ' · ', unsure && 'Quellen unsicher')));
}

function section(title, rows) {
  return rows.length ? [h('h2', {}, title), ...rows.map((r) => itemRow(r, false))] : [];
}

/* ---------- Tab: Jetzt ---------- */

function viewNow() {
  const next = nextIdx();
  const root = h('div');
  if (next >= missions.length) {
    root.append(h('section', { class: 'hero' }, h('div', { class: 'name' }, 'Story abgeschlossen 🎉')));
    root.append(h('button', { class: 'block', onclick: undoMission }, 'Eine Mission zurück'));
    return root;
  }
  const m = missions[next];
  const pct = Math.round((next / missions.length) * 100);
  const list = openNow(items, state, missions);
  const reds = redItems(items, state, missions);

  root.append(h('section', { class: 'hero' },
    h('div', { class: 'label' }, 'Nächste Mission'),
    h('div', { class: 'name' }, m.name),
    h('div', { class: 'meta' }, `${chapterLabel(m.chapter)} · Mission ${m.order} von ${missions.length}`),
    h('div', { class: 'bar', role: 'img', 'aria-label': `${pct} Prozent geschafft` }, h('i', { style: `width:${pct}%` })),
    m.orderNote && h('div', { class: 'meta' }, `ℹ ${m.orderNote}`),
    h('button', { class: 'primary block', onclick: () => completeMission(reds) }, 'Mission erledigt ✓')));

  if (m.pointOfNoReturn) {
    root.append(h('div', { class: 'banner', role: 'alert' },
      h('h2', {}, '⚠ Danach gibt es kein Zurück'),
      h('p', {}, 'Erledige die Einträge unten und speichere in einem eigenen Slot.'),
      h('details', {}, h('summary', {}, 'Was geht verloren?'), h('p', {}, m.ponrNote))));
  } else if (missions[next + 1]?.pointOfNoReturn) {
    root.append(h('div', { class: 'banner soft' },
      h('h2', {}, 'Danach kommt ein Point of no Return'),
      h('p', {}, 'Jetzt in einem eigenen Slot speichern und alles Wichtige erledigen.')));
  }

  const of = (u) => list.filter((it) => urgency(it, missions, next) === u);
  const rest = of('normal');
  root.append(...section('Jetzt erledigen', of('rot')), ...section('Bald erledigen', of('orange')));
  if (rest.length) {
    root.append(h('details', { class: 'more' }, h('summary', {}, `Weitere Einträge (${rest.length})`), rest.map((r) => itemRow(r, false))));
  }
  if (!list.length) root.append(h('p', { class: 'muted' }, 'Nichts offen. Du kannst weiterspielen.'));

  if (state.lastCompletedMissionId) {
    root.append(h('button', { class: 'link', onclick: undoMission }, 'Letzte Mission rückgängig machen'));
  }
  return root;
}

async function completeMission(reds) {
  if (reds.length) {
    const ok = await confirmDialog('Das ist danach weg:',
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

/* ---------- Tab: Missionen ---------- */

function viewMissions() {
  const next = nextIdx();
  const cur = missions[Math.min(next, missions.length - 1)];
  const root = h('div', {}, h('h1', {}, 'Missionen'),
    h('p', { class: 'muted small' }, 'Tippe eine Mission an, um sie als zuletzt abgeschlossen zu setzen.'));
  const byChapter = new Map();
  missions.forEach((m, i) => byChapter.set(m.chapter, [...(byChapter.get(m.chapter) || []), [m, i]]));
  for (const [chapter, entries] of byChapter) {
    const future = state.settings.spoilerProtection && chapter > cur.chapter;
    root.append(h('details', { class: 'chap', open: chapter === cur.chapter },
      h('summary', {}, chapterLabel(chapter), future || chapter === 0 ? '' : ` · ${chapters[chapter] || ''}`),
      entries.map(([m, i]) => missionRow(m, i, next))));
  }
  root.append(h('button', { class: 'link', onclick: () => setProgress(null) }, 'Fortschritt auf Anfang setzen'));
  return root;
}

function missionRow(m, i, next) {
  const isDone = i < next;
  const hidden = state.settings.spoilerProtection && i > next && !revealed.has(`m:${m.id}`);
  return h('button', { class: `row card ${m.pointOfNoReturn ? 'rot' : ''} ${isDone ? 'done' : ''} ${i === next ? 'current' : ''}`,
      onclick: async () => {
        if (hidden) { revealed.add(`m:${m.id}`); render(); return; }
        if (await confirmDialog('Fortschritt setzen', h('p', {}, `„${m.name}“ als zuletzt abgeschlossen setzen?`), 'Setzen')) setProgress(m.id);
      } },
    h('div', { class: 'check' }, isDone ? '✓' : ''),
    h('div', { class: 'body' },
      h('div', { class: `title ${hidden ? 'blur' : ''}` }, m.name),
      (i === next || m.pointOfNoReturn) && h('div', { class: 'meta' }, i === next && 'Als Nächstes', i === next && m.pointOfNoReturn && ' · ', m.pointOfNoReturn && '⚠ Point of no Return')));
}

/* ---------- Tab: Alle Einträge ---------- */

const STATUS_CHIPS = [['offen', 'Offen'], ['erledigt', 'Erledigt'], ['verpasst', 'Verpasst'], ['', 'Alle']];

function viewItems() {
  const set = (k) => (e) => { filters = { ...filters, [k]: e.target.value }; renderKeepFocus(k); };
  const sel = (k, opts, label) => h('select', { 'aria-label': label, onchange: set(k) },
    h('option', { value: '' }, label), opts.map(([v, t]) => h('option', { value: v, selected: filters[k] === v }, t)));
  const root = h('div', {}, h('h1', {}, 'Alle Einträge'),
    h('input', { type: 'search', id: 'q', placeholder: 'Suchen …', value: filters.q, oninput: set('q') }),
    h('div', { class: 'chips' }, STATUS_CHIPS.map(([v, t]) =>
      h('button', { class: `chip ${filters.status === v ? 'active' : ''}`, onclick: () => { filters = { ...filters, status: v }; render(); } }, t))),
    h('details', { class: 'more' }, h('summary', {}, 'Mehr Filter'),
      h('div', { class: 'filters' },
        sel('chapter', [...new Set(missions.map((m) => m.chapter))].map((c) => [String(c), chapterLabel(c)]), 'Kapitel'),
        sel('category', CATEGORIES.map((c) => [c, c]), 'Kategorie'))));
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

const yesNo = (v) => (v === true ? 'ja' : v === false ? 'nein' : 'unklar');

function whenText(it) {
  const lost = missions.find((m) => m.id === it.lostAt?.mission);
  const from = missions.find((m) => m.id === it.availableFrom);
  const parts = [];
  if (from) parts.push(`Verfügbar ab: nach „${from.name}“`);
  parts.push(lost
    ? `Geht verloren: ${it.lostAt.when === 'start' ? `sobald „${lost.name}“ startet` : `nach „${lost.name}“`}`
    : 'Geht verloren: Zeitpunkt nicht bekannt');
  return parts;
}

function showDetail(id) {
  const it = items.find((x) => x.id === id);
  if (!it) return;
  const st = status(it);
  const url = state.gtabaseUrls[id] || safeHttpsUrl(it.gtabaseUrl) || '';
  const input = h('input', { type: 'url', placeholder: 'GTABase-Teilen-Link einfügen (https://…)', value: state.gtabaseUrls[id] || '' });
  const hide = isFutureItem(it) ? 'blur' : '';
  openDialog(
    h('h1', { class: hide }, it.title),
    h('p', { class: hide }, it.description),
    h('div', { class: 'when' }, whenText(it).map((t) => h('div', {}, t))),
    it.confidence === 'umstritten' && h('div', { class: 'unsure' }, h('strong', {}, 'Unsicher: '), it.note || 'Die Quellen widersprechen sich.'),
    h('div', { class: 'actions' },
      st !== 'verpasst' && h('button', { class: 'primary', onclick: () => { closeDialog(); setDone(id, st !== 'erledigt'); } }, st === 'erledigt' ? 'Doch nicht erledigt' : 'Erledigt ✓'),
      h('button', { onclick: () => { if (hide) revealed.add(`i:${id}`); closeDialog(); render(); } }, hide ? 'Spoiler zeigen' : 'Schließen')),
    h('details', { class: 'more' }, h('summary', {}, 'Mehr Infos'),
      h('p', {}, h('strong', {}, 'Ort: '), it.location || '–'),
      h('p', {}, h('strong', {}, 'Kategorie: '), it.category, ' · ', it.importance),
      h('p', {}, h('strong', {}, 'Trophäe: '), yesNo(it.trophy), ' · ', h('strong', {}, '100 %: '), yesNo(it.completion100)),
      it.confidence !== 'umstritten' && it.note && h('p', {}, h('strong', {}, 'Hinweis: '), it.note),
      h('p', { class: 'small' }, h('strong', {}, 'Quellen: '),
        it.sources.map((s) => { const u = safeHttpsUrl(s); return u ? h('div', {}, h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, new URL(u).hostname)) : null; })),
      h('a', { href: url || MAP_URL, target: '_blank', rel: 'noopener noreferrer' }, h('button', { class: 'block' }, 'Auf GTABase-Karte öffnen')),
      h('p', { class: 'meta' }, url ? 'Direktlink zum Marker gespeichert.' : 'Kein Marker-Link – öffnet die Kartenseite.'),
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
        h('button', { class: 'danger', onclick: () => { closeDialog(); setMissed(id, !state.missedItems[id]); } },
          state.missedItems[id] ? 'Nicht verpasst' : 'Als verpasst markieren'))));
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

let animateNext = true; // Einblend-Animation nur bei Tabwechsel/Start, nicht bei jedem Haken

const BURST_COLORS = ['#ff2e93', '#ff8a3d', '#ffd23f', '#00e0d0', '#9b5cff'];
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Kleines Partikel-Feuerwerk beim Abhaken. */
function burst(x, y) {
  if (reducedMotion()) return;
  for (let i = 0; i < 14; i++) {
    const a = (Math.PI * 2 * i) / 14 + Math.random() * 0.4;
    const d = 40 + Math.random() * 40;
    const p = h('i', { class: 'spark', style: `left:${x}px;top:${y}px;background:${BURST_COLORS[i % BURST_COLORS.length]};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px` });
    document.body.append(p);
    p.addEventListener('animationend', () => p.remove());
  }
}

function render() {
  const view = document.getElementById('view');
  const fn = { now: viewNow, missions: viewMissions, items: viewItems, settings: viewSettings }[tab];
  view.replaceChildren(fn());
  view.classList.toggle('enter', animateNext);
  if (animateNext) {
    view.querySelectorAll('.hero, .card, .banner, h2, details, .chips').forEach((el, i) => el.style.setProperty('--i', Math.min(i, 16)));
    animateNext = false;
  }
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
    if (t) { tab = t; animateNext = true; window.scrollTo(0, 0); render(); }
  });
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
