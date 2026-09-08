/* Drawing2PCB — schematic editor (SVG, drag & drop, wires, nets, undo) */
(function () {
  const D = D2P;
  const GRID = 10;
  const S = D.sch = {
    design: null, view: { tx: 80, ty: 80, s: 1 }, tool: 'select', sel: new Set(), hist: [], hidx: -1, showGrid: true,
    nets: null, draft: null, placing: null, placeRot: 0, drag: null, pan: null, marquee: null, hlNet: -1, onChange: null, space: false,

    init() {
      S.svg = document.getElementById('sc');
      S.vp = document.getElementById('scViewport');
      S.g = { wires: document.getElementById('scWires'), comps: document.getElementById('scComps'), junctions: document.getElementById('scJunctions'), labels: document.getElementById('scLabels'), overlay: document.getElementById('scOverlay') };
      S.design = S.blank(); S.hist = [D.clone(S.design)]; S.hidx = 0;
      const sv = S.svg;
      sv.addEventListener('mousedown', S.onDown);
      window.addEventListener('mousemove', S.onMove);
      window.addEventListener('mouseup', S.onUp);
      sv.addEventListener('dblclick', S.onDbl);
      sv.addEventListener('contextmenu', e => { e.preventDefault(); if (S.draft) { S.draft = null; S.render(); } });
      sv.addEventListener('wheel', S.onWheel, { passive: false });
      sv.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
      sv.addEventListener('drop', e => { e.preventDefault(); const t = e.dataTransfer.getData('text/plain'); if (D.LIB[t]) S.place(t, S.snapPt(S.toWorld(e))); });
      window.addEventListener('keydown', S.onKey);
      window.addEventListener('keyup', e => { if (e.code === 'Space') S.space = false; });
      S.applyView(); S.render();
    },
    active() { return document.getElementById('view-schematic').classList.contains('active'); },
    blank() { return { components: [], wires: [], junctions: [], labels: [] }; },
    setDesign(d, keepHist) {
      d.components = d.components || []; d.wires = d.wires || []; d.junctions = d.junctions || []; d.labels = d.labels || [];
      S.design = d; S.sel.clear(); S.draft = null; S.placing = null;
      if (!keepHist) { S.hist = [D.clone(d)]; S.hidx = 0; }
      S.render(); S.changed();
    },
    commit() {
      S.hist = S.hist.slice(0, S.hidx + 1); S.hist.push(D.clone(S.design));
      if (S.hist.length > 100) S.hist.shift();
      S.hidx = S.hist.length - 1; S.render(); S.changed();
    },
    changed() { if (S.onChange) S.onChange(S.design); },
    undo() { if (S.hidx > 0) { S.hidx--; S.design = D.clone(S.hist[S.hidx]); S.sel.clear(); S.render(); S.changed(); } },
    redo() { if (S.hidx < S.hist.length - 1) { S.hidx++; S.design = D.clone(S.hist[S.hidx]); S.sel.clear(); S.render(); S.changed(); } },

    /* ---------- view ---------- */
    applyView() {
      S.vp.setAttribute('transform', `translate(${S.view.tx} ${S.view.ty}) scale(${S.view.s})`);
      document.getElementById('scGridRect').style.display = S.showGrid ? '' : 'none';
    },
    toWorld(e) { const r = S.svg.getBoundingClientRect(); return { x: (e.clientX - r.left - S.view.tx) / S.view.s, y: (e.clientY - r.top - S.view.ty) / S.view.s }; },
    snapPt(p) { return { x: D.snap(p.x, GRID), y: D.snap(p.y, GRID) }; },
    onWheel(e) {
      e.preventDefault();
      const r = S.svg.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      const f = e.deltaY < 0 ? 1.15 : 1 / 1.15, ns = D.clamp(S.view.s * f, 0.15, 6);
      S.view.tx = mx - (mx - S.view.tx) * (ns / S.view.s); S.view.ty = my - (my - S.view.ty) * (ns / S.view.s); S.view.s = ns;
      S.applyView();
    },
    bounds() {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
      S.design.components.forEach(c => { const b = D.getBBox(c); add(b.x, b.y); add(b.x + b.w, b.y + b.h); });
      S.design.wires.forEach(w => { add(w.a.x, w.a.y); add(w.b.x, w.b.y); });
      S.design.labels.forEach(l => add(l.x, l.y));
      if (x0 === Infinity) return null;
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    },
    fit() {
      const b = S.bounds(), r = S.svg.getBoundingClientRect();
      if (!b) { S.view = { tx: 80, ty: 80, s: 1 }; S.applyView(); return; }
      const m = 60, s = D.clamp(Math.min(r.width / (b.w + 2 * m), r.height / (b.h + 2 * m)), 0.15, 2.5);
      S.view.s = s; S.view.tx = (r.width - b.w * s) / 2 - b.x * s; S.view.ty = (r.height - b.h * s) / 2 - b.y * s;
      S.applyView();
    },

    /* ---------- hit testing ---------- */
    pinAt(p, tol = 8) {
      let best = null;
      for (const c of S.design.components) for (const pin of D.getPins(c)) { const a = D.pinAbs(c, pin), d = D.dist(a, p); if (d <= tol && (!best || d < best.d)) best = { comp: c, pin, pos: a, d }; }
      return best;
    },
    wireAt(p, tol = 4, exclude) {
      for (const w of S.design.wires) if (w !== exclude && D.segDist(p, w.a, w.b) <= tol) return w;
      return null;
    },
    selKind(k) { return k[0]; },
    selId(k) { return k.slice(2); },
    selected(kind) { const out = []; for (const k of S.sel) if (k[0] === kind) { const id = k.slice(2); const arr = { c: S.design.components, w: S.design.wires, j: S.design.junctions, l: S.design.labels }[kind]; const o = arr.find(x => x.id === id); if (o) out.push(o); } return out; },

    /* ---------- tools ---------- */
    setTool(t) {
      S.tool = t; S.draft = null; S.placing = null;
      document.querySelectorAll('#scTools [data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
      S.svg.className.baseVal = 'tool-' + t;
      S.render();
    },
    startPlacing(type) { S.setTool('select'); S.placing = type; S.placeRot = 0; S.svg.classList.add('placing'); S.render(); },
    place(type, pt) {
      const def = D.LIB[type];
      const comp = { id: D.uid('c'), type, x: pt.x, y: pt.y, rot: S.placeRot || 0, mirror: false, props: { ref: def.power ? def.prefix : D.nextRef(S.design, def.prefix), value: def.value, footprint: '' } };
      if (def.fields && def.fields.includes('n')) comp.props.n = String(def.nDefault);
      S.design.components.push(comp);
      S.placing = null; S.svg.classList.remove('placing');
      S.sel.clear(); S.sel.add('c:' + comp.id);
      S.commit();
      document.querySelectorAll('.part.active').forEach(p => p.classList.remove('active'));
    },
    wireClick(p) {
      const pin = S.pinAt(p);
      const pt = pin ? pin.pos : S.snapPt(p);
      if (!S.draft) { S.draft = { last: pt, mouse: pt }; S.render(); return; }
      const last = S.draft.last;
      if (last.x === pt.x && last.y === pt.y) return;
      const hFirst = Math.abs(pt.x - last.x) >= Math.abs(pt.y - last.y);
      const segs = D.lRoute(last, pt, null, hFirst);
      const added = [];
      segs.forEach(([a, b]) => { if (a.x !== b.x || a.y !== b.y) { const w = { id: D.uid('w'), a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } }; S.design.wires.push(w); added.push(w); } });
      const onExisting = S.design.wires.some(w => !added.includes(w) && D.ptOnSeg(pt, w.a, w.b, 0.6));
      const onJ = S.design.junctions.some(j => j.x === pt.x && j.y === pt.y);
      if (pin || onExisting || onJ) S.draft = null; else S.draft.last = pt;
      S.commit();
    },
    endDraft() { S.draft = null; S.render(); },

    /* ---------- mouse ---------- */
    onDown(e) {
      S.svg.focus({ preventScroll: true });
      const p = S.toWorld(e);
      if (e.button === 1 || e.button === 2 || S.space) { S.pan = { x: e.clientX, y: e.clientY, tx: S.view.tx, ty: S.view.ty }; e.preventDefault(); return; }
      if (e.button !== 0) return;
      if (S.placing) { S.place(S.placing, S.snapPt(p)); return; }
      if (S.tool === 'wire') { S.wireClick(p); return; }
      if (S.tool === 'junction') { const sp = S.snapPt(p); if (!S.design.junctions.some(j => j.x === sp.x && j.y === sp.y)) { S.design.junctions.push({ id: D.uid('j'), x: sp.x, y: sp.y }); S.commit(); } return; }
      if (S.tool === 'label') { const sp = S.snapPt(p); const text = prompt('Net name (e.g. VCC, OUT, SDA):'); if (text && text.trim()) { S.design.labels.push({ id: D.uid('l'), x: sp.x, y: sp.y, text: text.trim() }); S.commit(); } return; }
      /* select tool */
      const t = e.target;
      const hit = t.closest('.comp') ? ['c', t.closest('.comp').dataset.id] : t.closest('.wire,.wirehit') ? ['w', t.closest('.wire,.wirehit').dataset.id]
        : t.closest('.junc') ? ['j', t.closest('.junc').dataset.id] : t.closest('.label') ? ['l', t.closest('.label').dataset.id] : null;
      if (hit) {
        const k = hit[0] + ':' + hit[1];
        if (e.shiftKey) { S.sel.has(k) ? S.sel.delete(k) : S.sel.add(k); }
        else if (!S.sel.has(k)) { S.sel.clear(); S.sel.add(k); }
        S.render(); S.beginDrag(p);
      } else {
        if (!e.shiftKey) S.sel.clear();
        S.marquee = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, add: e.shiftKey };
        S.render();
      }
    },
    beginDrag(p) {
      const orig = { comps: [], wires: [], juncs: [], labels: [], ends: [] };
      const pinPts = [];
      S.selected('c').forEach(c => { orig.comps.push({ c, x: c.x, y: c.y }); D.getPins(c).forEach(pin => pinPts.push(D.pinAbs(c, pin))); });
      const selW = new Set(S.selected('w'));
      selW.forEach(w => orig.wires.push({ w, a: { ...w.a }, b: { ...w.b } }));
      S.selected('j').forEach(j => orig.juncs.push({ j, x: j.x, y: j.y }));
      S.selected('l').forEach(l => orig.labels.push({ l, x: l.x, y: l.y }));
      /* rubber-band: wire endpoints sitting on a moving pin follow it */
      S.design.wires.forEach(w => { if (selW.has(w)) return; ['a', 'b'].forEach(end => { if (pinPts.some(q => q.x === w[end].x && q.y === w[end].y)) orig.ends.push({ w, end, x: w[end].x, y: w[end].y }); }); });
      S.drag = { start: p, orig, moved: false };
    },
    onMove(e) {
      if (!S.svg) return;
      const p = S.toWorld(e);
      const cd = document.getElementById('scCoord'); if (cd && S.active()) cd.textContent = `${Math.round(p.x)}, ${Math.round(p.y)}  ×${S.view.s.toFixed(2)}`;
      if (S.pan) { S.view.tx = S.pan.tx + (e.clientX - S.pan.x); S.view.ty = S.pan.ty + (e.clientY - S.pan.y); S.applyView(); return; }
      if (S.drag) {
        const dx = D.snap(p.x - S.drag.start.x, GRID), dy = D.snap(p.y - S.drag.start.y, GRID);
        if (dx || dy) S.drag.moved = true;
        const o = S.drag.orig;
        o.comps.forEach(k => { k.c.x = k.x + dx; k.c.y = k.y + dy; });
        o.wires.forEach(k => { k.w.a = { x: k.a.x + dx, y: k.a.y + dy }; k.w.b = { x: k.b.x + dx, y: k.b.y + dy }; });
        o.juncs.forEach(k => { k.j.x = k.x + dx; k.j.y = k.y + dy; });
        o.labels.forEach(k => { k.l.x = k.x + dx; k.l.y = k.y + dy; });
        o.ends.forEach(k => { k.w[k.end] = { x: k.x + dx, y: k.y + dy }; });
        S.render(true); return;
      }
      if (S.marquee) { S.marquee.x1 = p.x; S.marquee.y1 = p.y; S.drawOverlay(); return; }
      if (S.draft) { S.draft.mouse = S.pinAt(p) ? S.pinAt(p).pos : S.snapPt(p); S.drawOverlay(); return; }
      if (S.placing) { S.ghost = S.snapPt(p); S.drawOverlay(); }
    },
    onUp(e) {
      if (S.pan) { S.pan = null; return; }
      if (S.drag) { const moved = S.drag.moved; S.drag = null; if (moved) S.commit(); return; }
      if (S.marquee) {
        const m = S.marquee, x0 = Math.min(m.x0, m.x1), x1 = Math.max(m.x0, m.x1), y0 = Math.min(m.y0, m.y1), y1 = Math.max(m.y0, m.y1);
        if (x1 - x0 > 3 || y1 - y0 > 3) {
          const inside = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
          S.design.components.forEach(c => { if (inside(c.x, c.y)) S.sel.add('c:' + c.id); });
          S.design.wires.forEach(w => { if (inside(w.a.x, w.a.y) && inside(w.b.x, w.b.y)) S.sel.add('w:' + w.id); });
          S.design.junctions.forEach(j => { if (inside(j.x, j.y)) S.sel.add('j:' + j.id); });
          S.design.labels.forEach(l => { if (inside(l.x, l.y)) S.sel.add('l:' + l.id); });
        }
        S.marquee = null; S.render();
      }
    },
    onDbl(e) {
      if (S.draft) { S.endDraft(); return; }
      const t = e.target.closest('.comp,.label');
      if (t) { const inp = document.querySelector('#scProps input'); if (inp) { inp.focus(); inp.select(); } }
    },
    onKey(e) {
      if (!S.active()) return;
      if (e.target.matches('input,textarea,select')) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (e.code === 'Space') { S.space = true; e.preventDefault(); return; }
      if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? S.redo() : S.undo(); return; }
      if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); S.redo(); return; }
      if (ctrl && e.key.toLowerCase() === 'a') { e.preventDefault(); S.design.components.forEach(c => S.sel.add('c:' + c.id)); S.design.wires.forEach(w => S.sel.add('w:' + w.id)); S.render(); return; }
      if (ctrl && e.key.toLowerCase() === 'd') { e.preventDefault(); S.duplicate(); return; }
      switch (e.key) {
        case 'Escape': S.draft = null; S.placing = null; S.svg.classList.remove('placing'); document.querySelectorAll('.part.active').forEach(p => p.classList.remove('active')); if (S.tool !== 'select') S.setTool('select'); else { S.sel.clear(); S.render(); } break;
        case 'Enter': if (S.draft) S.endDraft(); break;
        case 'Delete': case 'Backspace': S.deleteSel(); break;
        case 'r': case 'R': S.rotate(); break;
        case 'm': case 'M': S.mirror(); break;
        case 'w': case 'W': S.setTool('wire'); break;
        case 'v': case 'V': S.setTool('select'); break;
        case 'j': case 'J': S.setTool('junction'); break;
        case 'l': case 'L': S.setTool('label'); break;
        case 'f': case 'F': S.fit(); break;
        case 'g': case 'G': S.showGrid = !S.showGrid; S.applyView(); document.getElementById('scGrid').classList.toggle('active', S.showGrid); break;
        default: return;
      }
      e.preventDefault();
    },

    /* ---------- edit ops ---------- */
    rotate() {
      if (S.placing) { S.placeRot = (S.placeRot + 90) % 360; S.drawOverlay(); return; }
      const cs = S.selected('c'); if (!cs.length) return;
      cs.forEach(c => c.rot = ((c.rot || 0) + 90) % 360); S.commit();
    },
    mirror() { const cs = S.selected('c'); if (!cs.length) return; cs.forEach(c => c.mirror = !c.mirror); S.commit(); },
    deleteSel() {
      if (!S.sel.size) return;
      const d = S.design;
      const ids = kind => new Set([...S.sel].filter(k => k[0] === kind).map(k => k.slice(2)));
      const ci = ids('c'), wi = ids('w'), ji = ids('j'), li = ids('l');
      d.components = d.components.filter(c => !ci.has(c.id)); d.wires = d.wires.filter(w => !wi.has(w.id));
      d.junctions = d.junctions.filter(j => !ji.has(j.id)); d.labels = d.labels.filter(l => !li.has(l.id));
      S.sel.clear(); S.commit();
    },
    duplicate() {
      const cs = S.selected('c'), ws = S.selected('w'); if (!cs.length && !ws.length) return;
      S.sel.clear();
      cs.forEach(c => { const n = D.clone(c); n.id = D.uid('c'); n.x += 40; n.y += 40; if (!D.getDef(c).power) n.props.ref = D.nextRef(S.design, D.getDef(c).prefix); S.design.components.push(n); S.sel.add('c:' + n.id); });
      ws.forEach(w => { const n = D.clone(w); n.id = D.uid('w'); n.a.x += 40; n.a.y += 40; n.b.x += 40; n.b.y += 40; S.design.wires.push(n); S.sel.add('w:' + n.id); });
      S.commit();
    },
    updateProp(comp, k, v) {
      if (k === 'rot') comp.rot = ((+v % 360) + 360) % 360;
      else if (k === 'n') { comp.props.n = String(v); }
      else comp.props[k] = v;
      S.commit();
    },

    /* ---------- render ---------- */
    render(light) {
      const d = S.design;
      S.nets = D.computeNets(d);
      const ncPins = new Set();
      S.nets.nets.forEach(n => { if (n.pins.length === 1 && !n.names.length && !n.powers.length) ncPins.add(n.pins[0].comp.id + ':' + n.pins[0].pin); });
      d.components.forEach(c => D.getPins(c).forEach(p => { if (!S.nets.pinNet.has(c.id + ':' + p.n)) ncPins.add(c.id + ':' + p.n); }));

      let h = '';
      d.wires.forEach(w => {
        const sel = S.sel.has('w:' + w.id), hl = S.hlNet >= 0 && S.nets.wireNet.get(w.id) === S.hlNet;
        h += `<line class="wirehit" data-id="${w.id}" x1="${w.a.x}" y1="${w.a.y}" x2="${w.b.x}" y2="${w.b.y}"/><line class="wire${sel ? ' selected' : ''}${hl ? ' hl' : ''}" data-id="${w.id}" x1="${w.a.x}" y1="${w.a.y}" x2="${w.b.x}" y2="${w.b.y}"/>`;
      });
      S.g.wires.innerHTML = h;

      h = '';
      d.components.forEach(c => {
        const def = D.getDef(c), sel = S.sel.has('c:' + c.id), [bx, by, bw, bh] = D.getLocalBBox(c);
        h += `<g class="comp${sel ? ' selected' : ''}" data-id="${c.id}" transform="translate(${c.x} ${c.y}) rotate(${c.rot || 0}) scale(${c.mirror ? -1 : 1} 1)">`;
        h += `<rect class="hit" x="${bx}" y="${by}" width="${bw}" height="${bh}"/>`;
        h += D.primsToSvg(D.getSym(c));
        D.getPins(c).forEach(p => { const nc = ncPins.has(c.id + ':' + p.n); h += `<circle class="pin${nc ? ' nc' : ''}" data-comp="${c.id}" data-pin="${p.n}" cx="${p.x}" cy="${p.y}" r="2.6"><title>${D.esc((c.props.ref || '') + '.' + (p.l || p.n))}</title></circle>`; });
        h += '</g>';
        if (!def.power) {
          const bb = D.getBBox(c);
          h += `<text class="reftext" x="${bb.x + bb.w / 2}" y="${bb.y - 4}" text-anchor="middle">${D.esc(c.props.ref || '')}</text>`;
          if (c.props.value) h += `<text class="valtext" x="${bb.x + bb.w / 2}" y="${bb.y + bb.h + 11}" text-anchor="middle">${D.esc(c.props.value)}</text>`;
        }
      });
      S.g.comps.innerHTML = h;

      S.g.junctions.innerHTML = d.junctions.map(j => `<circle class="junc${S.sel.has('j:' + j.id) ? ' selected' : ''}" data-id="${j.id}" cx="${j.x}" cy="${j.y}" r="3.5"/>`).join('');
      S.g.labels.innerHTML = d.labels.map(l => `<g class="label${S.sel.has('l:' + l.id) ? ' selected' : ''}" data-id="${l.id}"><line x1="${l.x}" y1="${l.y}" x2="${l.x}" y2="${l.y - 8}"/><circle cx="${l.x}" cy="${l.y}" r="2" fill="#1d4ed8"/><text x="${l.x + 3}" y="${l.y - 9}">${D.esc(l.text)}</text></g>`).join('');
      S.drawOverlay();
      if (!light) { S.renderProps(); S.renderNets(); }
    },
    drawOverlay() {
      let h = '';
      if (S.draft && S.draft.mouse) {
        const hFirst = Math.abs(S.draft.mouse.x - S.draft.last.x) >= Math.abs(S.draft.mouse.y - S.draft.last.y);
        const segs = D.lRoute(S.draft.last, S.draft.mouse, null, hFirst);
        h += `<polyline class="draft" points="${[segs[0][0], ...segs.map(s => s[1])].map(p => p.x + ',' + p.y).join(' ')}"/>`;
      }
      if (S.marquee) { const m = S.marquee; h += `<rect class="marquee" x="${Math.min(m.x0, m.x1)}" y="${Math.min(m.y0, m.y1)}" width="${Math.abs(m.x1 - m.x0)}" height="${Math.abs(m.y1 - m.y0)}"/>`; }
      if (S.placing && S.ghost) {
        const c = { type: S.placing, x: S.ghost.x, y: S.ghost.y, rot: S.placeRot, props: { n: String(D.LIB[S.placing].nDefault || '') } };
        h += `<g class="comp ghost" transform="translate(${c.x} ${c.y}) rotate(${c.rot})">${D.primsToSvg(D.getSym(c))}</g>`;
      }
      S.g.overlay.innerHTML = h;
    },
    renderProps() {
      const box = document.getElementById('scProps');
      const cs = S.selected('c'), ws = S.selected('w'), ls = S.selected('l');
      box.innerHTML = '';
      if (S.sel.size === 0) { box.innerHTML = '<div class="muted">Nothing selected. Click a part, wire or label.</div>'; return; }
      if (S.sel.size > 1) { box.innerHTML = `<div class="muted">${S.sel.size} items selected.</div>`; return; }
      if (cs.length === 1) {
        const c = cs[0], def = D.getDef(c);
        const row = (label, input) => { const kv = D.el('div', { class: 'kv' }); kv.append(D.el('span', {}, label), input); box.append(kv); };
        box.append(D.el('div', { html: `<b>${D.esc(def.name)}</b> <span class="muted">(${c.type})</span>` }));
        if (!def.power) {
          row('Reference', D.el('input', { value: c.props.ref || '', onchange: e => S.updateProp(c, 'ref', e.target.value.trim()) }));
          row('Value', D.el('input', { value: c.props.value || '', onchange: e => S.updateProp(c, 'value', e.target.value.trim()) }));
          const fpSel = D.el('select', { onchange: e => { if (e.target.value === '__custom') { const v = prompt('Footprint name (e.g. DIP-14, HDR-1x5, R0805):', D.defaultFp(c)); if (v) S.updateProp(c, 'footprint', v.trim()); else S.renderProps(); } else S.updateProp(c, 'footprint', e.target.value); } });
          const cur = D.defaultFp(c);
          const opts = [...new Set([cur, ...D.FP_ORDER])];
          opts.forEach(f => fpSel.append(D.el('option', { value: f === D.defaultFp({ type: c.type, props: { n: c.props.n } }) && !c.props.footprint ? '' : f, ...(f === cur ? { selected: '' } : {}) }, f)));
          fpSel.append(D.el('option', { value: '__custom' }, 'Custom…'));
          row('Footprint', fpSel);
        }
        if (def.power === 'VCC') row('Net name', D.el('input', { value: c.props.net || 'VCC', onchange: e => S.updateProp(c, 'net', e.target.value.trim() || 'VCC') }));
        if (def.fields && def.fields.includes('n')) row('Pin count', D.el('input', { type: 'number', min: c.type === 'IC' ? 4 : 1, step: c.type === 'IC' ? 2 : 1, value: c.props.n || def.nDefault, onchange: e => S.updateProp(c, 'n', e.target.value) }));
        row('Rotation', D.el('select', { onchange: e => S.updateProp(c, 'rot', e.target.value) }, ...[0, 90, 180, 270].map(r => D.el('option', { value: r, ...(r === (c.rot || 0) ? { selected: '' } : {}) }, r + '°'))));
        row('Position', D.el('span', {}, `${c.x}, ${c.y}${c.mirror ? ' (mirrored)' : ''}`));
        const pinsDiv = D.el('div', { class: 'muted' });
        pinsDiv.textContent = 'Pins: ' + D.getPins(c).map(p => { const ni = S.nets.pinNet.get(c.id + ':' + p.n); return `${p.l || p.n}→${ni != null ? S.nets.nets[ni].name : '—'}`; }).join('  ');
        box.append(pinsDiv);
      } else if (ws.length === 1) {
        const w = ws[0], ni = S.nets.wireNet.get(w.id);
        box.innerHTML = `<div><b>Wire</b></div><div class="kv"><span>Net</span><span>${ni != null ? D.esc(S.nets.nets[ni].name) : '—'}</span></div><div class="kv"><span>From</span><span>${w.a.x}, ${w.a.y}</span></div><div class="kv"><span>To</span><span>${w.b.x}, ${w.b.y}</span></div>`;
      } else if (ls.length === 1) {
        const l = ls[0];
        box.append(D.el('div', { html: '<b>Net label</b>' }));
        const kv = D.el('div', { class: 'kv' }); kv.append(D.el('span', {}, 'Name'), D.el('input', { value: l.text, onchange: e => { l.text = e.target.value.trim() || l.text; S.commit(); } })); box.append(kv);
      } else box.innerHTML = '<div><b>Junction</b></div>';
    },
    renderNets() {
      const el = document.getElementById('scNets'), cnt = document.getElementById('netCount');
      const nets = S.nets.nets.filter(n => n.pins.length);
      cnt.textContent = nets.length;
      el.innerHTML = '';
      S.nets.nets.forEach((n, i) => {
        if (!n.pins.length) return;
        const row = D.el('div', { class: 'net' + (S.hlNet === i ? ' hl' : ''), onclick: () => { S.hlNet = S.hlNet === i ? -1 : i; S.render(); } });
        row.append(D.el('span', {}, n.name), D.el('span', { class: 'n' }, n.pins.map(p => (p.comp.props.ref || '?') + '.' + p.label).join(' ')));
        el.append(row);
      });
    },
    runErc() {
      const out = document.getElementById('scErcOut'), res = D.erc(S.design, S.nets);
      out.className = 'erc';
      out.innerHTML = res.map(r => `<div class="${r.level}">${r.level === 'err' ? '✖' : r.level === 'warn' ? '⚠' : '✔'} ${D.esc(r.msg)}</div>`).join('');
      D.status(`ERC: ${res.filter(r => r.level === 'err').length} errors, ${res.filter(r => r.level === 'warn').length} warnings`);
    },
  };
})();
