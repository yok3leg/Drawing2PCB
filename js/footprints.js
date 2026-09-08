/* Drawing2PCB — footprint library (mm, centred on origin, y down).
   pad: {n, x, y, w, h, shape:'circle'|'rect', drill (0 = SMD), layer:'thru'|'top'}
   silk: [{t:'l',x1,y1,x2,y2} | {t:'c',cx,cy,r}]   court: [w,h] courtyard for placement */
(function () {
  const D = D2P;
  const pad = (n, x, y, d, drill, shape = 'circle') => ({ n, x, y, w: d, h: d, shape, drill, layer: drill ? 'thru' : 'top' });
  const smd = (n, x, y, w, h) => ({ n, x, y, w, h, shape: 'rect', drill: 0, layer: 'top' });
  const L = (x1, y1, x2, y2) => ({ t: 'l', x1, y1, x2, y2 });
  const C = (cx, cy, r) => ({ t: 'c', cx, cy, r });
  const rect = (x, y, w, h) => [L(x, y, x + w, y), L(x + w, y, x + w, y + h), L(x + w, y + h, x, y + h), L(x, y + h, x, y)];

  D.FP = {
    'AXIAL-7.62': { pads: [pad('1', -3.81, 0, 1.8, 0.9), pad('2', 3.81, 0, 1.8, 0.9)], silk: [...rect(-3.2, -1.3, 6.4, 2.6), L(-3.2, 0, -2.5, 0), L(2.5, 0, 3.2, 0)], court: [9.6, 3.2] },
    'AXIAL-10.16': { pads: [pad('1', -5.08, 0, 1.8, 0.9), pad('2', 5.08, 0, 1.8, 0.9)], silk: [...rect(-4.3, -1.5, 8.6, 3)], court: [12.2, 3.6] },
    'R0805': { pads: [smd('1', -0.95, 0, 1.0, 1.3), smd('2', 0.95, 0, 1.0, 1.3)], silk: [L(-0.5, -0.8, 0.5, -0.8), L(-0.5, 0.8, 0.5, 0.8)], court: [3.2, 1.8] },
    'CAP-2.54': { pads: [pad('1', -1.27, 0, 1.6, 0.8), pad('2', 1.27, 0, 1.6, 0.8)], silk: [...rect(-2.3, -1.2, 4.6, 2.4)], court: [5.2, 2.8] },
    'CAP-RADIAL-5.0': { pads: [pad('1', -2.5, 0, 1.8, 1.0), pad('2', 2.5, 0, 1.8, 1.0)], silk: [C(0, 0, 3.6), L(-5.2, -1.2, -5.2, 0), L(-5.8, -0.6, -4.6, -0.6)], court: [8, 8] },
    'LED-3MM': { pads: [pad('1', -1.27, 0, 1.6, 0.9), pad('2', 1.27, 0, 1.6, 0.9)], silk: [C(0, 0, 1.9), L(-1.9, -1.2, -1.9, 1.2)], court: [4.4, 4.4] },
    'LED-5MM': { pads: [pad('1', -1.27, 0, 1.8, 0.9), pad('2', 1.27, 0, 1.8, 0.9)], silk: [C(0, 0, 2.9), L(-2.7, -1.8, -2.7, 1.8)], court: [6.2, 6.2] },
    'TO-92': { pads: [pad('1', -2.54, 0, 1.7, 0.9), pad('2', 0, 0, 1.7, 0.9), pad('3', 2.54, 0, 1.7, 0.9)], silk: [{ t: 'a', cx: 0, cy: 0, r: 2.6, a0: 200, a1: 340 }, L(-2.45, 0.9, 2.45, 0.9)], court: [6.4, 5.4] },
    'TO-220': { pads: [pad('1', -2.54, 0, 2.0, 1.0), pad('2', 0, 0, 2.0, 1.0), pad('3', 2.54, 0, 2.0, 1.0)], silk: [...rect(-5.1, -3.9, 10.2, 2.4), L(-5.1, -1.5, 5.1, -1.5)], court: [10.8, 6.4] },
    'TACT-6MM': { pads: [pad('1', -3.25, -2.25, 1.6, 0.9), pad('1', -3.25, 2.25, 1.6, 0.9), pad('2', 3.25, -2.25, 1.6, 0.9), pad('2', 3.25, 2.25, 1.6, 0.9)], silk: [...rect(-3, -3, 6, 6), C(0, 0, 1.7)], court: [8.4, 7.2] },
    'HC49': { pads: [pad('1', -2.44, 0, 1.6, 0.8), pad('2', 2.44, 0, 1.6, 0.8)], silk: [...rect(-5.6, -2.3, 11.2, 4.6)], court: [12, 5.2] },
    'CONN-2P-5.08': { pads: [pad('1', -2.54, 0, 2.2, 1.2, 'rect'), pad('2', 2.54, 0, 2.2, 1.2)], silk: [...rect(-5.1, -3.8, 10.2, 7.6), L(-4.3, -3.8, -4.3, 3.8)], court: [10.8, 8.2] },
    'POT-3P': { pads: [pad('1', -2.54, 0, 1.8, 1.0), pad('2', 0, 0, 1.8, 1.0), pad('3', 2.54, 0, 1.8, 1.0)], silk: [...rect(-4.8, -4.6, 9.6, 5.8), C(0, -1.7, 1.2)], court: [10.2, 7.2] },
    'BUZZER-12MM': { pads: [pad('1', -3.25, 0, 1.8, 1.0, 'rect'), pad('2', 3.25, 0, 1.8, 1.0)], silk: [C(0, 0, 6), L(-6.6, -1, -6.6, 1)], court: [12.6, 12.6] },
  };
  D.FP_ORDER = ['AXIAL-7.62', 'AXIAL-10.16', 'R0805', 'CAP-2.54', 'CAP-RADIAL-5.0', 'LED-3MM', 'LED-5MM', 'TO-92', 'TO-220', 'TACT-6MM', 'HC49', 'CONN-2P-5.08', 'POT-3P', 'BUZZER-12MM', 'DIP-8', 'DIP-14', 'DIP-16', 'HDR-1x2', 'HDR-1x3', 'HDR-1x4', 'HDR-1x6', 'HDR-1x8'];

  const gen = {};
  D.getFootprint = name => {
    if (D.FP[name]) return D.FP[name];
    if (gen[name]) return gen[name];
    let m;
    if ((m = /^DIP-(\d+)$/.exec(name))) {
      const n = Math.max(4, +m[1] + (+m[1] % 2)), k = n / 2, pads = [], h = (k - 1) * 2.54;
      for (let i = 0; i < k; i++) {
        const y = -h / 2 + i * 2.54;
        pads.push(pad(String(i + 1), -3.81, y, 1.6, 0.8, i === 0 ? 'rect' : 'circle'));
        pads.push(pad(String(n - i), 3.81, y, 1.6, 0.8));
      }
      const bh = h + 2.54;
      gen[name] = { pads, silk: [...rect(-2.6, -bh / 2, 5.2, bh), { t: 'a', cx: 0, cy: -bh / 2, r: 1, a0: 0, a1: 180 }], court: [9.2, bh + 1] };
      return gen[name];
    }
    if ((m = /^HDR-1x(\d+)$/.exec(name))) {
      const n = Math.max(1, +m[1]), pads = [], h = (n - 1) * 2.54;
      for (let i = 0; i < n; i++) pads.push(pad(String(i + 1), 0, -h / 2 + i * 2.54, 1.7, 1.0, i === 0 ? 'rect' : 'circle'));
      gen[name] = { pads, silk: rect(-1.27, -h / 2 - 1.27, 2.54, h + 2.54), court: [3.4, h + 3.4] };
      return gen[name];
    }
    return D.FP['AXIAL-7.62'];
  };

  /* absolute pad position for a placed part (rot in degrees, side 'top'|'bottom' mirrors x) */
  D.padAbs = (part, pd) => {
    let x = pd.x, y = pd.y;
    if (part.side === 'bottom') x = -x;
    const a = ((part.rot || 0) * Math.PI) / 180, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
    return { x: part.x + x * c - y * s, y: part.y + x * s + y * c };
  };
  D.partCourt = part => { const fp = D.getFootprint(part.fp); const [w, h] = fp.court; return (part.rot % 180) ? { w: h, h: w } : { w, h }; };

  /* silk primitives -> polylines in absolute mm (arcs & circles approximated) */
  D.silkPolylines = part => {
    const fp = D.getFootprint(part.fp), out = [];
    const xf = p => { let x = p.x, y = p.y; if (part.side === 'bottom') x = -x; const a = ((part.rot || 0) * Math.PI) / 180, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a)); return { x: part.x + x * c - y * s, y: part.y + x * s + y * c }; };
    for (const s of fp.silk) {
      if (s.t === 'l') out.push([xf({ x: s.x1, y: s.y1 }), xf({ x: s.x2, y: s.y2 })]);
      else if (s.t === 'c' || s.t === 'a') {
        const a0 = s.t === 'c' ? 0 : s.a0, a1 = s.t === 'c' ? 360 : s.a1, n = 24, pl = [];
        for (let i = 0; i <= n; i++) { const a = ((a0 + (a1 - a0) * i / n) * Math.PI) / 180; pl.push(xf({ x: s.cx + s.r * Math.cos(a), y: s.cy + s.r * Math.sin(a) })); }
        out.push(pl);
      }
    }
    return out;
  };
})();
