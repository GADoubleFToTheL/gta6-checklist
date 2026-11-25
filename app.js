import {
  nextIndex, itemStatus, urgency, openNow, redItems, itemChapter,
  defaultState, sanitizeState, safeHttpsUrl, mapTarget,
  moneyPlan, goalMatch, encodeShare, decodeShare, FAMILY_SAVINGS_CAP, sideChapter, sideUnlocked,
} from './logic.js';

const STORAGE_KEY = 'gta6-checklist-v1';
const CATEGORIES = ['Vorbereitung', 'Geld', 'Missable', 'Beziehung Lucia', 'Waffe', 'Kleidung', 'Sammelobjekt', 'Fahrzeug'];

let missions = [];
let items = [];
let sideMissions = [];
let missionMode = 'story'; // 'story' | 'side'
let sideFilter = 'all';
let chapters = {};
let state = defaultState();
let tab = 'now';
let filters = { chapter: '', category: '', status: 'offen', q: '', goal: '' };
let moneyInputs = { cash: '', checking: '', savings: '' };
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

let snackTimer;

/** Kurze Meldung unten; optional mit Knopf (z. B. „Rückgängig“). */
function snack(msg, action) {
  const el = document.getElementById('snack');
  const hide = () => { clearTimeout(snackTimer); el.hidden = true; };
  el.replaceChildren(h('span', {}, msg),
    action && h('button', { onclick: () => { hide(); action.run(); } }, action.label));
  el.hidden = false;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(snackTimer);
  snackTimer = setTimeout(hide, action ? 7000 : 4000);
}

const toast = (msg) => snack(msg);
const undoTo = (prev) => ({ label: 'Rückgängig', run: () => { animateNext = false; save(prev); } });
const titleOf = (id) => items.find((x) => x.id === id)?.title || id;

const nextIdx = () => nextIndex(missions, state.lastCompletedMissionId);
const status = (it) => itemStatus(it, state, missions);

function setDone(id, done) {
  const prev = state;
  const doneItems = { ...state.doneItems };
  if (done) doneItems[id] = true; else delete doneItems[id];
  save({ ...state, doneItems });
  snack(`${done ? 'Erledigt' : 'Wieder offen'}: ${titleOf(id)}`, undoTo(prev));
}

function setMissed(id, missed) {
  const missedItems = { ...state.missedItems };
  if (missed) missedItems[id] = true; else delete missedItems[id];
  const prev = state;
  save({ ...state, missedItems });
  snack(`${missed ? 'Als verpasst markiert' : 'Nicht mehr verpasst'}: ${titleOf(id)}`, undoTo(prev));
}

function setProgress(missionId, msg) {
  const prev = state;
  animateNext = true;
  save({ ...state, lastCompletedMissionId: missionId });
  if (msg) snack(msg, undoTo(prev));
}

/* ---------- Dialoge ---------- */

const dlg = () => document.getElementById('dlg');

function openDialog(...content) {
  const d = dlg();
  d.replaceChildren(...content.filter(Boolean));
  if (!d.open) d.showModal();
}
const closeDialog = () => dlg().close();

/** Ja/Nein-Dialog. `gate`: Checkbox, die angehakt sein muss, bevor „OK“ geht. */
function confirmDialog(title, body, okLabel, gate) {
  return new Promise((resolve) => {
    const d = dlg();
    const finish = (v) => { d.removeEventListener('close', onClose); if (d.open) d.close(); resolve(v); };
    const onClose = () => resolve(false);
    d.addEventListener('close', onClose, { once: true });
    const ok = h('button', { class: 'primary', disabled: gate ? !gate.checked : false, onclick: () => finish(true) }, okLabel);
    if (gate) gate.addEventListener('change', () => { ok.disabled = !gate.checked; });
    openDialog(
      h('h1', {}, title), h('div', {}, body),
      h('div', { class: 'actions' }, h('button', { onclick: () => finish(false) }, 'Abbrechen'), ok),
    );
  });
}

/* ---------- Bausteine ---------- */

const HINTS = {
  rot: 'Geht nach der nächsten Mission verloren',
  orange: 'Geht vor dem Point of no Return verloren',
};

const chapterLabel = (c) => (c === 0 ? 'Prolog' : `Kapitel ${c}`);
/** Deutscher Missionstitel (englischer Originaltitel als Zusatz, wo verschieden). */
const mName = (m) => m.nameDe || m.name;
const mAlt = (m) => (m.nameDe && m.nameDe !== m.name ? m.name : '');
let missionQuery = '';

function isFutureItem(it) {
  if (!state.settings.spoilerProtection || revealed.has(`i:${it.id}`)) return false;
  const cur = missions[Math.min(nextIdx(), missions.length - 1)];
  return itemChapter(it, missions) > cur.chapter;
}

const PIN_TITLES = {
  marker: 'Ort auf der Karte zeigen',
  category: 'Passende Kategorie auf der Karte zeigen',
};

function pinLink(it) {
  const { url, kind } = mapTarget(it, state);
  if (kind === 'map') return null; // kein Ort bekannt (z. B. Anruf, Spielmenü)
  return h('a', { class: `pin ${kind}`, href: url, target: '_blank', rel: 'noopener noreferrer',
    title: PIN_TITLES[kind], 'aria-label': PIN_TITLES[kind], onclick: (e) => e.stopPropagation(),
    onkeydown: (e) => e.stopPropagation() }, '📍');
}

function itemRow(it, showHint = true) {
  const st = status(it);
  const urg = st === 'offen' ? urgency(it, missions, nextIdx()) : 'normal';
  const done = st === 'erledigt';
  const hint = st === 'verpasst' ? 'Verpasst' : showHint ? HINTS[urg] : '';
  const unsure = it.confidence === 'umstritten';
  const goal = goalMatch(it, 'any');
  const row = h('div', { class: `row card ${urg === 'normal' ? '' : urg} ${done ? 'done' : ''}`, role: 'button', tabindex: 0,
      onclick: () => { if (!row.dataset.swiped) showDetail(it.id); },
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
      (hint || unsure || goal) && h('div', { class: 'meta' },
        [hint, unsure && 'Quellen unsicher', goal && '🏆 Trophäe/100 %'].filter(Boolean).join(' · '))),
    pinLink(it));
  addSwipe(row, {
    right: () => { if (st !== 'verpasst') setDone(it.id, !done); },
    left: () => showDetail(it.id),
  });
  return row;
}

/** Wischen: nach rechts = abhaken, nach links = Details. Senkrechtes Scrollen bleibt frei. */
function addSwipe(el, { right, left }) {
  const LIMIT = 70;
  let x0 = 0; let y0 = 0; let pid = null; let mode = null; let dx = 0;
  const reset = () => { el.style.transform = ''; el.classList.remove('swiping', 'sw-right', 'sw-left'); };
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || e.target.closest('a, .check')) return;
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
    dx = Math.max(-120, Math.min(120, mx));
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
    if (e.type === 'pointerup') {
      if (dx > LIMIT) { if (!reducedMotion() && navigator.vibrate) navigator.vibrate(15); right(); }
      else if (dx < -LIMIT) left();
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

/* ---------- Tab: Aufgaben ---------- */

function helpCard() {
  return h('div', { class: 'help card' },
    h('h2', {}, 'So geht’s'),
    h('ol', {},
      h('li', {}, 'Oben steht, welche Mission im Spiel als Nächstes kommt.'),
      h('li', {}, 'Darunter stehen Dinge, die du vorher erledigen solltest. Danach sind sie weg.'),
      h('li', {}, 'Erledigt? Tippe das Kästchen an – oder wische die Aufgabe nach rechts.'),
      h('li', {}, 'Mission gespielt? Tippe unten auf „Weiter“.')),
    h('button', { class: 'block', onclick: () => save({ ...state, settings: { ...state.settings, helpSeen: true } }) }, 'Verstanden'));
}

function viewNow() {
  const next = nextIdx();
  const root = h('div');
  if (next >= missions.length) {
    root.append(h('section', { class: 'hero' }, h('div', { class: 'name' }, 'Story abgeschlossen 🎉')));
    root.append(h('button', { class: 'link', onclick: undoMission }, 'Letzte Mission rückgängig machen'));
    return root;
  }
  const m = missions[next];
  const list = openNow(items, state, missions);
  const reds = redItems(items, state, missions);
  const shown = list.filter((it) => urgency(it, missions, next) === 'rot');
  const more = list.filter((it) => urgency(it, missions, next) !== 'rot');

  if (!state.settings.helpSeen) root.append(helpCard());

  root.append(h('section', { class: 'hero' },
    h('div', { class: 'label' }, 'Im Spiel als Nächstes'),
    h('div', { class: 'name' }, mName(m)),
    mAlt(m) && h('div', { class: 'alt' }, `Englisch: ${mAlt(m)}`),
    h('div', { class: 'meta' }, `${chapterLabel(m.chapter)} · ${m.step ? 'Story-Aufgabe' : 'Mission'} ${m.order} von ${missions.length}`),
    m.note && h('div', { class: 'meta' }, m.note),
    m.orderNote && h('div', { class: 'meta' }, `ℹ ${m.orderNote}`),
    h('button', { class: 'ahead', onclick: () => showAhead(next) }, 'Schon weiter im Spiel? →')));

  if (m.pointOfNoReturn) {
    root.append(h('div', { class: 'banner', role: 'alert' },
      h('h2', {}, '⚠ Danach gibt es kein Zurück'),
      h('p', {}, 'Erledige die Dinge unten und speichere in einem eigenen Slot.'),
      h('details', {}, h('summary', {}, 'Was geht verloren?'), h('p', {}, m.ponrNote))));
  } else if (missions[next + 1]?.pointOfNoReturn) {
    root.append(h('div', { class: 'banner soft' },
      h('h2', {}, 'Danach kommt ein Point of no Return'),
      h('p', {}, 'Speichere jetzt in einem eigenen Slot und erledige alles Wichtige.')));
  }

  if (showMoneyHint(next)) root.append(moneyCard(true));

  if (shown.length) {
    root.append(h('h2', {}, `Vor dieser Mission erledigen (${shown.length})`));
    shown.forEach((it) => root.append(itemRow(it, false)));
  } else {
    root.append(h('div', { class: 'allgood card' }, '✓ Vor dieser Mission ist nichts mehr zu tun. Viel Spaß!'));
  }
  if (more.length) {
    root.append(h('details', { class: 'more' }, h('summary', {}, `Für später (${more.length})`), more.map((it) => itemRow(it, false))));
  }
  if (state.lastCompletedMissionId) {
    root.append(h('button', { class: 'link', onclick: undoMission }, 'Letzte Mission rückgängig machen'));
  }
  root.append(h('div', { class: 'cta' },
    h('button', { class: 'primary block', onclick: () => completeMission(reds) }, `„${mName(m)}“ gespielt – weiter ✓`)));
  return root;
}

async function completeMission(reds) {
  const next = nextIdx();
  const m = missions[next];
  if (!m) return;
  if (reds.length || m.pointOfNoReturn) {
    const gate = m.pointOfNoReturn ? h('input', { type: 'checkbox' }) : null;
    const ok = await confirmDialog(m.pointOfNoReturn ? '⚠ Point of no Return' : 'Noch nicht erledigt', [
      reds.length && h('p', {}, `${reds.length === 1 ? 'Diese Aufgabe ist' : `Diese ${reds.length} Aufgaben sind`} danach weg:`),
      reds.length && h('ul', {}, reds.map((it) => h('li', {}, it.title))),
      m.pointOfNoReturn && h('div', { class: 'unsure' }, h('strong', {}, 'Kein Zurück: '), m.ponrNote || 'Danach geht einiges verloren.'),
      gate && h('label', { class: 'gate' }, gate, h('span', {}, 'Ich habe in einem eigenen Slot gespeichert.')),
    ], reds.length ? 'Trotzdem weiter' : 'Weiter', gate);
    if (!ok) return;
  }
  setProgress(m.id, `„${mName(m)}“ abgeschlossen`);
}

function undoMission() {
  const i = nextIdx() - 1;
  setProgress(i > 0 ? missions[i - 1].id : null, 'Letzte Mission zurückgenommen');
}

/* ---------- Geld vor Kapitelende ---------- */

const CH1_END = 'tourist-trap';
const fmt = (n) => `${n.toLocaleString('de-DE')} $`;

/** Geld-Hinweis kurz vor dem Ende von Kapitel 1 (dort verfällt Bargeld). */
function showMoneyHint(next) {
  const end = missions.findIndex((m) => m.id === CH1_END);
  return end >= 0 && (next === end || next === end - 1);
}

function moneyCard(compact) {
  const out = h('div', { class: 'money-out', 'aria-live': 'polite' });
  const update = () => {
    const p = moneyPlan(moneyInputs);
    const lines = [];
    if (p.toSavings > 0) {
      if (p.depositCash > 0) lines.push(`1. ${fmt(p.depositCash)} Bargeld am ATM aufs Girokonto einzahlen.`);
      lines.push(`${p.depositCash > 0 ? '2' : '1'}. In BuckMe unter „Buck Yourself“ ${fmt(p.toSavings)} ins Family Savings schieben.`);
    }
    if (p.spend > 0) lines.push(`${lines.length + 1}. Die restlichen ${fmt(p.spend)} ausgeben – z. B. Waffen bei Ammu-Nation, die bleiben.`);
    if (!lines.length) lines.push('Trag oben deine Beträge ein.');
    out.replaceChildren(
      h('ol', {}, lines.map((l) => h('li', {}, l.replace(/^\d+\. /, '')))),
      h('p', { class: 'meta' }, p.full
        ? `Family Savings ist dann voll (${fmt(FAMILY_SAVINGS_CAP)}) – nur das nimmst du mit.`
        : `Du nimmst ${fmt(p.kept)} mit. Mehr als ${fmt(FAMILY_SAVINGS_CAP)} passen nicht ins Family Savings.`));
  };
  const field = (k, label) => h('label', { class: 'money-field' }, h('span', {}, label),
    h('input', { type: 'text', inputmode: 'numeric', placeholder: '0', value: moneyInputs[k],
      oninput: (e) => { moneyInputs = { ...moneyInputs, [k]: e.target.value }; update(); } }));
  update();
  return h(compact ? 'details' : 'div', { class: 'money card' },
    h(compact ? 'summary' : 'h2', {}, '💰 Geld vor dem Kapitelende retten'),
    h('p', { class: 'meta' }, 'Am Ende von Kapitel 1 verfallen Bargeld, Girokonto und Bodenversteck. Nur das Family Savings (ab „Buck Me“) bleibt, höchstens 5.000 $.'),
    h('div', { class: 'money-grid' },
      field('cash', 'Bargeld'), field('checking', 'Girokonto'), field('savings', 'Schon im Family Savings')),
    out);
}

/* ---------- Tab: Missionen ---------- */

function viewMissions() {
  const next = nextIdx();
  const cur = missions[Math.min(next, missions.length - 1)];
  const root = h('div', {}, h('h1', {}, 'Missionen'),
    h('div', { class: 'seg', role: 'tablist' },
      [['story', 'Story'], ['side', `Nebenmissionen${sideMissions.length ? ` (${sideDoneCount()}/${sideMissions.length})` : ''}`]].map(([v, t]) =>
        h('button', { role: 'tab', 'aria-selected': missionMode === v, class: missionMode === v ? 'active' : '',
          onclick: () => { missionMode = v; animateNext = true; render(); } }, t))),
    missionMode === 'story' && h('p', { class: 'muted small' }, 'Tippe eine Mission an, um deinen Fortschritt zu setzen.'),
    h('input', { type: 'search', id: 'mq', placeholder: 'Mission suchen (deutsch oder englisch) …', value: missionQuery,
      oninput: (e) => { missionQuery = e.target.value; render(); const q = document.getElementById('mq'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }));
  const q = norm(missionQuery);
  if (missionMode === 'side') { root.append(viewSide(q, cur)); return root; }
  if (q) {
    const hits = missions.map((m, i) => [m, i]).filter(([m]) => norm(`${m.nameDe || ''} ${m.name} ${m.id}`).includes(q));
    if (!hits.length) root.append(h('p', { class: 'muted' }, 'Keine Mission gefunden.'));
    hits.forEach(([m, i]) => root.append(missionRow(m, i, next, true)));
    return root;
  }
  const byChapter = new Map();
  missions.forEach((m, i) => byChapter.set(m.chapter, [...(byChapter.get(m.chapter) || []), [m, i]]));
  for (const [chapter, entries] of byChapter) {
    const future = state.settings.spoilerProtection && chapter > cur.chapter;
    root.append(h('details', { class: 'chap', open: chapter === cur.chapter },
      h('summary', {}, chapterLabel(chapter), future || chapter === 0 ? '' : ` · ${chapters[chapter] || ''}`),
      entries.map(([m, i]) => missionRow(m, i, next))));
  }
  root.append(h('button', { class: 'link', onclick: () => setProgress(null, 'Fortschritt auf Anfang gesetzt') }, 'Fortschritt auf Anfang setzen'));
  return root;
}

const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const sideDone = (x) => !!(state.doneSide[x.id] || (x.item && state.doneItems[x.item]));
const sideDoneCount = () => sideMissions.filter(sideDone).length;

/** Nebenmission abhaken; verknüpfte Checklisten-Aufgabe wird mitgezogen. */
function toggleSide(x) {
  const prev = state;
  const done = sideDone(x);
  const doneSide = { ...state.doneSide };
  const doneItems = { ...state.doneItems };
  if (done) { delete doneSide[x.id]; if (x.item) delete doneItems[x.item]; } else { doneSide[x.id] = true; if (x.item) doneItems[x.item] = true; }
  save({ ...state, doneSide, doneItems });
  snack(`${done ? 'Wieder offen' : 'Erledigt'}: ${x.nameDe}`, undoTo(prev));
}

const SIDE_KINDS = [['all', 'Alle'], ['optional', 'Optional'], ['stranger', 'Fremde & Freaks'], ['open', 'Nur offene']];

function viewSide(q, cur) {
  const root = h('div');
  root.append(h('div', { class: 'chips' }, SIDE_KINDS.map(([v, t]) =>
    h('button', { class: `chip ${sideFilter === v ? 'active' : ''}`, onclick: () => { sideFilter = v; render(); } }, t))));
  let list = sideMissions.filter((x) => (sideFilter === 'all' || sideFilter === 'open' || x.kind === sideFilter)
    && (sideFilter !== 'open' || !sideDone(x))
    && (!q || norm(`${x.nameDe} ${x.name} ${x.giver || ''}`).includes(q)));
  if (!list.length) { root.append(h('p', { class: 'muted' }, sideMissions.length ? 'Keine Nebenmission gefunden.' : 'Nebenmissionen konnten nicht geladen werden.')); return root; }
  if (q) { list.forEach((x) => root.append(sideRow(x, cur, true))); return root; }

  const section = (title, entries, groupBy, labelOf, openKey) => {
    if (!entries.length) return;
    root.append(h('h2', {}, `${title} (${entries.filter((x) => sideDone(x)).length}/${entries.length})`));
    const groups = new Map();
    entries.forEach((x) => { const k = groupBy(x); groups.set(k, [...(groups.get(k) || []), x]); });
    for (const [k, xs] of groups) {
      const done = xs.filter((x) => sideDone(x)).length;
      root.append(h('details', { class: 'chap', open: openKey(k, xs) },
        h('summary', {}, labelOf(k, xs), h('span', { class: 'count' }, ` ${done}/${xs.length}`)),
        xs.map((x) => sideRow(x, cur))));
    }
  };
  const chap = (x) => sideChapter(x, missions) ?? 99;
  const byChapter = (a, b) => chap(a) - chap(b);
  const chapLabel = (c) => (c === 99 ? 'Kapitel unbekannt' : chapterLabel(c));
  const curOpen = (c) => c === cur.chapter;
  section('Optionale Missionen', list.filter((x) => x.kind === 'optional').sort(byChapter), chap, chapLabel, curOpen);
  section('Fremde & Freaks', list.filter((x) => x.kind === 'stranger').sort((a, b) => byChapter(a, b) || (a.giver || '').localeCompare(b.giver || '')),
    (x) => x.giver || 'Sonstige', (k, xs) => {
      const c = Math.min(...xs.map(chap));
      const hide = state.settings.spoilerProtection && c !== 99 && c > cur.chapter;
      return [hide ? '???' : k, c !== 99 ? ` · ab ${chapLabel(c)}` : ''].join('');
    }, (k, xs) => xs.some((x) => chap(x) === cur.chapter && !sideDone(x)));
  return root;
}

function sideRow(x, cur, searched = false) {
  const c = sideChapter(x, missions);
  const done = sideDone(x);
  const hidden = !searched && state.settings.spoilerProtection && c != null && c > cur.chapter && !revealed.has(`s:${x.id}`);
  const locked = !sideUnlocked(x, missions, nextIdx());
  const after = missions.find((m) => m.id === x.after);
  const meta = [
    searched && c != null && chapterLabel(c),
    x.kind === 'stranger' && x.giver,
    after && `nach „${mName(after)}“`,
    x.missable && '⚠ verpassbar',
    locked && !done && 'noch nicht frei',
  ].filter(Boolean).join(' · ');
  const toggle = () => toggleSide(x);
  const row = h('div', { class: `row card side ${x.missable && !done ? 'orange' : ''} ${done ? 'done' : ''}`, role: 'button', tabindex: 0,
      onclick: () => { if (row.dataset.swiped) return; if (hidden) { revealed.add(`s:${x.id}`); render(); return; } showSide(x); },
      onkeydown: (e) => { if (e.key === 'Enter') showSide(x); } },
    h('div', { class: 'check', role: 'checkbox', 'aria-checked': done, 'aria-label': 'Erledigt',
      onclick: (e) => { e.stopPropagation(); if (!done) { const r = e.currentTarget.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2); } toggle(); } }, done ? '✓' : ''),
    h('div', { class: 'body' },
      h('div', { class: `title ${hidden ? 'blur' : ''}` }, x.nameDe),
      x.name !== x.nameDe && h('div', { class: `alt ${hidden ? 'blur' : ''}` }, x.name),
      meta && h('div', { class: 'meta' }, meta)));
  addSwipe(row, { right: toggle, left: () => showSide(x) });
  return row;
}

function showSide(x) {
  const c = sideChapter(x, missions);
  const after = missions.find((m) => m.id === x.after);
  const done = sideDone(x);
  const link = safeHttpsUrl(x.url);
  openDialog(
    h('h1', {}, x.nameDe),
    x.name !== x.nameDe && h('p', { class: 'alt' }, `Englisch: ${x.name}`),
    x.description && h('p', {}, x.description),
    h('div', { class: 'when' },
      h('div', {}, { optional: 'Optionale Mission', stranger: `Fremde & Freaks${x.giver ? ` · ${x.giver}` : ''}`, step: 'Story-Aufgabe' }[x.kind]),
      c != null && h('div', {}, chapterLabel(c)),
      after && h('div', {}, `Erscheint nach „${mName(after)}“`)),
    x.missable && h('div', { class: 'unsure' }, h('strong', {}, '⚠ Verpassbar: '), 'Diese Mission kann später nicht mehr gespielt werden. Erledige sie, sobald sie auftaucht.'),
    h('div', { class: 'actions' },
      h('button', { class: 'primary', onclick: () => { closeDialog(); toggleSide(x); } },
        done ? 'Doch nicht erledigt' : 'Erledigt ✓'),
      h('button', { onclick: closeDialog }, 'Schließen')),
    link && h('p', { class: 'small' }, h('a', { href: link, target: '_blank', rel: 'noopener noreferrer' }, 'Komplettlösung auf GTABase')));
}

function missionRow(m, i, next, searched = false) {
  const isDone = i < next;
  // Gezielt gesuchte Missionen sind kein Spoiler – dann nicht verwischen.
  const hidden = !searched && state.settings.spoilerProtection && i > next && !revealed.has(`m:${m.id}`);
  const meta = [searched && chapterLabel(m.chapter), m.step && 'Story-Aufgabe', i === next && 'Als Nächstes', m.pointOfNoReturn && '⚠ Point of no Return'].filter(Boolean).join(' · ');
  return h('button', { class: `row card ${m.pointOfNoReturn ? 'rot' : ''} ${isDone ? 'done' : ''} ${i === next ? 'current' : ''}`,
      onclick: () => { if (hidden) { revealed.add(`m:${m.id}`); render(); return; } chooseProgress(m, i); } },
    h('div', { class: 'check' }, isDone ? '✓' : ''),
    h('div', { class: 'body' },
      h('div', { class: `title ${hidden ? 'blur' : ''}` }, mName(m)),
      mAlt(m) && h('div', { class: `alt ${hidden ? 'blur' : ''}` }, mAlt(m)),
      meta && h('div', { class: 'meta' }, meta)));
}

/** Die nächsten Missionen ohne Unschärfe zeigen – du wählst, welche du gerade spielst. */
function showAhead(next) {
  const upcoming = missions.slice(next + 1, next + 11);
  openDialog(
    h('h1', {}, 'Welche spielst du gerade?'),
    h('p', { class: 'meta' }, 'Alle Missionen davor gelten dann als gespielt. Aufgaben, die dabei verloren gegangen wären, werden als verpasst gezeigt – das kannst du rückgängig machen.'),
    h('div', { class: 'choice' }, upcoming.map((m) => {
      const i = missions.indexOf(m);
      return h('button', { class: 'block ahead-item', onclick: () => {
        closeDialog();
        setProgress(missions[i - 1].id, `Du spielst gerade „${mName(m)}“`);
      } }, h('b', {}, mName(m)), mAlt(m) && h('span', { class: 'alt' }, ` · ${mAlt(m)}`),
        h('span', { class: 'meta' }, ` · ${chapterLabel(m.chapter)}${m.step ? ' · Story-Aufgabe' : ''}`));
    })),
    h('button', { class: 'block link', onclick: closeDialog }, 'Abbrechen'));
}

/** Fortschritt auf eine Mission setzen: schon gespielt oder spiele ich gerade. */
function chooseProgress(m, i) {
  const prev = i > 0 ? missions[i - 1] : null;
  openDialog(
    h('h1', {}, mName(m)),
    mAlt(m) && h('p', { class: 'alt' }, `Englisch: ${mAlt(m)}`),
    h('div', { class: 'choice' },
      h('button', { class: 'primary block', onclick: () => { closeDialog(); missionQuery = ''; setProgress(prev ? prev.id : null, `Du spielst gerade „${mName(m)}“`); tab = 'now'; render(); } },
        'Spiele ich gerade'),
      h('button', { class: 'block', onclick: () => { closeDialog(); missionQuery = ''; setProgress(m.id, `„${mName(m)}“ als gespielt eingetragen`); } },
        'Schon gespielt ✓'),
      h('button', { class: 'block link', onclick: closeDialog }, 'Abbrechen')));
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
        sel('category', CATEGORIES.map((c) => [c, c]), 'Kategorie'),
        sel('goal', [['any', 'Trophäe oder 100 %'], ['trophy', 'Nur Trophäen'], ['completion', 'Nur 100 %']], 'Alle Ziele')),
      h('p', { class: 'meta' }, '🏆 = zählt für Trophäen oder 100 %, auch wenn sich die Quellen nur teilweise einig sind.')));
  const q = filters.q.trim().toLowerCase();
  const list = items.filter((it) =>
    (!filters.chapter || String(itemChapter(it, missions)) === filters.chapter)
    && (!filters.category || it.category === filters.category)
    && (!filters.goal || goalMatch(it, filters.goal))
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
  if (from) parts.push(`Verfügbar ab: nach „${mName(from)}“`);
  parts.push(lost
    ? `Geht verloren: ${it.lostAt.when === 'start' ? `sobald „${mName(lost)}“ startet` : `nach „${mName(lost)}“`}`
    : 'Geht verloren: Zeitpunkt nicht bekannt');
  return parts;
}

function showDetail(id) {
  const it = items.find((x) => x.id === id);
  if (!it) return;
  const st = status(it);
  const target = mapTarget(it, state);
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
    h('a', { class: 'map-link', href: target.url, target: '_blank', rel: 'noopener noreferrer' },
      h('button', { class: 'block' }, target.kind === 'marker' ? '📍 Ort auf der Karte zeigen' : '📍 Auf der Karte suchen')),
    h('details', { class: 'more' }, h('summary', {}, 'Mehr Infos'),
      h('p', {}, h('strong', {}, 'Ort: '), it.location || '–'),
      h('p', {}, h('strong', {}, 'Kategorie: '), it.category, ' · ', it.importance),
      h('p', {}, h('strong', {}, 'Trophäe: '), yesNo(it.trophy), ' · ', h('strong', {}, '100 %: '), yesNo(it.completion100)),
      it.confidence !== 'umstritten' && it.note && h('p', {}, h('strong', {}, 'Hinweis: '), it.note),
      h('p', { class: 'small' }, h('strong', {}, 'Quellen: '),
        it.sources.map((s) => { const u = safeHttpsUrl(s); return u ? h('div', {}, h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, new URL(u).hostname)) : null; })),
      h('p', { class: 'meta' }, {
        marker: state.gtabaseUrls[id] ? 'Dein eigener Marker-Link ist gespeichert.' : 'Zeigt den Ort direkt auf der GTABase-Karte.',
        category: 'Zeigt alle Orte dieser Art auf der Karte. Genauen Punkt speichern: auf GTABase den Marker antippen, „Link kopieren“ und unten einfügen.',
        map: 'Kein genauer Ort bekannt. Genauen Punkt speichern: auf GTABase den Marker antippen, „Link kopieren“ und unten einfügen.',
      }[target.kind]),
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
    h('h2', {}, 'Auf anderes Gerät übertragen'),
    shareCard(),
    h('h2', {}, 'Werkzeuge'),
    moneyCard(true),
    h('h2', {}, 'Sicherung'),
    h('button', { class: 'block', onclick: exportJson }, 'Fortschritt exportieren (JSON)'),
    h('button', { class: 'block', style: 'margin-top:8px', onclick: () => fileInput.click() }, 'Fortschritt importieren'),
    fileInput,
    h('button', { class: 'block danger', style: 'margin-top:8px', onclick: resetAll }, 'Alles zurücksetzen'),
    h('p', { class: 'muted small', style: 'margin-top:20px' },
      'Privates Fan-Tool, nicht mit Rockstar verbunden. Kein Zugriff auf Spielstände – der Fortschritt ist, was du hier einträgst. Daten aus Guides, siehe Quellen je Eintrag.'));
}

const shareLink = () => `${location.origin}${location.pathname}#import=${encodeShare(state)}`;

function shareCard() {
  const qrBox = h('div', { class: 'qr-box' });
  return h('div', { class: 'card share' },
    h('p', { class: 'meta' }, 'Öffne den Link oder scanne den QR-Code auf dem anderen Gerät. Dort wird dein Stand nach einer Rückfrage übernommen.'),
    h('div', { class: 'actions' },
      h('button', { class: 'primary', onclick: shareProgress }, 'Link teilen'),
      h('button', { onclick: async () => {
        if (qrBox.firstChild) { qrBox.replaceChildren(); return; }
        try { qrBox.replaceChildren(await qrSvg(shareLink())); } catch { toast('QR-Code konnte nicht erstellt werden.'); }
      } }, 'QR-Code')),
    qrBox);
}

async function shareProgress() {
  const url = shareLink();
  try {
    if (navigator.share) { await navigator.share({ title: 'GTA 6 Checkliste – mein Stand', url }); return; }
    await navigator.clipboard.writeText(url);
    toast('Link kopiert.');
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

/** Link mit #import=… öffnet: nach Rückfrage Stand übernehmen. */
async function importFromHash() {
  const m = location.hash.match(/^#import=([A-Za-z0-9_-]+)$/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  let incoming;
  try { incoming = decodeShare(m[1], missions); } catch { toast('Der Link enthält keinen gültigen Fortschritt.'); return; }
  const last = missions.find((x) => x.id === incoming.lastCompletedMissionId);
  const ok = await confirmDialog('Fortschritt übernehmen?', [
    h('p', {}, `Zuletzt gespielt: ${last ? `„${mName(last)}“` : 'noch nichts'} · ${Object.keys(incoming.doneItems).length} Aufgaben erledigt.`),
    h('p', { class: 'meta' }, 'Dein bisheriger Stand auf diesem Gerät wird ersetzt.'),
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
  document.body.classList.toggle('tab-now', tab === 'now');
}

async function init() {
  try {
    const [m, i, c] = await Promise.all(['missions', 'items', 'chapters'].map((n) => fetch(`data/${n}.json`).then((r) => {
      if (!r.ok) throw new Error(`${n}.json: ${r.status}`);
      return r.json();
    })));
    missions = m; items = i; chapters = c;
    sideMissions = await fetch('data/sidemissions.json').then((r) => (r.ok ? r.json() : [])).catch(() => []);
  } catch (err) {
    document.getElementById('view').replaceChildren(h('p', {}, `Daten konnten nicht geladen werden: ${err.message}`));
    return;
  }
  state = loadState();
  document.getElementById('tabs').addEventListener('click', (e) => {
    const t = e.target.closest('button')?.dataset.tab;
    if (t) {
      tab = t; animateNext = true; window.scrollTo(0, 0); render();
      // In „Missionen“ direkt zur aktuellen Mission springen.
      if (t === 'missions') document.querySelector('.row.current')?.scrollIntoView({ block: 'center' });
    }
  });
  render();
  importFromHash();
  window.addEventListener('hashchange', importFromHash);
  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) snack('Neue Version geladen.', { label: 'Neu laden', run: () => location.reload() });
    });
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
