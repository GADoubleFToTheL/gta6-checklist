// Eigene Illustrationen (keine fremden Bilder): Szenen für den Kopfbereich und Bilder zu jeder Mission.
// Alles wird als SVG aus einfachen Formen gebaut – im Stil eines ruhigen Abendhimmels über Leonida.

const NS = 'http://www.w3.org/2000/svg';
let uidCounter = 0;
const uid = (p) => `${p}${++uidCounter}`;

/** SVG-Element bauen (Text nur als Textknoten, nie als HTML). */
function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) el.setAttribute(k, v);
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const g = (attrs, ...kids) => s('g', attrs, ...kids);

/** Kleiner, fester Zufall (gleiches Bild bei jedem Aufruf). */
function rng(seedText) {
  let h = 2166136261;
  for (const ch of String(seedText)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
}

/* ---------- Farben je Tageszeit (aus der Dämmerungs-Palette abgeleitet) ---------- */

export const TIMES = {
  dusk: {
    sky: ['#473875', '#5d5398', '#8277bf', '#b285ca', '#f69ac9', '#f89fc2'],
    sun: '#fde4d6', glow: '#f89fc2', far: '#a48cc8', far2: '#8d78bc', mid: '#6b589f', near: '#4a3b7d', deep: '#33295c',
    water: ['#9a86c9', '#6a58a2', '#3f3274'], ground: '#3a2e68', light: '#fcf0d8', lightOn: 0.35,
    neon: '#ff8fc4', neon2: '#8ee6dc', facade: ['#e6b3c6', '#b9b2e3', '#f0c9b8', '#c6a9de'], shade: 0.42, stars: false,
  },
  night: {
    sky: ['#0f0b1d', '#191335', '#271f4f', '#3a2f6b', '#5a4589', '#6f4f8f'],
    sun: '#efe9ff', glow: '#7c6bc9', far: '#3a3070', far2: '#30285f', mid: '#251e4c', near: '#1a153a', deep: '#120e29',
    water: ['#2b2461', '#1b1641', '#100c26'], ground: '#151030', light: '#ffd9a8', lightOn: 0.7,
    neon: '#ff6fb5', neon2: '#6ff2e2', facade: ['#7a5d97', '#5e5a99', '#8a6a8f', '#6a5a9a'], shade: 0.15, stars: true,
  },
  day: {
    sky: ['#6278c0', '#7d93d3', '#a3abe0', '#c8bde6', '#f2cad9', '#fbdcd6'],
    sun: '#fff6ea', glow: '#ffe3d6', far: '#b7aee0', far2: '#a196d3', mid: '#8573bd', near: '#655399', deep: '#4c3f80',
    water: ['#a9b3e8', '#7b7fc4', '#585aa0'], ground: '#54478a', light: '#fcf0d8', lightOn: 0.1,
    neon: '#f69ac9', neon2: '#8ee6dc', facade: ['#f2c4d4', '#c9c4ef', '#f6d6c4', '#d6bce9'], shade: 0.62, stars: false,
  },
};

/** Farbe mischen (für Schatten/Ferne). */
function mix(a, b, t) {
  const full = (c) => (c.length === 4 ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}` : c);
  const p = (c) => [1, 3, 5].map((i) => parseInt(full(c).slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

/* ---------- Grundbausteine ---------- */

function defsSky(defs, T, id) {
  defs.append(s('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 },
    T.sky.map((c, i) => s('stop', { offset: i / (T.sky.length - 1), 'stop-color': c }))));
}

function sky(defs, T, w, h, horizon) {
  const id = uid('sky');
  defsSky(defs, T, id);
  const glowId = uid('glow');
  defs.append(s('radialGradient', { id: glowId, cx: 0.5, cy: 0.5, r: 0.5 },
    s('stop', { offset: 0, 'stop-color': T.glow, 'stop-opacity': 0.75 }),
    s('stop', { offset: 1, 'stop-color': T.glow, 'stop-opacity': 0 })));
  const out = g({}, s('rect', { width: w, height: horizon + 2, fill: `url(#${id})` }));
  if (T.stars) {
    const r = rng(`stars${w}`);
    for (let i = 0; i < 40; i++) out.append(s('circle', { cx: r() * w, cy: r() * horizon * 0.7, r: r() * 0.9 + 0.3, fill: '#fff', opacity: 0.3 + r() * 0.5, class: i % 5 ? null : 'twinkle' }));
  }
  return { node: out, glowId };
}

function sun(T, glowId, x, y, r) {
  return g({ class: 'sun' },
    s('circle', { cx: x, cy: y, r: r * 3.2, fill: `url(#${glowId})` }),
    s('circle', { cx: x, cy: y, r, fill: T.sun, opacity: T.stars ? 0.9 : 0.95 }));
}

function streaks(T, w, y, cls) {
  const c = mix(T.sky[3], '#ffffff', 0.18);
  return g({ class: cls, opacity: 0.45, fill: c },
    s('rect', { x: w * 0.05, y, width: w * 0.42, height: 2.2, rx: 1.1 }),
    s('rect', { x: w * 0.5, y: y - 14, width: w * 0.32, height: 1.8, rx: 0.9 }),
    s('rect', { x: w * 0.28, y: y + 11, width: w * 0.26, height: 1.4, rx: 0.7 }));
}

/** Flache Wolkenbank, Unterseite von der tiefen Sonne angestrahlt. */
function stratus(T, x, y, w, h, op = 0.75) {
  const body = mix(T.sky[2], T.sky[1], 0.25);
  const d = `M${x} ${y} C${x + w * 0.12} ${y - h * 0.9} ${x + w * 0.28} ${y - h * 0.3} ${x + w * 0.42} ${y - h * 0.85} C${x + w * 0.56} ${y - h * 1.35} ${x + w * 0.74} ${y - h * 0.45} ${x + w * 0.86} ${y - h * 0.7} C${x + w * 0.94} ${y - h * 0.9} ${x + w} ${y - h * 0.3} ${x + w} ${y} Z`;
  return g({ opacity: op },
    s('path', { d, fill: body }),
    s('rect', { x: x + w * 0.04, y: y - 1.6, width: w * 0.92, height: 2.6, rx: 1.3, fill: mix(T.glow, '#ffffff', 0.2), opacity: T.stars ? 0.25 : 0.75 }));
}

/** Dunst über dem Horizont. */
function haze(defs, T, w, horizon) {
  const id = uid('haze');
  defs.append(s('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 },
    s('stop', { offset: 0, 'stop-color': T.glow, 'stop-opacity': 0 }),
    s('stop', { offset: 0.7, 'stop-color': T.glow, 'stop-opacity': T.stars ? 0.12 : 0.3 }),
    s('stop', { offset: 1, 'stop-color': T.glow, 'stop-opacity': 0 })));
  return s('rect', { x: 0, y: horizon - 34, width: w, height: 40, fill: `url(#${id})` });
}

/** Straßenlaterne mit Lichtschein. */
function lamp(defs, T, x, yBase, h) {
  const id = uid('lamp');
  defs.append(s('radialGradient', { id, cx: 0.5, cy: 0.5, r: 0.5 },
    s('stop', { offset: 0, 'stop-color': T.light, 'stop-opacity': 0.55 + T.lightOn * 0.3 }), s('stop', { offset: 1, 'stop-color': T.light, 'stop-opacity': 0 })));
  return g({},
    s('rect', { x: x - 0.9, y: yBase - h, width: 1.8, height: h, fill: T.deep }),
    s('path', { d: `M${x} ${yBase - h} q0 -5 7 -5`, fill: 'none', stroke: T.deep, 'stroke-width': 1.6 }),
    s('rect', { x: x + 5, y: yBase - h - 6.5, width: 6, height: 2.4, rx: 1, fill: T.deep }),
    T.lightOn > 0.2 && s('circle', { cx: x + 8, cy: yBase - h - 3, r: 14, fill: `url(#${id})` }),
    s('circle', { cx: x + 8, cy: yBase - h - 4, r: 1.3, fill: T.light, opacity: 0.5 + T.lightOn * 0.5 }));
}

/** Rettungsschwimmer-Turm (typisch Strand). */
function lifeguard(T, x, yBase, sc = 1) {
  const c = mix(T.facade[(x | 0) % 4], T.deep, T.shade * 0.8);
  return g({},
    s('path', { d: `M${x - 9 * sc} ${yBase} L${x - 6 * sc} ${yBase - 14 * sc} M${x + 9 * sc} ${yBase} L${x + 6 * sc} ${yBase - 14 * sc}`, stroke: T.deep, 'stroke-width': 1.6 * sc }),
    s('path', { d: `M${x - 12 * sc} ${yBase - 6 * sc} L${x - 2 * sc} ${yBase - 14 * sc}`, stroke: T.deep, 'stroke-width': 1.2 * sc }),
    s('rect', { x: x - 10 * sc, y: yBase - 26 * sc, width: 20 * sc, height: 12 * sc, fill: c }),
    s('polygon', { points: `${x - 13 * sc},${yBase - 26 * sc} ${x},${yBase - 33 * sc} ${x + 13 * sc},${yBase - 26 * sc}`, fill: mix(c, '#000000', 0.25) }),
    s('rect', { x: x - 6 * sc, y: yBase - 23 * sc, width: 12 * sc, height: 5 * sc, fill: T.light, opacity: 0.35 + T.lightOn * 0.4 }),
    s('path', { d: `M${x} ${yBase - 33 * sc} v-9 l7 2.5 l-7 2.5`, fill: T.neon, stroke: T.deep, 'stroke-width': 0.6 }));
}

function umbrella(T, x, yBase, c) {
  return g({}, s('rect', { x: x - 0.6, y: yBase - 13, width: 1.2, height: 13, fill: T.deep }),
    s('path', { d: `M${x - 11} ${yBase - 12} Q${x} ${yBase - 22} ${x + 11} ${yBase - 12}Z`, fill: c }),
    s('path', { d: `M${x - 11} ${yBase - 12} Q${x - 4} ${yBase - 20} ${x} ${yBase - 21} L${x} ${yBase - 12}Z`, fill: mix(c, '#ffffff', 0.25) }));
}

function sailboat(T, x, y, sc = 1) {
  return g({ opacity: 0.85 },
    s('path', { d: `M${x - 8 * sc} ${y} L${x + 8 * sc} ${y} L${x + 6 * sc} ${y + 2.5 * sc} L${x - 6 * sc} ${y + 2.5 * sc}Z`, fill: T.far2 }),
    s('path', { d: `M${x} ${y - 1} L${x} ${y - 16 * sc} L${x + 7 * sc} ${y - 1}Z`, fill: mix(T.light, T.sky[3], 0.45) }),
    s('path', { d: `M${x - 1} ${y - 1} L${x - 1} ${y - 12 * sc} L${x - 6 * sc} ${y - 1}Z`, fill: mix(T.light, T.sky[3], 0.6) }));
}

function lilyPads(T, x, y, w, seed) {
  const r = rng(`lily${seed}`);
  const out = g({});
  for (let i = 0; i < w / 14; i++) {
    const cx = x + r() * w; const cy = y + r() * 10;
    out.append(s('ellipse', { cx, cy, rx: 4 + r() * 3, ry: 1.4 + r(), fill: mix('#5f8f6e', T.deep, 0.45) }));
    if (r() < 0.25) out.append(s('circle', { cx: cx + 1, cy: cy - 1.2, r: 1.2, fill: T.neon, opacity: 0.85 }));
  }
  return out;
}

function fireflies(T, w, y0, y1, seed) {
  if (T.lightOn < 0.5) return null;
  const r = rng(`ff${seed}`);
  const out = g({});
  for (let i = 0; i < 12; i++) out.append(s('circle', { cx: r() * w, cy: y0 + r() * (y1 - y0), r: 0.9, fill: '#f6e27a', opacity: 0.5 + r() * 0.5, class: 'twinkle' }));
  return out;
}

function fence(T, x0, x1, y) {
  const out = g({ stroke: T.deep, 'stroke-width': 1 });
  for (let x = x0; x <= x1; x += 9) out.append(s('line', { x1: x, y1: y, x2: x, y2: y - 7 }));
  out.append(s('line', { x1: x0, y1: y - 5, x2: x1, y2: y - 5 }), s('line', { x1: x0, y1: y - 2, x2: x1, y2: y - 2 }));
  return out;
}

/** Licht vom Sonnenstand + weiche Vignette: gibt jedem Bild Tiefe. */
function lighting(svg, defs, T, w, h, sunX, sunY) {
  const lw = uid('lw'); const vg = uid('vg');
  defs.append(s('radialGradient', { id: lw, cx: sunX / w, cy: sunY / h, r: 0.75 },
    s('stop', { offset: 0, 'stop-color': T.glow, 'stop-opacity': T.stars ? 0.12 : 0.3 }), s('stop', { offset: 1, 'stop-color': T.glow, 'stop-opacity': 0 })));
  defs.append(s('radialGradient', { id: vg, cx: 0.5, cy: 0.45, r: 0.75 },
    s('stop', { offset: 0.55, 'stop-color': T.deep, 'stop-opacity': 0 }), s('stop', { offset: 1, 'stop-color': T.deep, 'stop-opacity': 0.55 })));
  svg.append(s('rect', { width: w, height: h, fill: `url(#${lw})`, style: 'mix-blend-mode:screen' }), s('rect', { width: w, height: h, fill: `url(#${vg})` }));
}

/** Wasser mit Sonnen-Spiegelung. */
function water(defs, T, w, y, h, sunX, animated) {
  const id = uid('water');
  defs.append(s('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 },
    T.water.map((c, i) => s('stop', { offset: i / (T.water.length - 1), 'stop-color': c }))));
  const refl = g({ class: animated ? 'shimmer' : null, fill: T.glow, opacity: 0.55 });
  const rows = Math.max(4, Math.round(h / 9));
  for (let i = 0; i < rows; i++) {
    const ww = (1 - i / rows) * 46 + 6;
    refl.append(s('rect', { x: sunX - ww / 2 + ((i % 2) ? 4 : -3), y: y + 3 + i * (h / rows), width: ww, height: 1.6, rx: 0.8, opacity: 1 - i / rows }));
  }
  const lines = g({ stroke: mix(T.water[0], '#ffffff', 0.2), 'stroke-width': 0.8, opacity: 0.35 });
  const r = rng(`w${w}${y}`);
  for (let i = 0; i < 7; i++) { const yy = y + 6 + r() * (h - 8); const xx = r() * w; lines.append(s('line', { x1: xx, y1: yy, x2: xx + 14 + r() * 24, y2: yy })); }
  return g({}, s('rect', { x: 0, y, width: w, height: h, fill: `url(#${id})` }), refl, lines);
}

/* Palme: Stamm + Krone (Krone separat für Wind-Animation). */
export function palm(x, y, h, lean, fill, animated, seed = 0) {
  const tx = x + lean * h; const ty = y - h;
  const w0 = h * 0.045; const w1 = h * 0.022;
  const trunk = s('path', { fill, d: `M${x - w0} ${y} Q${x - w0 + lean * h * 0.55} ${y - h * 0.5} ${tx - w1} ${ty} L${tx + w1} ${ty} Q${x + w0 + lean * h * 0.55} ${y - h * 0.5} ${x + w0} ${y}Z` });
  const crown = g({ class: animated ? `crown c${seed % 3}` : null });
  const leaves = [[-2.9, 0.62, 0.18], [-2.35, 0.56, 0.05], [-1.85, 0.42, -0.02], [-1.25, 0.46, 0.02], [-0.75, 0.55, 0.06], [-0.2, 0.62, 0.2], [0.35, 0.5, 0.32], [2.75, 0.5, 0.34]];
  for (const [a, len, droop] of leaves) {
    const L = h * len; const dx = Math.cos(a); const dy = Math.sin(a);
    const tipX = tx + dx * L; const tipY = ty + dy * L + droop * h * 0.55;
    const ux = tx + Math.cos(a - 0.32) * L * 0.55; const uy = ty + Math.sin(a - 0.32) * L * 0.55 - h * 0.03;
    const lx = tx + Math.cos(a + 0.12) * L * 0.5; const ly = ty + Math.sin(a + 0.12) * L * 0.5 + droop * h * 0.3;
    crown.append(s('path', { fill, d: `M${tx} ${ty} Q${ux} ${uy} ${tipX} ${tipY} Q${lx} ${ly} ${tx} ${ty + h * 0.02}Z` }));
  }
  crown.append(s('circle', { cx: tx - 1, cy: ty + h * 0.02, r: h * 0.025, fill }), s('circle', { cx: tx + h * 0.02, cy: ty + h * 0.035, r: h * 0.022, fill }));
  return g({ class: animated ? `sway s${seed % 4}` : null }, trunk, crown);
}

function birds(x, y, color, animated) {
  const b = (bx, by, sc) => s('path', { d: `M${bx - 4 * sc} ${by} q${2 * sc} ${-2.6 * sc} ${4 * sc} 0 q${2 * sc} ${-2.6 * sc} ${4 * sc} 0`, fill: 'none', stroke: color, 'stroke-width': 1.1, 'stroke-linecap': 'round' });
  return g({ class: animated ? 'birds' : null }, b(x, y, 1), b(x + 12, y + 5, 0.8), b(x - 9, y + 8, 0.7));
}

/* ---------- Fahrzeuge (Seitenansicht, nach rechts gerichtet) ---------- */

const CAR_SHAPES = {
  sedan: { body: [[0, -0.13], [0.03, -0.24], [0.24, -0.27], [0.35, -0.42], [0.66, -0.42], [0.79, -0.28], [0.97, -0.25], [1, -0.13], [1, -0.07], [0, -0.07]], win: [[0.38, -0.39], [0.5, -0.39], [0.5, -0.29], [0.3, -0.29]], win2: [[0.53, -0.39], [0.64, -0.39], [0.74, -0.29], [0.53, -0.29]] },
  muscle: { body: [[0, -0.12], [0.02, -0.22], [0.3, -0.25], [0.42, -0.37], [0.64, -0.37], [0.74, -0.26], [0.98, -0.23], [1, -0.12], [1, -0.07], [0, -0.07]], win: [[0.44, -0.34], [0.53, -0.34], [0.53, -0.27], [0.38, -0.27]], win2: [[0.56, -0.34], [0.63, -0.34], [0.69, -0.27], [0.56, -0.27]] },
  pickup: { body: [[0, -0.12], [0, -0.27], [0.42, -0.27], [0.46, -0.44], [0.68, -0.44], [0.8, -0.29], [0.98, -0.26], [1, -0.12], [1, -0.07], [0, -0.07]], win: [[0.5, -0.41], [0.66, -0.41], [0.75, -0.3], [0.5, -0.3]] },
  van: { body: [[0, -0.1], [0, -0.55], [0.72, -0.55], [0.86, -0.32], [0.99, -0.28], [1, -0.1], [1, -0.07], [0, -0.07]], win: [[0.74, -0.51], [0.82, -0.33], [0.68, -0.33], [0.68, -0.51]] },
  convertible: { body: [[0, -0.13], [0.03, -0.24], [0.3, -0.26], [0.36, -0.36], [0.4, -0.27], [0.97, -0.24], [1, -0.13], [1, -0.07], [0, -0.07]] },
};

export function car(x, y, len, color, type = 'sedan', T = TIMES.dusk, flip = false, extra = {}) {
  const shape = CAR_SHAPES[type] || CAR_SHAPES.sedan;
  const pts = (arr) => arr.map(([u, v]) => `${u * len},${v * len}`).join(' ');
  const out = g({ transform: `translate(${x} ${y})${flip ? ' scale(-1 1)' : ''}`, class: extra.cls || null });
  out.append(s('ellipse', { cx: len * 0.5, cy: -len * 0.04, rx: len * 0.55, ry: len * 0.05, fill: '#000', opacity: 0.18 }));
  out.append(s('polygon', { points: pts(shape.body), fill: color }));
  out.append(s('polygon', { points: pts(shape.body.map(([u, v]) => [u, Math.max(v, -0.17)])), fill: mix(color, '#000000', 0.28) }));
  const glass = mix(T.sky[2], '#000000', 0.25);
  if (shape.win) out.append(s('polygon', { points: pts(shape.win), fill: glass }));
  if (shape.win2) out.append(s('polygon', { points: pts(shape.win2), fill: glass }));
  if (type === 'convertible') out.append(s('rect', { x: len * 0.42, y: -len * 0.31, width: len * 0.07, height: len * 0.05, rx: 1, fill: mix(color, '#000', 0.4) }));
  // Lichtkante oben, Türfuge, Spiegelung in den Scheiben
  out.append(s('polyline', { points: pts(shape.body.slice(1, -3)), fill: 'none', stroke: mix(T.glow, '#ffffff', 0.35), 'stroke-width': Math.max(0.6, len * 0.012), opacity: 0.55, 'stroke-linejoin': 'round' }));
  out.append(s('line', { x1: len * 0.52, y1: -len * 0.27, x2: len * 0.52, y2: -len * 0.1, stroke: mix(color, '#000000', 0.35), 'stroke-width': Math.max(0.4, len * 0.006) }));
  out.append(s('rect', { x: len * 0.03, y: -len * 0.155, width: len * 0.94, height: len * 0.014, fill: mix(color, '#ffffff', 0.45), opacity: 0.5 }));
  if (shape.win) out.append(s('polygon', { points: pts([[shape.win[0][0] + 0.03, shape.win[0][1]], [shape.win[0][0] + 0.07, shape.win[0][1]], [shape.win[0][0] + 0.02, shape.win[2][1]], [shape.win[0][0] - 0.02, shape.win[2][1]]]), fill: '#ffffff', opacity: 0.18 }));
  if (T.lightOn > 0.5) {
    const lid = uid('beam');
    out.append(s('defs', {}, s('linearGradient', { id: lid, x1: 0, y1: 0, x2: 1, y2: 0 }, s('stop', { offset: 0, 'stop-color': T.light, 'stop-opacity': 0.55 }), s('stop', { offset: 1, 'stop-color': T.light, 'stop-opacity': 0 }))));
    out.append(s('polygon', { points: `${len},${-len * 0.19} ${len * 1.9},${-len * 0.34} ${len * 1.9},${len * 0.02}`, fill: `url(#${lid})` }));
  }
  for (const wx of [0.2, 0.8]) {
    out.append(s('circle', { cx: wx * len, cy: -len * 0.07, r: len * 0.08, fill: '#16121f' }));
    out.append(s('circle', { cx: wx * len, cy: -len * 0.07, r: len * 0.05, fill: mix(color, '#ffffff', 0.15) }));
    out.append(s('circle', { cx: wx * len, cy: -len * 0.07, r: len * 0.05, fill: 'none', stroke: mix(color, '#ffffff', 0.55), 'stroke-width': len * 0.008 }));
    out.append(s('circle', { cx: wx * len, cy: -len * 0.07, r: len * 0.015, fill: '#16121f' }));
  }
  out.append(s('rect', { x: -1, y: -len * 0.2, width: len * 0.035, height: len * 0.04, fill: T.neon, opacity: 0.95 }));
  out.append(s('rect', { x: len * 0.965, y: -len * 0.2, width: len * 0.035, height: len * 0.035, fill: T.light, opacity: 0.95 }));
  if (extra.police) {
    out.append(s('rect', { x: len * 0.43, y: -len * 0.47, width: len * 0.08, height: len * 0.05, fill: T.neon }));
    out.append(s('rect', { x: len * 0.51, y: -len * 0.47, width: len * 0.08, height: len * 0.05, fill: T.neon2 }));
    out.append(s('rect', { x: len * 0.12, y: -len * 0.2, width: len * 0.74, height: len * 0.03, fill: T.light, opacity: 0.8 }));
  }
  if (extra.cross) {
    out.append(s('rect', { x: len * 0.2, y: -len * 0.42, width: len * 0.12, height: len * 0.04, fill: T.neon }));
    out.append(s('rect', { x: len * 0.24, y: -len * 0.46, width: len * 0.04, height: len * 0.12, fill: T.neon }));
  }
  if (extra.label) out.append(s('text', { x: len * 0.36, y: -len * 0.22, 'font-size': len * 0.09, 'font-family': 'Barlow Condensed, sans-serif', 'font-weight': 700, fill: T.light, 'text-anchor': 'middle' }, extra.label));
  return out;
}

export function speedboat(x, y, len, color, T = TIMES.dusk, flip = false, cls = null) {
  const out = g({ transform: `translate(${x} ${y})${flip ? ' scale(-1 1)' : ''}`, class: cls });
  out.append(g({ fill: T.light, opacity: 0.55 },
    s('path', { d: `M${-len * 0.9} ${len * 0.02} L0 ${-len * 0.02} L0 ${len * 0.05} Z` }),
    s('path', { d: `M${-len * 0.6} ${len * 0.09} L${-len * 0.05} ${len * 0.05} L${-len * 0.05} ${len * 0.09} Z`, opacity: 0.6 })));
  out.append(s('path', { fill: color, d: `M0 ${-len * 0.1} L${len * 0.72} ${-len * 0.1} L${len} ${-len * 0.2} L${len * 0.86} ${len * 0.04} L${len * 0.06} ${len * 0.04} Z` }));
  out.append(s('path', { fill: mix(color, '#000', 0.3), d: `M${len * 0.06} ${len * 0.04} L${len * 0.86} ${len * 0.04} L${len * 0.93} ${-len * 0.06} L0 ${-len * 0.04}Z` }));
  out.append(s('path', { fill: mix(T.sky[2], '#000', 0.2), d: `M${len * 0.42} ${-len * 0.1} L${len * 0.52} ${-len * 0.22} L${len * 0.6} ${-len * 0.22} L${len * 0.62} ${-len * 0.1}Z` }));
  out.append(s('rect', { x: len * 0.1, y: -len * 0.07, width: len * 0.7, height: len * 0.02, fill: T.light, opacity: 0.7 }));
  return out;
}

export function yacht(x, y, len, T = TIMES.dusk, cls = null) {
  const hull = '#e9e4f2';
  const out = g({ transform: `translate(${x} ${y})`, class: cls });
  out.append(s('path', { fill: mix(hull, T.sky[1], 0.35), d: `M0 ${-len * 0.08} L${len} ${-len * 0.1} L${len * 0.9} ${len * 0.04} L${len * 0.05} ${len * 0.04}Z` }));
  out.append(s('path', { fill: mix(hull, T.sky[1], 0.2), d: `M${len * 0.15} ${-len * 0.08} L${len * 0.22} ${-len * 0.17} L${len * 0.78} ${-len * 0.17} L${len * 0.86} ${-len * 0.09}Z` }));
  out.append(s('path', { fill: mix(hull, T.sky[1], 0.1), d: `M${len * 0.3} ${-len * 0.17} L${len * 0.36} ${-len * 0.25} L${len * 0.66} ${-len * 0.25} L${len * 0.7} ${-len * 0.17}Z` }));
  out.append(s('rect', { x: len * 0.24, y: -len * 0.145, width: len * 0.52, height: len * 0.03, fill: '#2a2244' }));
  out.append(s('rect', { x: len * 0.38, y: -len * 0.225, width: len * 0.26, height: len * 0.025, fill: '#2a2244' }));
  out.append(s('rect', { x: len * 0.52, y: -len * 0.36, width: len * 0.012, height: len * 0.11, fill: mix(hull, T.sky[1], 0.3) }));
  if (T.lightOn > 0.3) for (let i = 0; i < 6; i++) out.append(s('rect', { x: len * (0.27 + i * 0.08), y: -len * 0.14, width: len * 0.04, height: len * 0.02, fill: T.light, opacity: 0.85 }));
  return out;
}

export function airboat(x, y, len, color, T = TIMES.dusk, flip = false, cls = null) {
  const out = g({ transform: `translate(${x} ${y})${flip ? ' scale(-1 1)' : ''}`, class: cls });
  out.append(s('path', { fill: T.light, opacity: 0.4, d: `M${-len * 0.8} ${len * 0.01} L0 ${-len * 0.02} L0 ${len * 0.04}Z` }));
  out.append(s('path', { fill: color, d: `M0 ${-len * 0.06} L${len} ${-len * 0.06} L${len * 0.94} ${len * 0.04} L${len * 0.04} ${len * 0.04}Z` }));
  out.append(s('rect', { x: len * 0.36, y: -len * 0.2, width: len * 0.14, height: len * 0.14, fill: mix(color, '#000', 0.35) }));
  out.append(s('circle', { cx: len * 0.18, cy: -len * 0.3, r: len * 0.18, fill: 'none', stroke: mix(color, '#ffffff', 0.25), 'stroke-width': len * 0.025 }));
  out.append(s('line', { x1: len * 0.18, y1: -len * 0.46, x2: len * 0.18, y2: -len * 0.14, stroke: mix(color, '#ffffff', 0.25), 'stroke-width': len * 0.015 }));
  out.append(s('line', { x1: len * 0.02, y1: -len * 0.3, x2: len * 0.34, y2: -len * 0.3, stroke: mix(color, '#ffffff', 0.25), 'stroke-width': len * 0.015 }));
  return out;
}

export function jet(x, y, len, color, T = TIMES.dusk, cls = null, trail = true) {
  const out = g({ transform: `translate(${x} ${y})`, class: cls });
  const tid = uid('trail');
  if (trail) {
    out.append(s('defs', {}, s('linearGradient', { id: tid, x1: 0, y1: 0, x2: 1, y2: 0 },
      s('stop', { offset: 0, 'stop-color': T.light, 'stop-opacity': 0 }), s('stop', { offset: 1, 'stop-color': T.light, 'stop-opacity': 0.55 }))));
    out.append(s('rect', { x: -len * 9, y: -len * 0.06, width: len * 9, height: len * 0.09, rx: 1, fill: `url(#${tid})` }));
  }
  out.append(s('path', { fill: color, d: `M0 0 L${len * 0.82} ${-len * 0.04} Q${len} ${-len * 0.03} ${len} 0 Q${len} ${len * 0.05} ${len * 0.82} ${len * 0.05} L${len * 0.05} ${len * 0.05}Z` }));
  out.append(s('path', { fill: color, d: `M${len * 0.02} 0 L${len * 0.1} ${-len * 0.3} L${len * 0.2} ${-len * 0.3} L${len * 0.22} 0Z` }));
  out.append(s('path', { fill: mix(color, '#000', 0.25), d: `M${len * 0.38} ${len * 0.02} L${len * 0.62} ${len * 0.02} L${len * 0.5} ${len * 0.2} L${len * 0.42} ${len * 0.2}Z` }));
  out.append(s('circle', { class: cls ? 'blink' : null, cx: len * 0.08, cy: -len * 0.3, r: len * 0.035, fill: T.neon }));
  return out;
}

export function helicopter(x, y, len, color, T = TIMES.dusk, cls = null) {
  const out = g({ transform: `translate(${x} ${y})`, class: cls });
  out.append(s('ellipse', { cx: len * 0.62, cy: 0, rx: len * 0.26, ry: len * 0.15, fill: color }));
  out.append(s('path', { fill: color, d: `M${len * 0.4} ${-len * 0.04} L0 ${-len * 0.03} L0 ${len * 0.02} L${len * 0.42} ${len * 0.06}Z` }));
  out.append(s('path', { fill: color, d: `M0 ${-len * 0.12} L${len * 0.06} ${-len * 0.12} L${len * 0.08} ${len * 0.02} L0 ${len * 0.02}Z` }));
  out.append(s('ellipse', { cx: len * 0.74, cy: -len * 0.02, rx: len * 0.11, ry: len * 0.08, fill: mix(T.sky[2], '#000', 0.2) }));
  out.append(s('rect', { x: len * 0.6, y: -len * 0.22, width: len * 0.04, height: len * 0.08, fill: color }));
  out.append(s('rect', { class: cls ? 'rotor' : null, x: len * 0.17, y: -len * 0.25, width: len * 0.9, height: len * 0.025, rx: 1, fill: color, opacity: 0.85 }));
  out.append(s('path', { fill: 'none', stroke: color, 'stroke-width': len * 0.025, d: `M${len * 0.45} ${len * 0.2} L${len * 0.85} ${len * 0.2} M${len * 0.52} ${len * 0.13} L${len * 0.52} ${len * 0.2} M${len * 0.74} ${len * 0.13} L${len * 0.74} ${len * 0.2}` }));
  out.append(s('circle', { class: cls ? 'blink' : null, cx: 2, cy: -len * 0.12, r: len * 0.03, fill: T.neon }));
  return out;
}

/* ---------- Gebäude & Orte ---------- */

function stiltHouse(x, yWater, w, T, colorIdx, r) {
  const wall = mix(T.facade[colorIdx % 4], T.deep, T.shade + 0.12);
  const roof = mix(T.near, '#000', 0.15);
  const h = w * 0.5; const deck = yWater - w * 0.32;
  const out = g({});
  for (const px of [0.06, 0.34, 0.66, 0.94]) {
    out.append(s('rect', { x: x + w * px - 1, y: deck, width: 2.2, height: yWater - deck + 6, fill: T.deep }));
    out.append(s('rect', { x: x + w * px - 1, y: yWater + 6, width: 2.2, height: 10, fill: T.deep, opacity: 0.25 }));
  }
  out.append(s('rect', { x: x - 3, y: deck - 2, width: w + 6, height: 3, fill: T.deep }));
  out.append(s('rect', { x: x + w * 0.08, y: deck - h, width: w * 0.84, height: h, fill: wall }));
  out.append(s('polygon', { fill: roof, points: `${x - 4},${deck - h + 1} ${x + w * 0.5},${deck - h - w * 0.3} ${x + w + 4},${deck - h + 1}` }));
  out.append(s('rect', { x: x + w * 0.42, y: deck - h * 0.62, width: w * 0.14, height: h * 0.62, fill: mix(wall, '#000', 0.35) }));
  const lit = r() < 0.5 + T.lightOn * 0.5;
  for (const wx of [0.17, 0.66]) out.append(s('rect', { x: x + w * wx, y: deck - h * 0.68, width: w * 0.17, height: h * 0.3, fill: lit ? T.light : mix(wall, '#000', 0.3), opacity: lit ? 0.55 + T.lightOn * 0.4 : 1 }));
  out.append(s('path', { d: `M${x - 3} ${deck - 7} H${x + w + 3}`, stroke: T.deep, 'stroke-width': 1.2 }));
  for (let i = 0; i <= 8; i++) out.append(s('line', { x1: x - 3 + i * (w + 6) / 8, y1: deck - 7, x2: x - 3 + i * (w + 6) / 8, y2: deck - 2, stroke: T.deep, 'stroke-width': 0.8 }));
  return out;
}

function mangroves(x, y, w, h, color) {
  const out = g({ fill: color });
  const r = rng(`m${x}${y}${w}`);
  out.append(s('rect', { x, y: y - 2, width: w, height: 4, rx: 2 }));
  for (let i = 0; i < Math.max(3, w / 9); i++) {
    const cx = x + (i + 0.5) * (w / Math.max(3, w / 9)); const rr = h * (0.35 + r() * 0.35);
    out.append(s('ellipse', { cx, cy: y - rr * 0.6, rx: rr * 1.1, ry: rr }));
  }
  return out;
}

function bridge(x0, x1, y, T, animated) {
  const out = g({});
  out.append(s('rect', { x: x0, y, width: x1 - x0, height: 2.6, fill: T.far2 }));
  for (let px = x0 + 4; px < x1; px += 15) out.append(s('rect', { x: px, y: y + 2.6, width: 1.6, height: 7, fill: T.far2 }));
  if (animated) {
    out.append(g({ class: 'traffic t1' }, s('rect', { x: x0, y: y - 1.6, width: 4, height: 1.6, fill: T.far }), s('circle', { cx: x0 + 4.4, cy: y - 0.9, r: 0.7, fill: T.light })));
    out.append(g({ class: 'traffic t2' }, s('rect', { x: x1, y: y - 1.6, width: 4, height: 1.6, fill: T.far }), s('circle', { cx: x1 - 0.4, cy: y - 0.9, r: 0.7, fill: T.neon })));
  }
  return out;
}

function skyline(x0, x1, y, T, seed, lightsOn = true) {
  const r = rng(`sky${seed}`);
  const out = g({});
  let x = x0;
  while (x < x1) {
    const w = 8 + r() * 14; const h = 14 + r() * 46 + (Math.abs(x - (x0 + x1) / 2) < (x1 - x0) * 0.2 ? 18 : 0);
    out.append(s('rect', { x, y: y - h, width: w, height: h, fill: T.far }));
    if (r() < 0.3) out.append(s('rect', { x: x + w * 0.4, y: y - h - 6, width: 1.2, height: 6, fill: T.far }));
    if (lightsOn && T.lightOn > 0.2) for (let i = 0; i < h / 7; i++) if (r() < 0.35) out.append(s('rect', { x: x + 2 + r() * (w - 5), y: y - h + 3 + i * 7, width: 1.6, height: 1.6, fill: T.light, opacity: 0.4 + T.lightOn * 0.4 }));
    x += w + 1 + r() * 4;
  }
  return out;
}

function decoHotel(x, yBase, w, h, T, idx, name, animated) {
  const base = mix(T.facade[idx % 4], T.deep, T.shade);
  const trim = mix(T.facade[idx % 4], '#ffffff', 0.15);
  const out = g({});
  out.append(s('rect', { x, y: yBase - h, width: w, height: h, fill: base }));
  out.append(s('polygon', { points: `${x + w},${yBase - h} ${x + w + w * 0.08},${yBase - h + 4} ${x + w + w * 0.08},${yBase} ${x + w},${yBase}`, fill: mix(base, '#000000', 0.3) }));
  out.append(s('rect', { x: x + w * 0.12, y: yBase - h - 4, width: w * 0.1, height: 4, fill: mix(base, '#000000', 0.25) }), s('rect', { x: x + w * 0.78, y: yBase - h - 3, width: w * 0.08, height: 3, fill: mix(base, '#000000', 0.25) }));
  const tw = w * 0.32; const tx = x + (w - tw) / 2;
  out.append(s('rect', { x: tx, y: yBase - h - h * 0.22, width: tw, height: h * 0.22 + 1, fill: base }));
  out.append(s('rect', { x: tx + tw * 0.2, y: yBase - h - h * 0.32, width: tw * 0.6, height: h * 0.1 + 1, fill: base }));
  for (let i = 1; i <= 3; i++) out.append(s('rect', { x: x - 2, y: yBase - h + i * h * 0.22, width: w + 4, height: 2, fill: mix(trim, T.deep, T.shade * 0.6) }));
  const r = rng(`hotel${name}${idx}`);
  for (let f = 0; f < 3; f++) for (let c = 0; c < 4; c++) {
    const cx = x + w * (0.08 + c * 0.24) + (c > 1 ? w * 0.04 : 0);
    if (cx > tx - 4 && cx < tx + tw) continue;
    const on = r() < 0.25 + T.lightOn * 0.6;
    out.append(s('rect', { x: cx, y: yBase - h + 5 + f * h * 0.22, width: w * 0.12, height: h * 0.1, fill: on ? T.light : mix(base, '#000', 0.25), opacity: on ? 0.5 + T.lightOn * 0.4 : 1 }));
  }
  out.append(s('rect', { x: x + w * 0.36, y: yBase - h * 0.16, width: w * 0.28, height: h * 0.16, fill: mix(base, '#000', 0.3) }));
  out.append(s('rect', { x: x + w * 0.3, y: yBase - h * 0.2, width: w * 0.4, height: 2.4, fill: trim }));
  const neon = idx % 2 ? T.neon2 : T.neon;
  out.append(s('rect', { x, y: yBase - h, width: w, height: 1.4, fill: neon, opacity: 0.85 }));
  const fin = g({ class: animated && idx === 1 ? 'flicker' : null });
  fin.append(s('rect', { x: tx + tw * 0.34, y: yBase - h - h * 0.15, width: tw * 0.32, height: h * 0.62, fill: mix(base, '#000', 0.35) }));
  const letters = name.split('');
  const fs = Math.min(tw * 0.28, (h * 0.58) / letters.length);
  letters.forEach((ch, i) => fin.append(s('text', { x: tx + tw / 2, y: yBase - h - h * 0.15 + fs * (i + 1) * 0.98, 'font-size': fs, 'font-family': 'Barlow Condensed, sans-serif', 'font-weight': 700, 'text-anchor': 'middle', fill: neon }, ch)));
  out.append(fin);
  return out;
}

function motel(x, yBase, w, h, T, animated) {
  const wall = mix(T.facade[2], T.deep, T.shade + 0.05);
  const out = g({});
  out.append(s('rect', { x, y: yBase - h, width: w, height: h, fill: wall }));
  out.append(s('rect', { x: x - 3, y: yBase - h - 3, width: w + 6, height: 4, fill: mix(wall, '#000', 0.3) }));
  out.append(s('rect', { x: x - 2, y: yBase - h / 2 - 1, width: w + 4, height: 2.5, fill: mix(wall, '#000', 0.35) }));
  const r = rng(`motel${x}`);
  for (let fl = 0; fl < 2; fl++) for (let i = 0; i < Math.floor(w / 16); i++) {
    const dx = x + 5 + i * 16; const dy = yBase - h + 4 + fl * (h / 2);
    out.append(s('rect', { x: dx, y: dy, width: 6, height: h / 2 - 7, fill: mix(wall, '#000', 0.4) }));
    const on = r() < 0.3 + T.lightOn * 0.5;
    out.append(s('rect', { x: dx + 8, y: dy + 2, width: 5, height: 5, fill: on ? T.light : mix(wall, '#000', 0.25), opacity: on ? 0.75 : 1 }));
  }
  const sx = x + w + 12;
  out.append(s('rect', { x: sx, y: yBase - h - 34, width: 2.4, height: h + 34, fill: T.deep }));
  const sign = g({ class: animated ? 'flicker' : null });
  sign.append(s('rect', { x: sx - 14, y: yBase - h - 52, width: 30, height: 20, rx: 2, fill: T.deep }));
  sign.append(s('text', { x: sx + 1, y: yBase - h - 37, 'font-size': 11, 'font-family': 'Barlow Condensed, sans-serif', 'font-weight': 700, 'text-anchor': 'middle', fill: T.neon }, 'MOTEL'));
  sign.append(s('text', { x: sx + 1, y: yBase - h - 27, 'font-size': 5.5, 'font-family': 'Barlow Condensed, sans-serif', 'font-weight': 600, 'text-anchor': 'middle', fill: T.neon2, 'letter-spacing': 0.6 }, 'VACANCY'));
  out.append(sign);
  return out;
}

function cypress(x, y, h, color, mossColor) {
  const out = g({ fill: color });
  // Stamm mit breitem Fuß (typisch für Sumpfzypressen)
  out.append(s('path', { d: `M${x - h * 0.11} ${y} Q${x - h * 0.03} ${y - h * 0.12} ${x - h * 0.025} ${y - h * 0.7} L${x + h * 0.025} ${y - h * 0.7} Q${x + h * 0.03} ${y - h * 0.12} ${x + h * 0.11} ${y}Z` }));
  // Krone aus eng überlappenden Wolken, oben flach – liest sich als ein Baum, nicht als Stapel
  const r = rng(`cy${x}${h}`);
  for (const [dx, dy, rr] of [[-0.18, -0.68, 0.16], [0.16, -0.7, 0.17], [0, -0.8, 0.2], [-0.1, -0.9, 0.15], [0.12, -0.9, 0.14], [0.27, -0.62, 0.1], [-0.28, -0.6, 0.1]]) {
    out.append(s('ellipse', { cx: x + (dx + (r() - 0.5) * 0.04) * h, cy: y + dy * h, rx: rr * h * 1.25, ry: rr * h * 0.8 }));
  }
  const moss = g({ stroke: mossColor, 'stroke-width': 0.9, fill: 'none', opacity: 0.7 });
  for (const [dx, len] of [[-0.2, 0.12], [-0.1, 0.18], [0.05, 0.1], [0.16, 0.16], [0.26, 0.1]]) moss.append(s('line', { x1: x + dx * h, y1: y - h * 0.78, x2: x + dx * h, y2: y - h * (0.78 - len) }));
  out.append(moss);
  return out;
}

function reeds(x, y, w, color) {
  const out = g({ stroke: color, 'stroke-width': 1.1, 'stroke-linecap': 'round', fill: 'none' });
  const r = rng(`reed${x}${w}`);
  for (let i = 0; i < w / 3; i++) { const bx = x + i * 3 + r() * 2; const hh = 8 + r() * 14; out.append(s('path', { d: `M${bx} ${y} q${(r() - 0.5) * 6} ${-hh * 0.6} ${(r() - 0.5) * 8} ${-hh}` })); }
  return out;
}

function powerLine(xs, yTop, yBase, T) {
  const out = g({ stroke: T.deep, fill: 'none' });
  xs.forEach((px) => { out.append(s('line', { x1: px, y1: yTop, x2: px, y2: yBase, 'stroke-width': 2.2 }), s('line', { x1: px - 8, y1: yTop + 4, x2: px + 8, y2: yTop + 4, 'stroke-width': 1.6 })); });
  for (let i = 0; i < xs.length - 1; i++) {
    const a = xs[i]; const b = xs[i + 1];
    for (const dy of [4, 9]) out.append(s('path', { d: `M${a - 7} ${yTop + dy} Q${(a + b) / 2} ${yTop + dy + 12} ${b - 7} ${yTop + dy}`, 'stroke-width': 0.7, opacity: 0.8 }));
  }
  return out;
}

function waterTower(x, y, T) {
  return g({ fill: T.far2 },
    s('ellipse', { cx: x, cy: y - 34, rx: 11, ry: 8 }), s('rect', { x: x - 11, y: y - 40, width: 22, height: 7 }),
    s('path', { d: `M${x - 8} ${y - 28} L${x - 10} ${y} M${x + 8} ${y - 28} L${x + 10} ${y} M${x - 9} ${y - 14} L${x + 9} ${y - 14}`, stroke: T.far2, 'stroke-width': 1.6, fill: 'none' }),
    s('text', { x, y: y - 32, 'font-size': 5, 'font-family': 'Barlow Condensed, sans-serif', 'font-weight': 700, 'text-anchor': 'middle', fill: T.far }, 'GELLHORN'));
}

/* ---------- Szenen für den Kopfbereich (bewegt) ---------- */

const W = 400; const H = 260;

export function sceneFor(chapter) {
  if (chapter <= 1) return 'keys';
  if (chapter === 2) return 'gellhorn';
  return 'vice';
}

export const SCENE_NAMES = { keys: 'Key Lento', gellhorn: 'Port Gellhorn', vice: 'Vice City', swamp: 'Grassrivers' };

export function scene(loc, time = 'dusk', { animated = true } = {}) {
  const T = TIMES[time] || TIMES.dusk;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMax slice', class: `scene-svg loc-${loc}`, 'aria-hidden': 'true' });
  const defs = s('defs');
  svg.append(defs);
  const horizon = 172;
  const { node, glowId } = sky(defs, T, W, H, horizon);
  svg.append(node);
  svg.append(streaks(T, W, 58, animated ? 'drift' : null));
  const r = rng(`scene${loc}`);
  svg.append(stratus(T, 20, 92, 180, 14), stratus(T, 230, 70, 150, 12, 0.6));
  svg.append(haze(defs, T, W, horizon));
  if (loc === 'keys') {
    svg.append(sun(T, glowId, 268, horizon - 6, 22));
    svg.append(g({ class: animated ? 'fly' : null }, jet(330, 46, 14, T.deep, T, animated ? 'jet' : null)));
    svg.append(bridge(0, W, horizon - 7, T, animated));
    svg.append(water(defs, T, W, horizon, H - horizon, 268, animated));
    svg.append(mangroves(20, horizon + 2, 70, 9, T.mid), mangroves(300, horizon + 1, 90, 8, T.mid));
    svg.append(stiltHouse(70, 214, 54, T, 0, r), stiltHouse(150, 206, 40, T, 1, r));
    svg.append(speedboat(-60, 238, 26, '#efe6f4', T, false, animated ? 'sail' : null));
    svg.append(birds(214, 88, T.deep, animated));
    svg.append(g({ fill: T.near }, palm(338, 262, 118, -0.12, T.near, animated, 1), palm(378, 262, 92, 0.1, T.near, animated, 2), palm(20, 262, 96, 0.14, T.near, animated, 3)));
    svg.append(s('rect', { x: 218, y: 226, width: 3, height: 34, fill: T.deep }), s('rect', { x: 236, y: 230, width: 3, height: 30, fill: T.deep }));
    svg.append(s('rect', { x: 200, y: 228, width: 60, height: 3, fill: T.deep }));
  } else if (loc === 'gellhorn') {
    svg.append(sun(T, glowId, 110, horizon - 12, 20));
    svg.append(g({ class: animated ? 'fly' : null }, jet(330, 40, 12, T.deep, T, animated ? 'jet' : null)));
    for (let i = 0; i < 9; i++) svg.append(cypress(10 + i * 46 + r() * 14, horizon + 2, 34 + r() * 18, T.far2, T.far));
    svg.append(waterTower(338, horizon + 2, T));
    svg.append(s('rect', { x: 0, y: horizon, width: W, height: H - horizon, fill: T.ground }));
    svg.append(water(defs, T, W, horizon + 6, 26, 110, animated));
    svg.append(motel(150, 222, 150, 46, T, animated));
    svg.append(lamp(defs, T, 110, 222, 46), lamp(defs, T, 330, 222, 46));
    svg.append(s('rect', { x: 0, y: 222, width: W, height: 16, fill: mix(T.ground, '#000', 0.25) }));
    svg.append(s('rect', { x: 0, y: 229, width: W, height: 1, fill: T.light, opacity: 0.25 }));
    svg.append(g({ class: animated ? 'drive-r d1' : null }, car(-80, 236, 40, mix(T.facade[1], T.deep, 0.3), 'pickup', T)));
    svg.append(g({ class: animated ? 'drive-l d2' : null }, car(480, 234, 38, mix(T.facade[0], T.deep, 0.2), 'sedan', T, true)));
    svg.append(powerLine([40, 130, 352], 150, 222, T));
    svg.append(reeds(0, 262, 120, T.near), reeds(300, 262, 100, T.near));
    svg.append(airboat(-90, 214, 30, mix(T.facade[3], T.deep, 0.35), T, false, animated ? 'sail slow' : null));
    svg.append(g({}, palm(118, 262, 100, -0.08, T.near, animated, 1), palm(392, 262, 108, -0.14, T.near, animated, 2)));
    svg.append(birds(240, 92, T.deep, animated));
  } else {
    svg.append(sun(T, glowId, 318, horizon - 18, 18));
    svg.append(g({ class: animated ? 'heli' : null }, helicopter(420, 70, 26, T.deep, T, animated ? 'h' : null)));
    svg.append(g({ class: animated ? 'fly' : null }, jet(300, 32, 11, T.deep, T, animated ? 'jet' : null)));
    svg.append(skyline(222, W, horizon + 2, T, 'vc'));
    svg.append(water(defs, T, W, horizon, 40, 318, animated));
    svg.append(yacht(300, horizon + 22, 60, T, animated ? 'sail slow' : null));
    svg.append(decoHotel(70, 220, 74, 70, T, 0, 'MARISOL', animated));
    svg.append(decoHotel(156, 220, 66, 86, T, 1, 'CORAL', animated));
    svg.append(decoHotel(234, 220, 58, 62, T, 2, 'AZUL', animated));
    svg.append(s('rect', { x: 0, y: 212, width: W, height: H - 212, fill: mix(T.ground, '#000', 0.15) }));
    svg.append(s('rect', { x: 0, y: 220, width: W, height: 2, fill: T.neon, opacity: 0.25 }));
    svg.append(lamp(defs, T, 120, 220, 50), lamp(defs, T, 300, 220, 50));
    svg.append(g({ class: animated ? 'drive-r d1' : null }, car(-70, 244, 44, mix(T.facade[0], '#ffffff', 0.05), 'convertible', T)));
    svg.append(g({ class: animated ? 'drive-l d3' : null }, car(470, 238, 42, mix(T.facade[1], T.deep, 0.25), 'muscle', T, true)));
    svg.append(g({}, palm(40, 262, 104, 0.1, T.near, animated, 1), palm(148, 262, 84, -0.06, T.near, animated, 2), palm(230, 262, 92, 0.08, T.near, animated, 3), palm(352, 262, 108, -0.12, T.near, animated, 0)));
    svg.append(birds(250, 80, T.deep, animated));
  }
  return svg;
}

/* ---------- Bilder zu Missionen (statisch, 16:9) ---------- */

const CW = 320; const CH = 180;

/** Hintergrund-Ort für ein Missionsbild. */
function cardBackdrop(svg, defs, loc, T, seed) {
  const horizon = 112;
  const { node, glowId } = sky(defs, T, CW, CH, horizon);
  svg.append(node);
  const r = rng(seed);
  const sunX = 70 + r() * 180;
  svg.append(stratus(T, 10 + r() * 60, 44 + r() * 14, 150, 12), stratus(T, 170 + r() * 50, 30 + r() * 12, 130, 10, 0.6));
  svg.append(sun(T, glowId, sunX, horizon - 10, 14));
  svg.append(stratus(T, sunX - 60, horizon - 22, 120, 6, 0.55));
  svg.append(haze(defs, T, CW, horizon));
  if (loc === 'keys') {
    svg.append(bridge(0, CW, horizon - 5, T, false));
    svg.append(water(defs, T, CW, horizon, CH - horizon, sunX, false));
    svg.append(sailboat(T, 60 + r() * 200, horizon + 6, 0.8));
    svg.append(mangroves(10 + r() * 30, horizon + 2, 60, 7, T.mid), mangroves(220, horizon + 1, 80, 6, T.mid));
    svg.append(g({ fill: T.deep }, s('rect', { x: 236, y: 150, width: 2.5, height: 30 }), s('rect', { x: 252, y: 154, width: 2.5, height: 26 }), s('rect', { x: 226, y: 152, width: 44, height: 2.5 })));
    svg.append(birds(110 + r() * 100, 58, T.deep, false));
    svg.append(palm(300, 184, 92, -0.14, T.near, false, 1), palm(14, 184, 70, 0.14, T.near, false, 2));
  } else if (loc === 'swamp') {
    for (let i = 0; i < 8; i++) svg.append(cypress(i * 44 + r() * 14, horizon + 2, 30 + r() * 16, T.far2, T.far));
    svg.append(water(defs, T, CW, horizon, CH - horizon, sunX, false));
    svg.append(s('rect', { x: 0, y: horizon + 6, width: CW, height: 5, fill: T.light, opacity: 0.08 }));
    svg.append(lilyPads(T, 40, 150, 240, seed));
    svg.append(cypress(30, 186, 92, T.near, T.mid), cypress(292, 186, 84, T.near, T.mid));
    svg.append(reeds(0, 182, 80, T.near), reeds(240, 182, 80, T.near));
    svg.append(fireflies(T, CW, 60, 150, seed));
  } else if (loc === 'gellhorn') {
    for (let i = 0; i < 7; i++) svg.append(cypress(i * 52 + r() * 16, horizon + 2, 28 + r() * 14, T.far2, T.far));
    svg.append(waterTower(270 + r() * 30, horizon + 2, T));
    svg.append(s('rect', { x: 0, y: horizon, width: CW, height: CH - horizon, fill: T.ground }));
    svg.append(s('rect', { x: 0, y: 148, width: CW, height: 18, fill: mix(T.ground, '#000', 0.25) }));
    svg.append(g({ fill: T.light, opacity: 0.35 }, ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => s('rect', { x: 8 + i * 42, y: 156.5, width: 20, height: 1.4 }))));
    svg.append(powerLine([30, 290], 70, 148, T));
    svg.append(lamp(defs, T, 60, 148, 40));
    svg.append(palm(302, 184, 80, -0.12, T.near, false, 1));
    svg.append(reeds(0, 182, 60, T.near));
  } else if (loc === 'vice') {
    svg.append(skyline(0, CW, horizon + 2, T, `c${seed}`));
    svg.append(s('rect', { x: 0, y: horizon, width: CW, height: CH - horizon, fill: T.ground }));
    svg.append(s('rect', { x: 0, y: 150, width: CW, height: 16, fill: mix(T.ground, '#000', 0.2) }));
    svg.append(s('rect', { x: 0, y: 149, width: CW, height: 1.6, fill: T.neon, opacity: 0.3 }));
    svg.append(g({ fill: T.light, opacity: 0.3 }, ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => s('rect', { x: 8 + i * 42, y: 157.5, width: 20, height: 1.2 }))));
    svg.append(lamp(defs, T, 70, 149, 44), lamp(defs, T, 250, 149, 44));
    svg.append(palm(18, 184, 96, 0.1, T.near, false, 1), palm(304, 184, 104, -0.12, T.near, false, 2));
  } else if (loc === 'beach') {
    svg.append(skyline(170, CW, horizon + 2, T, `b${seed}`));
    svg.append(water(defs, T, CW, horizon, 40, sunX, false));
    svg.append(sailboat(T, 40 + r() * 100, horizon + 8, 0.9));
    svg.append(g({ stroke: mix(T.light, T.water[0], 0.4), 'stroke-width': 1.2, fill: 'none', opacity: 0.6 }, s('path', { d: `M0 ${horizon + 38} Q40 ${horizon + 34} 80 ${horizon + 38} T160 ${horizon + 37} T240 ${horizon + 38} T320 ${horizon + 36}` })));
    svg.append(s('path', { d: `M0 ${horizon + 40} Q${CW / 2} ${horizon + 30} ${CW} ${horizon + 42} L${CW} ${CH} L0 ${CH}Z`, fill: mix(T.facade[2], T.deep, T.shade + 0.1) }));
    svg.append(lifeguard(T, 250 + r() * 30, 166, 1));
    svg.append(umbrella(T, 60, 172, mix(T.neon, T.deep, 0.2)), umbrella(T, 90, 176, mix(T.neon2, T.deep, 0.25)));
    svg.append(palm(26, 184, 100, 0.12, T.near, false, 1), palm(296, 184, 92, -0.12, T.near, false, 2));
  } else if (loc === 'country') {
    svg.append(s('path', { d: `M0 ${horizon} Q80 ${horizon - 26} 160 ${horizon - 8} T${CW} ${horizon - 18} L${CW} ${horizon + 2} L0 ${horizon + 2}Z`, fill: T.far }));
    svg.append(s('path', { d: `M0 ${horizon + 2} Q100 ${horizon - 12} 200 ${horizon - 2} T${CW} ${horizon - 4} L${CW} ${horizon + 4} L0 ${horizon + 4}Z`, fill: T.far2 }));
    svg.append(s('rect', { x: 0, y: horizon, width: CW, height: CH - horizon, fill: T.ground }));
    for (let i = 0; i < 6; i++) svg.append(cypress(i * 60 + r() * 20, horizon + 4, 24 + r() * 10, T.far2, T.far));
    svg.append(fence(T, 0, 120, 146), fence(T, 220, CW, 146));
    svg.append(s('rect', { x: 0, y: 152, width: CW, height: 12, fill: mix(T.ground, '#000', 0.25) }));
    svg.append(powerLine([60, 300], 80, 146, T));
  }
  return { horizon, sunX };
}

function shadow(x, y, w) { return s('ellipse', { cx: x, cy: y, rx: w / 2, ry: w * 0.08, fill: '#000', opacity: 0.25 }); }

/* Gegenstände für Missionsbilder: jeweils mittig unten, ~80 px hoch. */
const PROPS = {
  bag: (T) => g({}, shadow(160, 166, 110), s('path', { fill: '#2b2240', d: 'M110 164 Q104 120 120 112 L200 112 Q216 120 210 164Z' }), s('path', { fill: mix('#2b2240', '#fff', 0.12), d: 'M120 112 L200 112 Q206 116 206 124 L114 124 Q114 116 120 112Z' }), s('path', { d: 'M136 112 Q140 88 160 88 Q180 88 184 112', fill: 'none', stroke: '#1b1530', 'stroke-width': 6 }), s('rect', { x: 150, y: 120, width: 20, height: 8, rx: 2, fill: T.neon })),
  money: (T) => g({}, shadow(160, 166, 120), ...[0, 1, 2, 3].map((i) => g({}, s('rect', { x: 112 + (i % 2) * 6, y: 140 - i * 14, width: 96, height: 14, rx: 2, fill: '#7fb69b' }), s('rect', { x: 150 + (i % 2) * 6, y: 140 - i * 14, width: 20, height: 14, fill: T.light, opacity: 0.85 }))), s('circle', { cx: 216, cy: 110, r: 14, fill: '#e9c46a' }), s('text', { x: 216, y: 115, 'font-size': 14, 'font-family': 'Barlow Condensed, sans-serif', 'font-weight': 700, 'text-anchor': 'middle', fill: '#5b4310' }, '$')),
  pills: (T) => g({}, shadow(160, 166, 70), s('rect', { x: 132, y: 98, width: 56, height: 68, rx: 8, fill: '#f0a35e' }), s('rect', { x: 128, y: 86, width: 64, height: 16, rx: 4, fill: T.light }), s('rect', { x: 136, y: 116, width: 48, height: 30, rx: 3, fill: T.light }), s('rect', { x: 142, y: 124, width: 36, height: 3, fill: '#2b2240' }), s('rect', { x: 142, y: 131, width: 26, height: 3, fill: '#2b2240' }), s('rect', { x: 200, y: 150, width: 18, height: 9, rx: 4.5, fill: T.light }), s('rect', { x: 209, y: 150, width: 9, height: 9, rx: 4.5, fill: T.neon })),
  phone: (T) => g({}, shadow(160, 168, 70), s('rect', { x: 128, y: 62, width: 64, height: 104, rx: 10, fill: '#1b1530' }), s('rect', { x: 133, y: 70, width: 54, height: 88, rx: 5, fill: mix(T.sky[2], '#000', 0.2) }), s('rect', { x: 138, y: 80, width: 34, height: 12, rx: 6, fill: T.light, opacity: 0.9 }), s('rect', { x: 150, y: 98, width: 32, height: 12, rx: 6, fill: T.neon }), s('rect', { x: 138, y: 116, width: 26, height: 12, rx: 6, fill: T.light, opacity: 0.9 })),
  gun: (T) => g({}, shadow(160, 160, 120), s('path', { fill: '#2b2240', d: 'M104 112 L214 112 L218 120 L214 128 L168 128 L162 150 L146 154 L140 150 L148 128 L112 128 Q104 126 104 120Z' }), s('rect', { x: 106, y: 108, width: 108, height: 6, rx: 2, fill: mix('#2b2240', '#fff', 0.15) }), s('path', { d: 'M156 128 Q160 140 152 140', fill: 'none', stroke: '#1b1530', 'stroke-width': 3 })),
  package: (T) => g({}, shadow(160, 166, 120), s('rect', { x: 108, y: 124, width: 60, height: 40, rx: 3, fill: '#d9c9a3' }), s('rect', { x: 152, y: 110, width: 62, height: 40, rx: 3, fill: '#cbb98f' }), s('path', { d: 'M108 140 H168 M138 124 V164 M152 126 H214 M183 110 V150', stroke: mix('#d9c9a3', '#000', 0.3), 'stroke-width': 3 }), s('rect', { x: 120, y: 148, width: 18, height: 8, fill: T.neon })),
  safe: (T) => g({}, shadow(160, 168, 110), s('rect', { x: 112, y: 76, width: 96, height: 90, rx: 6, fill: '#3b3358' }), s('rect', { x: 120, y: 84, width: 80, height: 74, rx: 4, fill: '#4a4170' }), s('circle', { cx: 160, cy: 121, r: 20, fill: '#2b2240' }), s('circle', { cx: 160, cy: 121, r: 13, fill: 'none', stroke: T.light, 'stroke-width': 2.5 }), s('path', { d: 'M160 108 V114 M173 121 H167 M160 134 V128 M147 121 H153', stroke: T.light, 'stroke-width': 2 }), s('rect', { x: 190, y: 110, width: 6, height: 22, rx: 2, fill: '#bfb3d9' })),
  statue: (T) => g({}, shadow(160, 168, 90), s('rect', { x: 126, y: 150, width: 68, height: 16, rx: 2, fill: '#3b3358' }), s('path', { fill: '#d9a84e', d: 'M144 150 L146 112 Q138 106 140 96 Q142 82 160 80 Q178 82 180 96 Q182 106 174 112 L176 150Z' }), s('path', { fill: '#b88a35', d: 'M160 80 Q178 82 180 96 Q182 106 174 112 L176 150 L160 150Z' }), s('circle', { cx: 153, cy: 96, r: 2.5, fill: '#5b4310' }), s('circle', { cx: 167, cy: 96, r: 2.5, fill: '#5b4310' }), s('path', { d: 'M150 70 L160 58 L170 70', fill: 'none', stroke: '#d9a84e', 'stroke-width': 4 })),
  wrench: (T) => g({}, shadow(160, 166, 120), s('path', { fill: '#bfb3d9', d: 'M110 150 L184 92 Q178 76 192 68 Q204 62 214 68 L200 80 L206 92 L218 90 Q222 102 212 112 Q202 118 192 112 L118 160Z' }), s('rect', { x: 112, y: 120, width: 34, height: 30, rx: 3, fill: '#3b3358', transform: 'rotate(-38 129 135)' })),
  key: (T) => g({}, shadow(160, 166, 110), s('rect', { x: 104, y: 104, width: 44, height: 56, rx: 12, fill: '#2b2240' }), s('circle', { cx: 126, cy: 122, r: 6, fill: T.neon }), s('rect', { x: 146, y: 126, width: 74, height: 12, rx: 3, fill: '#bfb3d9' }), s('path', { fill: '#bfb3d9', d: 'M190 138 V150 H198 V138 M206 138 V146 H214 V138' })),
  flowers: (T) => g({}, shadow(160, 168, 70), s('path', { fill: '#5f8f6e', d: 'M150 168 L136 110 L146 108 L156 160 L160 104 L166 104 L164 160 L178 108 L186 112 L170 168Z' }), ...[[136, 98, T.neon], [160, 90, T.light], [186, 100, '#f0a35e'], [148, 80, '#f89fc2'], [174, 80, T.neon]].map(([x, y, c]) => g({}, ...[0, 1, 2, 3, 4].map((i) => s('circle', { cx: x + Math.cos(i * 1.26) * 7, cy: y + Math.sin(i * 1.26) * 7, r: 6, fill: c })), s('circle', { cx: x, cy: y, r: 4, fill: '#f6d36b' }))), s('path', { fill: '#efe6f4', d: 'M138 136 L182 136 L172 168 L148 168Z' })),
  groceries: (T) => g({}, shadow(160, 168, 90), s('rect', { x: 150, y: 70, width: 8, height: 40, rx: 3, fill: '#7fb69b' }), s('circle', { cx: 178, cy: 92, r: 14, fill: '#f0a35e' }), s('rect', { x: 132, y: 84, width: 14, height: 30, rx: 3, fill: T.light }), s('path', { fill: '#d9c9a3', d: 'M120 104 L200 104 L192 168 L128 168Z' }), s('path', { fill: mix('#d9c9a3', '#000', 0.15), d: 'M160 104 L200 104 L192 168 L160 168Z' })),
  necklace: (T) => g({}, shadow(160, 168, 100), s('path', { d: 'M116 72 Q120 140 160 146 Q200 140 204 72', fill: 'none', stroke: '#e9c46a', 'stroke-width': 3 }), ...[0, 1, 2, 3, 4, 5, 6].map((i) => s('circle', { cx: 120 + i * 13.3, cy: 100 + Math.sin(i / 6 * Math.PI) * 42, r: 4, fill: T.light })), s('path', { fill: T.neon2, d: 'M160 144 L172 158 L160 176 L148 158Z' })),
  fish: (T) => g({}, s('path', { d: 'M96 170 L236 40', stroke: '#3b3358', 'stroke-width': 4 }), s('path', { d: 'M236 40 Q250 90 214 104', fill: 'none', stroke: T.light, 'stroke-width': 1.2 }), s('path', { fill: '#8ee6dc', d: 'M186 120 Q214 98 236 118 Q214 138 186 120Z' }), s('path', { fill: '#8ee6dc', d: 'M186 120 L172 108 L174 132Z' }), s('circle', { cx: 226, cy: 116, r: 2.5, fill: '#1b1530' })),
  camera: (T) => g({}, shadow(160, 168, 100), s('path', { d: 'M160 130 L130 168 M160 130 L190 168 M160 130 L160 168', stroke: '#2b2240', 'stroke-width': 4 }), s('rect', { x: 118, y: 86, width: 84, height: 50, rx: 6, fill: '#2b2240' }), s('rect', { x: 130, y: 78, width: 24, height: 10, rx: 2, fill: '#2b2240' }), s('circle', { cx: 166, cy: 111, r: 18, fill: '#3b3358' }), s('circle', { cx: 166, cy: 111, r: 10, fill: mix(T.sky[2], '#000', 0.2) }), s('circle', { cx: 190, cy: 96, r: 3, fill: T.neon })),
  drone: (T) => g({}, s('rect', { x: 138, y: 96, width: 44, height: 16, rx: 6, fill: '#2b2240' }), s('path', { d: 'M138 100 L112 90 M182 100 L208 90 M138 108 L112 118 M182 108 L208 118', stroke: '#2b2240', 'stroke-width': 4 }), ...[[112, 88], [208, 88], [112, 120], [208, 120]].map(([x, y]) => s('ellipse', { cx: x, cy: y - 4, rx: 16, ry: 2.5, fill: '#bfb3d9', opacity: 0.8 })), s('circle', { cx: 160, cy: 116, r: 5, fill: T.neon }), s('path', { d: 'M160 121 L132 176 L188 176Z', fill: T.light, opacity: 0.12 })),
  dumbbell: (T) => g({}, shadow(160, 166, 130), s('rect', { x: 116, y: 128, width: 88, height: 10, rx: 3, fill: '#bfb3d9' }), s('rect', { x: 100, y: 108, width: 18, height: 50, rx: 4, fill: '#2b2240' }), s('rect', { x: 202, y: 108, width: 18, height: 50, rx: 4, fill: '#2b2240' }), s('rect', { x: 120, y: 114, width: 10, height: 38, rx: 3, fill: '#3b3358' }), s('rect', { x: 190, y: 114, width: 10, height: 38, rx: 3, fill: '#3b3358' })),
  scissors: (T) => g({}, s('path', { d: 'M130 60 L176 130 M190 60 L144 130', stroke: '#bfb3d9', 'stroke-width': 7, 'stroke-linecap': 'round' }), s('circle', { cx: 136, cy: 146, r: 15, fill: 'none', stroke: T.neon, 'stroke-width': 7 }), s('circle', { cx: 184, cy: 146, r: 15, fill: 'none', stroke: T.neon, 'stroke-width': 7 }), s('circle', { cx: 160, cy: 96, r: 4, fill: '#2b2240' })),
  shopping: (T) => g({}, shadow(160, 168, 120), s('path', { d: 'M114 100 Q114 80 128 80 Q142 80 142 100', fill: 'none', stroke: '#2b2240', 'stroke-width': 4 }), s('rect', { x: 104, y: 98, width: 50, height: 68, rx: 3, fill: T.neon }), s('path', { d: 'M176 92 Q176 70 192 70 Q208 70 208 92', fill: 'none', stroke: '#2b2240', 'stroke-width': 4 }), s('rect', { x: 164, y: 90, width: 56, height: 76, rx: 3, fill: '#8ee6dc' }), s('rect', { x: 164, y: 112, width: 56, height: 8, fill: T.light, opacity: 0.6 })),
  mic: (T) => g({}, s('rect', { x: 150, y: 78, width: 20, height: 40, rx: 10, fill: '#bfb3d9' }), s('path', { d: 'M140 104 Q140 130 160 130 Q180 130 180 104', fill: 'none', stroke: '#2b2240', 'stroke-width': 4 }), s('path', { d: 'M160 130 V164 M146 166 H174', stroke: '#2b2240', 'stroke-width': 4 }), s('path', { d: 'M112 70 Q100 90 112 110 M208 70 Q220 90 208 110', fill: 'none', stroke: T.neon, 'stroke-width': 3, 'stroke-linecap': 'round' })),
  cocktail: (T) => g({}, shadow(160, 168, 60), s('path', { fill: T.neon, opacity: 0.85, d: 'M120 84 L200 84 L160 126Z' }), s('path', { d: 'M160 126 V162 M140 166 H180', stroke: '#efe6f4', 'stroke-width': 4 }), s('circle', { cx: 196, cy: 82, r: 10, fill: '#f0a35e' }), s('path', { d: 'M150 70 L170 98', stroke: T.light, 'stroke-width': 2.5 })),
  dice: (T) => g({}, shadow(160, 168, 110), s('rect', { x: 112, y: 112, width: 50, height: 50, rx: 8, fill: T.light, transform: 'rotate(-12 137 137)' }), s('rect', { x: 162, y: 98, width: 50, height: 50, rx: 8, fill: T.neon, transform: 'rotate(10 187 123)' }), ...[[128, 126], [146, 146], [137, 136]].map(([x, y]) => s('circle', { cx: x, cy: y, r: 4, fill: '#2b2240' })), ...[[178, 112], [196, 134], [178, 134], [196, 112]].map(([x, y]) => s('circle', { cx: x, cy: y, r: 4, fill: '#2b2240' }))),
  contract: (T) => g({}, shadow(160, 168, 110), s('rect', { x: 120, y: 70, width: 74, height: 96, rx: 3, fill: '#efe6f4' }), ...[0, 1, 2, 3, 4, 5].map((i) => s('rect', { x: 130, y: 84 + i * 11, width: i === 5 ? 30 : 54, height: 3, fill: '#bfb3d9' })), s('path', { d: 'M136 150 q10 -10 20 0 t20 0', fill: 'none', stroke: '#2b2240', 'stroke-width': 2 }), s('path', { fill: '#2b2240', d: 'M196 84 L208 88 L170 156 L162 158 L162 150Z' })),
  harddrive: (T) => g({}, shadow(160, 168, 120), s('rect', { x: 104, y: 104, width: 112, height: 60, rx: 6, fill: '#3b3358' }), s('rect', { x: 112, y: 112, width: 96, height: 44, rx: 4, fill: '#4a4170' }), s('circle', { cx: 160, cy: 134, r: 16, fill: '#2b2240' }), s('circle', { cx: 160, cy: 134, r: 4, fill: '#bfb3d9' }), s('circle', { cx: 200, cy: 150, r: 3, fill: T.neon2 })),
  charges: (T) => g({}, shadow(160, 168, 120), ...[0, 1, 2].map((i) => s('rect', { x: 118 + i * 24, y: 112, width: 20, height: 52, rx: 3, fill: '#e07a5f' })), s('rect', { x: 112, y: 128, width: 80, height: 8, fill: '#2b2240' }), s('rect', { x: 196, y: 112, width: 24, height: 30, rx: 3, fill: '#2b2240' }), s('rect', { x: 200, y: 118, width: 16, height: 8, fill: T.neon2 }), s('path', { d: 'M208 112 Q214 86 236 82', fill: 'none', stroke: T.neon, 'stroke-width': 2 })),
  piggy: (T) => g({}, shadow(160, 168, 110), s('ellipse', { cx: 160, cy: 126, rx: 50, ry: 36, fill: '#f6a9c9' }), s('path', { fill: '#f6a9c9', d: 'M128 94 L132 78 L146 92Z' }), s('rect', { x: 128, y: 150, width: 12, height: 16, rx: 3, fill: '#e389b2' }), s('rect', { x: 178, y: 150, width: 12, height: 16, rx: 3, fill: '#e389b2' }), s('ellipse', { cx: 206, cy: 128, rx: 9, ry: 11, fill: '#e389b2' }), s('rect', { x: 150, y: 92, width: 22, height: 4, rx: 2, fill: '#2b2240' }), s('circle', { cx: 190, cy: 116, r: 3, fill: '#2b2240' }), s('circle', { cx: 160, cy: 80, r: 10, fill: '#e9c46a' })),
  atm: (T) => g({}, shadow(160, 170, 110), s('rect', { x: 120, y: 60, width: 80, height: 110, rx: 4, fill: '#3b3358' }), s('rect', { x: 130, y: 72, width: 60, height: 36, rx: 3, fill: mix(T.sky[2], '#000', 0.15) }), s('text', { x: 160, y: 95, 'font-size': 14, 'font-family': 'Barlow Condensed, sans-serif', 'font-weight': 700, 'text-anchor': 'middle', fill: T.light }, 'ATM'), ...[0, 1, 2].map((r) => [0, 1, 2].map((c) => s('rect', { x: 136 + c * 16, y: 116 + r * 11, width: 12, height: 8, rx: 1.5, fill: '#bfb3d9' }))).flat(), s('rect', { x: 134, y: 154, width: 52, height: 5, rx: 2, fill: T.neon })),
  chest: (T) => g({}, shadow(160, 168, 120), s('rect', { x: 112, y: 116, width: 96, height: 50, rx: 3, fill: '#8a5a3c' }), s('path', { fill: '#a06a46', d: 'M112 116 Q112 88 160 86 Q208 88 208 116Z' }), s('rect', { x: 112, y: 112, width: 96, height: 7, fill: '#d9a84e' }), s('rect', { x: 152, y: 112, width: 16, height: 22, rx: 2, fill: '#d9a84e' }), s('circle', { cx: 132, cy: 104, r: 5, fill: '#e9c46a' }), s('circle', { cx: 182, cy: 100, r: 6, fill: T.light })),
  bell: (T) => g({}, shadow(160, 170, 80), s('path', { fill: '#d9a84e', d: 'M120 150 Q124 140 128 110 Q132 80 160 78 Q188 80 192 110 Q196 140 200 150Z' }), s('rect', { x: 116, y: 148, width: 88, height: 8, rx: 3, fill: '#b88a35' }), s('circle', { cx: 160, cy: 162, r: 7, fill: '#b88a35' }), s('rect', { x: 156, y: 66, width: 8, height: 14, rx: 2, fill: '#b88a35' }), s('path', { d: 'M100 100 Q94 116 100 132 M220 100 Q226 116 220 132', fill: 'none', stroke: T.light, 'stroke-width': 3, 'stroke-linecap': 'round' })),
  bottle: (T) => g({}, shadow(160, 170, 60), s('path', { fill: '#7a3f2e', d: 'M146 70 L174 70 L174 92 Q190 100 190 120 L190 164 Q190 170 184 170 L136 170 Q130 170 130 164 L130 120 Q130 100 146 92Z' }), s('rect', { x: 148, y: 58, width: 24, height: 14, rx: 2, fill: '#2b2240' }), s('rect', { x: 136, y: 120, width: 48, height: 30, rx: 2, fill: '#efe6f4' }), s('text', { x: 160, y: 140, 'font-size': 13, 'font-family': 'Barlow Condensed, sans-serif', 'font-weight': 700, 'text-anchor': 'middle', fill: '#7a3f2e' }, 'RUM')),
  lotus: (T) => g({}, shadow(160, 168, 110), ...[[-40, 0.9], [-20, 1], [0, 1.15], [20, 1], [40, 0.9]].map(([a, sc]) => s('path', { fill: a === 0 ? T.neon : '#f6a9c9', opacity: 0.95, transform: `rotate(${a} 160 150)`, d: `M160 150 Q${160 - 18 * sc} ${150 - 40 * sc} 160 ${150 - 66 * sc} Q${160 + 18 * sc} ${150 - 40 * sc} 160 150Z` })), s('ellipse', { cx: 160, cy: 156, rx: 54, ry: 10, fill: '#5f8f6e' })),
  flag: (T) => g({}, s('rect', { x: 120, y: 60, width: 5, height: 110, fill: '#bfb3d9' }), s('path', { d: 'M125 64 Q160 54 200 66 L200 116 Q160 104 125 114Z', fill: T.light }), ...[0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => ((r + c) % 2 ? s('rect', { x: 125 + c * 18.75, y: 64 + r * 12.5 + (c === 1 || c === 2 ? -3 : 0), width: 18.75, height: 12.5, fill: '#2b2240' }) : null))).flat()),
  ufo: (T) => g({}, s('path', { d: 'M160 112 L120 176 L200 176Z', fill: T.neon2, opacity: 0.18 }), s('ellipse', { cx: 160, cy: 104, rx: 58, ry: 14, fill: '#bfb3d9' }), s('path', { fill: mix(T.sky[2], '#fff', 0.3), d: 'M134 100 Q136 74 160 72 Q184 74 186 100Z' }), ...[0, 1, 2, 3, 4].map((i) => s('circle', { cx: 120 + i * 20, cy: 108, r: 3, fill: i % 2 ? T.neon : T.neon2 }))),
  footprint: (T) => g({}, ...[[124, 128, -14], [186, 96, 10]].map(([x, y, a]) => g({ transform: `rotate(${a} ${x} ${y})`, fill: '#2b2240' }, s('ellipse', { cx: x, cy: y, rx: 16, ry: 26 }), ...[-12, -5, 2, 9].map((dx, i) => s('circle', { cx: x + dx, cy: y - 32 + Math.abs(i - 1.5) * 2, r: 4.5 }))))),
  antlers: (T) => g({}, shadow(160, 168, 90), s('path', { d: 'M160 110 Q142 96 136 70 M140 88 L124 80 M136 70 L130 54 M160 110 Q178 96 184 70 M180 88 L196 80 M184 70 L190 54', fill: 'none', stroke: '#d9c9a3', 'stroke-width': 6, 'stroke-linecap': 'round' }), s('path', { fill: '#8a5a3c', d: 'M146 108 Q160 100 174 108 L168 150 Q160 160 152 150Z' }), s('rect', { x: 130, y: 150, width: 60, height: 16, rx: 3, fill: '#3b3358' })),
  rooster: (T) => g({}, shadow(160, 168, 90), s('path', { fill: '#2b2240', d: 'M130 140 Q120 110 140 96 Q150 70 172 74 Q186 78 184 94 L196 98 L184 104 Q190 130 170 146 L172 164 L164 164 L162 150 L152 150 L150 164 L142 164 L144 148Z' }), s('path', { fill: T.neon, d: 'M166 74 Q170 60 176 66 Q180 58 184 70 Q186 76 180 78Z' }), s('path', { fill: '#e07a5f', d: 'M120 96 Q100 80 110 110 Q96 100 112 128 Q100 128 128 140Z' }), s('circle', { cx: 176, cy: 88, r: 2.5, fill: T.light })),
  dog: (T) => g({}, shadow(160, 168, 110), s('path', { fill: '#2b2240', d: 'M112 128 Q110 110 128 108 L176 108 L186 88 L196 86 L208 96 L212 108 Q212 118 200 120 L196 128 L196 166 L186 166 L184 136 L136 136 L132 166 L122 166 Q118 150 118 136 L104 116Z' }), s('circle', { cx: 200, cy: 98, r: 2.2, fill: T.light })),
  ring: (T) => g({}, shadow(160, 168, 80), s('circle', { cx: 160, cy: 130, r: 30, fill: 'none', stroke: '#e9c46a', 'stroke-width': 9 }), s('path', { fill: T.neon2, d: 'M146 98 L174 98 L182 86 L160 70 L138 86Z' }), s('path', { fill: '#fff', opacity: 0.55, d: 'M150 86 L160 78 L166 86Z' })),
  briefcase: (T) => g({}, shadow(160, 168, 120), s('rect', { x: 108, y: 100, width: 104, height: 66, rx: 6, fill: '#5b4310' }), s('rect', { x: 108, y: 126, width: 104, height: 6, fill: '#3d2c0a' }), s('path', { d: 'M142 100 V88 Q142 82 148 82 L172 82 Q178 82 178 88 V100', fill: 'none', stroke: '#3d2c0a', 'stroke-width': 6 }), s('rect', { x: 152, y: 122, width: 16, height: 14, rx: 2, fill: '#e9c46a' })),
  float: (T) => g({}, s('ellipse', { cx: 160, cy: 150, rx: 62, ry: 20, fill: '#f6a9c9' }), s('ellipse', { cx: 160, cy: 146, rx: 36, ry: 9, fill: mix(T.water[0], '#fff', 0.2) }), s('path', { d: 'M196 140 Q214 100 204 84 Q198 74 206 70 Q216 68 214 80', fill: 'none', stroke: '#f6a9c9', 'stroke-width': 9, 'stroke-linecap': 'round' }), s('path', { d: 'M212 72 L224 78 L212 82Z', fill: '#2b2240' })),
  ticket: (T) => g({}, shadow(160, 168, 120), s('path', { fill: T.neon, d: 'M104 100 L216 100 L216 116 Q206 120 216 126 L216 142 L104 142 L104 126 Q114 120 104 116Z', transform: 'rotate(-8 160 121)' }), s('text', { x: 160, y: 128, 'font-size': 16, 'font-family': 'Barlow Condensed, sans-serif', 'font-weight': 700, 'text-anchor': 'middle', fill: '#2b2240', transform: 'rotate(-8 160 121)' }, 'LIVE')),
  home: (T) => g({}, shadow(160, 170, 130), stiltHouse(112, 170, 96, T, 0, rng('home'))),
  pin: (T) => g({}, shadow(160, 168, 60), s('path', { fill: T.neon, d: 'M160 168 Q126 128 126 104 Q126 72 160 72 Q194 72 194 104 Q194 128 160 168Z' }), s('circle', { cx: 160, cy: 104, r: 12, fill: '#2b2240' })),
};

/* Fahrzeuge/Gebäude als Hauptmotiv */
const SUBJECTS = {
  car: (T, c) => car(96, 164, 128, c, 'sedan', T),
  muscle: (T, c) => car(92, 164, 136, c, 'muscle', T),
  sports: (T, c) => car(92, 164, 136, '#e07a5f', 'muscle', T),
  convertible: (T, c) => car(92, 164, 136, c, 'convertible', T),
  pickup: (T, c) => car(92, 164, 136, c, 'pickup', T),
  police: (T) => car(92, 164, 136, '#efe6f4', 'sedan', T, false, { police: true }),
  ambulance: (T) => car(92, 166, 136, '#efe6f4', 'van', T, false, { cross: true }),
  van: (T, c) => car(92, 166, 136, c, 'van', T),
  armored: (T) => car(92, 166, 136, '#6b6e7c', 'van', T, false, { label: 'SECURE' }),
  catering: (T) => car(92, 166, 136, '#efe6f4', 'van', T, false, { label: 'CATERING' }),
  boat: (T, c) => speedboat(96, 150, 128, c, T),
  yacht: (T) => yacht(86, 150, 150, T),
  airboat: (T, c) => airboat(100, 154, 120, c, T),
  plane: (T) => jet(110, 70, 100, T.deep, T, null, true),
  heli: (T) => helicopter(110, 82, 110, T.deep, T),
  motel: (T) => motel(70, 150, 150, 52, T, false),
  hotel: (T) => g({}, decoHotel(70, 150, 84, 74, T, 0, 'MARISOL', false), decoHotel(166, 150, 74, 88, T, 1, 'CORAL', false)),
  hospital: (T) => g({}, s('rect', { x: 84, y: 66, width: 152, height: 84, fill: mix(T.facade[1], T.deep, T.shade) }), ...[0, 1, 2].map((f) => [0, 1, 2, 3, 4, 5].map((c) => s('rect', { x: 94 + c * 23, y: 76 + f * 22, width: 14, height: 12, fill: T.light, opacity: 0.25 + T.lightOn * 0.5 }))).flat(), s('rect', { x: 146, y: 40, width: 28, height: 28, rx: 3, fill: '#efe6f4' }), s('rect', { x: 156, y: 44, width: 8, height: 20, fill: '#e0707f' }), s('rect', { x: 150, y: 50, width: 20, height: 8, fill: '#e0707f' })),
  prison: (T) => g({}, s('rect', { x: 60, y: 96, width: 200, height: 54, fill: mix(T.facade[1], T.deep, T.shade + 0.1) }), s('rect', { x: 210, y: 60, width: 26, height: 90, fill: mix(T.facade[1], T.deep, T.shade + 0.2) }), s('rect', { x: 204, y: 54, width: 38, height: 10, fill: T.deep }), s('path', { d: 'M40 150 V110 M280 150 V110 M40 112 H280', stroke: T.deep, 'stroke-width': 2 }), s('path', { d: 'M40 108 q5 -6 10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0 t10 0', fill: 'none', stroke: T.deep, 'stroke-width': 1.5 }), s('path', { d: 'M236 64 L300 30 L300 70Z', fill: T.light, opacity: 0.15 })),
  bank: (T) => g({}, s('polygon', { points: '80,74 160,46 240,74', fill: mix(T.facade[3], T.deep, T.shade - 0.05) }), s('rect', { x: 84, y: 74, width: 152, height: 8, fill: mix(T.facade[3], T.deep, T.shade - 0.1) }), ...[0, 1, 2, 3, 4, 5].map((i) => s('rect', { x: 92 + i * 25, y: 84, width: 11, height: 56, fill: mix(T.facade[3], '#fff', 0.1) })), s('rect', { x: 80, y: 140, width: 160, height: 10, fill: mix(T.facade[3], T.deep, T.shade - 0.1) }), s('text', { x: 160, y: 69, 'font-size': 11, 'font-family': 'Barlow Condensed, sans-serif', 'font-weight': 700, 'text-anchor': 'middle', fill: T.deep, 'letter-spacing': 1.5 }, 'BANK')),
  club: (T) => g({}, s('path', { d: 'M120 150 L60 0 M200 150 L270 0', stroke: T.neon, 'stroke-width': 10, opacity: 0.18 }), s('rect', { x: 80, y: 84, width: 160, height: 66, fill: '#1b1530' }), s('rect', { x: 100, y: 60, width: 120, height: 26, rx: 3, fill: '#2b2240' }), s('text', { x: 160, y: 80, 'font-size': 20, 'font-family': 'Barlow Condensed, sans-serif', 'font-weight': 700, 'text-anchor': 'middle', fill: T.neon, 'letter-spacing': 2 }, 'CLUB'), s('rect', { x: 146, y: 116, width: 28, height: 34, fill: T.neon, opacity: 0.4 })),
  shop: (T) => g({}, s('rect', { x: 84, y: 76, width: 152, height: 74, fill: mix(T.facade[2], T.deep, T.shade) }), ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => s('path', { d: `M${84 + i * 19} 92 L${84 + i * 19} 82 L${103 + i * 19} 82 L${103 + i * 19} 92 Q${93.5 + i * 19} 98 ${84 + i * 19} 92Z`, fill: i % 2 ? T.light : T.neon })), s('rect', { x: 96, y: 102, width: 56, height: 36, fill: T.light, opacity: 0.35 + T.lightOn * 0.3 }), s('rect', { x: 176, y: 102, width: 30, height: 48, fill: mix(T.facade[2], '#000', 0.4) })),
  trailer: (T) => g({}, s('rect', { x: 76, y: 96, width: 170, height: 52, rx: 10, fill: mix(T.facade[0], T.deep, T.shade + 0.05) }), s('rect', { x: 76, y: 120, width: 170, height: 4, fill: mix(T.facade[0], '#000', 0.35) }), s('rect', { x: 100, y: 106, width: 26, height: 14, fill: T.light, opacity: 0.4 + T.lightOn * 0.4 }), s('rect', { x: 196, y: 106, width: 30, height: 14, fill: T.light, opacity: 0.4 + T.lightOn * 0.4 }), s('rect', { x: 150, y: 106, width: 20, height: 42, fill: mix(T.facade[0], '#000', 0.4) }), s('circle', { cx: 120, cy: 152, r: 8, fill: '#16121f' }), s('path', { d: 'M246 140 L270 150', stroke: T.deep, 'stroke-width': 4 })),
  marina: (T) => g({}, s('rect', { x: 40, y: 140, width: 240, height: 6, fill: T.deep }), ...[60, 130, 200, 260].map((x) => s('rect', { x, y: 140, width: 4, height: 22, fill: T.deep })), speedboat(70, 154, 80, '#efe6f4', T), s('path', { d: 'M206 150 L206 70 L250 140Z', fill: T.light, opacity: 0.85 }), s('path', { d: 'M180 150 L270 150 L260 160 L190 160Z', fill: '#efe6f4' })),
  airport: (T) => g({}, s('rect', { x: 210, y: 60, width: 18, height: 90, fill: T.deep }), s('path', { d: 'M196 60 L242 60 L236 40 L202 40Z', fill: mix(T.sky[2], '#000', 0.3) }), s('rect', { x: 0, y: 150, width: 320, height: 4, fill: T.light, opacity: 0.3 }), jet(60, 128, 110, '#efe6f4', T, null, false)),
  stage: (T) => g({}, s('path', { d: 'M110 150 L40 0 M160 150 L160 0 M210 150 L280 0', stroke: T.neon2, 'stroke-width': 8, opacity: 0.16 }), s('rect', { x: 70, y: 120, width: 180, height: 30, fill: '#1b1530' }), s('rect', { x: 70, y: 64, width: 180, height: 8, fill: '#2b2240' }), s('rect', { x: 74, y: 72, width: 6, height: 48, fill: '#2b2240' }), s('rect', { x: 240, y: 72, width: 6, height: 48, fill: '#2b2240' }), ...[0, 1, 2, 3, 4].map((i) => s('circle', { cx: 100 + i * 30, cy: 76, r: 4, fill: i % 2 ? T.neon : T.neon2 })), ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => s('circle', { cx: 40 + i * 24, cy: 168, r: 9, fill: '#16121f' }))),
  pool: (T) => g({}, s('rect', { x: 40, y: 132, width: 240, height: 40, rx: 6, fill: '#8ee6dc', opacity: 0.85 }), s('path', { d: 'M60 146 q10 -4 20 0 t20 0 t20 0 M170 158 q10 -4 20 0 t20 0 t20 0', fill: 'none', stroke: '#fff', 'stroke-width': 2, opacity: 0.7 }), s('ellipse', { cx: 200, cy: 150, rx: 26, ry: 8, fill: '#f6a9c9' }), s('path', { d: 'M90 132 V100 M106 132 V100 M90 108 H106 M90 120 H106', stroke: '#bfb3d9', 'stroke-width': 3 })),
  gym: (T) => g({}, s('rect', { x: 80, y: 80, width: 160, height: 70, fill: mix(T.facade[1], T.deep, T.shade) }), s('rect', { x: 92, y: 92, width: 136, height: 40, fill: T.light, opacity: 0.25 + T.lightOn * 0.35 }), s('text', { x: 160, y: 76, 'font-size': 16, 'font-family': 'Barlow Condensed, sans-serif', 'font-weight': 700, 'text-anchor': 'middle', fill: T.neon, 'letter-spacing': 2 }, 'GYM'), PROPS.dumbbell(T)),
};

/**
 * Bild zu einer Mission. art = { loc, motif, time, color }.
 * loc: keys | swamp | gellhorn | vice | beach | country ; motif: Schlüssel aus PROPS oder SUBJECTS.
 */
export function missionArt(art = {}, { seed = '', title = '' } = {}) {
  const loc = art.loc || 'keys';
  const T = TIMES[art.time] || TIMES.dusk;
  const svg = s('svg', { viewBox: `0 0 ${CW} ${CH}`, preserveAspectRatio: 'xMidYMid slice', class: 'art', role: title ? 'img' : null, 'aria-label': title || null, 'aria-hidden': title ? null : 'true' });
  const defs = s('defs');
  svg.append(defs);
  const { horizon, sunX } = cardBackdrop(svg, defs, loc, T, `${seed}${loc}`);
  const color = art.color || mix(T.facade[rng(seed)() * 4 | 0], T.deep, 0.15);
  const make = SUBJECTS[art.motif] || PROPS[art.motif] || PROPS.pin;
  svg.append(make(T, color));
  lighting(svg, defs, T, CW, CH, sunX, horizon - 10);
  return svg;
}

export const MOTIFS = [...Object.keys(SUBJECTS), ...Object.keys(PROPS)];
export const LOCATIONS = ['keys', 'swamp', 'gellhorn', 'vice', 'beach', 'country'];
