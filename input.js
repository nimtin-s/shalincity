// Pointer input + HUD/palette/dialog wiring.
import { N, TOOLS, TOOL_GROUPS, CAT } from './data.js';
import { place, newGame, hashStr, startDisaster, DISASTERS } from './sim.js';
import { cam, toTile, zoomAt, jumpTo, miniToWorld, buildFar, center } from './render.js';

const $ = s => document.querySelector(s);
const clampZ = () => { cam.z = Math.max(.25, Math.min(2, cam.z)); };

// 4-connected staircase line so painted roads always connect
function line4(x0, y0, x1, y1, fn) {
  fn(x0, y0);
  while (x0 !== x1 || y0 !== y1) {
    if (Math.abs(x1 - x0) > Math.abs(y1 - y0)) x0 += Math.sign(x1 - x0); else y0 += Math.sign(y1 - y0);
    fn(x0, y0);
  }
}

export function setup(G) {
  const cv = $('#c'), ui = G.ui, tools = $('#tools');
  const dirty = () => { G.dirty = true; };
  const doPlace = (x, y) => { if (place(G.S, ui.tool, x, y, ui.ug)) dirty(); };

  // palette
  for (const grp of TOOL_GROUPS) {
    for (const name of grp) {
      const T = TOOLS[name], cost = T.cost ?? (T.bld ? CAT[T.bld][3] : 0);
      const b = document.createElement('button');
      b.dataset.tool = name;
      b.innerHTML = `<span>${T.icon}</span><small>${T.label}</small><small>${cost ? '$' + cost : ''}</small>`;
      tools.append(b);
    }
    tools.append(Object.assign(document.createElement('i'), { className: 'gap' }));
  }
  const setTool = name => {
    ui.tool = name; ui.rect = null;
    ui.ug = !!TOOLS[name].under || ui.ugToggle;
    for (const b of tools.children) b.classList.toggle('sel', b.dataset.tool === name);
    dirty();
  };
  tools.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setTool(b.dataset.tool); });
  setTool(ui.tool);

  // pointers
  const ptrs = new Map();
  let mode = null, pinch0 = null, last = null, painted = false;
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() });
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      mode = 'pinch'; ui.rect = null;
      pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, z: cam.z, ox: cam.ox, oy: cam.oy };
      return;
    }
    if (ptrs.size > 2) return;
    mode = ui.tool === 'pan' || e.button === 1 || e.button === 2 ? 'pan' : 'tool';
    last = null; painted = false;
    const t = toTile(e.clientX, e.clientY);
    if (mode === 'tool' && TOOLS[ui.tool].rect) ui.rect = [t[0], t[1], t[0], t[1]];
    ui.hover = t; dirty();
  });
  cv.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId);
    const t = toTile(e.clientX, e.clientY);
    if (!p) { if (e.pointerType === 'mouse') { ui.hover = t; dirty(); } return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (mode === 'pinch') {
      if (ptrs.size !== 2) return;
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      cam.z = pinch0.z * d / pinch0.d; clampZ();
      cam.ox = mx - (pinch0.mx - pinch0.ox) * cam.z / pinch0.z;
      cam.oy = my - (pinch0.my - pinch0.oy) * cam.z / pinch0.z;
    } else if (mode === 'pan') { cam.ox += dx; cam.oy += dy; }
    else if (mode === 'tool') {
      const T = TOOLS[ui.tool];
      ui.hover = t;
      if (T.rect) { ui.rect[2] = t[0]; ui.rect[3] = t[1]; }
      else if (T.line && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 8) {
        if (!last) last = toTile(p.x0, p.y0);
        line4(last[0], last[1], t[0], t[1], doPlace);
        last = t; painted = true;
      }
    }
    dirty();
  });
  const up = e => {
    const p = ptrs.get(e.pointerId);
    ptrs.delete(e.pointerId);
    if (!p) return;
    if (mode === 'tool' && e.type === 'pointerup') {
      const T = TOOLS[ui.tool], t = toTile(e.clientX, e.clientY);
      const tap = Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 8 && performance.now() - p.t0 < 400;
      if (T.rect && ui.rect) {
        let [x0, y0, x1, y1] = ui.rect;
        if (x0 > x1) [x0, x1] = [x1, x0]; if (y0 > y1) [y0, y1] = [y1, y0];
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) doPlace(x, y);
      } else if (T.line) { if (!painted) doPlace(t[0], t[1]); }
      else if (T.bld && tap) doPlace(t[0], t[1]);
    }
    ui.rect = null; if (e.pointerType !== 'mouse') ui.hover = null;
    mode = null; dirty();
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15); dirty(); }, { passive: false });

  // minimap tap → jump
  $('#mini').addEventListener('pointerdown', e => {
    const r = e.currentTarget.getBoundingClientRect();
    jumpTo(...miniToWorld(e.clientX - r.left, e.clientY - r.top)); dirty();
  });

  // HUD
  document.querySelectorAll('[data-speed]').forEach(b => b.onclick = () => { G.S.speed = +b.dataset.speed; dirty(); });
  $('#view').onchange = e => { ui.view = e.target.value; dirty(); };
  $('#budgetBtn').onclick = () => openBudget(G);
  $('#menuBtn').onclick = () => openMenu(G);

  // dialogs
  const budget = $('#budget'), menu = $('#menu');
  let prevSpeed = 1;
  for (const d of [budget, menu]) {
    d.addEventListener('close', () => { G.S.speed = prevSpeed; dirty(); });
    d.querySelector('.close').onclick = () => d.close();
  }
  const pause = () => { prevSpeed = G.S.speed || 1; G.S.speed = 0; };
  budget.querySelectorAll('input[data-tax]').forEach(i => i.oninput = () => { G.S.tax[+i.dataset.tax] = +i.value; i.nextElementSibling.textContent = i.value + '%'; });
  budget.querySelectorAll('input[data-fund]').forEach(i => i.oninput = () => { G.S.fund[i.dataset.fund] = +i.value; i.nextElementSibling.textContent = i.value + '%'; });
  function openBudget(G) {
    const S = G.S; pause();
    budget.querySelectorAll('input[data-tax]').forEach(i => { i.value = S.tax[+i.dataset.tax]; i.nextElementSibling.textContent = i.value + '%'; });
    budget.querySelectorAll('input[data-fund]').forEach(i => { i.value = S.fund[i.dataset.fund]; i.nextElementSibling.textContent = i.value + '%'; });
    const inc = S.hist.reduce((a, h) => a + h.inc, 0), exp = S.hist.reduce((a, h) => a + h.exp, 0);
    $('#hist').textContent = `Last ${S.hist.length} months — income $${inc.toLocaleString()}, expenses $${exp.toLocaleString()}, net $${(inc - exp).toLocaleString()}`;
    $('#stats').textContent = `Power ${S.powerUse}/${S.powerCap} MW · Water ${S.waterUse}/${S.waterCap} · Jobs ${S.jobs}`;
    budget.showModal();
  }
  G.openBudget = () => openBudget(G);
  function openMenu(G) {
    pause();
    $('#disasters').checked = G.S.disastersOn;
    $('#ugToggle').checked = ui.ugToggle;
    menu.showModal();
  }
  $('#disasters').onchange = e => { G.S.disastersOn = e.target.checked; };
  $('#ugToggle').onchange = e => { ui.ugToggle = e.target.checked; setTool(ui.tool); };
  menu.querySelectorAll('[data-disaster]').forEach(b => b.onclick = () => { startDisaster(G.S, +b.dataset.disaster); menu.close(); });
  $('#saveBtn').onclick = () => { G.save(); G.S.msg = 'Saved'; menu.close(); };
  $('#randBtn').onclick = () => { $('#seed').value = Math.random().toString(36).slice(2, 8); };
  $('#newBtn').onclick = () => {
    if (!confirm('Start a new city? Current city will be overwritten.')) return;
    const s = $('#seed').value.trim();
    G.S = newGame(s ? hashStr(s) : (Math.random() * 2 ** 32) >>> 0);
    buildFar(G.S); center(); G.save(); menu.close(); dirty();
  };
  // manual trigger labels
  menu.querySelectorAll('[data-disaster]').forEach(b => b.textContent = DISASTERS[+b.dataset.disaster]);
  // keyboard shortcuts (desktop nicety)
  addEventListener('keydown', e => { if (e.key === ' ') { G.S.speed = G.S.speed ? 0 : 1; dirty(); e.preventDefault(); } });
}
