// Pure simulation. No DOM. Importable from node for tests.
import { N, LAND, WATER, TREES, EMPTY, ROAD, RAIL, HWY, WIRE, XING, ZR, ZRD, ZID, BLD, RUBBLE, PIPE, SUBWAY, WIREX,
  POW, WAT, FIRE, FLOOD, COAL, PUMP, TOWER, PARK, CAT, TOOLS, K } from './data.js';

export const NN = N * N;
const SAVED = ['terrain', 'surf', 'under', 'lvl', 'bid', 'off', 'flags'];
const DERIVED = ['net', 'rd', 'pollution', 'crime', 'value', 'traffic', 'covPolice', 'covFire',
  'covEdu', 'covHealth', 'covTransit', 'nearWater', 'tmp', 'tmp2'];
const SCALARS = ['seed', 'rngA', 'tick', 'month', 'year', 'money', 'speed', 'tax', 'fund',
  'disastersOn', 'disaster', 'dem', 'pop', 'jobs', 'powerCap', 'powerUse', 'waterCap', 'waterUse', 'hist'];
const COV = { police: 'covPolice', fire: 'covFire', edu: 'covEdu', health: 'covHealth', station: 'covTransit' };
const FUND = { police: 'police', fire: 'fire', edu: 'edu', health: 'health', station: 'transport' };

// mulberry32, state lives in S.rngA so saves are deterministic
export function rand(S) {
  let t = S.rngA = (S.rngA + 0x6D2B79F5) | 0;
  t = Math.imul(t ^ t >>> 15, 1 | t);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export const idx = (x, y) => y * N + x;
export const isZone = s => s >= ZR && s <= ZID;
export const zk = s => (s - ZR) % 3; // 0 r, 1 c, 2 i
export const isRoad = s => s === ROAD || s === HWY || s === XING;
const crossing = (a, b) => (a === ROAD && b === RAIL) || (a === RAIL && b === ROAD);
export const anchorOf = (S, i) => i - (S.off[i] >> 4) - (S.off[i] & 15) * N;
const clamp8 = v => v < 0 ? 0 : v > 255 ? 255 : v | 0;
const clamp1 = v => v < -1 ? -1 : v > 1 ? 1 : v;

function blank(seed) {
  const S = {
    seed, rngA: seed | 0, tick: 0, month: 0, year: 1900, money: K.START_MONEY, speed: 1,
    tax: [7, 7, 7], fund: { police: 100, fire: 100, transport: 100, edu: 100, health: 100 },
    disastersOn: true, disaster: { k: 0, x: 0, y: 0, ttl: 0 }, dem: [0, 0, 0],
    pop: 0, jobs: 0, powerCap: 0, powerUse: 0, waterCap: 0, waterUse: 0, hist: [],
    msg: '', dirtyTiles: [], fireCount: 0, stack: new Int32Array(NN),
  };
  for (const g of SAVED) S[g] = new Uint8Array(NN);
  for (const g of DERIVED) S[g] = new Uint8Array(NN);
  return S;
}
export function newGame(seed) { const S = blank(seed); genTerrain(S); prep(S); return S; }

// ---------- terrain ----------
function stamp(S, g, cx, cy, r, v, only) {
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if (x < 0 || y < 0 || x >= N || y >= N || (x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
    const i = idx(x, y);
    if (only == null || g[i] === only) g[i] = v;
  }
}
function walk(S, x, y, len, r, v, only, bx = 0, by = 0) {
  for (let k = 0; k < len; k++) {
    stamp(S, S.terrain, x | 0, y | 0, r, v, only);
    x = Math.max(0, Math.min(N - 1, x + rand(S) * 2 - 1 + bx));
    y = Math.max(0, Math.min(N - 1, y + rand(S) * 2 - 1 + by));
  }
}
function genTerrain(S) {
  const t = S.terrain;
  const nl = 3 + (rand(S) * 4 | 0);
  for (let l = 0; l < nl; l++) walk(S, rand(S) * N, rand(S) * N, 150 + rand(S) * 300, 2, WATER);
  // one river across the map
  const side = rand(S) * 4 | 0, p = rand(S) * N;
  if (side === 0) walk(S, 0, p, N * 2, 1, WATER, null, .7, 0);
  else if (side === 1) walk(S, N - 1, p, N * 2, 1, WATER, null, -.7, 0);
  else if (side === 2) walk(S, p, 0, N * 2, 1, WATER, null, 0, .7);
  else walk(S, p, N - 1, N * 2, 1, WATER, null, 0, -.7);
  // majority smoothing
  const c = S.tmp;
  for (let pass = 0; pass < 2; pass++) {
    c.set(t);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let w = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= N || yy >= N) continue;
        if (c[idx(xx, yy)] === WATER) w++;
      }
      const i = idx(x, y);
      if (w >= 5) t[i] = WATER; else if (w <= 3) t[i] = LAND;
    }
  }
  for (let k = 0; k < 30; k++) walk(S, rand(S) * N, rand(S) * N, 40 + rand(S) * 80, 1, TREES, LAND);
}
function prep(S) {
  const { terrain, nearWater, flags } = S;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let w = 0;
    for (let dy = -3; dy <= 3 && !w; dy++) for (let dx = -3; dx <= 3; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < N && yy < N && terrain[idx(xx, yy)] === WATER) { w = 1; break; }
    }
    nearWater[idx(x, y)] = w;
  }
  S.fireCount = 0;
  for (let i = 0; i < NN; i++) if (flags[i] & FIRE) S.fireCount++;
  recompute(S);
}
export function recompute(S) { for (let p = 0; p < 9; p++) PHASES[p](S); }

// ---------- placement ----------
function footprint(S, x, y, B, fn) {
  for (let dy = 0; dy < B[2]; dy++) for (let dx = 0; dx < B[1]; dx++) {
    const xx = x + dx, yy = y + dy;
    if (xx >= N || yy >= N) return false;
    if (fn(idx(xx, yy), dx, dy) === false) return false;
  }
  return true;
}
function adjWater(S, x, y) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const xx = x + dx, yy = y + dy;
    if (xx >= 0 && yy >= 0 && xx < N && yy < N && S.terrain[idx(xx, yy)] === WATER) return true;
  }
  return false;
}
// returns cost > 0 if placeable, 0 if no-op (already there), -1 if blocked
export function canPlace(S, tool, x, y, ug) {
  const T = TOOLS[tool];
  if (!T || x < 0 || y < 0 || x >= N || y >= N) return -1;
  const i = idx(x, y), sf = S.surf[i], tr = S.terrain[i];
  if (tool === 'bulldoze') {
    if (ug) return S.under[i] & (PIPE | SUBWAY) ? T.cost : -1;
    return sf !== EMPTY || tr === TREES ? T.cost : -1;
  }
  if (T.under) return S.under[i] & T.under ? 0 : T.cost;          // pipes/subways may run under water
  if (T.surf === WIRE && tr === WATER) return sf === EMPTY ? T.cost : sf === WIRE ? 0 : -1; // lines may cross water
  if (tr === WATER) return -1;                                       // ponytail: no bridges; add a BRIDGE surf if wanted
  if (T.surf === WIRE && (isRoad(sf) || sf === RAIL)) return S.under[i] & WIREX ? 0 : T.cost;
  if (T.surf) return sf === EMPTY || sf === RUBBLE || crossing(T.surf, sf) ? T.cost
    : sf === T.surf || (sf === XING && (T.surf === ROAD || T.surf === RAIL)) ? 0 : -1;
  const B = CAT[T.bld];
  if (T.bld === PUMP && !adjWater(S, x, y)) return -1;
  const ok = footprint(S, x, y, B, j => S.terrain[j] !== WATER && (S.surf[j] === EMPTY || S.surf[j] === RUBBLE));
  return ok ? B[3] : -1;
}
export function place(S, tool, x, y, ug) {
  const c = canPlace(S, tool, x, y, ug);
  if (c <= 0) return false;
  if (S.money < c) { S.msg = 'Not enough money'; return false; }
  S.money -= c;
  const T = TOOLS[tool], i = idx(x, y);
  if (tool === 'bulldoze') {
    if (ug) S.under[i] &= ~(PIPE | SUBWAY);
    else if (S.surf[i] === BLD) clearBld(S, i, EMPTY);
    else { S.surf[i] = EMPTY; S.under[i] &= ~WIREX; S.lvl[i] = 0; S.flags[i] &= ~FIRE; if (S.terrain[i] === TREES) S.terrain[i] = LAND; }
  } else if (T.under) S.under[i] |= T.under;
  else if (T.surf === WIRE && S.surf[i] !== EMPTY && S.surf[i] !== RUBBLE) S.under[i] |= WIREX;
  else if (T.surf) { S.surf[i] = crossing(T.surf, S.surf[i]) ? XING : T.surf; S.lvl[i] = 0; if (S.terrain[i] === TREES) S.terrain[i] = LAND; }
  else footprint(S, x, y, CAT[T.bld], (j, dx, dy) => {
    S.surf[j] = BLD; S.bid[j] = T.bld; S.off[j] = dx << 4 | dy; S.lvl[j] = 0;
    if (S.terrain[j] === TREES) S.terrain[j] = LAND;
    S.dirtyTiles.push(j);
  });
  S.dirtyTiles.push(i);
  return true;
}
function clearBld(S, i, to) {
  const a = anchorOf(S, i), B = CAT[S.bid[a]];
  footprint(S, a % N, (a / N) | 0, B, j => {
    S.surf[j] = to; S.bid[j] = 0; S.off[j] = 0; S.flags[j] &= ~FIRE; S.dirtyTiles.push(j);
  });
}

// ---------- networks ----------
// Labels connected components from sources; FLAG set where component supply >= demand.
function flood(S, FLAG, srcCap, conducts, useOf) {
  const { net, flags, stack } = S;
  net.fill(0);
  const cap = [0], use = [0];
  let k = 0;
  for (let i = 0; i < NN; i++) {
    if (net[i] || !srcCap(i)) continue;
    if (k === 255) break; // ponytail: Uint8 net ids, 255 separate networks max
    k++; cap.push(0); use.push(0);
    let sp = 0; stack[sp++] = i; net[i] = k;
    while (sp) {
      const j = stack[--sp];
      cap[k] += srcCap(j); use[k] += useOf(j);
      const x = j % N;
      if (x > 0 && !net[j - 1] && conducts(j - 1)) { net[j - 1] = k; stack[sp++] = j - 1; }
      if (x < N - 1 && !net[j + 1] && conducts(j + 1)) { net[j + 1] = k; stack[sp++] = j + 1; }
      if (j >= N && !net[j - N] && conducts(j - N)) { net[j - N] = k; stack[sp++] = j - N; }
      if (j < NN - N && !net[j + N] && conducts(j + N)) { net[j + N] = k; stack[sp++] = j + N; }
    }
  }
  let tc = 0, tu = 0;
  for (let n = 1; n <= k; n++) { tc += cap[n]; tu += use[n]; }
  for (let i = 0; i < NN; i++) {
    const n = net[i];
    if (n && use[n] <= cap[n]) flags[i] |= FLAG; else flags[i] &= ~FLAG;
  }
  return [tc, tu];
}
function powerFlood(S) {
  const { surf, off, bid, lvl } = S;
  const isPlant = i => surf[i] === BLD && off[i] === 0 && CAT[bid[i]][5] === 'power';
  [S.powerCap, S.powerUse] = flood(S, POW,
    i => isPlant(i) ? CAT[bid[i]][6] : 0,
    i => surf[i] !== EMPTY && surf[i] !== RUBBLE,
    i => isZone(surf[i]) ? lvl[i] * K.PW[zk(surf[i])] : surf[i] === BLD && off[i] === 0 ? CAT[bid[i]][4] / 10 : 0);
}
function waterFlood(S) {
  const { surf, off, bid, lvl, under, flags } = S;
  const src = i => surf[i] === BLD && off[i] === 0 && (flags[i] & POW) &&
    (bid[i] === TOWER || (bid[i] === PUMP && adjWater(S, i % N, (i / N) | 0))) ? CAT[bid[i]][6] : 0;
  [S.waterCap, S.waterUse] = flood(S, WAT, src,
    i => (under[i] & PIPE) || (surf[i] >= ZR && surf[i] !== RUBBLE),
    i => isZone(surf[i]) ? lvl[i] * K.WT[zk(surf[i])] : 0);
}
// Chebyshev distance to nearest road, capped at 4 (two-pass chamfer)
function roadDist(S) {
  const { rd, surf } = S;
  for (let i = 0; i < NN; i++) rd[i] = isRoad(surf[i]) ? 0 : 4;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y); let v = rd[i];
    if (x > 0) v = Math.min(v, rd[i - 1] + 1);
    if (y > 0) {
      v = Math.min(v, rd[i - N] + 1);
      if (x > 0) v = Math.min(v, rd[i - N - 1] + 1);
      if (x < N - 1) v = Math.min(v, rd[i - N + 1] + 1);
    }
    rd[i] = v;
  }
  for (let y = N - 1; y >= 0; y--) for (let x = N - 1; x >= 0; x--) {
    const i = idx(x, y); let v = rd[i];
    if (x < N - 1) v = Math.min(v, rd[i + 1] + 1);
    if (y < N - 1) {
      v = Math.min(v, rd[i + N] + 1);
      if (x < N - 1) v = Math.min(v, rd[i + N + 1] + 1);
      if (x > 0) v = Math.min(v, rd[i + N - 1] + 1);
    }
    rd[i] = v;
  }
}
function coverage(S) {
  for (const g of Object.values(COV)) S[g].fill(0);
  const { surf, off, bid, flags } = S;
  for (let i = 0; i < NN; i++) {
    if (surf[i] !== BLD || off[i]) continue;
    const B = CAT[bid[i]], g = S[COV[B[5]]];
    if (!g || (B[5] !== 'station' && !(flags[i] & POW))) continue;
    const R = B[6] * S.fund[FUND[B[5]]] / 100, cx = i % N + B[1] / 2, cy = ((i / N) | 0) + B[2] / 2;
    for (let y = Math.max(0, cy - R | 0); y <= Math.min(N - 1, cy + R | 0); y++)
      for (let x = Math.max(0, cx - R | 0); x <= Math.min(N - 1, cx + R | 0); x++) {
        const d = Math.hypot(x + .5 - cx, y + .5 - cy);
        if (d >= R) continue;
        const v = 255 * (1 - d / R) | 0, j = idx(x, y);
        if (v > g[j]) g[j] = v;
      }
  }
}
function blur(src, dst) {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let s = 0, c = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy; if (yy < 0 || yy >= N) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx; if (xx < 0 || xx >= N) continue;
        s += src[idx(xx, yy)]; c++;
      }
    }
    dst[idx(x, y)] = s / c | 0;
  }
}
function pollutionPass(S) {
  const { tmp, tmp2, pollution: P, surf, lvl, terrain, traffic, bid } = S;
  for (let i = 0; i < NN; i++) {
    const s = surf[i]; let e = P[i] * .6;
    if (isZone(s)) { if (zk(s) === 2) e += lvl[i] * 20; }
    else if (s === BLD) { if (bid[i] === COAL) e += 200; else if (bid[i] === PARK) e -= 30; }
    else if (isRoad(s)) e += traffic[i] / 4;
    if (terrain[i] === TREES) e -= 30;
    tmp[i] = clamp8(e);
  }
  blur(tmp, tmp2); blur(tmp2, P);
}
function trafficPass(S) {
  const { tmp, traffic, surf, lvl, covTransit } = S;
  tmp.fill(0);
  const f = 100 / Math.max(10, S.fund.transport);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y);
    if (!isZone(surf[i]) || !lvl[i]) continue;
    const amt = lvl[i] * (covTransit[i] ? 1 : 2) * f;
    for (let yy = Math.max(0, y - 3); yy <= Math.min(N - 1, y + 3); yy++)
      for (let xx = Math.max(0, x - 3); xx <= Math.min(N - 1, x + 3); xx++) {
        const j = idx(xx, yy);
        if (isRoad(surf[j])) tmp[j] = clamp8(tmp[j] + amt);
      }
  }
  for (let i = 0; i < NN; i++) traffic[i] = (traffic[i] + (surf[i] === HWY ? tmp[i] >> 2 : tmp[i])) >> 1;
}
function crimePass(S) {
  const { tmp, crime, surf, lvl, value, covPolice } = S;
  for (let i = 0; i < NN; i++) {
    const s = surf[i];
    const base = isZone(s) && zk(s) !== 2 ? lvl[i] * 12 : s === RUBBLE ? 40 : 0;
    tmp[i] = clamp8(base - value[i] / 4 - covPolice[i] * .8);
  }
  blur(tmp, crime);
}
function valuePass(S) {
  const { tmp, value, surf, bid, terrain, nearWater, covEdu, covHealth, pollution, crime } = S;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = idx(x, y);
    let green = 0;
    for (let yy = Math.max(0, y - 2); yy <= Math.min(N - 1, y + 2) && !green; yy++)
      for (let xx = Math.max(0, x - 2); xx <= Math.min(N - 1, x + 2); xx++) {
        const j = idx(xx, yy);
        if (terrain[j] === TREES || (surf[j] === BLD && bid[j] === PARK)) { green = 1; break; }
      }
    tmp[i] = clamp8(100 + nearWater[i] * 40 + green * 25 + covEdu[i] / 5 + covHealth[i] / 5 - pollution[i] / 2 - crime[i] / 2);
  }
  blur(tmp, value);
}
function demand(S) {
  const { surf, lvl } = S;
  let pop = 0, jc = 0, ji = 0;
  for (let i = 0; i < NN; i++) {
    const s = surf[i];
    if (!isZone(s)) continue;
    const p = K.POP_PER_LVL[lvl[i]], k = zk(s);
    if (k === 0) pop += p; else if (k === 1) jc += p; else ji += p;
  }
  S.pop = pop; S.jobs = jc + ji;
  const workers = pop * K.WORK, t = S.tax;
  S.dem[0] = clamp1((jc + ji - workers) / (workers + 200) - (t[0] - 7) * .05 + K.RBIAS);
  S.dem[1] = clamp1((workers * K.CSHARE - jc) / (jc + 100) - (t[1] - 7) * .05);
  S.dem[2] = clamp1((workers * K.ISHARE - ji) / (ji + 100) - (t[2] - 7) * .05 + K.EXT * Math.max(0, 1 - pop / 40000));
}
function growZones(S) {
  const { surf, lvl, flags, rd, value, pollution, crime, traffic, covEdu, covHealth, dem } = S;
  for (let i = 0; i < NN; i++) {
    const s = surf[i];
    if (!isZone(s)) continue;
    const k = zk(s), W = K.W[k], x = i % N;
    let score;
    if (!(flags[i] & POW) || rd[i] > 3) score = -.3;
    else {
      const tr = Math.max(x > 0 ? traffic[i - 1] : 0, x < N - 1 ? traffic[i + 1] : 0,
        i >= N ? traffic[i - N] : 0, i < NN - N ? traffic[i + N] : 0);
      score = W.dem * dem[k] + W.val * (value[i] - 128) / 128 - W.pol * pollution[i] / 255
        - W.crime * crime[i] / 255 - W.traf * tr / 255 + W.svc * (covEdu[i] + covHealth[i]) / 510
        + (rand(S) - .5) * .2;
    }
    let cap = s >= ZRD ? 8 : 3;
    if (!(flags[i] & WAT)) cap = Math.min(cap, 2);
    const l = lvl[i];
    if (score > K.GROW_T && l < cap && rand(S) < K.P_GROW) { lvl[i] = l + 1; S.dirtyTiles.push(i); }
    else if ((score < K.DECAY_T || l > cap) && l > 0 && rand(S) < K.P_DECAY) { lvl[i] = l - 1; S.dirtyTiles.push(i); }
  }
}
function monthEnd(S) {
  const { surf, lvl, off, bid, under } = S;
  let inc = 0, exp = 0, tiles = 0;
  for (let i = 0; i < NN; i++) {
    const s = surf[i];
    if (isZone(s)) inc += K.POP_PER_LVL[lvl[i]] * K.TAXBASE[zk(s)] * S.tax[zk(s)] / 100;
    else if (isRoad(s) || s === RAIL) tiles++;
    else if (s === BLD && !off[i]) { const B = CAT[bid[i]], f = FUND[B[5]]; exp += B[4] * (f ? S.fund[f] / 100 : 1); }
    tiles += (under[i] & 1) + (under[i] >> 1 & 1);
  }
  exp += tiles * K.ROAD_MAINT * S.fund.transport / 100;
  inc |= 0; exp |= 0;
  S.money += inc - exp;
  S.hist.push({ inc, exp });
  if (S.hist.length > 12) S.hist.shift();
  if (++S.month === 12) { S.month = 0; S.year++; S.yearEnd = true; }
  if (S.month % 3 === 0) S.needSave = true;
  if (S.disastersOn && !S.disaster.k && rand(S) < K.DISASTER_P) startDisaster(S, 1 + (rand(S) * 5 | 0));
}

// ---------- disasters ----------
const flammable = (S, i) => (isZone(S.surf[i]) && S.lvl[i] > 0) || S.surf[i] === BLD || (S.terrain[i] === TREES && S.surf[i] === EMPTY);
const destroyable = (S, i) => S.surf[i] !== EMPTY && S.surf[i] !== RUBBLE;
export function ignite(S, i) { if (!(S.flags[i] & FIRE)) { S.flags[i] |= FIRE; S.fireCount++; } }
function destroy(S, i) {
  if (S.surf[i] === BLD) clearBld(S, i, RUBBLE);
  else { S.surf[i] = RUBBLE; S.lvl[i] = 0; S.flags[i] &= ~FIRE; S.dirtyTiles.push(i); }
}
function burnOut(S, i) {
  if (S.surf[i] !== EMPTY) destroy(S, i);
  else { S.terrain[i] = LAND; S.flags[i] &= ~FIRE; S.dirtyTiles.push(i); }
}
export const DISASTERS = ['', 'Fire', 'Tornado', 'Earthquake', 'Flood', 'Monster'];
export function startDisaster(S, k) {
  const D = S.disaster, x = rand(S) * N | 0, y = rand(S) * N | 0;
  S.msg = DISASTERS[k] + '!';
  if (k === 1) {
    for (let t = 0; t < 500; t++) { const i = rand(S) * NN | 0; if (flammable(S, i)) { ignite(S, i); break; } }
  } else if (k === 2 || k === 5) Object.assign(D, { k, x, y, ttl: k === 5 ? 80 : 40 });
  else if (k === 3) {
    for (let i = 0; i < NN; i++) if (rand(S) < .02 && destroyable(S, i)) destroy(S, i);
    for (let t = 0; t < 40; t++) { const i = rand(S) * NN | 0; if (flammable(S, i)) ignite(S, i); }
  } else if (k === 4) {
    for (let i = 0; i < NN; i++) if (S.nearWater[i] && S.terrain[i] !== WATER) S.flags[i] |= FLOOD;
    Object.assign(D, { k, ttl: 16 });
  }
}
function disasterStep(S) {
  const D = S.disaster;
  if (D.k === 4) {
    for (let i = 0; i < NN; i++) if (S.flags[i] & FLOOD) {
      if (S.lvl[i] > 0 && rand(S) < .05) { S.lvl[i]--; S.dirtyTiles.push(i); }
      if (!D.ttl) S.flags[i] &= ~FLOOD;
    }
    if (D.ttl-- <= 0) D.k = 0;
    return;
  }
  const r = D.k === 5 ? 2 : 1;
  D.x = Math.max(0, Math.min(N - 1, D.x + (rand(S) * 3 | 0) - 1));
  D.y = Math.max(0, Math.min(N - 1, D.y + (rand(S) * 3 | 0) - 1));
  for (let y = Math.max(0, D.y - r); y <= Math.min(N - 1, D.y + r); y++)
    for (let x = Math.max(0, D.x - r); x <= Math.min(N - 1, D.x + r); x++) {
      const i = idx(x, y);
      if (destroyable(S, i) && rand(S) < .5) destroy(S, i);
      else if (flammable(S, i) && rand(S) < .1) ignite(S, i);
    }
  if (--D.ttl <= 0) D.k = 0;
}
function fireStep(S) {
  const { flags, stack, covFire } = S;
  let n = 0, cnt = 0;
  for (let i = 0; i < NN; i++) if (flags[i] & FIRE) stack[n++] = i;
  for (let q = 0; q < n; q++) {
    const i = stack[q];
    if (!(flags[i] & FIRE)) continue; // cleared by a neighbour's building collapse
    if (rand(S) < .125) { burnOut(S, i); continue; }
    if (rand(S) < covFire[i] / 255 * .3) { flags[i] &= ~FIRE; S.dirtyTiles.push(i); continue; }
    cnt++;
    const x = i % N, nb = [x > 0 ? i - 1 : -1, x < N - 1 ? i + 1 : -1, i >= N ? i - N : -1, i < NN - N ? i + N : -1];
    for (const j of nb) if (j >= 0 && !(flags[j] & FIRE) && flammable(S, j) && rand(S) < .15 * (1 - covFire[j] / 255)) {
      flags[j] |= FIRE; cnt++;
    }
  }
  S.fireCount = cnt;
}

// ---------- tick ----------
const PHASES = [powerFlood, waterFlood, roadDist, coverage, pollutionPass, trafficPass, crimePass, valuePass, demand, growZones];
export function tick(S) {
  if (S.fireCount) fireStep(S);
  if (S.disaster.k) disasterStep(S);
  const ph = S.tick & 15;
  if (ph < PHASES.length) PHASES[ph](S);
  else if (ph === 15) monthEnd(S);
  S.tick++;
}

// ---------- save / load ----------
function b64(a) {
  let s = '';
  for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode.apply(null, a.subarray(i, i + 8192));
  return btoa(s);
}
function unb64(s, a) { const d = atob(s); for (let i = 0; i < a.length; i++) a[i] = d.charCodeAt(i); }
export function save(S) {
  const o = { v: 1, g: {} };
  for (const k of SCALARS) o[k] = S[k];
  for (const g of SAVED) o.g[g] = b64(S[g]);
  return JSON.stringify(o);
}
export function load(json) {
  const o = JSON.parse(json), S = blank(o.seed);
  for (const k of SCALARS) if (k in o) S[k] = o[k];
  for (const g of SAVED) unb64(o.g[g], S[g]);
  prep(S);
  return S;
}
