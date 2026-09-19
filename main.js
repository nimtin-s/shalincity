import { K } from './data.js';
import { newGame, load, save, tick } from './sim.js';
import * as R from './render.js';
import { setup } from './input.js';

const KEY = 'shalincity';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const G = { S: null, ui: { tool: 'road', hover: null, rect: null, view: '', ug: false, ugToggle: false }, dirty: true };

try { const j = localStorage.getItem(KEY); G.S = j ? load(j) : null; } catch (e) { console.warn('bad save', e); }
if (!G.S) G.S = newGame((Math.random() * 2 ** 32) >>> 0);
G.save = () => { try { localStorage.setItem(KEY, save(G.S)); } catch (e) { console.warn(e); } G.S.needSave = false; };

R.init(document.getElementById('c'), document.getElementById('mini'));
R.buildFar(G.S); R.center();
setup(G);
addEventListener('resize', () => { R.resize(); G.dirty = true; });
document.addEventListener('visibilitychange', () => { if (document.hidden) G.save(); });

const $ = s => document.querySelector(s);
const el = { money: $('#money'), pop: $('#pop'), date: $('#date'), msg: $('#msg'), undo: $('#undoBtn'), dem: [$('#dr'), $('#dc'), $('#di')] };
let msgT = 0;
function hud(S) {
  el.money.textContent = '$' + S.money.toLocaleString();
  el.pop.textContent = S.pop.toLocaleString();
  el.date.textContent = MONTHS[S.month] + ' ' + S.year;
  S.dem.forEach((d, k) => { const b = el.dem[k]; b.style.height = Math.abs(d) * 14 + 2 + 'px'; b.classList.toggle('neg', d < 0); });
  document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('sel', +b.dataset.speed === S.speed));
  el.undo.disabled = !G.undo.length;
  if (S.msg) { el.msg.textContent = S.msg; el.msg.style.opacity = 1; msgT = performance.now() + 2500; S.msg = ''; }
  else if (msgT && performance.now() > msgT) { el.msg.style.opacity = 0; msgT = 0; }
}

let acc = 0, last = performance.now();
function frame(t) {
  const S = G.S, dt = Math.min(t - last, 250); last = t;
  if (S.speed) {
    acc += dt * S.speed;
    for (let n = 0; acc >= K.TICK_MS && n < 4; n++) { tick(S); acc -= K.TICK_MS; G.dirty = true; }
    if (acc > K.TICK_MS * 4) acc = 0;
  }
  if (S.dirtyTiles.length) { for (const i of S.dirtyTiles) R.patch(S, i); S.dirtyTiles.length = 0; }
  if (G.dirty || msgT) { R.draw(S, G.ui); hud(S); G.dirty = false; }
  if (S.yearEnd) { S.yearEnd = false; G.openBudget(); }
  if (S.needSave) G.save();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.G = G; // debug/console access
navigator.serviceWorker?.register('sw.js');
navigator.serviceWorker?.addEventListener('controllerchange', () => location.reload()); // pick up a new deploy right away
