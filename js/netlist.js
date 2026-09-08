/* Drawing2PCB — connectivity, ERC, annotation, netlist -> schematic layout */
(function () {
  const D = D2P;
  const key = (x, y) => Math.round(x) + ',' + Math.round(y);

  /* Rules: wires touching end-to-end connect; a wire endpoint lying on another wire connects (T);
     a pin touching a wire end or lying on a wire connects; junction dots connect everything through them;
     labels connect by name; power symbols (GND/VCC) connect by their net name. Plain X crossings do NOT connect. */
  D.computeNets = design => {
    const dsu = new D.DSU();
    const pts = new Map();
    const add = (k, id) => { if (!pts.has(k)) pts.set(k, []); pts.get(k).push(id); };
    const pinInfo = new Map();
    design.wires.forEach(w => { add(key(w.a.x, w.a.y), 'w:' + w.id); add(key(w.b.x, w.b.y), 'w:' + w.id); dsu.find('w:' + w.id); });
    design.components.forEach(c => D.getPins(c).forEach(p => {
      const a = D.pinAbs(c, p), id = 'p:' + c.id + ':' + p.n;
      add(key(a.x, a.y), id); dsu.find(id);
      pinInfo.set(id, { comp: c, pin: p.n, label: p.l || p.n, x: a.x, y: a.y });
    }));
    design.junctions.forEach(j => { add(key(j.x, j.y), 'j:' + j.id); dsu.find('j:' + j.id); });
    design.labels.forEach(l => { add(key(l.x, l.y), 'l:' + l.id); dsu.find('l:' + l.id); dsu.union('l:' + l.id, 'n:' + l.text.trim()); });
    for (const list of pts.values()) for (let i = 1; i < list.length; i++) dsu.union(list[0], list[i]);
    for (const [k, list] of pts) {
      const [x, y] = k.split(',').map(Number), p = { x, y };
      for (const w of design.wires) {
        if (list.includes('w:' + w.id)) continue;
        if (D.ptOnSeg(p, w.a, w.b, 0.6)) dsu.union(list[0], 'w:' + w.id);
      }
    }
    design.components.forEach(c => {
      const def = D.getDef(c);
      if (def.power) dsu.union('p:' + c.id + ':1', 'n:' + (def.power === 'VCC' ? (c.props.net || 'VCC') : 'GND'));
    });

    const groups = new Map();
    const push = (id, kind, val) => { const r = dsu.find(id); if (!groups.has(r)) groups.set(r, { pins: [], wires: [], junctions: [], labels: [], names: new Set(), powers: new Set() }); groups.get(r)[kind].push(val); return groups.get(r); };
    design.wires.forEach(w => push('w:' + w.id, 'wires', w.id));
    design.junctions.forEach(j => push('j:' + j.id, 'junctions', j.id));
    design.labels.forEach(l => { const g = push('l:' + l.id, 'labels', l.id); g.names.add(l.text.trim()); });
    for (const [id, info] of pinInfo) {
      const g = push(id, 'pins', info);
      const def = D.getDef(info.comp);
      if (def.power) g.powers.add(def.power === 'VCC' ? (info.comp.props.net || 'VCC') : 'GND');
    }
    const nets = [];
    let k = 1;
    for (const g of groups.values()) {
      if (!g.pins.length && !g.wires.length) continue;
      const powers = [...g.powers], names = [...g.names];
      g.name = powers[0] || names[0] || ('N$' + (k++));
      g.powers = powers; g.names = names;
      nets.push(g);
    }
    nets.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const pinNet = new Map(), wireNet = new Map();
    nets.forEach((n, i) => { n.pins.forEach(p => pinNet.set(p.comp.id + ':' + p.pin, i)); n.wires.forEach(w => wireNet.set(w, i)); });
    return { nets, pinNet, wireNet };
  };

  D.erc = (design, nets) => {
    nets = nets || D.computeNets(design);
    const out = [];
    nets.nets.forEach(n => {
      const real = n.pins.filter(p => !D.getDef(p.comp).power);
      if (n.powers.length > 1) out.push({ level: 'err', msg: `Power nets shorted together: ${n.powers.join(' + ')}` });
      if (real.length === 1 && !n.names.length && !n.powers.length) out.push({ level: 'warn', msg: `Pin ${real[0].comp.props.ref || '?'}.${real[0].label} is not connected to anything` });
      if (!n.pins.length && n.wires.length) out.push({ level: 'warn', msg: `Dangling wire (net ${n.name}) with no pins` });
      if (n.powers.length && !real.length) out.push({ level: 'warn', msg: `Power symbol ${n.name} is not connected to any component` });
    });
    const refs = new Map();
    design.components.forEach(c => { if (D.getDef(c).power) return; const r = c.props.ref || ''; if (!r) out.push({ level: 'warn', msg: `A ${D.getDef(c).name} has no reference (run Annotate)` }); else refs.set(r, (refs.get(r) || 0) + 1); });
    for (const [r, n] of refs) if (n > 1) out.push({ level: 'err', msg: `Duplicate reference ${r} (${n}×)` });
    const pinned = new Set(nets.pinNet.keys());
    design.components.forEach(c => D.getPins(c).forEach(p => { if (!pinned.has(c.id + ':' + p.n)) out.push({ level: 'warn', msg: `Pin ${c.props.ref || '?'}.${p.l || p.n} unconnected` }); }));
    if (!out.length) out.push({ level: 'ok', msg: 'No problems found.' });
    return out;
  };

  /* assign refs: keep valid unique existing ones unless force */
  D.annotate = (design, force = false) => {
    const counters = {}, used = new Set();
    const comps = [...design.components].sort((a, b) => (a.y - b.y) || (a.x - b.x));
    if (!force) comps.forEach(c => { const r = c.props.ref; if (r && !used.has(r) && !D.getDef(c).power) used.add(r); else if (r && used.has(r)) c.props.ref = ''; });
    comps.forEach(c => {
      const def = D.getDef(c);
      if (def.power) { c.props.ref = def.prefix; return; }
      if (!force && c.props.ref) return;
      const pre = def.prefix;
      counters[pre] = counters[pre] || 0;
      let r;
      do { counters[pre]++; r = pre + counters[pre]; } while (used.has(r));
      used.add(r); c.props.ref = r;
    });
    return design;
  };

  /* Orthogonal route between two points. With a design given, L and Z candidates are scored so wires avoid
     crossing other components' pins (which would short them) and bodies. */
  D.lRoute = (a, b, design, hFirst) => {
    if (a.x === b.x || a.y === b.y) return [[a, b]];
    const c1 = { x: b.x, y: a.y }, c2 = { x: a.x, y: b.y };
    if (hFirst === true) return [[a, c1], [c1, b]];
    if (hFirst === false) return [[a, c2], [c2, b]];
    if (!design) return [[a, c1], [c1, b]];
    const cands = [[[a, c1], [c1, b]], [[a, c2], [c2, b]]];
    const mids = [0.5, 0.25, 0.75];
    mids.forEach(f => {
      const mx = D.snap(a.x + (b.x - a.x) * f, 10), my = D.snap(a.y + (b.y - a.y) * f, 10);
      cands.push([[a, { x: mx, y: a.y }], [{ x: mx, y: a.y }, { x: mx, y: b.y }], [{ x: mx, y: b.y }, b]]);
      cands.push([[a, { x: a.x, y: my }], [{ x: a.x, y: my }, { x: b.x, y: my }], [{ x: b.x, y: my }, b]]);
    });
    let best = cands[0], bestScore = Infinity;
    for (const segs of cands) { const s = D.routeScore(segs, design, [a, b]); if (s < bestScore) { bestScore = s; best = segs; } }
    return best.filter(([p, q]) => p.x !== q.x || p.y !== q.y);
  };
  D.routeScore = (segs, design, ends) => {
    let s = segs.length * 0.5;
    for (const c of design.components) {
      const bb = D.getBBox(c), pins = D.getPins(c).map(p => D.pinAbs(c, p));
      const own = pins.some(ap => ends.some(e => e.x === ap.x && e.y === ap.y));
      for (const [p, q] of segs) {
        const x0 = Math.min(p.x, q.x), x1 = Math.max(p.x, q.x), y0 = Math.min(p.y, q.y), y1 = Math.max(p.y, q.y);
        if (x1 > bb.x + 1 && x0 < bb.x + bb.w - 1 && y1 > bb.y + 1 && y0 < bb.y + bb.h - 1) s += own ? 0.3 : 4;
        for (const ap of pins) { if (ends.some(e => e.x === ap.x && e.y === ap.y)) continue; if (D.ptOnSeg(ap, p, q, 0.5)) s += 25; }
      }
    }
    for (const w of design.wires) for (const [p, q] of segs) {
      /* running along or ending on an existing wire of (possibly) another net is risky too */
      if (D.ptOnSeg(w.a, p, q, 0.5) || D.ptOnSeg(w.b, p, q, 0.5)) s += 2;
    }
    return s;
  };

  /* Build a schematic from a netlist.
     comps: [{id,type,value,ref?,x?,y? (0..1 hints),rot?,net?,props?}]  nets: [{name,pins:['id.pin',...]}] */
  D.designFromNetlist = (comps, nets, opts = {}) => {
    const W = opts.width || 1000, H = opts.height || 700;
    const design = { components: [], wires: [], junctions: [], labels: [] };
    const byId = new Map();
    const n = comps.length, cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.4))), sx = 160, sy = 140;
    comps.forEach((c, i) => {
      const type = D.LIB[c.type] ? c.type : 'R', def = D.LIB[type];
      let x, y;
      const hint = typeof c.x === 'number' && typeof c.y === 'number' && c.x >= 0 && c.x <= 1.01 && c.y >= 0 && c.y <= 1.01;
      if (hint) { x = c.x * W; y = c.y * H; } else { x = (i % cols) * sx + 100; y = Math.floor(i / cols) * sy + 100; }
      const comp = { id: c.id || D.uid('c'), type, x: D.snap(x, 20), y: D.snap(y, 20), rot: (((+c.rot || 0) % 360) + 360) % 360, mirror: false,
        props: Object.assign({ ref: c.ref || '', value: c.value != null && c.value !== '' ? String(c.value) : def.value, footprint: '' }, c.props || {}) };
      if (comp.rot % 90) comp.rot = 0;
      if (type === 'VCC' && c.net) comp.props.net = String(c.net);
      if ((type === 'IC' || type === 'HDR') && c.n) comp.props.n = String(c.n);
      design.components.push(comp); byId.set(String(c.id), comp);
    });
    /* push apart overlapping bodies */
    for (let it = 0; it < 30; it++) {
      let moved = false;
      for (let i = 0; i < design.components.length; i++) for (let j = i + 1; j < design.components.length; j++) {
        const A = D.getBBox(design.components[i]), B = D.getBBox(design.components[j]), m = 20;
        if (A.x < B.x + B.w + m && A.x + A.w + m > B.x && A.y < B.y + B.h + m && A.y + A.h + m > B.y) {
          const dx = (A.x + A.w / 2) - (B.x + B.w / 2), dy = (A.y + A.h / 2) - (B.y + B.h / 2);
          const cj = design.components[j];
          if (Math.abs(dx) > Math.abs(dy)) cj.x += dx > 0 ? -40 : 40; else cj.y += dy > 0 ? -40 : 40;
          cj.x = D.snap(cj.x, 20); cj.y = D.snap(cj.y, 20); moved = true;
        }
      }
      if (!moved) break;
    }
    /* wires */
    (nets || []).forEach(net => {
      const pts = [];
      (net.pins || []).forEach(ref => {
        const s = String(ref), i = s.lastIndexOf('.');
        if (i < 0) return;
        const comp = byId.get(s.slice(0, i)), pn = s.slice(i + 1);
        if (!comp) return;
        const pins = D.getPins(comp);
        const pin = pins.find(p => p.n === pn) || pins.find(p => (p.l || '').toUpperCase() === pn.toUpperCase());
        if (!pin) return;
        pts.push(D.pinAbs(comp, pin));
      });
      if (pts.length < 2) return;
      D.mst(pts).forEach(([i, j]) => {
        D.lRoute(pts[i], pts[j], design).forEach(([a, b]) => { if (a.x !== b.x || a.y !== b.y) design.wires.push({ id: D.uid('w'), a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } }); });
      });
    });
    D.annotate(design);
    return design;
  };
})();
