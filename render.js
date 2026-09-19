// Isometric Canvas 2D renderer. World unit: tile = 64x32 px at zoom 1.
import { N, WATER, TREES, EMPTY, ROAD, RAIL, HWY, WIRE, ZRD, BLD, RUBBLE, PIPE, SUBWAY,
  POW, WAT, FIRE, FLOOD, CAT, TOOLS } from './data.js';
import { NN, isZone, zk, canPlace, idx } from './sim.js';

export const cam = { ox: 0, oy: 0, z: 1 };
let cv, ctx, far, farCtx, mini, mctx, dpr = 1, W = 0, H = 0;

const TER = ['#5a8f3a', '#2a6fbf', '#3d7a30'];
const ZONE = ['#5c5', '#58c', '#cc5'];
const px = (x, y) => [(x - y) * 32, (x + y) * 16];

export function init(canvas, minimap) {
  cv = canvas; ctx = cv.getContext('2d');
  mini = minimap; mctx = mini.getContext('2d');
  far = document.createElement('canvas');
  far.width = N * 16; far.height = N * 8;
  farCtx = far.getContext('2d');
  farCtx.setTransform(.25, 0, 0, .25, N * 8, 0);
  resize();
}
export function resize() {
  dpr = devicePixelRatio || 1;
  W = cv.clientWidth; H = cv.clientHeight;
  cv.width = W * dpr | 0; cv.height = H * dpr | 0;
  mini.width = mini.clientWidth * dpr | 0; mini.height = mini.clientHeight * dpr | 0;
}
export function center() { cam.z = 1; cam.ox = W / 2; cam.oy = H / 2 - N * 16; }
export const toTile = (sx, sy) => {
  const x = (sx - cam.ox) / cam.z, y = (sy - cam.oy) / cam.z;
  return [Math.floor(x / 64 + y / 32), Math.floor(y / 32 - x / 64)];
};
export function zoomAt(sx, sy, f) {
  const z = Math.max(.25, Math.min(2, cam.z * f));
  cam.ox = sx - (sx - cam.ox) * z / cam.z; cam.oy = sy - (sy - cam.oy) * z / cam.z; cam.z = z;
}
export function jumpTo(wx, wy) { cam.ox = W / 2 - wx * cam.z; cam.oy = H / 2 - wy * cam.z; }

const shades = new Map();
function shade(c, f) {
  const key = c + f; let v = shades.get(key);
  if (v) return v;
  let r, g, b;
  if (c[0] === '#') {
    const n = parseInt(c.slice(1), 16);
    [r, g, b] = c.length === 4 ? [(n >> 8 & 15) * 17, (n >> 4 & 15) * 17, (n & 15) * 17] : [n >> 16, n >> 8 & 255, n & 255];
  } else [r, g, b] = c.match(/\d+/g).map(Number);
  shades.set(key, v = `rgb(${r * f | 0},${g * f | 0},${b * f | 0})`);
  return v;
}
function diamond(c, x, y, inf = 0) {
  const [sx, sy] = px(x, y);
  c.beginPath(); c.moveTo(sx, sy - inf); c.lineTo(sx + 32 + inf, sy + 16);
  c.lineTo(sx, sy + 32 + inf); c.lineTo(sx - 32 - inf, sy + 16); c.closePath();
}
function poly(...p) {
  ctx.beginPath(); ctx.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  ctx.closePath(); ctx.fill();
}
// faces bit0 = front-left (y+1 side), bit1 = front-right (x+1 side), bit2 = top
function box(x, y, w, h, ht, color, faces = 7) {
  const [ax, ay] = px(x, y), [bx, by] = px(x + w, y), [cx, cy] = px(x + w, y + h), [dx, dy] = px(x, y + h);
  if (faces & 1) { ctx.fillStyle = shade(color, .72); poly(dx, dy, cx, cy, cx, cy - ht, dx, dy - ht); }
  if (faces & 2) { ctx.fillStyle = shade(color, .5); poly(bx, by, cx, cy, cx, cy - ht, bx, by - ht); }
  if (faces & 4) { ctx.fillStyle = ctx.strokeStyle = color; poly(ax, ay - ht, bx, by - ht, cx, cy - ht, dx, dy - ht); ctx.stroke(); }
}
// 4-neighbour mask: 1 = x-1, 2 = x+1, 4 = y-1, 8 = y+1
function mask(S, i, pred) {
  const x = i % N; let m = 0;
  if (x > 0 && pred(i - 1)) m |= 1;
  if (x < N - 1 && pred(i + 1)) m |= 2;
  if (i >= N && pred(i - N)) m |= 4;
  if (i < NN - N && pred(i + N)) m |= 8;
  return m;
}
function links(x, y, m, lift = 0) {
  const [cx, cy] = px(x + .5, y + .5);
  ctx.beginPath();
  const to = (tx, ty) => { const [ex, ey] = px(tx, ty); ctx.moveTo(cx, cy - lift); ctx.lineTo(ex, ey - lift); };
  if (m & 1) to(x, y + .5); if (m & 2) to(x + 1, y + .5); if (m & 4) to(x + .5, y); if (m & 8) to(x + .5, y + 1);
  if (!m) { ctx.moveTo(cx - 4, cy - lift); ctx.lineTo(cx + 4, cy - lift); }
  ctx.stroke();
}
function strokeLinks(x, y, m, color, width, lift) { ctx.strokeStyle = color; ctx.lineWidth = width; links(x, y, m, lift); }

export function tileColor(S, i) {
  const s = S.surf[i];
  if (s === EMPTY || s === WIRE) return TER[S.terrain[i]];
  if (s === ROAD) return '#777'; if (s === RAIL) return '#875'; if (s === HWY) return '#555';
  if (s === RUBBLE) return '#765'; if (s === BLD) return CAT[S.bid[i]][8];
  return shade(ZONE[zk(s)], .5 + S.lvl[i] / 16);
}
export function patch(S, i) {
  farCtx.fillStyle = tileColor(S, i);
  diamond(farCtx, i % N, (i / N) | 0, 2); farCtx.fill();
}
export function buildFar(S) {
  farCtx.save(); farCtx.setTransform(1, 0, 0, 1, 0, 0); farCtx.clearRect(0, 0, far.width, far.height); farCtx.restore();
  for (let i = 0; i < NN; i++) patch(S, i);
}

function range() {
  const c = [toTile(0, 0), toTile(W, 0), toTile(0, H), toTile(W, H)];
  const xs = c.map(t => t[0]), ys = c.map(t => t[1]);
  return [Math.max(0, Math.min(...xs) - 1), Math.min(N - 1, Math.max(...xs) + 2),
    Math.max(0, Math.min(...ys) - 1), Math.min(N - 1, Math.max(...ys) + 2)];
}
const isRoad = S => i => S.surf[i] === ROAD || S.surf[i] === HWY;
const isRail = S => i => S.surf[i] === RAIL || (S.surf[i] === BLD && S.bid[i] === 12);
const isWire = S => i => S.surf[i] === WIRE || S.surf[i] === BLD;

function ground(S, x0, x1, y0, y1) {
  const { terrain, surf, lvl } = S;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = idx(x, y), s = surf[i];
    ctx.fillStyle = TER[terrain[i]]; diamond(ctx, x, y, .5); ctx.fill();
    if (s === EMPTY || s === WIRE) continue;
    if (s === ROAD) { ctx.fillStyle = '#777'; ctx.fill(); strokeLinks(x, y, mask(S, i, isRoad(S)), '#ee9', 2); }
    else if (s === HWY) {
      ctx.fillStyle = '#444'; ctx.fill(); const m = mask(S, i, isRoad(S));
      strokeLinks(x, y, m, '#666', 18); strokeLinks(x, y, m, '#ee5', 2);
    }
    else if (s === RAIL) { const m = mask(S, i, isRail(S)); strokeLinks(x, y, m, '#654', 9); strokeLinks(x, y, m, '#bbb', 3); }
    else if (s === RUBBLE) { ctx.fillStyle = '#765'; ctx.fill(); }
    else if (s === BLD) { ctx.fillStyle = shade(CAT[S.bid[i]][8], .6); ctx.fill(); }
    else { ctx.fillStyle = shade(ZONE[zk(s)], s >= ZRD ? .7 : .9); ctx.fill(); if (!lvl[i]) { ctx.strokeStyle = '#0003'; ctx.lineWidth = 1; ctx.stroke(); } }
  }
}
function objects(S, x0, x1, y0, y1) {
  const { terrain, surf, lvl, flags, off, bid } = S;
  const flash = S.tick >> 1 & 1;
  ctx.lineWidth = 1;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = idx(x, y), s = surf[i];
    if (s === EMPTY) { if (terrain[i] === TREES) box(x + .3, y + .3, .4, .4, 10 + (i * 7 % 5), '#2a6a2a'); }
    else if (s === WIRE) {
      const [cx, cy] = px(x + .5, y + .5);
      ctx.strokeStyle = '#864'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 22); ctx.stroke();
      strokeLinks(x, y, mask(S, i, isWire(S)), '#333', 1, 20);
    }
    else if (isZone(s)) {
      if (lvl[i]) box(x + .1, y + .1, .8, .8, lvl[i] * 6, shade(ZONE[zk(s)], .8 + (i * 13 % 3) / 10));
      if (!(flags[i] & POW) && flash) bolt(x, y);
    }
    else if (s === BLD) {
      const B = CAT[bid[i]], dx = off[i] >> 4, dy = off[i] & 15;
      box(x, y, 1, 1, B[7] * 12, B[8], 4 | (dy === B[2] - 1 ? 1 : 0) | (dx === B[1] - 1 ? 2 : 0));
      if (!off[i] && !(flags[i] & POW) && B[5] !== 'power' && B[5] !== 'park' && flash) bolt(x, y, B[7] * 12);
    }
    if (flags[i] & FIRE) {
      const [cx, cy] = px(x + .5, y + .5), j = (S.tick * 7 + i) % 5;
      ctx.fillStyle = j & 1 ? '#f80' : '#fd3'; poly(cx - 10, cy, cx + 10, cy, cx + j - 2, cy - 26 - j * 2);
    }
    if (flags[i] & FLOOD) { ctx.globalAlpha = .5; ctx.fillStyle = '#48f'; diamond(ctx, x, y); ctx.fill(); ctx.globalAlpha = 1; }
  }
}
function disasterSprite(S) {
  const D = S.disaster;
  if (D.k !== 2 && D.k !== 5) return;
  const [cx, cy] = px(D.x + .5, D.y + .5), t = S.tick;
  if (D.k === 2) { // tornado funnel
    ctx.globalAlpha = .7; ctx.fillStyle = '#999';
    for (let k = 0; k < 6; k++) { const w = 6 + k * 7, ox = Math.sin(t / 2 + k) * 6; ctx.beginPath(); ctx.ellipse(cx + ox, cy - k * 14, w, w / 2, 0, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
  } else { box(D.x - .5, D.y - .5, 2, 2, 70 + Math.sin(t) * 6, '#4a3'); ctx.fillStyle = '#f00'; poly(cx - 40, cy - 60, cx - 30, cy - 60, cx - 35, cy - 52); poly(cx - 10, cy - 60, cx, cy - 60, cx - 5, cy - 52); }
}
function bolt(x, y, ht = 0) {
  const [cx, cy] = px(x + .5, y + .5);
  ctx.fillStyle = '#ff0'; poly(cx + 2, cy - ht - 30, cx - 5, cy - ht - 16, cx, cy - ht - 16, cx - 2, cy - ht - 6, cx + 5, cy - ht - 20, cx, cy - ht - 20);
}
function underground(S, x0, x1, y0, y1) {
  const { under } = S;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = idx(x, y);
    if (under[i] & SUBWAY) { const m = mask(S, i, j => under[j] & SUBWAY); strokeLinks(x, y, m, '#ccc', 12); strokeLinks(x, y, m, '#333', 4); }
    if (under[i] & PIPE) strokeLinks(x, y, mask(S, i, j => under[j] & PIPE), '#3af', 5);
  }
}
export const VIEWS = { pollution: ['pollution', '#a0a'], crime: ['crime', '#f00'], value: ['value', '#0f0'], traffic: ['traffic', '#f80'],
  police: ['covPolice', '#36f'], fire: ['covFire', '#e33'], edu: ['covEdu', '#fc6'], health: ['covHealth', '#fff'], transit: ['covTransit', '#999'] };
function overlay(S, view, x0, x1, y0, y1) {
  const { surf, flags } = S;
  const fl = view === 'power' ? POW : view === 'water' ? WAT : 0;
  const V = VIEWS[view], g = V && S[V[0]];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = idx(x, y);
    if (fl) {
      if (surf[i] === EMPTY || surf[i] === RUBBLE) continue;
      ctx.globalAlpha = .45; ctx.fillStyle = flags[i] & fl ? (fl === POW ? '#ff0' : '#3af') : '#f00';
    } else {
      const v = view === 'value' ? Math.max(0, g[i] - 100) * 1.6 : g[i];
      if (v < 8) continue;
      ctx.globalAlpha = v / 255 * .7; ctx.fillStyle = V[1];
    }
    diamond(ctx, x, y); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function cursor(S, ui) {
  const T = TOOLS[ui.tool];
  if (!T || T === TOOLS.pan) return;
  let x0, y0, x1, y1, ok = true;
  if (ui.rect) { [x0, y0, x1, y1] = ui.rect; if (x0 > x1) [x0, x1] = [x1, x0]; if (y0 > y1) [y0, y1] = [y1, y0]; }
  else if (ui.hover) {
    [x0, y0] = ui.hover; const B = T.bld ? CAT[T.bld] : null;
    x1 = x0 + (B ? B[1] : 1) - 1; y1 = y0 + (B ? B[2] : 1) - 1;
    ok = canPlace(S, ui.tool, x0, y0, ui.ug) >= 0;
  } else return;
  const [ax, ay] = px(x0, y0), [bx, by] = px(x1 + 1, y0), [cx, cy] = px(x1 + 1, y1 + 1), [dx, dy] = px(x0, y1 + 1);
  ctx.globalAlpha = .4; ctx.fillStyle = ok ? '#0f0' : '#f00'; poly(ax, ay, bx, by, cx, cy, dx, dy);
  ctx.globalAlpha = 1; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
}

export function draw(S, ui) {
  const { ox, oy, z } = cam;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0b1a2b'; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(dpr * z, 0, 0, dpr * z, ox * dpr, oy * dpr);
  ctx.lineCap = 'round';
  const [x0, x1, y0, y1] = range();
  if (z < .5 && !ui.ug) ctx.drawImage(far, -N * 32, 0, N * 64, N * 32);
  else if (ui.ug) {
    ctx.globalAlpha = .35; ground(S, x0, x1, y0, y1); ctx.globalAlpha = 1;
    underground(S, x0, x1, y0, y1);
  } else { ground(S, x0, x1, y0, y1); objects(S, x0, x1, y0, y1); disasterSprite(S); }
  if (ui.view) overlay(S, ui.view, x0, x1, y0, y1);
  cursor(S, ui);
  // minimap
  const mw = mini.width, mh = mini.height, s = mw / (N * 64);
  mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.clearRect(0, 0, mw, mh);
  mctx.drawImage(far, 0, 0, mw, mh);
  mctx.strokeStyle = '#fff'; mctx.lineWidth = 2;
  mctx.strokeRect((N * 32 - ox / z) * s, -oy / z * s, W / z * s, H / z * s);
}
export function miniToWorld(mx, my) { const s = mini.clientWidth / (N * 64); return [mx / s - N * 32, my / s]; }
