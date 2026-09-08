/* Drawing2PCB — exporters: EasyEDA Std schematic/PCB JSON (best effort), KiCad netlist, Gerber RS-274X + Excellon, BOM, SVG */
(function () {
  const D = D2P;
  const E = D.Export = {};
  let gid = 100;
  const gge = () => 'gge' + (gid++);
  const n2 = v => D.fmt(v, 2);

  /* ================= EasyEDA schematic ================= */
  E.easyedaSchematic = (design, nets) => {
    gid = 100;
    nets = nets || D.computeNets(design);
    const b = D.sch.bounds ? D.sch.bounds() : null;
    const OX = b ? D.snap(400 - b.x, 10) : 400, OY = b ? D.snap(300 - b.y, 10) : 300;
    const shape = [];
    const SC = '#880000';
    const tp = (d, len) => { const parts = []; const p = (x, y) => parts.push(`${n2(x)} ${n2(y)}`); return { parts, p }; };
    const xfPath = (d, c) => {
      const tok = d.replace(/([A-Za-z])/g, ' $1 ').trim().split(/\s+/), out = [];
      const T = (x, y) => { const r = D.rot(x, y, c.rot || 0, c.mirror); return `${n2(c.x + r.x + OX)} ${n2(c.y + r.y + OY)}`; };
      let i = 0;
      while (i < tok.length) {
        const cmd = tok[i++];
        if (cmd === 'M' || cmd === 'L') { out.push(cmd, T(+tok[i], +tok[i + 1])); i += 2; }
        else if (cmd === 'Q') { out.push('Q', T(+tok[i], +tok[i + 1]), T(+tok[i + 2], +tok[i + 3])); i += 4; }
        else if (cmd === 'A') { const sweep = c.mirror ? 1 - +tok[i + 4] : +tok[i + 4]; out.push('A', n2(+tok[i]), n2(+tok[i + 1]), tok[i + 2], tok[i + 3], sweep, T(+tok[i + 5], +tok[i + 6])); i += 7; }
        else if (cmd === 'Z') out.push('Z');
        else i++;
      }
      return out.join(' ');
    };
    design.components.forEach(c => {
      const def = D.getDef(c), sub = [];
      const T = (x, y) => { const r = D.rot(x, y, c.rot || 0, c.mirror); return { x: c.x + r.x + OX, y: c.y + r.y + OY }; };
      const fp = D.defaultFp(c);
      const head = `LIB~${n2(c.x + OX)}~${n2(c.y + OY)}~package\`${fp}\`spicePre\`${def.prefix.replace('#', '')}\`~0~~${gge()}~1~yes~yes~0~0~`;
      D.getSym(c).forEach(p => {
        if (p.t === 'l') { const a = T(p.x1, p.y1), b = T(p.x2, p.y2); sub.push(`PL~${n2(a.x)} ${n2(a.y)} ${n2(b.x)} ${n2(b.y)}~${SC}~1~0~none~${gge()}~0`); }
        else if (p.t === 'r') { const cs = [[p.x, p.y], [p.x + p.w, p.y], [p.x + p.w, p.y + p.h], [p.x, p.y + p.h]].map(([x, y]) => T(x, y)); const x0 = Math.min(...cs.map(q => q.x)), y0 = Math.min(...cs.map(q => q.y)); sub.push(`R~${n2(x0)}~${n2(y0)}~~~${n2(Math.max(...cs.map(q => q.x)) - x0)}~${n2(Math.max(...cs.map(q => q.y)) - y0)}~${SC}~1~0~${p.f ? SC : 'none'}~${gge()}~0`); }
        else if (p.t === 'c') { const a = T(p.cx, p.cy); sub.push(`E~${n2(a.x)}~${n2(a.y)}~${n2(p.r)}~${n2(p.r)}~${SC}~1~0~${p.f ? SC : 'none'}~${gge()}~0`); }
        else if (p.t === 'p') sub.push(`PT~${xfPath(p.d, c)}~${SC}~1~0~${p.f ? SC : 'none'}~${gge()}~0`);
        else if (p.t === 'pl') { const pts = p.pts.map(([x, y]) => T(x, y)).map(q => `${n2(q.x)} ${n2(q.y)}`).join(' '); sub.push(`${p.cl ? 'PG' : 'PL'}~${pts}~${SC}~1~0~${p.f ? SC : 'none'}~${gge()}~0`); }
        else if (p.t === 't') { const a = T(p.x, p.y); sub.push(`T~L~${n2(a.x)}~${n2(a.y)}~0~${SC}~Arial~${p.sz}pt~~~comment~${p.s}~1~middle~${gge()}~0~`); }
      });
      D.getPins(c).forEach(pin => {
        const a = T(pin.x, pin.y), rel = D.rot(pin.x, pin.y, c.rot || 0, c.mirror);
        const rot = Math.abs(rel.x) >= Math.abs(rel.y) ? (rel.x <= 0 ? 0 : 180) : (rel.y < 0 ? 90 : 270);
        const id = gge(), X = n2(a.x), Y = n2(a.y);
        sub.push(`P~show~0~${pin.n}~${X}~${Y}~${rot}~${id}~0^^${X}~${Y}^^M ${X} ${Y} h 10~${SC}^^0~${n2(a.x + 5)}~${n2(a.y - 2)}~0~${pin.n}~start~~~#0000FF^^0~${n2(a.x + 12)}~${n2(a.y)}~0~${pin.l || pin.n}~start~~~#0000FF^^0~${n2(a.x + 10)}~${Y}^^0~${n2(a.x + 12)}~${Y}`);
      });
      const bb = D.getBBox(c);
      if (!def.power) {
        sub.push(`T~P~${n2(bb.x + OX)}~${n2(bb.y + OY - 4)}~0~#000080~Arial~~~~comment~${c.props.ref || ''}~1~start~${gge()}~1~pinpart`);
        sub.push(`T~N~${n2(bb.x + OX)}~${n2(bb.y + bb.h + OY + 12)}~0~#000080~Arial~~~~comment~${c.props.value || ''}~1~start~${gge()}~1~pinpart`);
      } else {
        const a = T(0, 0), name = def.power === 'VCC' ? (c.props.net || 'VCC') : 'GND';
        shape.push(`N~${n2(a.x)}~${n2(a.y)}~0~#0000FF~${name}~${gge()}~start~${n2(a.x + 4)}~${n2(a.y - 4)}~Times New Roman~0`);
      }
      shape.push([head, ...sub].join('#@$'));
    });
    design.wires.forEach(w => shape.push(`W~${n2(w.a.x + OX)} ${n2(w.a.y + OY)} ${n2(w.b.x + OX)} ${n2(w.b.y + OY)}~#008800~1~0~none~${gge()}~0`));
    design.junctions.forEach(j => shape.push(`J~${n2(j.x + OX)}~${n2(j.y + OY)}~2.5~#CC0000~${gge()}~0`));
    design.labels.forEach(l => shape.push(`N~${n2(l.x + OX)}~${n2(l.y + OY)}~0~#0000FF~${l.text}~${gge()}~start~${n2(l.x + OX + 4)}~${n2(l.y + OY - 4)}~Times New Roman~0`));
    const doc = {
      head: { docType: '1', editorVersion: '6.5.40', newgId: true, c_para: { 'Prefix Start': '1' }, hasIdFlag: true, x: '0', y: '0', importFlag: 0, transformList: '', c_spiceCmd: null },
      canvas: 'CA~1000~1000~#FFFFFF~yes~#CCCCCC~5~1000~1000~line~5~pixel~5~0~0',
      shape,
      BBox: b ? { x: b.x + OX - 20, y: b.y + OY - 20, width: b.w + 40, height: b.h + 40 } : { x: 0, y: 0, width: 1000, height: 1000 },
      colors: {}
    };
    return JSON.stringify(doc, null, 1);
  };

  /* ================= EasyEDA PCB ================= */
  E.easyedaPcb = board => {
    gid = 100;
    const K = 1 / 0.254, OX = 4000, OY = 3000;
    const X = v => n2(OX + v * K), Y = v => n2(OY + v * K), S = v => n2(v * K);
    const netName = i => (i >= 0 && board.nets[i]) ? board.nets[i].name : '';
    const shape = [];
    shape.push(`TRACK~1~10~~${X(0)} ${Y(0)} ${X(board.w)} ${Y(0)} ${X(board.w)} ${Y(board.h)} ${X(0)} ${Y(board.h)} ${X(0)} ${Y(0)}~${gge()}~0`);
    const padNet = new Map(); board.nets.forEach((n, i) => n.pads.forEach(pp => padNet.set(pp.part + '/' + pp.pad, i)));
    board.parts.forEach(part => {
      const fp = D.getFootprint(part.fp), sub = [], silkL = part.side === 'bottom' ? 4 : 3;
      const head = `LIB~${X(part.x)}~${Y(part.y)}~package\`${part.fp}\`~0~~${gge()}~1~yes~yes~0~`;
      D.silkPolylines(part).forEach(pl => sub.push(`TRACK~0.6~${silkL}~~${pl.map(p => `${X(p.x)} ${Y(p.y)}`).join(' ')}~${gge()}~0`));
      fp.pads.forEach(pd => {
        const a = D.padAbs(part, pd), ni = padNet.get(part.id + '/' + pd.n), rotated = (part.rot % 180) !== 0;
        const w = rotated ? pd.h : pd.w, h = rotated ? pd.w : pd.h;
        const layer = pd.layer === 'thru' ? 11 : (part.side === 'bottom' ? 2 : 1);
        sub.push(`PAD~${pd.shape === 'rect' ? 'RECT' : 'ELLIPSE'}~${X(a.x)}~${Y(a.y)}~${S(w)}~${S(h)}~${layer}~${netName(ni == null ? -1 : ni)}~${pd.n}~${S(pd.drill / 2)}~~0~${gge()}~0~~Y~0~0.2~${X(a.x)},${Y(a.y)}`);
      });
      const ct = D.partCourt(part);
      sub.push(`TEXT~P~${X(part.x - ct.w / 2)}~${Y(part.y - ct.h / 2 - 0.5)}~0.6~0~${part.side === 'bottom' ? 'M' : ''}~${silkL}~~4.5~${part.ref}~~~${gge()}~~0`);
      shape.push([head, ...sub].join('#@$'));
    });
    board.traces.forEach(t => shape.push(`TRACK~${S(t.w)}~${t.layer === 0 ? 1 : 2}~${netName(t.net)}~${t.pts.map(p => `${X(p.x)} ${Y(p.y)}`).join(' ')}~${gge()}~0`));
    board.vias.forEach(v => shape.push(`VIA~${X(v.x)}~${Y(v.y)}~${S(0.9)}~${netName(v.net)}~${S(0.2)}~${gge()}~0`));
    const layers = ['1~TopLayer~#FF0000~true~true~true~', '2~BottomLayer~#0000FF~true~false~true~', '3~TopSilkLayer~#FFCC00~true~false~true~', '4~BottomSilkLayer~#66CC33~true~false~true~',
      '5~TopPasteMaskLayer~#808080~true~false~true~', '6~BottomPasteMaskLayer~#800000~true~false~true~', '7~TopSolderMaskLayer~#800080~true~false~true~', '8~BottomSolderMaskLayer~#AA00FF~true~false~true~',
      '9~Ratlines~#6464FF~true~false~true~', '10~BoardOutLine~#FF00FF~true~false~true~', '11~Multi-Layer~#C0C0C0~true~false~true~', '12~Document~#FFFFFF~true~false~true~', '13~TopAssembly~#33CC99~true~false~true~',
      '14~BottomAssembly~#5555FF~true~false~true~', '15~Mechanical~#F022F0~true~false~true~', '19~3DModel~#66CCFF~true~false~true~', '21~Inner1~#800000~false~false~false~', '22~Inner2~#008000~false~false~false~'];
    const doc = {
      head: { docType: '3', editorVersion: '6.5.40', newgId: true, c_para: {}, hasIdFlag: true, x: '0', y: '0', importFlag: 0, transformList: '' },
      canvas: 'CA~1000~1000~#000000~yes~#FFFFFF~10~1000~1000~line~1~mil~1~4000~3000~~yes',
      shape, layers,
      objects: ['All~true~false', 'Component~true~true', 'Prefix~true~true', 'Name~false~false', 'Track~true~true', 'Pad~true~true', 'Via~true~true', 'Hole~true~true', 'Copper_Area~true~true', 'Circle~true~true', 'Arc~true~true', 'Rect~true~true', 'Text~true~true', 'Image~true~true', 'Dimension~true~true', 'Protractor~true~true'],
      BBox: { x: OX - 20, y: OY - 20, width: board.w * K + 40, height: board.h * K + 40 },
      preference: { hideFootprints: '', hideNets: '' },
      DRCRULE: { Default: { trackWidth: +S(board.trace), clearance: +S(board.clr), viaHoleDiameter: 2.4, viaHoleD: 1.2 }, isRealtime: true, isDrcOnRoutingOrPlaceVia: false, checkObjectToCopperarea: true, showDRCRangeLine: true },
      netColors: []
    };
    return JSON.stringify(doc, null, 1);
  };

  /* ================= KiCad netlist (legacy s-expression) ================= */
  E.kicadNet = (design, nets, name) => {
    nets = nets || D.computeNets(design);
    const q = s => '"' + String(s).replace(/"/g, '\\"') + '"';
    const comps = design.components.filter(c => !D.getDef(c).power);
    const out = ['(export (version D)', `  (design (source ${q(name + '.d2p.json')}) (date ${q(new Date().toISOString())}) (tool "Drawing2PCB"))`, '  (components'];
    comps.forEach(c => out.push(`    (comp (ref ${q(c.props.ref || '?')}) (value ${q(c.props.value || '')}) (footprint ${q('Drawing2PCB:' + D.defaultFp(c))}) (libsource (lib "Drawing2PCB") (part ${q(c.type)}) (description ${q(D.getDef(c).name)})) (sheetpath (names "/") (tstamps "/")) (tstamp ${q(c.id)}))`));
    out.push('  )', '  (nets');
    let code = 1;
    nets.nets.forEach(n => {
      const pins = n.pins.filter(p => !D.getDef(p.comp).power);
      if (!pins.length) return;
      out.push(`    (net (code ${code++}) (name ${q(n.name)})`);
      pins.forEach(p => out.push(`      (node (ref ${q(p.comp.props.ref || '?')}) (pin ${q(p.pin)}) (pinfunction ${q(p.label)}))`));
      out.push('    )');
    });
    out.push('  )', ')', '');
    return out.join('\n');
  };

  /* ================= Gerber ================= */
  class Gerber {
    constructor(fn, H) { this.fn = fn; this.H = H; this.ap = new Map(); this.body = []; }
    c(v) { return Math.round(v * 1e6).toString(); }
    Y(y) { return this.c(this.H - y); }
    ap_(desc) { if (!this.ap.has(desc)) this.ap.set(desc, 10 + this.ap.size); return this.ap.get(desc); }
    flash(x, y, desc) { this.body.push(`D${this.ap_(desc)}*`, `X${this.c(x)}Y${this.Y(y)}D03*`); }
    line(pts, w) { if (pts.length < 2) return; this.body.push(`D${this.ap_(`C,${w.toFixed(3)}`)}*`); pts.forEach((p, i) => this.body.push(`X${this.c(p.x)}Y${this.Y(p.y)}D0${i ? 1 : 2}*`)); }
    toString() {
      const h = ['%TF.GenerationSoftware,Drawing2PCB,web,1.0*%', `%TF.FileFunction,${this.fn}*%`, '%FSLAX46Y46*%', '%MOMM*%', '%LPD*%', 'G01*'];
      for (const [desc, d] of this.ap) h.push(`%ADD${d}${desc}*%`);
      return [...h, ...this.body, 'M02*', ''].join('\n');
    }
  }
  E.gerberZip = (board, name) => {
    const H = board.h;
    const top = new Gerber('Copper,L1,Top', H), bot = new Gerber('Copper,L2,Bot', H), sTop = new Gerber('Legend,Top', H), sBot = new Gerber('Legend,Bot', H),
      mTop = new Gerber('Soldermask,Top', H), mBot = new Gerber('Soldermask,Bot', H), edge = new Gerber('Profile,NP', H);
    edge.line([{ x: 0, y: 0 }, { x: board.w, y: 0 }, { x: board.w, y: board.h }, { x: 0, y: board.h }, { x: 0, y: 0 }], 0.1);
    const drills = new Map();
    const padDesc = (pd, part, grow = 0) => { const rotated = (part.rot % 180) !== 0, w = (rotated ? pd.h : pd.w) + grow, h = (rotated ? pd.w : pd.h) + grow; return pd.shape === 'rect' ? `R,${w.toFixed(3)}X${h.toFixed(3)}` : `C,${w.toFixed(3)}`; };
    board.parts.forEach(part => {
      const fp = D.getFootprint(part.fp);
      fp.pads.forEach(pd => {
        const a = D.padAbs(part, pd);
        const onTop = pd.layer === 'thru' || part.side === 'top', onBot = pd.layer === 'thru' || part.side === 'bottom';
        if (onTop) { top.flash(a.x, a.y, padDesc(pd, part)); mTop.flash(a.x, a.y, padDesc(pd, part, 0.2)); }
        if (onBot) { bot.flash(a.x, a.y, padDesc(pd, part)); mBot.flash(a.x, a.y, padDesc(pd, part, 0.2)); }
        if (pd.drill) { const k = pd.drill.toFixed(3); if (!drills.has(k)) drills.set(k, []); drills.get(k).push(a); }
      });
      const silk = part.side === 'bottom' ? sBot : sTop;
      D.silkPolylines(part).forEach(pl => silk.line(pl, 0.15));
      const ct = D.partCourt(part), tx = part.x, ty = part.y - ct.h / 2 - 1.0;
      D.textStrokes(part.ref, tx, ty, 1.0).forEach(pl => silk.line(part.side === 'bottom' ? pl.map(p => ({ x: 2 * tx - p.x, y: p.y })) : pl, 0.15));
    });
    board.traces.forEach(t => (t.layer === 0 ? top : bot).line(t.pts, t.w));
    board.vias.forEach(v => { top.flash(v.x, v.y, 'C,0.900'); bot.flash(v.x, v.y, 'C,0.900'); const k = '0.400'; if (!drills.has(k)) drills.set(k, []); drills.get(k).push(v); });
    const drl = ['M48', ';Drawing2PCB plated through holes', 'FMAT,2', 'METRIC,TZ'];
    const tools = [...drills.keys()].sort((a, b) => a - b);
    tools.forEach((k, i) => drl.push(`T${String(i + 1).padStart(2, '0')}C${k}`));
    drl.push('%', 'G90', 'G05');
    tools.forEach((k, i) => { drl.push(`T${String(i + 1).padStart(2, '0')}`); drills.get(k).forEach(p => drl.push(`X${p.x.toFixed(3)}Y${(H - p.y).toFixed(3)}`)); });
    drl.push('M30', '');
    const files = [
      { name: `${name}-F_Cu.gtl`, data: top.toString() }, { name: `${name}-B_Cu.gbl`, data: bot.toString() },
      { name: `${name}-F_Silkscreen.gto`, data: sTop.toString() }, { name: `${name}-B_Silkscreen.gbo`, data: sBot.toString() },
      { name: `${name}-F_Mask.gts`, data: mTop.toString() }, { name: `${name}-B_Mask.gbs`, data: mBot.toString() },
      { name: `${name}-Edge_Cuts.gko`, data: edge.toString() }, { name: `${name}-PTH.drl`, data: drl.join('\n') },
      { name: 'README.txt', data: `Generated by Drawing2PCB\nBoard ${board.w} x ${board.h} mm, ${board.nl} copper layer(s), trace ${board.trace} mm, clearance ${board.clr} mm.\nUnits mm, format 4.6 absolute. Drill file is Excellon metric with decimal coordinates.\n` }
    ];
    return D.zipStore(files);
  };

  /* ================= BOM / SVG / project ================= */
  E.bom = design => {
    const rows = [['Reference', 'Value', 'Type', 'Footprint', 'Qty']];
    const groups = new Map();
    design.components.filter(c => !D.getDef(c).power).forEach(c => { const k = c.type + '|' + (c.props.value || '') + '|' + D.defaultFp(c); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); });
    for (const [k, cs] of groups) { const [type, value, fp] = k.split('|'); rows.push([cs.map(c => c.props.ref).sort().join(' '), value, D.LIB[type].name, fp, String(cs.length)]); }
    return rows.map(r => r.map(v => /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v).join(',')).join('\r\n') + '\r\n';
  };
  E.pcbSvg = board => {
    const svg = document.getElementById('pcb');
    const css = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch (e) { return []; } }).filter(r => r.selectorText && r.selectorText.startsWith('#pcb')).map(r => r.cssText).join('\n');
    const inner = document.getElementById('pcbViewport').innerHTML;
    return `<svg xmlns="http://www.w3.org/2000/svg" id="pcb" viewBox="-2 -2 ${board.w + 4} ${board.h + 4}" width="${(board.w + 4) * 10}" height="${(board.h + 4) * 10}"><style>${css}\n#pcb{background:#1e2430}</style><g>${inner}</g></svg>`;
  };
})();
