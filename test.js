// node test.js — no framework. Throws on first failure.
import { N, WATER, LAND, EMPTY, ROAD, RAIL, XING, HXING, BLD, RUBBLE, POW, WAT, FIRE, ZR } from './data.js';
import { newGame, tick, place, canPlace, save, load, idx, ignite, recompute } from './sim.js';

const ok = (c, m) => { if (!c) throw new Error('FAIL: ' + m); console.log('ok', m); };
const flat = S => { S.terrain.fill(LAND); S.nearWater.fill(0); }; // deterministic test board

// terrain
{
  const a = newGame(7), b = newGame(7);
  ok(a.terrain.every((v, i) => v === b.terrain[i]), 'seed is deterministic');
  ok(a.terrain.includes(WATER), 'map has water');
}
// placement + money
{
  const S = newGame(1); flat(S); S.money = 1000;
  ok(place(S, 'road', 5, 5), 'road placed');
  ok(S.money === 990 && !place(S, 'road', 5, 5) && S.money === 990, 'road idempotent, charged once');
  ok(canPlace(S, 'police', 5, 5) === -1, '3x3 rejects overlap with road');
  ok(canPlace(S, 'police', N - 2, 5) === -1, '3x3 rejects out of bounds');
  S.terrain[idx(11, 10)] = WATER;
  ok(canPlace(S, 'police', 10, 10) === -1, '3x3 rejects water');
  S.terrain[idx(11, 10)] = LAND; S.money = 1e6;
  ok(place(S, 'police', 10, 10) && S.surf[idx(12, 12)] === BLD, 'police footprint set');
  ok(place(S, 'bulldoze', 12, 12) && S.surf[idx(10, 10)] === EMPTY && S.bid[idx(11, 11)] === 0, 'bulldoze clears all 9 via anchor');
  ok(place(S, 'rail', 5, 5) && S.surf[idx(5, 5)] === XING && !place(S, 'road', 5, 5) && !place(S, 'rail', 5, 5), 'rail over road → crossing, idempotent');
  place(S, 'rail', 7, 7); ok(place(S, 'road', 7, 7) && S.surf[idx(7, 7)] === XING, 'road over rail → crossing');
  ok(place(S, 'bulldoze', 7, 7) && S.surf[idx(7, 7)] === EMPTY, 'bulldoze crossing');
  place(S, 'hwy', 9, 9); ok(place(S, 'rail', 9, 9) && S.surf[idx(9, 9)] === HXING && !place(S, 'hwy', 9, 9) && canPlace(S, 'road', 9, 9) === -1, 'rail over highway → crossing');
  place(S, 'road', 8, 8); ok(place(S, 'wire', 8, 8) && S.surf[idx(8, 8)] === ROAD && !place(S, 'wire', 8, 8), 'wire over road keeps road, idempotent');
  ok(canPlace(S, 'bulldoze', 8, 8, 1) === -1 && place(S, 'bulldoze', 8, 8) && S.under[idx(8, 8)] === 0, 'bulldozing road drops its wire');
  S.money = 5; ok(!place(S, 'road', 6, 6), 'no money → no place');
}
// power
{
  const S = newGame(2); flat(S); S.money = 1e6;
  place(S, 'coal', 10, 10);
  for (let x = 14; x < 20; x++) place(S, 'wire', x, 10);
  place(S, 'zr', 20, 10); place(S, 'zr', 21, 10);
  recompute(S);
  ok(S.flags[idx(21, 10)] & POW, 'zone powered through wire chain');
  place(S, 'bulldoze', 16, 10); recompute(S);
  ok(!(S.flags[idx(21, 10)] & POW), 'cut wire → unpowered');
  place(S, 'wire', 16, 10); place(S, 'wind', 22, 10); recompute(S);
  ok(S.powerCap === 3100, 'two plants on one net sum capacity');
  S.lvl[idx(20, 10)] = 8; S.lvl[idx(21, 10)] = 8; // 16 units use (r: 1/lvl)
  place(S, 'bulldoze', 12, 12); recompute(S);   // remove coal, only wind (100) left
  ok(S.powerCap === 100 && (S.flags[idx(21, 10)] & POW), 'wind covers 16');
  for (let x = 23; x < 40; x++) { place(S, 'zid', x, 10); S.lvl[idx(x, 10)] = 8; } recompute(S);
  ok(S.powerUse > S.powerCap && !(S.flags[idx(21, 10)] & POW), 'over-demand → brownout');
}
// water
{
  const S = newGame(3); flat(S); S.money = 1e6;
  S.terrain[idx(0, 0)] = WATER; S.nearWater[idx(1, 1)] = 1;
  place(S, 'wind', 5, 5); place(S, 'zr', 6, 5); place(S, 'road', 6, 6); S.lvl[idx(6, 5)] = 1;
  ok(canPlace(S, 'pump', 5, 5) === -1 && place(S, 'pump', 1, 1), 'pump only next to water');
  for (let x = 1; x <= 6; x++) place(S, 'pipe', x, 4, 1);
  place(S, 'pipe', 1, 2, 1); place(S, 'pipe', 1, 3, 1);
  recompute(S);
  ok(!(S.flags[idx(6, 5)] & WAT), 'unpowered pump gives no water');
  for (let x = 2; x <= 4; x++) place(S, 'wire', x, 1); place(S, 'wire', 5, 1); place(S, 'wire', 5, 2); place(S, 'wire', 5, 3); place(S, 'wire', 5, 4);
  recompute(S);
  ok(S.flags[idx(1, 1)] & POW, 'pump powered');
  ok(S.flags[idx(6, 5)] & WAT, 'zone watered via pipe adjacency');
}
// growth
{
  const S = newGame(4); flat(S); S.money = 1e6; S.disastersOn = false;
  place(S, 'wind', 10, 11); place(S, 'wind', 11, 11);
  for (let x = 10; x < 20; x++) place(S, 'road', x, 12);
  for (let x = 12; x < 20; x++) place(S, 'zr', x, 11);
  for (let x = 10; x < 20; x++) place(S, 'zi', x, 13);
  for (let m = 0; m < 24 * 16; m++) tick(S);
  const l = S.lvl[idx(15, 11)];
  ok(l >= 1 && l <= 2 && S.pop > 0, `zone grows without water but caps at 2 (lvl ${l})`);
  ok(S.hist.length === 12 && S.year === 1902, '24 months of budget history, year advanced');
}
// save/load
{
  const S = newGame(5); S.money = 1234; place(S, 'road', 3, 3);
  const T = load(save(S));
  ok(T.money === S.money && T.surf[idx(3, 3)] === ROAD && T.terrain.every((v, i) => v === S.terrain[i]), 'save → load roundtrip');
}
// fire
{
  const S = newGame(6); flat(S); S.money = 1e6; S.disastersOn = false;
  place(S, 'zr', 30, 30); S.lvl[idx(30, 30)] = 3; ignite(S, idx(30, 30));
  for (let t = 0; t < 400; t++) tick(S);
  ok(S.surf[idx(30, 30)] === RUBBLE && !S.fireCount, 'lone fire burns out to rubble');
}
console.log('all passed');
