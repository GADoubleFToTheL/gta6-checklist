import {
  nextIndex, itemStatus, urgency, openNow, redItems, itemChapter, missionIndexById,
  defaultState, sanitizeState, safeHttpsUrl, mapTarget, spotLink, spotCategoryLink,
  moneyPlan, goalMatch, encodeShare, decodeShare, FAMILY_SAVINGS_CAP, sideChapter, sideUnlocked,
} from './logic.js';
import { icon } from './icons.js';
import { scene, sceneFor, missionArt, SCENE_NAMES } from './art.js';

const STORAGE_KEY = 'gta6-checklist-v1';
const CATEGORIES = ['Vorbereitung', 'Geld', 'Missable', 'Beziehung Lucia', 'Waffe', 'Kleidung', 'Sammelobjekt', 'Fahrzeug'];

let missions = [];
let items = [];
let sideMissions = [];
let chapters = {};
let state = defaultState();
let tab = 'now';
let sub = null; // Unterseite im Reiter „Mehr“
let storyQuery = '';
let sideQuery = '';
let sideFilter = 'all';
let itemFilters = { q: '', status: 'offen', chapter: '', category: '' };
let moneyInputs = { cash: '', checking: '', savings: '' };
let showLater = false;
// Fundorte (GTABase-Marker), werden erst beim Öffnen des Reiters geladen
let spots = null;
let spotsLoading = null;
let spotIndex = [];
let spotGroup = 'all';
let spotQuery = '';
let spotCat = null;
let spotCatQuery = '';
let spotCatFilter = 'all';
let spotLimit = 150;
const openChapters = new Set();
const revealed = new Set(); // nur für diese Sitzung aufgedeckte Spoiler

/* ---------- Hilfsfunktionen ---------- */

/** Sicherer DOM-Builder: Text immer als Textknoten, nie als HTML. */
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const chapterLabel = (c) => (c === 0 ? 'Prolog' : `Kapitel ${c}`);
const chapterName = (c) => chapters[c] || '';
/** „Kapitel 2 · Paradise Lost“ – ohne doppeltes „Prolog · Prolog“. */
const chapterLine = (c) => [...new Set([chapterLabel(c), chapterName(c)].filter(Boolean))].join(' · ');
const mName = (m) => m.nameDe || m.name;
const mAlt = (m) => (m.nameDe && m.nameDe !== m.name ? m.name : '');
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const fmt = (n) => `${n.toLocaleString('de-DE')} $`;
const nextIdx = () => nextIndex(missions, state.lastCompletedMissionId);
/** Story-Fortschritt in Prozent (gespielte Story-Einträge). */
const storyPercent = () => Math.round((Math.min(nextIdx(), missions.length) / missions.length) * 100);
function progressBar(label) {
  const pct = storyPercent();
  return h('div', { class: 'story-progress', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Story-Fortschritt' },
    h('div', { class: 'track' }, h('i', { style: `width:${pct}%` })),
    h('span', { class: 'pct' }, `${pct} %`, label && h('span', { class: 'lbl' }, ` ${label}`)));
}
const curMission = () => missions[Math.min(nextIdx(), missions.length - 1)];
const curChapter = () => curMission().chapter;
const status = (it) => itemStatus(it, state, missions);
const spoiler = () => state.settings.spoilerProtection;
const missionById = (id) => missions.find((m) => m.id === id);
const sideDone = (x) => !!(state.doneSide[x.id] || (x.item && state.doneItems[x.item]));
/** Verpasst: verknüpfte Aufgabe ist verpasst (z. B. Kapitel vorbei). */
const sideMissed = (x) => !sideDone(x) && !!x.item && (() => { const it = items.find((i) => i.id === x.item); return it ? status(it) === 'verpasst' : false; })();
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function art(m, title = '') {
  const a = m.art || { loc: sceneFor(m.chapter ?? 1), motif: 'pin' };
  return missionArt(a, { seed: m.id, title });
}

/* ---------- Vorschaubilder ----------
   Jede Illustration wird einmal als SVG gezeichnet, in ein kleines PNG umgerechnet und im Browser-Cache
   abgelegt. Listen zeigen dann nur noch leichte <img>-Elemente – schnell auch auf älteren Handys. */

const THUMB_STORE = 'gta6-thumbs-v1';
const THUMB_W = 228; const THUMB_H = 128;
const thumbUrl = new Map(); // id -> Object-URL des PNG
const thumbJobs = new Map(); // id -> Promise
const thumbSource = new Map();
let thumbObserver = null;
let thumbChain = Promise.resolve();

const thumbKey = (m) => {
  const a = m.art || {};
  return new Request(`${location.origin}${location.pathname.replace(/[^/]*$/, '')}__thumb/${encodeURIComponent(m.id)}/${a.loc}-${a.motif}-${a.time}.png`);
};

async function renderThumbPng(m) {
  const svg = art(m);
  svg.setAttribute('width', '320');
  svg.setAttribute('height', '180');
  const svgUrl = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = svgUrl;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = THUMB_W; c.height = THUMB_H;
    c.getContext('2d').drawImage(img, 0, 0, THUMB_W, THUMB_H);
    return await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

/** PNG-Vorschau holen: aus dem Cache oder neu erzeugen (nacheinander, damit die Oberfläche flüssig bleibt). */
function getThumb(m) {
  if (thumbUrl.has(m.id)) return Promise.resolve(thumbUrl.get(m.id));
  if (thumbJobs.has(m.id)) return thumbJobs.get(m.id);
  const job = (thumbChain = thumbChain.then(async () => {
    let blob = null;
    const store = 'caches' in window ? await caches.open(THUMB_STORE).catch(() => null) : null;
    const hit = store && await store.match(thumbKey(m)).catch(() => null);
    if (hit) blob = await hit.blob();
    else {
      await new Promise((r) => setTimeout(r, 0));
      blob = await renderThumbPng(m);
      store?.put(thumbKey(m), new Response(blob, { headers: { 'content-type': 'image/png' } })).catch(() => {});
    }
    const url = URL.createObjectURL(blob);
    thumbUrl.set(m.id, url);
    return url;
  }).catch(() => null));
  thumbJobs.set(m.id, job);
  return job;
}

function thumbImg(m) {
  thumbSource.set(m.id, m);
  const url = thumbUrl.get(m.id);
  const img = h('img', { alt: '', decoding: 'async', draggable: 'false', 'data-thumb': m.id, src: url || null });
  if (url) return img;
  const fill = () => getThumb(m).then((u) => { if (u) { img.src = u; img.classList.add('in'); } });
  if (!('IntersectionObserver' in window)) { fill(); return img; }
  thumbObserver ||= new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      thumbObserver.unobserve(e.target);
      const src = thumbSource.get(e.target.dataset.thumb);
      if (src) getThumb(src).then((u) => { if (u) { e.target.src = u; e.target.classList.add('in'); } });
    }
  }, { rootMargin: '300px 0px' });
  thumbObserver.observe(img);
  return img;
}

/** Restliche Vorschaubilder in Leerlaufzeit vorbereiten – zuerst das aktuelle Kapitel. */
function warmThumbs() {
  const c = curChapter();
  const all = [...missions, ...sideMissions];
  const chapterOf = (x) => (x.chapter ?? sideChapter(x, missions) ?? 9);
  const todo = all.filter((x) => !thumbUrl.has(x.id)).sort((a, b) => Math.abs(chapterOf(a) - c) - Math.abs(chapterOf(b) - c));
  const idle = window.requestIdleCallback || ((f) => setTimeout(() => f({ timeRemaining: () => 10 }), 80));
  const step = (deadline) => {
    let n = 0;
    while (todo.length && deadline.timeRemaining() > 4 && n < 3) { getThumb(todo.shift()); n++; }
    if (todo.length) thumbChain.then(() => idle(step));
  };
  idle(step);
}

function loadState() {
  try { return sanitizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)), missions); } catch { return defaultState(); }
}

function save(next) {
  state = next;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { snack('Speichern fehlgeschlagen (Speicher voll oder gesperrt).'); }
  render();
}

/* ---------- Meldungsleiste ---------- */

let snackTimer;
function snack(msg, action) {
  const el = document.getElementById('snack');
  const hide = () => { clearTimeout(snackTimer); el.hidden = true; };
  el.replaceChildren(h('span', {}, msg), action && h('button', { onclick: () => { hide(); action.run(); } }, action.label));
  el.hidden = false;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(snackTimer);
  snackTimer = setTimeout(hide, action ? 7000 : 4000);
}
const undoTo = (prev) => ({ label: 'Rückgängig', run: () => save(prev) });

/* ---------- Zustand ändern ---------- */

function setDone(id, done) {
  const prev = state;
  const doneItems = { ...state.doneItems };
  if (done) doneItems[id] = true; else delete doneItems[id];
  save({ ...state, doneItems });
  if (done && navigator.vibrate && !reducedMotion()) navigator.vibrate(12);
  snack(`${done ? 'Erledigt' : 'Wieder offen'}: ${items.find((x) => x.id === id)?.title || id}`, undoTo(prev));
}

function setMissed(id, missed) {
  const prev = state;
  const missedItems = { ...state.missedItems };
  if (missed) missedItems[id] = true; else delete missedItems[id];
  save({ ...state, missedItems });
  snack(`${missed ? 'Als verpasst markiert' : 'Nicht mehr verpasst'}: ${items.find((x) => x.id === id)?.title || id}`, undoTo(prev));
}

function setProgress(missionId, msg) {
  const prev = state;
  save({ ...state, lastCompletedMissionId: missionId });
  if (msg) snack(msg, undoTo(prev));
}

/** Diese Mission spiele ich gerade: alle davor gelten als gespielt. */
function playingNow(m) {
  const i = missions.indexOf(m);
  setProgress(i > 0 ? missions[i - 1].id : null, `Du spielst jetzt „${mName(m)}“`);
}

function toggleSide(x) {
  const prev = state;
  const done = sideDone(x);
  const doneSide = { ...state.doneSide };
  const doneItems = { ...state.doneItems };
  if (done) { delete doneSide[x.id]; if (x.item) delete doneItems[x.item]; } else { doneSide[x.id] = true; if (x.item) doneItems[x.item] = true; }
  save({ ...state, doneSide, doneItems });
  snack(`${done ? 'Wieder offen' : 'Erledigt'}: ${x.nameDe}`, undoTo(prev));
}

/* ---------- Blatt (Dialog) ---------- */

const dlg = () => document.getElementById('dlg');
function openSheet(...content) {
  const d = dlg();
  d.replaceChildren(
    h('div', { class: 'grab', 'aria-hidden': 'true' }),
    h('button', { class: 'close', 'aria-label': 'Schließen', onclick: closeSheet }, icon('x', 20)),
    ...content.filter(Boolean));
  if (!d.open) d.showModal();
  d.scrollTop = 0;
}
const closeSheet = () => { if (dlg().open) dlg().close(); };

/** Ja/Nein-Abfrage. `gate`: Checkbox, die vor „OK“ angehakt sein muss. */
function confirmSheet(title, body, okLabel, gate) {
  return new Promise((resolve) => {
    const d = dlg();
    let result = false;
    const ok = h('button', { class: 'btn btn-primary', disabled: gate ? !gate.checked : false, onclick: () => { result = true; closeSheet(); } }, okLabel);
    if (gate) gate.addEventListener('change', () => { ok.disabled = !gate.checked; });
    d.addEventListener('close', () => resolve(result), { once: true });
    openSheet(h('div', { class: 'sheet-body no-art' }, h('h2', {}, title), body,
      h('div', { class: 'btn-row' }, h('button', { class: 'btn', onclick: closeSheet }, 'Abbrechen'), ok)));
  });
}

/* ---------- Wischen auf Zeilen ---------- */

function addSwipe(el, { right, left }) {
  const LIMIT = 64;
  let x0 = 0; let y0 = 0; let pid = null; let mode = null; let dx = 0;
  const reset = () => { el.style.transform = ''; el.classList.remove('swiping', 'sw-right', 'sw-left'); };
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || e.target.closest('a, .cb, .icon-btn')) return;
    x0 = e.clientX; y0 = e.clientY; pid = e.pointerId; mode = null; dx = 0;
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid) return;
    const mx = e.clientX - x0; const my = e.clientY - y0;
    if (mode === null) {
      if (Math.abs(mx) > 12 && Math.abs(mx) > Math.abs(my) * 1.5) { mode = 'x'; el.setPointerCapture(pid); el.classList.add('swiping'); }
      else if (Math.abs(my) > 12) { mode = 'y'; pid = null; return; }
    }
    if (mode !== 'x') return;
    dx = Math.max(-110, Math.min(110, mx));
    el.style.transform = `translateX(${dx}px)`;
    el.classList.toggle('sw-right', dx > LIMIT);
    el.classList.toggle('sw-left', dx < -LIMIT);
  });
  const end = (e) => {
    if (e.pointerId !== pid) return;
    pid = null;
    if (mode !== 'x') return;
    reset();
    el.dataset.swiped = '1';
    setTimeout(() => { delete el.dataset.swiped; }, 80);
    if (e.type === 'pointerup') { if (dx > LIMIT) right(); else if (dx < -LIMIT) left(); }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

/* ---------- Bausteine ---------- */

function checkbox(on, label, onToggle, missed = false) {
  return h('button', { class: `cb ${on ? 'on' : ''} ${missed ? 'missed' : ''}`, role: 'checkbox', 'aria-checked': on, 'aria-label': label,
    onclick: (e) => { e.stopPropagation(); onToggle(); } }, h('span', { class: 'box' }, on ? icon('check', 16) : null));
}

function sectionH(text, count) {
  return h('div', { class: 'section-h' }, text, count != null && h('span', { class: 'count' }, count));
}

function deadlineText(it) {
  const lost = missionById(it.lostAt?.mission);
  if (!lost) return 'Kein Zeitlimit bekannt';
  return it.lostAt.when === 'start' ? `Bis vor „${mName(lost)}“` : `Bis Ende „${mName(lost)}“`;
}

/** Zeile für eine Checklisten-Aufgabe. */
function itemRow(it, { context = 'list' } = {}) {
  const st = status(it);
  const done = st === 'erledigt';
  const missed = st === 'verpasst';
  const urg = st === 'offen' ? urgency(it, missions, nextIdx()) : 'normal';
  const target = mapTarget(it, state);
  const subParts = [];
  if (missed) subParts.push('Verpasst');
  else if (context !== 'urgent') subParts.push(deadlineText(it));
  else subParts.push(it.location || it.category);
  const row = h('div', { class: `li ${done ? 'done' : ''} ${missed ? 'missed' : ''} ${!done && !missed && urg === 'rot' && context !== 'urgent' ? 'urgent' : ''} ${!done && !missed && urg === 'orange' ? 'soon' : ''}`,
    role: 'button', tabindex: 0, onclick: () => { if (!row.dataset.swiped) showItem(it); }, onkeydown: (e) => { if (e.key === 'Enter') showItem(it); } },
  checkbox(done, `${it.title} erledigt`, () => { if (!missed) setDone(it.id, !done); }, missed),
  h('div', { class: 'main' },
    h('div', { class: 't' }, it.title),
    h('div', { class: 'sub' }, subParts.join(' · '),
      goalMatch(it, 'any') && h('span', { class: 'meta-ic', title: 'Zählt für Trophäen/100 %' }, h('span', { class: 'sep' }, '·'), icon('trophy', 14)),
      it.confidence === 'umstritten' && h('span', {}, h('span', { class: 'sep' }, '·'), 'unsicher'))),
  h('div', { class: 'trail' },
    target.kind !== 'map' && h('a', { class: 'icon-btn', href: target.url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Auf der Karte zeigen', onclick: (e) => e.stopPropagation() }, icon('map-pin', 19))));
  addSwipe(row, { right: () => { if (!missed) setDone(it.id, !done); }, left: () => showItem(it) });
  return row;
}

/** Zeile für eine Story-Mission. */
function missionRow(m, next, { searched = false } = {}) {
  const i = missions.indexOf(m);
  const done = i < next;
  const current = i === next;
  const subParts = [m.step ? 'Story-Aufgabe' : null, searched ? chapterLabel(m.chapter) : null].filter(Boolean);
  return h('button', { class: `li ${done ? 'done' : ''} ${current ? 'current' : ''}`, onclick: () => showMission(m) },
    h('div', { class: 'thumb' }, thumbImg(m), done && h('span', { class: 'badge' }, icon('check', 12))),
    h('div', { class: 'main' },
      h('div', { class: 't' }, mName(m)),
      mAlt(m) && h('div', { class: 'en' }, mAlt(m)),
      subParts.length > 0 && h('div', { class: 'sub' }, subParts.join(' · '))),
    h('div', { class: 'trail' },
      current && h('span', { class: 'pill now' }, 'Jetzt'),
      m.pointOfNoReturn && h('span', { class: 'pill warn', title: 'Point of no Return: danach gibt es kein Zurück' }, icon('triangle-alert', 12), 'Kein Zurück'),
      icon('chevron-right', 18)));
}

function hiddenRow(text, onReveal, anchor = null) {
  return h('button', { class: 'li-more', 'data-anchor': anchor, onclick: onReveal }, icon('eye', 18), h('span', {}, text), h('span', { style: 'margin-left:auto' }, icon('chevron-down', 16)));
}

/** Aufgedeckte Liste wieder einklappen; danach die Stelle zeigen, an der aufgeklappt wurde. */
function collapseRow(text, anchor, onCollapse) {
  return h('button', { class: 'li-more collapse', onclick: () => { onCollapse(); render(); keepInView(anchor); } },
    icon('eye-off', 18), h('span', {}, text), h('span', { style: 'margin-left:auto' }, icon('chevron-up', 16)));
}

function keepInView(anchor) {
  if (!anchor) return;
  requestAnimationFrame(() => document.querySelector(`[data-anchor="${CSS.escape(anchor)}"]`)?.scrollIntoView({ block: 'nearest' }));
}

/** Kapitelkopf mit Fortschritt und Pfeil zum Auf-/Zuklappen. */
function chapterHead(num, name, muted, doneCount, total, expanded, onToggle, anchor) {
  return h('button', { class: 'chapter-h', 'aria-expanded': String(expanded), 'data-anchor': anchor, onclick: onToggle },
    h('div', {}, h('div', { class: 'num' }, num), h('span', { class: `name ${muted ? 'muted' : ''}` }, name)),
    h('div', { class: 'prog' }, `${doneCount}/${total}`, h('div', { class: 'bar' }, h('i', { style: `width:${(doneCount / total) * 100}%` }))),
    h('span', { class: 'chev', 'aria-hidden': 'true' }, icon('chevron-down', 18)));
}

/* ---------- Reiter: Jetzt ---------- */

function viewNow() {
  const next = nextIdx();
  const page = h('div', { class: 'page' });
  if (next >= missions.length) {
    page.append(h('div', { class: 'lead' }, h('div', { class: 'eyebrow' }, 'Geschafft'), h('h1', { class: 'display' }, 'Story abgeschlossen')),
      h('div', { class: 'card' }, h('div', { class: 'card-body' }, h('p', { class: 'desc' }, 'Alle Story-Missionen sind gespielt. Offene Nebenmissionen findest du unter „Neben“.'),
        h('button', { class: 'btn btn-block', onclick: undoMission }, icon('rotate-ccw', 18), 'Letzte Mission zurücknehmen'))));
    return page;
  }
  const m = missions[next];
  const list = openNow(items, state, missions);
  const reds = list.filter((it) => urgency(it, missions, next) === 'rot');
  const later = list.filter((it) => urgency(it, missions, next) !== 'rot');

  page.append(h('div', { class: 'lead' },
    h('div', { class: 'eyebrow' }, chapterLine(m.chapter)),
    h('h1', { class: 'display' }, mName(m)),
    h('div', { class: 'lead-meta' }, `${m.step ? 'Story-Aufgabe' : 'Mission'} ${m.order} von ${missions.length}`,
      mAlt(m) && h('span', { class: 'en' }, ` · ${mAlt(m)}`)),
    progressBar('der Story geschafft')));

  if (!state.settings.helpSeen) {
    page.append(h('div', { class: 'notice info' }, h('span', { class: 'ic' }, icon('info', 20)),
      h('div', {}, h('div', { class: 'nt' }, 'So funktioniert die Checkliste'),
        h('div', { class: 'nb' }, 'Oben steht die Mission, die im Spiel als Nächstes kommt. Darunter alles, was du vorher erledigen solltest – danach ist es weg. Hast du die Mission gespielt, tippst du auf „Gespielt – weiter“.'),
        h('button', { class: 'link-btn', onclick: () => save({ ...state, settings: { ...state.settings, helpSeen: true } }) }, 'Verstanden'))));
    page.lastChild.style.marginBottom = '12px';
  }

  page.append(h('div', { class: 'card mission-card' },
    art(m, mName(m)),
    h('div', { class: 'card-body' },
      m.desc && h('p', { class: 'desc' }, m.desc),
      h('button', { class: 'btn btn-primary btn-block', onclick: () => completeMission(m, reds) }, icon('check', 18), 'Mission gespielt – weiter'),
      h('button', { class: 'link-btn ahead', onclick: () => showAhead(next) }, icon('fast-forward', 16), 'Im Spiel schon weiter?'))));

  if (m.pointOfNoReturn) {
    page.append(h('div', { class: 'notice danger', role: 'alert' }, h('span', { class: 'ic' }, icon('triangle-alert', 20)),
      h('div', {}, h('div', { class: 'nt' }, 'Danach gibt es kein Zurück'),
        h('div', { class: 'nb' }, 'Erledige vorher alles Wichtige und speichere in einem eigenen Slot.'),
        m.ponrNote && h('details', {}, h('summary', {}, 'Was geht verloren?', icon('chevron-down', 16)), h('p', {}, m.ponrNote)))));
  } else if (missions[next + 1]?.pointOfNoReturn) {
    page.append(h('div', { class: 'notice' }, h('span', { class: 'ic' }, icon('flag', 20)),
      h('div', {}, h('div', { class: 'nt' }, 'Bald kommt ein Point of no Return'),
        h('div', { class: 'nb' }, `Nach dieser Mission folgt „${mName(missions[next + 1])}“. Speichere vorher in einem eigenen Slot.`))));
  }
  if (showMoneyHint(next)) {
    page.append(h('button', { class: 'notice', style: 'width:100%;text-align:left', onclick: () => { tab = 'more'; sub = 'money'; render(); window.scrollTo(0, 0); } },
      h('span', { class: 'ic' }, icon('piggy-bank', 20)),
      h('div', {}, h('div', { class: 'nt' }, 'Geld vor dem Kapitelende retten'),
        h('div', { class: 'nb' }, 'Bargeld und Girokonto verfallen am Ende von Kapitel 1. Der Rechner sagt dir, was du einzahlen oder ausgeben solltest.')),
      h('span', { style: 'margin-left:auto;align-self:center;color:var(--text-3)' }, icon('chevron-right', 18))));
  }

  page.append(sectionH('Vorher erledigen', reds.length ? `${reds.length} offen` : null));
  if (reds.length) page.append(h('div', { class: 'list' }, reds.map((it) => itemRow(it, { context: 'urgent' }))));
  else page.append(h('div', { class: 'card' }, h('div', { class: 'empty' }, icon('circle-check', 26), 'Vor dieser Mission musst du nichts erledigen.')));

  if (later.length) {
    page.append(sectionH(`Später in ${chapterLabel(m.chapter)}`, `${later.length}`));
    const box = h('div', { class: 'list' });
    if (showLater) later.forEach((it) => box.append(itemRow(it)));
    box.append(h('button', { class: `li-more ${showLater ? 'collapse' : ''}`, 'data-anchor': 'later', onclick: () => { showLater = !showLater; render(); if (!showLater) keepInView('later'); } },
      icon(showLater ? 'chevron-up' : 'list-checks', 18), showLater ? 'Weniger anzeigen' : `${later.length} weitere Aufgaben anzeigen`));
    page.append(box);
  }
  if (state.lastCompletedMissionId) {
    page.append(h('div', { style: 'text-align:center;margin-top:18px' },
      h('button', { class: 'link-btn', onclick: undoMission }, icon('rotate-ccw', 16), 'Letzte Mission zurücknehmen')));
  }
  return page;
}

async function completeMission(m, reds = redItems(items, state, missions)) {
  if (missions.indexOf(m) !== nextIdx()) return;
  closeSheet();
  if (reds.length || m.pointOfNoReturn) {
    const gate = m.pointOfNoReturn ? h('input', { type: 'checkbox' }) : null;
    const ok = await confirmSheet(m.pointOfNoReturn ? 'Point of no Return' : 'Noch nicht alles erledigt', [
      reds.length && h('p', {}, `${reds.length === 1 ? 'Diese Aufgabe ist' : `Diese ${reds.length} Aufgaben sind`} danach weg:`),
      reds.length && h('ul', { class: 'lost' }, reds.map((it) => h('li', {}, it.title))),
      m.pointOfNoReturn && h('div', { class: 'note' }, h('b', {}, 'Kein Zurück: '), m.ponrNote || 'Danach geht einiges verloren.'),
      gate && h('label', { class: 'gate' }, gate, h('span', {}, 'Ich habe in einem eigenen Slot gespeichert.')),
    ], reds.length ? 'Trotzdem weiter' : 'Weiter', gate);
    if (!ok) return;
  }
  setProgress(m.id, `„${mName(m)}“ gespielt`);
  window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
}

function undoMission() {
  const i = nextIdx() - 1;
  setProgress(i > 0 ? missions[i - 1].id : null, 'Letzte Mission zurückgenommen');
}

/** Die nächsten Missionen ohne Spoiler-Schutz – du wählst, welche du gerade spielst. */
function showAhead(next) {
  const upcoming = missions.slice(next + 1, next + 11);
  openSheet(h('div', { class: 'sheet-body no-art' },
    h('h2', {}, 'Welche spielst du gerade?'),
    h('p', {}, 'Alle Missionen davor gelten dann als gespielt. Was dabei verloren gegangen wäre, wird als verpasst angezeigt – „Rückgängig“ macht es ungeschehen.'),
    h('div', { class: 'list', style: 'margin-top:16px' }, upcoming.map((m) => h('button', { class: 'li', onclick: () => { closeSheet(); playingNow(m); } },
      h('div', { class: 'thumb' }, thumbImg(m)),
      h('div', { class: 'main' }, h('div', { class: 't' }, mName(m)), h('div', { class: 'sub' }, [chapterLabel(m.chapter), m.step ? 'Story-Aufgabe' : null].filter(Boolean).join(' · '))),
      h('div', { class: 'trail' }, icon('play', 16)))))));
}

/* ---------- Reiter: Story ---------- */

function viewStory() {
  const next = nextIdx();
  const played = Math.min(next, missions.length);
  const page = h('div', { class: 'page' });
  page.append(h('div', { class: 'lead' }, h('h1', { class: 'page-title' }, 'Story'),
    h('div', { class: 'lead-meta' }, `${played} von ${missions.length} gespielt`),
    progressBar('geschafft')));
  page.append(searchBox('Mission suchen (deutsch oder englisch)', storyQuery, (v) => { storyQuery = v; }, 'sq'));
  const q = norm(storyQuery);
  if (q) {
    const hits = missions.filter((m) => norm(`${m.nameDe} ${m.name} ${m.id}`).includes(q));
    page.append(sectionH('Treffer', hits.length));
    page.append(hits.length ? h('div', { class: 'list' }, hits.map((m) => missionRow(m, next, { searched: true }))) : emptyCard('Keine Mission gefunden.'));
    return page;
  }
  const cur = curChapter();
  const byChapter = new Map();
  missions.forEach((m) => byChapter.set(m.chapter, [...(byChapter.get(m.chapter) || []), m]));
  for (const [c, list] of byChapter) {
    const doneCount = list.filter((m) => missions.indexOf(m) < next).length;
    const locked = spoiler() && c > cur && !revealed.has(`ch:${c}`);
    const isOpen = openChapters.has(c) || (c === cur && !openChapters.has(`-${c}`));
    const sec = h('section', { class: `chapter ${locked ? 'locked' : ''}` });
    sec.append(chapterHead(c === 0 ? 'Einstieg' : chapterLabel(c), locked ? 'Noch nicht erreicht' : (chapterName(c) || chapterLabel(c)), locked,
      doneCount, list.length, !locked && isOpen, () => { toggleChapter(c, isOpen); keepInView(`head:${c}`); }, `head:${c}`));
    if (locked) {
      sec.append(h('div', { class: 'list' }, hiddenRow(`${list.length} Missionen ausgeblendet (Spoiler) – anzeigen`, () => { revealed.add(`ch:${c}`); openChapters.add(c); openChapters.delete(`-${c}`); render(); }, `ch:${c}`)));
    } else if (isOpen) {
      const box = h('div', { class: 'list' });
      const restKey = `rest:${c}`;
      if (spoiler() && c === cur) {
        const upcoming = list.filter((m) => missions.indexOf(m) > next);
        const restOpen = revealed.has(restKey);
        list.filter((m) => restOpen || missions.indexOf(m) <= next).forEach((m) => box.append(missionRow(m, next)));
        if (upcoming.length && !restOpen) {
          box.append(hiddenRow(`Noch ${upcoming.length} ${upcoming.length === 1 ? 'Mission' : 'Missionen'} in diesem Kapitel – anzeigen`, () => { revealed.add(restKey); render(); }, restKey));
        } else if (upcoming.length) {
          box.append(collapseRow('Kommende Missionen wieder ausblenden', restKey, () => revealed.delete(restKey)));
        }
      } else {
        list.forEach((m) => box.append(missionRow(m, next)));
        if (spoiler() && c > cur) box.append(collapseRow('Kapitel wieder ausblenden', `ch:${c}`, () => revealed.delete(`ch:${c}`)));
      }
      sec.append(box);
    }
    page.append(sec);
  }
  return page;
}

function toggleChapter(c, isOpen) {
  if (isOpen) { openChapters.delete(c); openChapters.add(`-${c}`); } else { openChapters.add(c); openChapters.delete(`-${c}`); }
  render();
}

function showMission(m) {
  const next = nextIdx();
  const i = missions.indexOf(m);
  const lostHere = items.filter((it) => it.lostAt?.mission === m.id);
  const body = h('div', { class: 'sheet-body' },
    h('div', { class: 'eyebrow', style: 'text-shadow:none' }, [chapterLabel(m.chapter), `${m.step ? 'Story-Aufgabe' : 'Mission'} ${m.order}`].join(' · ')),
    h('h2', {}, mName(m)),
    mAlt(m) && h('div', { class: 'en' }, `Englisch: ${mAlt(m)}`),
    m.desc && h('p', {}, m.desc),
    m.pointOfNoReturn && h('div', { class: 'notice danger', style: 'margin-top:16px' }, h('span', { class: 'ic' }, icon('triangle-alert', 20)),
      h('div', {}, h('div', { class: 'nt' }, 'Point of no Return'), h('div', { class: 'nb' }, m.ponrNote || 'Danach geht einiges verloren.'))),
    sectionH('Vorher erledigen', lostHere.length || null),
    lostHere.length ? h('div', { class: 'list sheet-items' }, lostHere.map((it) => itemRow(it))) : h('p', { style: 'margin-top:0' }, 'Bei dieser Mission geht laut Checkliste nichts verloren.'),
    h('div', { class: 'btn-row' },
      i === next && h('button', { class: 'btn btn-primary', onclick: () => completeMission(m) }, icon('check', 18), 'Gespielt – weiter'),
      i !== next && h('button', { class: `btn ${i > next ? 'btn-primary' : ''}`, onclick: () => { closeSheet(); playingNow(m); } }, icon('play', 18), 'Spiele ich gerade'),
      i > next && h('button', { class: 'btn', onclick: () => { closeSheet(); setProgress(m.id, `„${mName(m)}“ als gespielt eingetragen`); } }, icon('check', 18), 'Schon gespielt')));
  openSheet(art(m, mName(m)), body);
}

/* ---------- Reiter: Neben ---------- */

const SIDE_FILTERS = [['all', 'Alle'], ['optional', 'Optional'], ['stranger', 'Fremde'], ['open', 'Offen']];
const KIND_LABEL = { optional: 'Optionale Mission', stranger: 'Fremde & Freaks' };

function viewSide() {
  const page = h('div', { class: 'page' });
  const doneCount = sideMissions.filter(sideDone).length;
  page.append(h('div', { class: 'lead' }, h('h1', { class: 'page-title' }, 'Nebenmissionen'),
    h('div', { class: 'lead-meta' }, `${doneCount} von ${sideMissions.length} erledigt`)));
  page.append(searchBox('Nebenmission oder Person suchen', sideQuery, (v) => { sideQuery = v; }, 'nq'));
  page.append(h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter' }, SIDE_FILTERS.map(([v, t]) =>
    h('button', { 'aria-pressed': String(sideFilter === v), onclick: () => { sideFilter = v; render(); } }, t))));
  const q = norm(sideQuery);
  const list = sideMissions.filter((x) => (sideFilter === 'all' || sideFilter === 'open' || x.kind === sideFilter)
    && (sideFilter !== 'open' || !sideDone(x)) && (!q || norm(`${x.nameDe} ${x.name} ${x.giver || ''}`).includes(q)));
  if (!list.length) { page.append(emptyCard(sideMissions.length ? 'Keine Nebenmission gefunden.' : 'Nebenmissionen konnten nicht geladen werden.')); return page; }
  if (q) { page.append(sectionH('Treffer', list.length), h('div', { class: 'list' }, list.map((x) => sideRow(x, true)))); return page; }
  const cur = curChapter();
  const chap = (x) => sideChapter(x, missions) ?? 99;
  const groups = new Map();
  [...list].sort((a, b) => chap(a) - chap(b) || (a.kind === b.kind ? 0 : a.kind === 'optional' ? -1 : 1)).forEach((x) => groups.set(chap(x), [...(groups.get(chap(x)) || []), x]));
  for (const [c, xs] of groups) {
    const locked = spoiler() && c !== 99 && c > cur && !revealed.has(`side:${c}`);
    const d = xs.filter(sideDone).length;
    const key = `s${c}`;
    const isOpen = openChapters.has(key) || (c >= cur && !openChapters.has(`-${key}`));
    const sec = h('section', { class: `chapter ${locked ? 'locked' : ''}` },
      chapterHead(c === 99 ? 'Ohne Kapitel' : c === 0 ? 'Einstieg' : chapterLabel(c), locked ? 'Noch nicht erreicht' : (chapterName(c) || 'Sonstige'), locked,
        d, xs.length, !locked && isOpen, () => { toggleChapter(key, isOpen); keepInView(`head:${key}`); }, `head:${key}`));
    if (locked) {
      sec.append(h('div', { class: 'list' }, hiddenRow(`${xs.length} Nebenmissionen ausgeblendet (Spoiler) – anzeigen`, () => { revealed.add(`side:${c}`); openChapters.add(key); openChapters.delete(`-${key}`); render(); }, `side:${c}`)));
    } else if (isOpen) {
      const box = h('div', { class: 'list' }, xs.map((x) => sideRow(x)));
      if (spoiler() && c !== 99 && c > cur) box.append(collapseRow('Wieder ausblenden', `side:${c}`, () => revealed.delete(`side:${c}`)));
      sec.append(box);
    }
    page.append(sec);
  }
  return page;
}

function sideRow(x, searched = false) {
  const done = sideDone(x);
  const missed = sideMissed(x);
  const c = sideChapter(x, missions);
  const after = missionById(x.after);
  const locked = !sideUnlocked(x, missions, nextIdx());
  const subParts = [
    searched && c != null ? chapterLabel(c) : null,
    missed ? 'Verpasst' : null,
    x.kind === 'stranger' ? (x.giver || 'Fremde & Freaks') : (after && !done && !missed ? `nach „${mName(after)}“` : 'Optional'),
    locked && !done && !missed ? 'noch nicht frei' : null,
  ].filter(Boolean);
  const row = h('div', { class: `li ${done ? 'done' : ''} ${missed ? 'missed' : ''} ${x.missable && !done && !missed ? 'soon' : ''}`, role: 'button', tabindex: 0,
    onclick: () => { if (!row.dataset.swiped) showSide(x); }, onkeydown: (e) => { if (e.key === 'Enter') showSide(x); } },
  h('div', { class: 'thumb' }, thumbImg(x), done && h('span', { class: 'badge' }, icon('check', 12))),
  h('div', { class: 'main' },
    h('div', { class: 't' }, x.nameDe),
    x.name !== x.nameDe && h('div', { class: 'en' }, x.name),
    h('div', { class: 'sub' }, subParts.join(' · '), x.missable && !done && !missed && h('span', {}, h('span', { class: 'sep' }, '·'), 'verpassbar'))),
  checkbox(done, `${x.nameDe} erledigt`, () => toggleSide(x), missed));
  row.lastChild.style.margin = '-10px -10px -10px -6px';
  addSwipe(row, { right: () => toggleSide(x), left: () => showSide(x) });
  return row;
}

function showSide(x) {
  const c = sideChapter(x, missions);
  const after = missionById(x.after);
  const done = sideDone(x);
  const link = safeHttpsUrl(x.url);
  openSheet(art(x, x.nameDe), h('div', { class: 'sheet-body' },
    h('div', { class: 'eyebrow', style: 'text-shadow:none' }, [KIND_LABEL[x.kind], c != null ? chapterLabel(c) : null].filter(Boolean).join(' · ')),
    h('h2', {}, x.nameDe),
    x.name !== x.nameDe && h('div', { class: 'en' }, `Englisch: ${x.name}`),
    x.description && h('p', {}, x.description),
    h('div', { class: 'kv' },
      x.giver && h('div', {}, icon('users', 18), `Auftraggeber: ${x.giver}`),
      after && h('div', {}, icon('flag', 18), `Erscheint nach „${mName(after)}“`),
      x.missable && h('div', {}, icon('triangle-alert', 18), 'Verpassbar – erledige sie, sobald sie auftaucht.')),
    h('div', { class: 'btn-row' },
      h('button', { class: `btn ${done ? '' : 'btn-primary'}`, onclick: () => { closeSheet(); toggleSide(x); } }, icon(done ? 'rotate-ccw' : 'check', 18), done ? 'Doch nicht erledigt' : 'Erledigt')),
    link && h('div', { class: 'sources' }, h('a', { href: link, target: '_blank', rel: 'noopener noreferrer' }, 'Komplettlösung auf GTABase'))));
}

/* ---------- Reiter: Fundorte ---------- */

const GROUP_ICON = {
  secrets: 'sparkles', collectibles: 'gem', 'collectible-cards': 'layers', weapons: 'crosshair', vehicles: 'car',
  activities: 'zap', robberies: 'banknote', properties: 'house', style: 'shirt', 'food-drink': 'utensils', 'local-places': 'landmark',
};
const GROUP_SHORT = {
  secrets: 'Geheimnisse', collectibles: 'Sammeln', 'collectible-cards': 'Karten', weapons: 'Waffen', vehicles: 'Fahrzeuge',
  activities: 'Aktivitäten', robberies: 'Raubzüge', properties: 'Persönlich', style: 'Stil', 'food-drink': 'Essen', 'local-places': 'Orte',
};

function loadSpots() {
  spotsLoading ||= fetch('data/spots.json').then((r) => {
    if (!r.ok) throw new Error(`spots.json: ${r.status}`);
    return r.json();
  }).then((d) => {
    spots = d;
    spots.catById = new Map(d.categories.map((c) => [c.id, c]));
    spotIndex = d.categories.flatMap((c) => c.items.map(([id, name]) => ({ id, name, cat: c, n: norm(name) })));
    if (tab === 'spots') render();
  }).catch((err) => {
    spotsLoading = null;
    if (tab === 'spots') document.getElementById('view').replaceChildren(h('div', { class: 'page' },
      h('div', { class: 'lead' }, h('h1', { class: 'page-title' }, 'Fundorte')), emptyCard(`Fundorte konnten nicht geladen werden: ${err.message}`)));
  });
  return spotsLoading;
}

const foundCount = (items) => items.reduce((n, [id]) => n + (state.found[id] ? 1 : 0), 0);

function pctBar(done, total, label) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return h('div', { class: 'story-progress', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 },
    h('div', { class: 'track' }, h('i', { style: `width:${pct}%` })),
    h('span', { class: 'pct' }, `${pct} %`, label && h('span', { class: 'lbl' }, ` ${label}`)));
}

function toggleFound(id, name) {
  const prev = state;
  const found = { ...state.found };
  const was = !!found[id];
  if (was) delete found[id]; else found[id] = true;
  save({ ...state, found });
  if (!was && navigator.vibrate && !reducedMotion()) navigator.vibrate(10);
  snack(`${was ? 'Wieder offen' : 'Gefunden'}: ${name}`, undoTo(prev));
}

function spotRow(id, name, catName = null) {
  const done = !!state.found[id];
  const row = h('div', { class: `li spot ${done ? 'done' : ''}` },
    checkbox(done, `${name} gefunden`, () => toggleFound(id, name)),
    h('a', { class: 'main spot-link', href: spotLink(id), target: '_blank', rel: 'noopener noreferrer', 'aria-label': `${name} auf der GTABase-Karte zeigen` },
      h('div', { class: 't' }, name),
      catName && h('div', { class: 'sub' }, catName)),
    h('a', { class: 'icon-btn', href: spotLink(id), target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Auf der Karte zeigen', tabindex: -1 }, icon('map-pin', 19)));
  addSwipe(row, { right: () => toggleFound(id, name), left: () => {} });
  return row;
}

function viewSpots() {
  if (!spots) {
    loadSpots();
    return h('div', { class: 'page' }, h('div', { class: 'lead' }, h('h1', { class: 'page-title' }, 'Fundorte'), h('div', { class: 'lead-meta' }, 'Wird geladen …')));
  }
  if (spotCat && spots.catById.has(spotCat)) return viewSpotCategory(spots.catById.get(spotCat));
  const page = h('div', { class: 'page' });
  const all = spotIndex.length;
  const doneAll = spotIndex.reduce((n, x) => n + (state.found[x.id] ? 1 : 0), 0);
  page.append(h('div', { class: 'lead' }, h('h1', { class: 'page-title' }, 'Fundorte'),
    h('div', { class: 'lead-meta' }, `${doneAll.toLocaleString('de-DE')} von ${all.toLocaleString('de-DE')} gefunden`),
    pctBar(doneAll, all, 'gefunden')));
  page.append(searchBox('Fundort suchen, z. B. Revolver', spotQuery, (v) => { spotQuery = v; spotLimit = 150; }, 'spq'));
  const q = norm(spotQuery);
  if (q) {
    const hits = spotIndex.filter((x) => x.n.includes(q) || norm(x.cat.name).includes(q));
    page.append(sectionH('Treffer', hits.length.toLocaleString('de-DE')));
    if (!hits.length) { page.append(emptyCard('Kein Fundort gefunden.')); return page; }
    const box = h('div', { class: 'list' }, hits.slice(0, spotLimit).map((x) => spotRow(x.id, x.name, x.cat.name)));
    if (hits.length > spotLimit) box.append(h('button', { class: 'li-more', onclick: () => { spotLimit += 150; render(); } }, icon('chevron-down', 18), `Weitere ${Math.min(150, hits.length - spotLimit)} anzeigen`));
    page.append(box);
    return page;
  }
  page.append(h('div', { class: 'chips-scroll', role: 'group', 'aria-label': 'Art' },
    [['all', 'Alle'], ...spots.groups.map((g) => [g.id, GROUP_SHORT[g.id] || g.name])].map(([v, t]) =>
      h('button', { class: 'chip', 'aria-pressed': String(spotGroup === v), onclick: () => { spotGroup = v; render(); } }, v !== 'all' && icon(GROUP_ICON[v] || 'map-pin', 15), t))));
  for (const g of spots.groups) {
    if (spotGroup !== 'all' && spotGroup !== g.id) continue;
    const cats = spots.categories.filter((c) => c.group === g.id);
    if (!cats.length) continue;
    const gTotal = cats.reduce((n, c) => n + c.items.length, 0);
    const gDone = cats.reduce((n, c) => n + foundCount(c.items), 0);
    page.append(sectionH(g.name, `${gDone}/${gTotal}`));
    page.append(h('div', { class: 'list' }, cats.map((c) => {
      const d = foundCount(c.items);
      return h('button', { class: `li ${d === c.items.length ? 'done-cat' : ''}`, onclick: () => { spotCat = c.id; spotCatQuery = ''; spotCatFilter = 'all'; spotLimit = 150; render(); window.scrollTo(0, 0); } },
        h('span', { class: 'lead-ic' }, icon(GROUP_ICON[g.id] || 'map-pin', 18)),
        h('div', { class: 'main' }, h('div', { class: 't' }, c.name), h('div', { class: 'sub' }, `${d} von ${c.items.length} gefunden`)),
        h('div', { class: 'trail' }, h('div', { class: 'mini' }, h('i', { style: `width:${(d / c.items.length) * 100}%` })), icon('chevron-right', 18)));
    })));
  }
  page.append(h('p', { class: 'fine' }, `Fundorte nach der interaktiven Karte von GTABase (Stand ${new Date(spots.updated).toLocaleDateString('de-DE')}). Antippen öffnet den Ort direkt auf der Karte; Beschreibung und Bilder findest du dort.`));
  return page;
}

const SPOT_FILTERS = [['all', 'Alle'], ['open', 'Offen'], ['found', 'Gefunden']];

function viewSpotCategory(c) {
  const page = h('div', { class: 'page' });
  const d = foundCount(c.items);
  page.append(h('div', { class: 'lead' },
    h('button', { class: 'back', onclick: () => { spotCat = null; render(); window.scrollTo(0, 0); } }, icon('chevron-right', 18), 'Fundorte'),
    h('h1', { class: 'page-title' }, c.name),
    h('div', { class: 'lead-meta' }, `${d} von ${c.items.length} gefunden`),
    pctBar(d, c.items.length, 'gefunden')));
  page.append(h('a', { class: 'btn btn-block', href: spotCategoryLink(c.feature), target: '_blank', rel: 'noopener noreferrer' }, icon('map', 18), 'Alle auf der GTABase-Karte zeigen'));
  if (c.items.length > 8) page.append(h('div', { style: 'margin-top:12px' }, searchBox(`In „${c.name}“ suchen`, spotCatQuery, (v) => { spotCatQuery = v; spotLimit = 150; }, 'scq')));
  page.append(h('div', { class: 'seg' }, SPOT_FILTERS.map(([v, t]) => h('button', { 'aria-pressed': String(spotCatFilter === v), onclick: () => { spotCatFilter = v; spotLimit = 150; render(); } }, t))));
  const q = norm(spotCatQuery);
  const list = c.items.filter(([id, name]) => (spotCatFilter === 'all' || (spotCatFilter === 'found') === !!state.found[id]) && (!q || norm(name).includes(q)));
  page.append(sectionH(spotCatFilter === 'found' ? 'Gefunden' : spotCatFilter === 'open' ? 'Noch offen' : 'Fundorte', list.length));
  if (!list.length) { page.append(emptyCard(spotCatFilter === 'open' ? 'Alles gefunden!' : 'Keine Einträge.')); return page; }
  const box = h('div', { class: 'list' }, list.slice(0, spotLimit).map(([id, name]) => spotRow(id, name)));
  if (list.length > spotLimit) box.append(h('button', { class: 'li-more', onclick: () => { spotLimit += 150; render(); } }, icon('chevron-down', 18), `Weitere ${Math.min(150, list.length - spotLimit)} anzeigen`));
  page.append(box);
  return page;
}

/* ---------- Reiter: Mehr ---------- */

function viewMore() {
  const fn = { items: viewItems, goals: viewGoals, money: viewMoney, share: viewShare, backup: viewBackup }[sub];
  if (fn) return fn();
  const page = h('div', { class: 'page' });
  const open = items.filter((it) => status(it) === 'offen').length;
  page.append(h('div', { class: 'lead' }, h('h1', { class: 'page-title' }, 'Mehr')));
  const nav = (ic, t, s, go) => h('button', { class: 'li', onclick: () => { sub = go; render(); window.scrollTo(0, 0); } },
    h('span', { class: 'lead-ic' }, icon(ic, 18)), h('div', { class: 'main' }, h('div', { class: 't' }, t), s && h('div', { class: 'sub' }, s)),
    h('div', { class: 'trail' }, icon('chevron-right', 18)));
  page.append(sectionH('Checkliste'), h('div', { class: 'list' },
    nav('list-checks', 'Alle Aufgaben', `${open} offen von ${items.length}`, 'items'),
    nav('trophy', 'Trophäen & 100 %', 'Aufgaben, die dafür zählen', 'goals')));
  page.append(sectionH('Werkzeuge'), h('div', { class: 'list' },
    nav('piggy-bank', 'Geld-Rechner', 'Geld vor dem Ende von Kapitel 1 retten', 'money'),
    nav('share-2', 'Auf anderes Gerät übertragen', 'Link oder QR-Code', 'share'),
    nav('download', 'Sicherung', 'Exportieren und importieren', 'backup')));
  const sw = h('button', { class: 'switch', role: 'switch', 'aria-checked': String(spoiler()), 'aria-label': 'Spoiler-Schutz',
    onclick: () => save({ ...state, settings: { ...state.settings, spoilerProtection: !spoiler() } }) });
  page.append(sectionH('Einstellungen'), h('div', { class: 'list' },
    h('div', { class: 'li' }, h('span', { class: 'lead-ic' }, icon('eye', 18)),
      h('div', { class: 'main' }, h('div', { class: 't' }, 'Spoiler-Schutz'), h('div', { class: 'sub' }, 'Kommende Missionen und spätere Kapitel ausblenden')), sw),
    h('button', { class: 'li', onclick: resetAll }, h('span', { class: 'lead-ic', style: 'color:var(--red)' }, icon('trash-2', 18)),
      h('div', { class: 'main' }, h('div', { class: 't', style: 'color:var(--red)' }, 'Alles zurücksetzen')))));
  page.append(h('p', { class: 'fine' }, 'Privates Fan-Tool, nicht mit Rockstar Games verbunden. Kein Zugriff auf Spielstände – der Fortschritt ist, was du hier einträgst. Missionsdaten nach GTABase und weiteren Guides (Quellen je Aufgabe). Illustrationen sind eigene Zeichnungen.'));
  return page;
}

function subHead(title, meta) {
  return h('div', { class: 'lead' },
    h('button', { class: 'back', onclick: () => { sub = null; render(); } }, icon('chevron-right', 18), 'Mehr'),
    h('h1', { class: 'page-title' }, title), meta && h('div', { class: 'lead-meta' }, meta));
}

const STATUS_SEG = [['offen', 'Offen'], ['erledigt', 'Erledigt'], ['verpasst', 'Verpasst'], ['', 'Alle']];

function viewItems() {
  const page = h('div', { class: 'page' }, subHead('Alle Aufgaben', `${items.filter((it) => status(it) === 'erledigt').length} von ${items.length} erledigt`));
  page.append(searchBox('Aufgabe suchen', itemFilters.q, (v) => { itemFilters = { ...itemFilters, q: v }; }, 'iq'));
  page.append(h('div', { class: 'seg' }, STATUS_SEG.map(([v, t]) => h('button', { 'aria-pressed': String(itemFilters.status === v), onclick: () => { itemFilters = { ...itemFilters, status: v }; render(); } }, t))));
  const sel = (k, opts, label) => h('select', { 'aria-label': label, onchange: (e) => { itemFilters = { ...itemFilters, [k]: e.target.value }; render(); } },
    h('option', { value: '' }, label), opts.map(([v, t]) => h('option', { value: v, selected: itemFilters[k] === v }, t)));
  page.append(h('div', { class: 'filters' },
    sel('chapter', [...new Set(missions.map((m) => m.chapter))].map((c) => [String(c), chapterLabel(c)]), 'Alle Kapitel'),
    sel('category', CATEGORIES.map((c) => [c, c]), 'Alle Kategorien')));
  const q = norm(itemFilters.q);
  const cur = curChapter();
  let list = items.filter((it) => (!itemFilters.chapter || String(itemChapter(it, missions)) === itemFilters.chapter)
    && (!itemFilters.category || it.category === itemFilters.category)
    && (!itemFilters.status || status(it) === itemFilters.status)
    && (!q || norm(`${it.title} ${it.description} ${it.location}`).includes(q)));
  const later = spoiler() && !q ? list.filter((it) => itemChapter(it, missions) > cur) : [];
  const laterOpen = revealed.has('items-future');
  if (!laterOpen) list = list.filter((it) => !later.includes(it));
  const future = laterOpen ? [] : later;
  page.append(sectionH('Aufgaben', list.length));
  const box = h('div', { class: 'list' }, list.map((it) => itemRow(it)));
  if (future.length) box.append(hiddenRow(`${future.length} Aufgaben aus späteren Kapiteln ausgeblendet – anzeigen`, () => { revealed.add('items-future'); render(); }, 'items-future'));
  else if (laterOpen && later.length) box.append(collapseRow('Aufgaben aus späteren Kapiteln wieder ausblenden', 'items-future', () => revealed.delete('items-future')));
  page.append(list.length || future.length ? box : emptyCard('Keine Aufgaben für diesen Filter.'));
  return page;
}

function viewGoals() {
  const list = items.filter((it) => goalMatch(it, 'any'));
  const page = h('div', { class: 'page' }, subHead('Trophäen & 100 %', `${list.filter((it) => status(it) === 'erledigt').length} von ${list.length} erledigt`));
  page.append(h('div', { class: 'notice' }, h('span', { class: 'ic' }, icon('info', 20)),
    h('div', { class: 'nb', style: 'margin:0' }, 'Diese Aufgaben zählen laut mindestens einer Quelle für eine Trophäe oder für 100 %. Bei „unsicher“ widersprechen sich die Guides – Details beim Antippen.')));
  page.append(sectionH('Aufgaben', list.length), h('div', { class: 'list' }, list.map((it) => itemRow(it))));
  return page;
}

function viewMoney() {
  const page = h('div', { class: 'page' }, subHead('Geld-Rechner', 'Ende von Kapitel 1'));
  const out = h('div');
  const update = () => {
    const p = moneyPlan(moneyInputs);
    const steps = [];
    if (p.depositCash > 0) steps.push(`${fmt(p.depositCash)} Bargeld am ATM aufs Girokonto einzahlen.`);
    if (p.toSavings > 0) steps.push(`In BuckMe unter „Buck Yourself“ ${fmt(p.toSavings)} ins Family Savings schieben.`);
    if (p.spend > 0) steps.push(`Die restlichen ${fmt(p.spend)} ausgeben – z. B. für Waffen bei Ammu-Nation, die bleiben dir.`);
    out.replaceChildren(steps.length ? h('ol', { class: 'plan' }, steps.map((t) => h('li', {}, t))) : h('p', { class: 'plan-note' }, 'Trag oben deine Beträge ein.'),
      h('p', { class: 'plan-note' }, p.full ? `Family Savings ist dann voll (${fmt(FAMILY_SAVINGS_CAP)}) – nur das nimmst du mit.` : `Du nimmst ${fmt(p.kept)} mit. Mehr als ${fmt(FAMILY_SAVINGS_CAP)} passen nicht ins Family Savings.`));
  };
  const field = (k, label) => h('label', {}, label, h('input', { type: 'text', inputmode: 'numeric', placeholder: '0 $', value: moneyInputs[k],
    oninput: (e) => { moneyInputs = { ...moneyInputs, [k]: e.target.value }; update(); } }));
  update();
  page.append(h('div', { class: 'notice' }, h('span', { class: 'ic' }, icon('info', 20)),
    h('div', { class: 'nb', style: 'margin:0' }, 'Am Ende von Kapitel 1 verfallen Bargeld, Girokonto und Bodenversteck. Nur das Family Savings (ab „Buck Me“) bleibt – höchstens 5.000 $.')));
  page.append(h('div', { class: 'card', style: 'margin-top:12px' }, h('div', { class: 'card-body' },
    h('div', { class: 'money-grid' }, field('cash', 'Bargeld'), field('checking', 'Girokonto'), field('savings', 'Schon im Family Savings')), out)));
  return page;
}

const shareLink = () => `${location.origin}${location.pathname}#import=${encodeShare(state)}`;

function viewShare() {
  const page = h('div', { class: 'page' }, subHead('Übertragen', 'Auf ein anderes Gerät'));
  const qrBox = h('div', { class: 'qr-box' });
  page.append(h('div', { class: 'card' }, h('div', { class: 'card-body' },
    h('p', { class: 'desc', style: 'margin:0 0 16px;color:var(--text-2)' }, 'Öffne den Link oder scanne den QR-Code auf dem anderen Gerät. Dort wird dein Stand nach einer Rückfrage übernommen.'),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn btn-primary', onclick: shareProgress }, icon('share-2', 18), 'Link teilen'),
      h('button', { class: 'btn', onclick: async () => {
        if (qrBox.firstChild) { qrBox.replaceChildren(); return; }
        try { qrBox.replaceChildren(await qrSvg(shareLink())); } catch { snack('QR-Code konnte nicht erstellt werden.'); }
      } }, icon('qr-code', 18), 'QR-Code')),
    qrBox)));
  return page;
}

function viewBackup() {
  const page = h('div', { class: 'page' }, subHead('Sicherung', 'Fortschritt als Datei'));
  const fileInput = h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: importFile });
  page.append(h('div', { class: 'list' },
    h('button', { class: 'li', onclick: exportJson }, h('span', { class: 'lead-ic' }, icon('download', 18)),
      h('div', { class: 'main' }, h('div', { class: 't' }, 'Exportieren'), h('div', { class: 'sub' }, 'Speichert eine JSON-Datei auf deinem Gerät'))),
    h('button', { class: 'li', onclick: () => fileInput.click() }, h('span', { class: 'lead-ic' }, icon('upload', 18)),
      h('div', { class: 'main' }, h('div', { class: 't' }, 'Importieren'), h('div', { class: 'sub' }, 'Ersetzt den aktuellen Stand nach Rückfrage')))), fileInput);
  return page;
}

async function shareProgress() {
  const url = shareLink();
  try {
    if (navigator.share) { await navigator.share({ title: 'GTA 6 Checkliste – mein Stand', url }); return; }
    await navigator.clipboard.writeText(url);
    snack('Link kopiert.');
  } catch (err) {
    if (err?.name !== 'AbortError') prompt('Link kopieren:', url);
  }
}

/** QR-Code als SVG aus DOM-Elementen (kein innerHTML). */
async function qrSvg(text) {
  const { default: qrcode } = await import('./vendor/qrcode.js');
  const q = qrcode(0, 'L');
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  const pad = 4;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + pad} ${r + pad}h1v1h-1z`;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${n + 2 * pad} ${n + 2 * pad}`);
  svg.setAttribute('class', 'qr');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'QR-Code mit deinem Fortschritt');
  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%'); bg.setAttribute('fill', '#fff');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d); path.setAttribute('fill', '#000');
  svg.append(bg, path);
  return svg;
}

async function importFromHash() {
  const m = location.hash.match(/^#import=([A-Za-z0-9_-]+)$/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  let incoming;
  try { incoming = decodeShare(m[1], missions); } catch { snack('Der Link enthält keinen gültigen Fortschritt.'); return; }
  const last = missionById(incoming.lastCompletedMissionId);
  const ok = await confirmSheet('Fortschritt übernehmen?', [
    h('p', {}, `Zuletzt gespielt: ${last ? `„${mName(last)}“` : 'noch nichts'} · ${Object.keys(incoming.doneItems).length} Aufgaben erledigt.`),
    h('p', {}, 'Dein bisheriger Stand auf diesem Gerät wird ersetzt.'),
  ], 'Übernehmen');
  if (ok) { const prev = state; save(incoming); snack('Fortschritt übernommen', undoTo(prev)); }
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
    if (await confirmSheet('Importieren?', h('p', {}, 'Aktuellen Fortschritt durch die Datei ersetzen?'), 'Ersetzen')) {
      const prev = state; save(sanitizeState(raw, missions)); snack('Fortschritt importiert', undoTo(prev));
    }
  } catch (err) {
    snack(`Import fehlgeschlagen: ${err.message}`);
  }
  e.target.value = '';
}

async function resetAll() {
  if (await confirmSheet('Alles zurücksetzen?', h('p', {}, 'Fortschritt, Haken und eigene Kartenlinks werden gelöscht. Tipp: vorher unter „Sicherung“ exportieren.'), 'Alles löschen')) {
    const prev = state; save(defaultState()); snack('Alles zurückgesetzt', undoTo(prev));
  }
}

/* ---------- Aufgabe im Detail ---------- */

const yesNo = (v) => (v === true ? 'ja' : v === false ? 'nein' : 'unklar');

function showItem(it) {
  const st = status(it);
  const target = mapTarget(it, state);
  const from = missionById(it.availableFrom);
  const lost = missionById(it.lostAt?.mission);
  const input = h('input', { type: 'url', placeholder: 'https://www.gtabase.com/de/gta-6/karte/#…', value: state.gtabaseUrls[it.id] || '' });
  openSheet(h('div', { class: 'sheet-body no-art' },
    h('div', { class: 'eyebrow', style: 'text-shadow:none' }, [it.category, chapterLabel(itemChapter(it, missions))].join(' · ')),
    h('h2', {}, it.title),
    h('p', {}, it.description),
    h('div', { class: 'kv' },
      from && h('div', {}, icon('play', 18), `Möglich ab: nach „${mName(from)}“`),
      h('div', {}, icon('clock', 18), lost ? `Geht verloren: ${it.lostAt.when === 'start' ? `sobald „${mName(lost)}“ startet` : `nach „${mName(lost)}“`}` : 'Geht verloren: Zeitpunkt nicht bekannt'),
      it.location && h('div', {}, icon('map-pin', 18), it.location),
      h('div', {}, icon('trophy', 18), `Trophäe: ${yesNo(it.trophy)} · 100 %: ${yesNo(it.completion100)}`)),
    it.note && h('div', { class: 'note' }, it.confidence === 'umstritten' && h('b', {}, 'Unsicher: '), it.note),
    h('div', { class: 'btn-row' },
      st !== 'verpasst' && h('button', { class: `btn ${st === 'erledigt' ? '' : 'btn-primary'}`, onclick: () => { closeSheet(); setDone(it.id, st !== 'erledigt'); } },
        icon(st === 'erledigt' ? 'rotate-ccw' : 'check', 18), st === 'erledigt' ? 'Doch nicht erledigt' : 'Erledigt'),
      target.kind !== 'map' && h('a', { class: 'btn', href: target.url, target: '_blank', rel: 'noopener noreferrer' }, icon('map-pin', 18), target.kind === 'marker' ? 'Auf der Karte' : 'Orte auf der Karte')),
    sectionH('Eigener Kartenlink'),
    h('p', { style: 'margin-top:0;font-size:14px' }, 'Auf der GTABase-Karte einen Marker antippen, „Link kopieren“ und hier einfügen.'),
    input,
    h('div', { class: 'btn-row', style: 'margin-top:12px' },
      h('button', { class: 'btn', onclick: () => {
        const v = input.value.trim();
        const safe = safeHttpsUrl(v);
        if (v && !safe) { snack('Nur https-Links erlaubt.'); return; }
        const gtabaseUrls = { ...state.gtabaseUrls };
        if (safe) gtabaseUrls[it.id] = safe; else delete gtabaseUrls[it.id];
        closeSheet(); save({ ...state, gtabaseUrls }); snack(safe ? 'Kartenlink gespeichert' : 'Kartenlink entfernt');
      } }, 'Link speichern'),
      h('button', { class: 'btn btn-danger', onclick: () => { closeSheet(); setMissed(it.id, !state.missedItems[it.id]); } },
        state.missedItems[it.id] ? 'Nicht verpasst' : 'Als verpasst markieren')),
    it.sources?.length > 0 && h('div', { class: 'sources' }, 'Quellen: ', it.sources.map((src, i) => {
      const u = safeHttpsUrl(src);
      return u ? [i ? ', ' : '', h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, new URL(u).hostname.replace(/^www\./, ''))] : null;
    }))));
}

/* ---------- Geld-Hinweis ---------- */

const CH1_END = 'tourist-trap';
function showMoneyHint(next) {
  const end = missionIndexById(missions, CH1_END);
  return end >= 0 && next >= end - 2 && next <= end;
}

/* ---------- Gemeinsame Bausteine ---------- */

function searchBox(placeholder, value, set, id) {
  return h('label', { class: 'search' }, icon('search', 18),
    h('input', { type: 'search', id, placeholder, value, 'aria-label': placeholder,
      oninput: (e) => { set(e.target.value); render(); const el = document.getElementById(id); el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }));
}

function emptyCard(text) {
  return h('div', { class: 'card' }, h('div', { class: 'empty' }, icon('circle-help', 26), text));
}

/* ---------- Kulisse ---------- */

let sceneLoc = null;
function updateScene() {
  const loc = sceneFor(curChapter());
  if (loc !== sceneLoc) {
    sceneLoc = loc;
    document.getElementById('scene').replaceChildren(scene(loc, 'dusk', { animated: !reducedMotion() }));
  }
  const c = curChapter();
  document.getElementById('appsub').textContent = `${chapterLabel(c)} · ${SCENE_NAMES[loc]}`;
}

/* ---------- Rendern / Start ---------- */

function render() {
  const view = document.getElementById('view');
  const fn = { now: viewNow, story: viewStory, side: viewSide, spots: viewSpots, more: viewMore }[tab];
  view.replaceChildren(fn());
  document.body.className = `tab-${tab}`;
  document.querySelectorAll('#tabs button').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
    b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false');
  });
  updateScene();
}

function goTab(t) {
  if (t === tab && t === 'more' && sub) sub = null;
  if (t === tab && t === 'spots' && spotCat) spotCat = null;
  tab = t;
  render();
  window.scrollTo(0, 0);
  if (t === 'story') requestAnimationFrame(() => document.querySelector('.li.current')?.scrollIntoView({ block: 'center' }));
}

async function init() {
  document.querySelectorAll('#tabs button').forEach((b) => b.prepend(h('span', { class: 'ic-wrap' }, icon(b.dataset.icon, 22))));
  try {
    const [m, i, c] = await Promise.all(['missions', 'items', 'chapters'].map((n) => fetch(`data/${n}.json`).then((r) => {
      if (!r.ok) throw new Error(`${n}.json: ${r.status}`);
      return r.json();
    })));
    missions = m; items = i; chapters = c;
    sideMissions = await fetch('data/sidemissions.json').then((r) => (r.ok ? r.json() : [])).catch(() => []);
  } catch (err) {
    document.getElementById('view').replaceChildren(h('div', { class: 'page' }, h('div', { class: 'lead' }, h('h1', { class: 'page-title' }, 'Fehler')),
      emptyCard(`Daten konnten nicht geladen werden: ${err.message}`)));
    return;
  }
  state = loadState();
  document.getElementById('tabs').addEventListener('click', (e) => {
    const t = e.target.closest('button')?.dataset.tab;
    if (t) goTab(t);
  });
  render();
  importFromHash();
  window.addEventListener('hashchange', importFromHash);
  setTimeout(warmThumbs, 1200);
  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) snack('Neue Version geladen.', { label: 'Neu laden', run: () => location.reload() });
    });
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
