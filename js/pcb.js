/* Drawing2PCB — PCB: footprint placement (simulated annealing), grid maze router, SVG view. Units mm, y down. */
(function () {
  const D = D2P;
  const P = D.pcb = {
    board: null, view: { tx: 30, ty: 30, s: 8 }, sel: null, drag: null, pan: null, onChange: null,
    layers: { top: true, bot: true, silk: true, rat: true },

    blank() { return { w: 50, h: 40, trace: 0.4, clr: 0.3, nl: 2, parts: [], traces: [], vias: [], nets: [], unrouted: [] }; },
    init() {
      P.svg = document.getElementById('pcb'); P.vp = document.getElementById('pcbViewport'); P.board = P.blank();
      P.svg.addEventListener('mousedown', P.onDown);
      window.addEventListener('mousemove', P.onMove);
      window.addEventListener('mouseup', P.onUp);
      P.svg.addEventListener('wheel', P.onWheel, { passive: false });
      P.svg.addEventListener('contextmenu', e => e.preventDefault());
      window.addEventListener('keydown', e => {
        if (!P.active() || e.target.matches('input,textarea,select')) return;
        if (e.key === 'r' || e.key === 'R') P.rotateSel();
        else if (e.key === 'f' || e.key === 'F') P.flipSel();
        else if (e.key === 'Escape') { P.sel = null; P.render(); }
        else return;
        e.preventDefault();
      });
      P.render();
    },
    active() { return document.getElementById('view-pcb').classList.contains('active'); },
    changed() { if (P.onChange) P.onChange(P.board); },

    /* ---------- from schematic ---------- */
    generate(design) {
      const nets = D.computeNets(design);
      const B = P.board, old = new Map(B.parts.map(p => [p.id, p]));
      B.parts = design.components.filter(c => !D.getDef(c).power).map(c => {
        const o = old.get(c.id), fp = D.defaultFp(c);
        return { id: c.id, ref: c.props.ref || '?', value: c.props.value || '', type: c.type, fp, x: o ? o.x : 0, y: o ? o.y : 0, rot: o && o.fp === fp ? o.rot : 0, side: o ? o.side : 'top', placed: !!o };
      });
      B.nets = [];
      nets.nets.forEach(n => {
        const pads = [];
        n.pins.forEach(pn => {
          const part = B.parts.find(p => p.id === pn.comp.id); if (!part) return;
          if (D.getFootprint(part.fp).pads.some(pd => pd.n === pn.pin)) pads.push({ part: part.id, pad: pn.pin });
        });
        if (pads.length >= 2) B.nets.push({ name: n.name, pads });
      });
      B.traces = []; B.vias = []; B.unrouted = [];
      /* suggest a board size big enough */
      let area = 0; B.parts.forEach(p => { const c = D.partCourt(p); area += (c.w + 2) * (c.h + 2); });
      const need = area * 2.2;
      if (B.w * B.h < need) { const f = Math.sqrt(need / (B.w * B.h)); B.w = Math.ceil(B.w * f); B.h = Math.ceil(B.h * f); document.getElementById('pcbW').value = B.w; document.getElementById('pcbH').value = B.h; D.status(`Board enlarged to ${B.w}×${B.h} mm to fit ${B.parts.length} parts.`); }
      P.initialPlace(); P.render(); P.fit(); P.changed();
    },
    initialPlace() {
      const B = P.board, un = B.parts.filter(p => !p.placed); if (!un.length) return;
      const cols = Math.ceil(Math.sqrt(un.length)), cw = (B.w - 4) / cols, rows = Math.ceil(un.length / cols), ch = (B.h - 4) / rows;
      un.forEach((p, i) => { p.x = P.snap(2 + cw * (i % cols) + cw / 2); p.y = P.snap(2 + ch * Math.floor(i / cols) + ch / 2); p.placed = true; });
    },
    snap(v) { return Math.round(v / 0.635) * 0.635; },

    /* ---------- placement ---------- */
    padPos(partId, padName) {
      const part = P.board.parts.find(p => p.id === partId); if (!part) return null;
      const pd = D.getFootprint(part.fp).pads.find(q => q.n === padName); if (!pd) return null;
      return D.padAbs(part, pd);
    },
    cost(parts) {
      const B = P.board; let c = 0;
      const pos = new Map(parts.map(p => [p.id, p]));
      B.nets.forEach(n => {
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        n.pads.forEach(pp => { const part = pos.get(pp.part), pd = D.getFootprint(part.fp).pads.find(q => q.n === pp.pad); const a = D.padAbs(part, pd); x0 = Math.min(x0, a.x); x1 = Math.max(x1, a.x); y0 = Math.min(y0, a.y); y1 = Math.max(y1, a.y); });
        c += (x1 - x0) + (y1 - y0);
      });
      /* courtyards grown by a routing channel; any overlap is heavily penalised */
      const gap = Math.max(1.2, (B.trace + 2 * B.clr) * 1.5);
      const rects = parts.map(p => { const ct = D.partCourt(p); return { x: p.x - ct.w / 2 - gap / 2, y: p.y - ct.h / 2 - gap / 2, w: ct.w + gap, h: ct.h + gap }; });
      for (let i = 0; i < rects.length; i++) {
        const a = rects[i];
        const outX = Math.max(0, 1 - a.x) + Math.max(0, a.x + a.w - B.w + 1), outY = Math.max(0, 1 - a.y) + Math.max(0, a.y + a.h - B.h + 1);
        c += (outX + outY) * 200;
        for (let j = i + 1; j < rects.length; j++) {
          const b = rects[j], ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          if (ox > 0 && oy > 0) c += 40 + ox * oy * 300;
        }
      }
      return c;
    },
    autoPlace() {
      const B = P.board; if (!B.parts.length) { D.status('Generate the board from the schematic first.'); return; }
      const t0 = performance.now();
      let cur = B.parts.map(p => ({ ...p })), curC = P.cost(cur), best = cur.map(p => ({ ...p })), bestC = curC;
      const N = Math.min(80000, 15000 + 1500 * cur.length), T0 = Math.max(20, curC * 0.1), T1 = 0.02, alpha = Math.pow(T1 / T0, 1 / N);
      let T = T0;
      for (let it = 0; it < N; it++) {
        const i = Math.floor(Math.random() * cur.length), p = cur[i], save = { ...p }, r = Math.random();
        let j = -1, savej = null;
        if (r < 0.55) { const amp = 2 + 10 * (T / T0); p.x = P.snap(D.clamp(p.x + (Math.random() - 0.5) * amp * 2, 2, B.w - 2)); p.y = P.snap(D.clamp(p.y + (Math.random() - 0.5) * amp * 2, 2, B.h - 2)); }
        else if (r < 0.8) p.rot = (p.rot + 90) % 360;
        else if (cur.length > 1) { j = Math.floor(Math.random() * cur.length); if (j === i) j = (j + 1) % cur.length; savej = { ...cur[j] }; const q = cur[j]; [p.x, q.x] = [q.x, p.x]; [p.y, q.y] = [q.y, p.y]; }
        const nc = P.cost(cur), dC = nc - curC;
        if (dC <= 0 || Math.random() < Math.exp(-dC / T)) { curC = nc; if (nc < bestC) { bestC = nc; best = cur.map(x => ({ ...x })); } }
        else { Object.assign(p, save); if (j >= 0) Object.assign(cur[j], savej); }
        T *= alpha;
      }
      best.forEach(b => { const p = B.parts.find(x => x.id === b.id); p.x = b.x; p.y = b.y; p.rot = b.rot; });
      B.traces = []; B.vias = []; B.unrouted = [];
      P.render(); P.changed();
      D.status(`Auto-place done in ${Math.round(performance.now() - t0)} ms (cost ${bestC.toFixed(1)}).`);
    },
    ratEdges() {
      /* MST edges per net -> [{net, a, b, pa, pb}] */
      const out = [];
      P.board.nets.forEach((n, ni) => {
        const pts = n.pads.map(pp => ({ ...P.padPos(pp.part, pp.pad), pp })).filter(p => p.x != null);
        D.mst(pts).forEach(([i, j]) => out.push({ net: ni, a: pts[i], b: pts[j], pa: pts[i].pp, pb: pts[j].pp }));
      });
      return out;
    },

    /* ---------- routing ---------- */
    unroute() { P.board.traces = []; P.board.vias = []; P.board.unrouted = []; P.render(); P.changed(); },
    route() {
      const B = P.board; if (!B.nets.length) { D.status('Nothing to route.'); return; }
      const t0 = performance.now();
      B.traces = []; B.vias = [];
      const cell = Math.max(0.25, (B.trace + B.clr) / 2), NX = Math.ceil(B.w / cell), NY = Math.ceil(B.h / cell);
      if (NX * NY > 600000) { D.status('Board too large for the router at this resolution — increase trace width/clearance or shrink the board.'); return; }
      const layers = B.nl === 1 ? [1] : [0, 1];
      const occ = [new Int16Array(NX * NY), new Int16Array(NX * NY)];
      const idx = (cx, cy) => cy * NX + cx;
      const toCell = v => D.clamp(Math.floor(v / cell), 0, 1e9);
      const stamp = (l, x, y, r, val, force) => {
        const cx0 = Math.max(0, toCell(x - r)), cx1 = Math.min(NX - 1, toCell(x + r)), cy0 = Math.max(0, toCell(y - r)), cy1 = Math.min(NY - 1, toCell(y + r));
        for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
          const px = (cx + 0.5) * cell, py = (cy + 0.5) * cell;
          if (Math.hypot(px - x, py - y) > r) continue;
          const i = idx(cx, cy), cur = occ[l][i];
          if (force) occ[l][i] = val;
          else if (cur === 0) occ[l][i] = val;
          else if (cur !== val) occ[l][i] = -1;
        }
      };
      /* board edge keep-out */
      const m = Math.ceil((B.clr + B.trace / 2) / cell);
      for (const l of [0, 1]) for (let cy = 0; cy < NY; cy++) for (let cx = 0; cx < NX; cx++) if (cx < m || cy < m || cx >= NX - m || cy >= NY - m) occ[l][idx(cx, cy)] = -1;
      /* pads */
      const padNet = new Map();
      B.nets.forEach((n, ni) => n.pads.forEach(pp => padNet.set(pp.part + '/' + pp.pad, ni)));
      const padList = [];
      B.parts.forEach(part => D.getFootprint(part.fp).pads.forEach(pd => {
        const a = D.padAbs(part, pd), ni = padNet.get(part.id + '/' + pd.n), val = ni != null ? ni + 1 : -1;
        const ls = pd.layer === 'thru' ? [0, 1] : [part.side === 'bottom' ? 1 : 0];
        const r = Math.max(pd.w, pd.h) / 2 * (pd.shape === 'rect' ? 1.35 : 1);
        padList.push({ a, ls, r, val });
        ls.forEach(l => stamp(l, a.x, a.y, r + B.clr + B.trace / 2, val));
      }));
      padList.forEach(p => p.ls.forEach(l => stamp(l, p.a.x, p.a.y, p.r, p.val, true)));
      /* Dijkstra over (cell, layer) */
      const NL = 2, NN = NX * NY * NL, dist = new Float64Array(NN), prev = new Int32Array(NN);
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      const viaCost = 14 / cell * 0.5, bendCost = 0.6;
      const heap = []; const hpush = (k, v) => { heap.push([k, v]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break;[heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
      const hpop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (; ;) { let l = 2 * i + 1, r = l + 1, s = i; if (l < heap.length && heap[l][0] < heap[s][0]) s = l; if (r < heap.length && heap[r][0] < heap[s][0]) s = r; if (s === i) break;[heap[s], heap[i]] = [heap[i], heap[s]]; i = s; } } return top; };
      const findPath = (A, Bp, val) => {
        dist.fill(Infinity); prev.fill(-1); heap.length = 0;
        const ax = toCell(A.a.x), ay = toCell(A.a.y), bx = toCell(Bp.a.x), by = toCell(Bp.a.y);
        const tgt = new Set(Bp.ls.filter(l => layers.includes(l)).map(l => l * NX * NY + idx(bx, by)));
        A.ls.filter(l => layers.includes(l)).forEach(l => { const n = l * NX * NY + idx(ax, ay); dist[n] = 0; hpush(0, n); });
        let found = -1;
        while (heap.length) {
          const [d, n] = hpop(); if (d > dist[n]) continue;
          if (tgt.has(n)) { found = n; break; }
          const l = Math.floor(n / (NX * NY)), ci = n % (NX * NY), cx = ci % NX, cy = (ci - cx) / NX;
          const pn = prev[n]; let pdx = 0, pdy = 0;
          if (pn >= 0 && Math.floor(pn / (NX * NY)) === l) { const pci = pn % (NX * NY), pcx = pci % NX, pcy = (pci - pcx) / NX; pdx = cx - pcx; pdy = cy - pcy; }
          for (const [dx, dy] of dirs) {
            const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= NX || ny >= NY) continue;
            const ni = idx(nx, ny), o = occ[l][ni]; if (o !== 0 && o !== val) continue;
            if (dx && dy) { const o1 = occ[l][idx(cx + dx, cy)], o2 = occ[l][idx(cx, cy + dy)]; if ((o1 !== 0 && o1 !== val) || (o2 !== 0 && o2 !== val)) continue; }
            const nn = l * NX * NY + ni, nd = d + (dx && dy ? 1.4142 : 1) + ((pdx || pdy) && (pdx !== dx || pdy !== dy) ? bendCost : 0);
            if (nd < dist[nn]) { dist[nn] = nd; prev[nn] = n; hpush(nd, nn); }
          }
          if (layers.length > 1) { const ol = 1 - l, on = ol * NX * NY + ci, oo = occ[ol][ci]; if ((oo === 0 || oo === val) && d + viaCost < dist[on]) { dist[on] = d + viaCost; prev[on] = n; hpush(d + viaCost, on); } }
        }
        if (found < 0) return null;
        const path = []; for (let n = found; n >= 0; n = prev[n]) path.push(n); path.reverse();
        return path.map(n => { const l = Math.floor(n / (NX * NY)), ci = n % (NX * NY), cx = ci % NX; return { l, x: (cx + 0.5) * cell, y: ((ci - cx) / NX + 0.5) * cell, cx, cy: (ci - cx) / NX }; });
      };
      const edges = P.ratEdges().sort((u, v) => D.dist(u.a, u.b) - D.dist(v.a, v.b));
      const padOf = pp => { const part = B.parts.find(p => p.id === pp.part), pd = D.getFootprint(part.fp).pads.find(q => q.n === pp.pad); return { a: D.padAbs(part, pd), ls: pd.layer === 'thru' ? [0, 1] : [part.side === 'bottom' ? 1 : 0] }; };
      const unrouted = []; let ok = 0;
      edges.forEach(e => {
        const val = e.net + 1, A = padOf(e.pa), Bp = padOf(e.pb);
        const path = findPath(A, Bp, val);
        if (!path) { unrouted.push(e); return; }
        ok++;
        path.forEach(p => stamp(p.l, p.x, p.y, B.trace / 2 + B.clr + B.trace / 2, val));
        /* split by layer, compress collinear points */
        let seg = [], segL = path[0].l;
        const flush = () => { if (seg.length >= 2) B.traces.push({ net: e.net, layer: segL, w: B.trace, pts: P.compress(seg) }); };
        path.forEach((p, i) => {
          if (p.l !== segL) { const last = seg[seg.length - 1]; flush(); B.vias.push({ x: last.x, y: last.y, net: e.net }); seg = [{ x: last.x, y: last.y }]; segL = p.l; }
          const pt = { x: p.x, y: p.y };
          if (i === 0) { pt.x = A.a.x; pt.y = A.a.y; } if (i === path.length - 1) { pt.x = Bp.a.x; pt.y = Bp.a.y; }
          seg.push(pt);
        });
        flush();
      });
      B.unrouted = unrouted;
      P._dbg = { occ, NX, NY, cell, padOf };
      P.render(); P.changed();
      const msg = `Routed ${ok}/${edges.length} connections in ${Math.round(performance.now() - t0)} ms` + (unrouted.length ? ` — ${unrouted.length} left as ratlines (try more space, 2 layers or smaller trace/clearance).` : '.');
      document.getElementById('pcbRouteStat').textContent = msg; D.status(msg);
    },
    compress(pts) {
      const out = [pts[0]];
      for (let i = 1; i < pts.length - 1; i++) {
        const a = out[out.length - 1], b = pts[i], c = pts[i + 1];
        const d1x = Math.sign(b.x - a.x), d1y = Math.sign(b.y - a.y), d2x = Math.sign(c.x - b.x), d2y = Math.sign(c.y - b.y);
        if (d1x === d2x && d1y === d2y) continue;
        out.push(b);
      }
      out.push(pts[pts.length - 1]);
      return out;
    },

    /* ---------- interaction ---------- */
    toWorld(e) { const r = P.svg.getBoundingClientRect(); return { x: (e.clientX - r.left - P.view.tx) / P.view.s, y: (e.clientY - r.top - P.view.ty) / P.view.s }; },
    applyView() { P.vp.setAttribute('transform', `translate(${P.view.tx} ${P.view.ty}) scale(${P.view.s})`); },
    fit() { const r = P.svg.getBoundingClientRect(), B = P.board; const s = Math.min((r.width - 40) / B.w, (r.height - 40) / B.h); P.view.s = Math.max(1, s); P.view.tx = (r.width - B.w * P.view.s) / 2; P.view.ty = (r.height - B.h * P.view.s) / 2; P.applyView(); },
    onWheel(e) { e.preventDefault(); const r = P.svg.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, f = e.deltaY < 0 ? 1.15 : 1 / 1.15, ns = D.clamp(P.view.s * f, 0.5, 80); P.view.tx = mx - (mx - P.view.tx) * (ns / P.view.s); P.view.ty = my - (my - P.view.ty) * (ns / P.view.s); P.view.s = ns; P.applyView(); },
    onDown(e) {
      P.svg.focus({ preventScroll: true });
      if (e.button === 1 || e.button === 2) { P.pan = { x: e.clientX, y: e.clientY, tx: P.view.tx, ty: P.view.ty }; e.preventDefault(); return; }
      if (e.button !== 0) return;
      const g = e.target.closest('.part');
      if (g) { const part = P.board.parts.find(p => p.id === g.dataset.id); P.sel = part.id; const w = P.toWorld(e); P.drag = { part, start: w, x: part.x, y: part.y, moved: false }; }
      else P.sel = null;
      P.render();
    },
    onMove(e) {
      if (P.pan) { P.view.tx = P.pan.tx + e.clientX - P.pan.x; P.view.ty = P.pan.ty + e.clientY - P.pan.y; P.applyView(); return; }
      if (!P.drag) return;
      const w = P.toWorld(e), d = P.drag;
      const nx = P.snap(d.x + w.x - d.start.x), ny = P.snap(d.y + w.y - d.start.y);
      if (nx !== d.part.x || ny !== d.part.y) { d.part.x = nx; d.part.y = ny; d.moved = true; P.render(true); }
    },
    onUp() { if (P.pan) { P.pan = null; return; } if (P.drag) { if (P.drag.moved) { P.invalidatePart(P.drag.part); P.changed(); } P.drag = null; P.render(); } },
    invalidatePart(part) {
      const nets = new Set(P.board.nets.map((n, i) => n.pads.some(pp => pp.part === part.id) ? i : -1).filter(i => i >= 0));
      P.board.traces = P.board.traces.filter(t => !nets.has(t.net)); P.board.vias = P.board.vias.filter(v => !nets.has(v.net));
      P.board.unrouted = P.board.unrouted.filter(e => !nets.has(e.net));
    },
    rotateSel() { const p = P.board.parts.find(x => x.id === P.sel); if (!p) return; p.rot = (p.rot + 90) % 360; P.invalidatePart(p); P.render(); P.changed(); },
    flipSel() { const p = P.board.parts.find(x => x.id === P.sel); if (!p) return; p.side = p.side === 'top' ? 'bottom' : 'top'; P.invalidatePart(p); P.render(); P.changed(); },

    /* ---------- render ---------- */
    render(light) {
      const B = P.board, L = P.layers;
      let h = `<rect class="board" x="0" y="0" width="${B.w}" height="${B.h}"/>`;
      const routedNets = new Set(B.traces.map(t => t.net));
      if (L.rat) {
        const rat = P.ratEdges().filter(e => !routedNets.has(e.net)).concat(B.unrouted || []);
        rat.forEach(e => { const a = P.padPos(e.pa.part, e.pa.pad), b = P.padPos(e.pb.part, e.pb.pad); if (a && b) h += `<line class="rat" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`; });
      }
      const order = B.nl === 1 ? [1] : [1, 0];
      order.forEach(l => { if ((l === 0 && !L.top) || (l === 1 && !L.bot)) return; B.traces.filter(t => t.layer === l).forEach(t => { h += `<polyline class="${l ? 'trace-bot' : 'trace-top'}" stroke-width="${t.w}" points="${t.pts.map(p => p.x.toFixed(3) + ',' + p.y.toFixed(3)).join(' ')}"/>`; }); });
      B.parts.forEach(part => {
        const fp = D.getFootprint(part.fp), ct = D.partCourt(part), sel = P.sel === part.id;
        h += `<g class="part${sel ? ' selected' : ''}" data-id="${part.id}">`;
        h += `<rect class="court" x="${part.x - ct.w / 2}" y="${part.y - ct.h / 2}" width="${ct.w}" height="${ct.h}"/>`;
        if (L.silk) D.silkPolylines(part).forEach(pl => h += `<polyline class="${part.side === 'bottom' ? 'silk-bot' : 'silk-top'}" points="${pl.map(p => p.x.toFixed(3) + ',' + p.y.toFixed(3)).join(' ')}"/>`);
        fp.pads.forEach(pd => {
          const a = D.padAbs(part, pd), rotated = (part.rot % 180) !== 0, w = rotated ? pd.h : pd.w, hh = rotated ? pd.w : pd.h;
          const onTop = pd.layer === 'thru' || part.side === 'top', onBot = pd.layer === 'thru' || part.side === 'bottom';
          if ((onTop && !L.top && !onBot) || (onBot && !L.bot && !onTop)) return;
          const cls = pd.layer === 'thru' ? 'pad-thru' : (part.side === 'bottom' ? 'pad-bot' : 'pad-top');
          h += pd.shape === 'rect' ? `<rect class="${cls}" x="${a.x - w / 2}" y="${a.y - hh / 2}" width="${w}" height="${hh}"/>` : `<circle class="${cls}" cx="${a.x}" cy="${a.y}" r="${w / 2}"/>`;
          if (pd.drill) h += `<circle class="hole" cx="${a.x}" cy="${a.y}" r="${pd.drill / 2}"/>`;
        });
        if (L.silk) h += `<text class="reftext" x="${part.x}" y="${part.y - ct.h / 2 - 0.4}" text-anchor="middle" font-size="1.1">${D.esc(part.ref)}</text>`;
        h += '</g>';
      });
      if (L.top || L.bot) B.vias.forEach(v => h += `<circle class="via" cx="${v.x}" cy="${v.y}" r="0.45"/><circle class="hole" cx="${v.x}" cy="${v.y}" r="0.2"/>`);
      P.vp.innerHTML = h;
      P.applyView();
      if (!light) P.renderPanels();
    },
    renderPanels() {
      const B = P.board, info = document.getElementById('pcbInfo');
      const edges = B.nets.reduce((a, n) => a + Math.max(0, n.pads.length - 1), 0), routed = edges - (B.traces.length ? (B.unrouted || []).length : edges);
      info.textContent = `${B.w}×${B.h} mm · ${B.parts.length} parts · ${B.nets.length} nets · ${B.traces.length ? routed + '/' + edges + ' routed' : 'unrouted'}`;
      const box = document.getElementById('pcbProps'), part = B.parts.find(p => p.id === P.sel);
      box.innerHTML = '';
      if (!part) { box.innerHTML = '<div class="muted">Click a footprint to select it. Drag to move, R to rotate, F to flip.</div>'; return; }
      const row = (l, v) => { const kv = D.el('div', { class: 'kv' }); kv.append(D.el('span', {}, l), typeof v === 'string' ? D.el('span', {}, v) : v); box.append(kv); };
      box.append(D.el('div', { html: `<b>${D.esc(part.ref)}</b> ${D.esc(part.value)}` }));
      const fsel = D.el('select', { onchange: e => { part.fp = e.target.value; P.invalidatePart(part); P.render(); P.changed(); } });
      [...new Set([part.fp, ...D.FP_ORDER])].forEach(f => fsel.append(D.el('option', { value: f, ...(f === part.fp ? { selected: '' } : {}) }, f)));
      row('Footprint', fsel);
      row('Position', `${part.x.toFixed(2)}, ${part.y.toFixed(2)} mm`);
      row('Rotation', `${part.rot}°`);
      row('Side', part.side);
    },
  };
})();
