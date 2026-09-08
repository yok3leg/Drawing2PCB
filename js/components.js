/* Drawing2PCB — symbol library.
   Coordinates: schematic units, grid = 10. Primitives are shared by the SVG renderer and the EasyEDA exporter:
   l=line r=rect c=circle p=path(d: M/L/A/Q/Z only) pl=polyline(cl=closed) t=text */
(function () {
  const D = D2P;
  const L = (x1, y1, x2, y2) => ({ t: 'l', x1, y1, x2, y2 });
  const R = (x, y, w, h, f) => ({ t: 'r', x, y, w, h, f: !!f });
  const C = (cx, cy, r, f) => ({ t: 'c', cx, cy, r, f: !!f });
  const P = (d, f) => ({ t: 'p', d, f: !!f });
  const PL = (pts, cl, f) => ({ t: 'pl', pts, cl: !!cl, f: !!f });
  const T = (x, y, s, sz = 9) => ({ t: 't', x, y, s, sz });
  /* arrow head at point a+t*(b-a) pointing from a to b */
  const arrowAt = (ax, ay, bx, by, t = 1, size = 5) => {
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    const px = ax + dx * t, py = ay + dy * t;
    return [PL([[px - ux * size - uy * size * 0.55, py - uy * size + ux * size * 0.55], [px, py], [px - ux * size + uy * size * 0.55, py - uy * size - ux * size * 0.55]], true, true)];
  };
  const arrow = (x1, y1, x2, y2) => [L(x1, y1, x2, y2), ...arrowAt(x1, y1, x2, y2)];
  const two = [{ n: '1', x: -30, y: 0 }, { n: '2', x: 30, y: 0 }];
  const vert = [{ n: '1', x: 0, y: -30, l: '+' }, { n: '2', x: 0, y: 30, l: '-' }];

  D.LIB = {
    R: { name: 'Resistor', cat: 'Passive', prefix: 'R', value: '1k', fp: 'AXIAL-7.62', bbox: [-30, -8, 60, 16], pins: two,
      sym: () => [L(-30, 0, -15, 0), L(15, 0, 30, 0), R(-15, -6, 30, 12)] },
    POT: { name: 'Potentiometer', cat: 'Passive', prefix: 'RV', value: '10k', fp: 'POT-3P', bbox: [-30, -30, 60, 38],
      pins: [{ n: '1', x: -30, y: 0 }, { n: '2', x: 0, y: -30, l: 'W' }, { n: '3', x: 30, y: 0 }],
      sym: () => [L(-30, 0, -15, 0), L(15, 0, 30, 0), R(-15, -6, 30, 12), ...arrow(0, -30, 0, -7)] },
    C: { name: 'Capacitor', cat: 'Passive', prefix: 'C', value: '100n', fp: 'CAP-2.54', bbox: [-30, -14, 60, 28], pins: two,
      sym: () => [L(-30, 0, -4, 0), L(4, 0, 30, 0), L(-4, -12, -4, 12), L(4, -12, 4, 12)] },
    CP: { name: 'Capacitor (electrolytic)', cat: 'Passive', prefix: 'C', value: '100u', fp: 'CAP-RADIAL-5.0', bbox: [-30, -16, 60, 32],
      pins: [{ n: '1', x: -30, y: 0, l: '+' }, { n: '2', x: 30, y: 0, l: '-' }],
      sym: () => [L(-30, 0, -4, 0), L(7, 0, 30, 0), L(-4, -12, -4, 12), P('M 8 -12 A 18 18 0 0 1 8 12'), T(-16, -8, '+', 10)] },
    L: { name: 'Inductor', cat: 'Passive', prefix: 'L', value: '10u', fp: 'AXIAL-7.62', bbox: [-30, -10, 60, 14], pins: two,
      sym: () => [L(-30, 0, -20, 0), L(20, 0, 30, 0), P('M -20 0 A 5 5 0 0 1 -10 0 A 5 5 0 0 1 0 0 A 5 5 0 0 1 10 0 A 5 5 0 0 1 20 0')] },
    XTAL: { name: 'Crystal', cat: 'Passive', prefix: 'Y', value: '16MHz', fp: 'HC49', bbox: [-30, -14, 60, 28], pins: two,
      sym: () => [L(-30, 0, -8, 0), L(8, 0, 30, 0), L(-8, -10, -8, 10), L(8, -10, 8, 10), R(-5, -12, 10, 24)] },
    FUSE: { name: 'Fuse', cat: 'Passive', prefix: 'F', value: '1A', fp: 'AXIAL-7.62', bbox: [-30, -8, 60, 16], pins: two,
      sym: () => [L(-30, 0, 30, 0), R(-15, -6, 30, 12)] },

    D: { name: 'Diode', cat: 'Semiconductor', prefix: 'D', value: '1N4148', fp: 'AXIAL-7.62', bbox: [-30, -10, 60, 20],
      pins: [{ n: '2', x: -30, y: 0, l: 'A' }, { n: '1', x: 30, y: 0, l: 'K' }],
      sym: () => [L(-30, 0, -8, 0), L(8, 0, 30, 0), PL([[-8, -8], [8, 0], [-8, 8]], true), L(8, -8, 8, 8)] },
    ZD: { name: 'Zener diode', cat: 'Semiconductor', prefix: 'D', value: '5V1', fp: 'AXIAL-7.62', bbox: [-30, -12, 60, 24],
      pins: [{ n: '2', x: -30, y: 0, l: 'A' }, { n: '1', x: 30, y: 0, l: 'K' }],
      sym: () => [L(-30, 0, -8, 0), L(8, 0, 30, 0), PL([[-8, -8], [8, 0], [-8, 8]], true), L(8, -8, 8, 8), L(8, -8, 4, -11), L(8, 8, 12, 11)] },
    LED: { name: 'LED', cat: 'Semiconductor', prefix: 'D', value: 'RED', fp: 'LED-5MM', bbox: [-30, -20, 60, 30],
      pins: [{ n: '2', x: -30, y: 0, l: 'A' }, { n: '1', x: 30, y: 0, l: 'K' }],
      sym: () => [L(-30, 0, -8, 0), L(8, 0, 30, 0), PL([[-8, -8], [8, 0], [-8, 8]], true), L(8, -8, 8, 8), ...arrow(-2, -9, 4, -17), ...arrow(4, -6, 10, -14)] },
    Q_NPN: { name: 'NPN transistor', cat: 'Semiconductor', prefix: 'Q', value: '2N3904', fp: 'TO-92', bbox: [-30, -30, 50, 60],
      pins: [{ n: '1', x: 10, y: 30, l: 'E' }, { n: '2', x: -30, y: 0, l: 'B' }, { n: '3', x: 10, y: -30, l: 'C' }],
      sym: () => [C(2, 0, 20), L(-30, 0, -5, 0), L(-5, -12, -5, 12), L(-5, -5, 10, -15), L(10, -15, 10, -30), L(-5, 5, 10, 15), L(10, 15, 10, 30), ...arrowAt(-5, 5, 10, 15, 0.8)] },
    Q_PNP: { name: 'PNP transistor', cat: 'Semiconductor', prefix: 'Q', value: '2N3906', fp: 'TO-92', bbox: [-30, -30, 50, 60],
      pins: [{ n: '1', x: 10, y: 30, l: 'E' }, { n: '2', x: -30, y: 0, l: 'B' }, { n: '3', x: 10, y: -30, l: 'C' }],
      sym: () => [C(2, 0, 20), L(-30, 0, -5, 0), L(-5, -12, -5, 12), L(-5, -5, 10, -15), L(10, -15, 10, -30), L(-5, 5, 10, 15), L(10, 15, 10, 30), ...arrowAt(10, 15, -5, 5, 0.8)] },
    NMOS: { name: 'N-MOSFET', cat: 'Semiconductor', prefix: 'Q', value: 'IRLZ44N', fp: 'TO-220', bbox: [-30, -30, 50, 60],
      pins: [{ n: '1', x: -30, y: 0, l: 'G' }, { n: '2', x: 10, y: -30, l: 'D' }, { n: '3', x: 10, y: 30, l: 'S' }],
      sym: () => [L(-30, 0, -10, 0), L(-10, -12, -10, 12), L(-4, -14, -4, -6), L(-4, -3, -4, 3), L(-4, 6, -4, 14), L(-4, -10, 10, -10), L(10, -10, 10, -30), L(-4, 10, 10, 10), L(10, 10, 10, 30), L(10, 0, -4, 0), ...arrowAt(10, 0, -4, 0, 1, 4)] },
    OPAMP: { name: 'Op-amp', cat: 'IC', prefix: 'U', value: 'TL071', fp: 'DIP-8', bbox: [-30, -30, 60, 60],
      pins: [{ n: '3', x: -30, y: -10, l: '+' }, { n: '2', x: -30, y: 10, l: '-' }, { n: '6', x: 30, y: 0, l: 'OUT' }, { n: '7', x: 0, y: -30, l: 'V+' }, { n: '4', x: 0, y: 30, l: 'V-' }],
      sym: () => [PL([[-20, -22], [24, 0], [-20, 22]], true), L(-30, -10, -20, -10), L(-30, 10, -20, 10), L(24, 0, 30, 0), L(0, -30, 0, -12), L(0, 30, 0, 12), T(-15, -7, '+', 9), T(-15, 13, '-', 9)] },
    IC: { name: 'IC (DIP)', cat: 'IC', prefix: 'U', value: 'IC', fp: null, fields: ['n'], nDefault: 8,
      pins: p => { const n = D.evenN(p.n, 8), k = n / 2, out = []; for (let i = 0; i < k; i++) { const y = (i - (k - 1) / 2) * 20; out.push({ n: String(i + 1), x: -50, y }); out.push({ n: String(n - i), x: 50, y }); } return out; },
      sym: p => { const n = D.evenN(p.n, 8), k = n / 2, h = k * 10; const s = [R(-30, -h, 60, 2 * h), P(`M -6 ${-h} A 6 6 0 0 0 6 ${-h}`)]; for (let i = 0; i < k; i++) { const y = (i - (k - 1) / 2) * 20; s.push(L(-50, y, -30, y), L(30, y, 50, y), T(-27, y + 3, String(i + 1), 7), T(27, y + 3, String(n - i), 7)); } return s; },
      bbox: p => { const k = D.evenN(p.n, 8) / 2; return [-50, -k * 10 - 8, 100, k * 20 + 16]; } },
    HDR: { name: 'Pin header', cat: 'Connector', prefix: 'J', value: 'HDR', fp: null, fields: ['n'], nDefault: 4,
      pins: p => { const n = D.posN(p.n, 4); return Array.from({ length: n }, (_, i) => ({ n: String(i + 1), x: -30, y: (i - (n - 1) / 2) * 20 })); },
      sym: p => { const n = D.posN(p.n, 4), h = n * 10; const s = [R(-10, -h, 20, 2 * h)]; for (let i = 0; i < n; i++) { const y = (i - (n - 1) / 2) * 20; s.push(L(-30, y, -10, y), C(0, y, 2.5), T(14, y + 3, String(i + 1), 7)); } return s; },
      bbox: p => { const n = D.posN(p.n, 4); return [-30, -n * 10 - 4, 50, n * 20 + 8]; } },

    BATT: { name: 'Battery', cat: 'Source', prefix: 'BT', value: '9V', fp: 'CONN-2P-5.08', bbox: [-14, -30, 30, 60], pins: vert,
      sym: () => [L(0, -30, 0, -9), L(-12, -9, 12, -9), L(-5, -3, 5, -3), L(-12, 3, 12, 3), L(-5, 9, 5, 9), L(0, 9, 0, 30), T(16, -12, '+', 10)] },
    VSRC: { name: 'DC voltage source', cat: 'Source', prefix: 'V', value: '5V', fp: 'CONN-2P-5.08', bbox: [-16, -30, 32, 60], pins: vert,
      sym: () => [C(0, 0, 15), L(0, -30, 0, -15), L(0, 15, 0, 30), L(-4, -7, 4, -7), L(0, -11, 0, -3), L(-4, 7, 4, 7)] },
    ACSRC: { name: 'AC source', cat: 'Source', prefix: 'V', value: '12Vac', fp: 'CONN-2P-5.08', bbox: [-16, -30, 32, 60], pins: [{ n: '1', x: 0, y: -30 }, { n: '2', x: 0, y: 30 }],
      sym: () => [C(0, 0, 15), L(0, -30, 0, -15), L(0, 15, 0, 30), P('M -8 0 Q -4 -10 0 0 Q 4 10 8 0')] },
    GND: { name: 'Ground', cat: 'Power', prefix: '#GND', value: '', fp: '', power: 'GND', bbox: [-12, 0, 24, 22], pins: [{ n: '1', x: 0, y: 0 }],
      sym: () => [L(0, 0, 0, 10), L(-12, 10, 12, 10), L(-8, 15, 8, 15), L(-4, 20, 4, 20)] },
    VCC: { name: 'Power flag (VCC)', cat: 'Power', prefix: '#PWR', value: '', fp: '', power: 'VCC', fields: ['net'], bbox: [-14, -22, 28, 22], pins: [{ n: '1', x: 0, y: 0 }],
      sym: p => [L(0, 0, 0, -10), L(-10, -10, 10, -10), T(0, -14, p.net || 'VCC', 9)] },

    SW: { name: 'Switch (SPST)', cat: 'Electromech', prefix: 'SW', value: 'SPST', fp: 'CONN-2P-5.08', bbox: [-30, -16, 60, 20], pins: two,
      sym: () => [L(-30, 0, -15, 0), C(-15, 0, 2), C(15, 0, 2), L(-13, -1, 14, -12), L(15, 0, 30, 0)] },
    BTN: { name: 'Pushbutton', cat: 'Electromech', prefix: 'SW', value: 'TACT', fp: 'TACT-6MM', bbox: [-30, -20, 60, 24], pins: two,
      sym: () => [L(-30, 0, -15, 0), C(-15, 0, 2), C(15, 0, 2), L(-17, -7, 17, -7), L(0, -7, 0, -16), L(-6, -16, 6, -16), L(15, 0, 30, 0)] },
    BUZZ: { name: 'Buzzer', cat: 'Electromech', prefix: 'BZ', value: '5V', fp: 'BUZZER-12MM', bbox: [-20, -20, 40, 50],
      pins: [{ n: '1', x: -10, y: 30, l: '+' }, { n: '2', x: 10, y: 30, l: '-' }],
      sym: () => [P('M -18 10 A 18 18 0 0 1 18 10'), L(-18, 10, 18, 10), L(-10, 10, -10, 30), L(10, 10, 10, 30), T(-17, -2, '+', 9)] },
    MOTOR: { name: 'DC motor', cat: 'Electromech', prefix: 'M', value: 'DC', fp: 'CONN-2P-5.08', bbox: [-16, -30, 32, 60], pins: [{ n: '1', x: 0, y: -30 }, { n: '2', x: 0, y: 30 }],
      sym: () => [C(0, 0, 15), L(0, -30, 0, -15), L(0, 15, 0, 30), T(0, 4.5, 'M', 12)] },
    LAMP: { name: 'Lamp', cat: 'Electromech', prefix: 'LA', value: '12V', fp: 'CONN-2P-5.08', bbox: [-16, -30, 32, 60], pins: [{ n: '1', x: 0, y: -30 }, { n: '2', x: 0, y: 30 }],
      sym: () => [C(0, 0, 15), L(0, -30, 0, -15), L(0, 15, 0, 30), L(-10, -10, 10, 10), L(-10, 10, 10, -10)] },
  };
  D.LIB_ORDER = ['R', 'POT', 'C', 'CP', 'L', 'XTAL', 'FUSE', 'D', 'ZD', 'LED', 'Q_NPN', 'Q_PNP', 'NMOS', 'OPAMP', 'IC', 'HDR', 'BATT', 'VSRC', 'ACSRC', 'GND', 'VCC', 'SW', 'BTN', 'BUZZ', 'MOTOR', 'LAMP'];
  D.CATS = ['Passive', 'Semiconductor', 'IC', 'Connector', 'Source', 'Power', 'Electromech'];

  D.evenN = (v, dflt) => { let n = parseInt(v, 10); if (!(n >= 2)) n = dflt; if (n % 2) n++; return Math.min(n, 64); };
  D.posN = (v, dflt) => { let n = parseInt(v, 10); if (!(n >= 1)) n = dflt; return Math.min(n, 40); };

  /* resolve library data for a component instance */
  D.getDef = c => D.LIB[c.type] || D.LIB.R;
  D.getPins = c => { const d = D.getDef(c); return typeof d.pins === 'function' ? d.pins(c.props || {}) : d.pins; };
  D.getSym = c => D.getDef(c).sym(c.props || {});
  D.getLocalBBox = c => { const d = D.getDef(c); return typeof d.bbox === 'function' ? d.bbox(c.props || {}) : d.bbox; };
  D.getBBox = c => {
    const [bx, by, bw, bh] = D.getLocalBBox(c);
    const cs = [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]].map(([x, y]) => D.rot(x, y, c.rot || 0, c.mirror));
    const xs = cs.map(p => p.x), ys = cs.map(p => p.y);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    return { x: c.x + x0, y: c.y + y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
  };
  D.pinAbs = (c, pin) => { const r = D.rot(pin.x, pin.y, c.rot || 0, c.mirror); return { x: c.x + r.x, y: c.y + r.y }; };
  D.defaultFp = c => {
    const d = D.getDef(c);
    if (c.props && c.props.footprint) return c.props.footprint;
    if (c.type === 'IC') return 'DIP-' + D.evenN(c.props && c.props.n, 8);
    if (c.type === 'HDR') return 'HDR-1x' + D.posN(c.props && c.props.n, 4);
    return d.fp || '';
  };

  /* primitives -> SVG markup (class 'sym' for styling) */
  D.primsToSvg = prims => prims.map(p => {
    const fc = p.f ? 'sym fill' : 'sym';
    switch (p.t) {
      case 'l': return `<line class="sym" x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}"/>`;
      case 'r': return `<rect class="${fc}" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}"/>`;
      case 'c': return `<circle class="${fc}" cx="${p.cx}" cy="${p.cy}" r="${p.r}"/>`;
      case 'p': return `<path class="${fc}" d="${p.d}"/>`;
      case 'pl': return `<${p.cl ? 'polygon' : 'polyline'} class="${fc}" points="${p.pts.map(q => q.join(',')).join(' ')}"/>`;
      case 't': return `<text class="sym" x="${p.x}" y="${p.y}" font-size="${p.sz}" text-anchor="middle">${D.esc(p.s)}</text>`;
    }
    return '';
  }).join('');

  /* next free reference for a prefix */
  D.nextRef = (design, prefix) => {
    const used = new Set(design.components.map(c => c.props && c.props.ref));
    for (let i = 1; ; i++) if (!used.has(prefix + i)) return prefix + i;
  };
})();
