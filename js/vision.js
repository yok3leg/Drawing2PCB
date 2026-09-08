/* Drawing2PCB — hand-drawn circuit image -> editable overlay -> schematic.
   Offline pipeline: adaptive threshold -> despeckle -> skeleton -> stroke graph -> long straight strokes = wires,
   everything else clustered into symbol boxes with a heuristic type guess. Optional Claude vision pass. */
(function () {
  const D = D2P;
  const V = D.vision = {
    W: 0, H: 0, src: null, bin: null, skel: null, boxes: [], wires: [], aiNets: null, sel: null, mode: 'select', k: 1, drag: null, draft: null, show: 'all',

    init() {
      V.canvas = document.getElementById('impCanvas'); V.svg = document.getElementById('impSvg'); V.wrap = document.getElementById('impWrap'); V.stage = document.getElementById('impStage');
      const drop = document.getElementById('imgDrop'), file = document.getElementById('imgFile');
      drop.addEventListener('click', () => file.click());
      drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files[0]) V.loadFile(e.dataTransfer.files[0]); });
      file.addEventListener('change', () => { if (file.files[0]) V.loadFile(file.files[0]); file.value = ''; });
      V.wrap.addEventListener('dragover', e => e.preventDefault());
      V.wrap.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files[0]) V.loadFile(e.dataTransfer.files[0]); });
      document.addEventListener('paste', e => { if (!V.active()) return; for (const it of e.clipboardData.items) if (it.type.startsWith('image/')) { V.loadFile(it.getAsFile()); break; } });
      ['thr', 'minLen', 'boxPad'].forEach(id => { const r = document.getElementById(id); r.addEventListener('input', () => document.getElementById(id + 'Val').textContent = r.value); });
      document.getElementById('imgSample').addEventListener('click', () => V.loadImage(V.makeSample()));
      document.getElementById('btnDetect').addEventListener('click', () => V.detect());
      document.getElementById('btnAI').addEventListener('click', () => V.analyzeAI());
      document.getElementById('btnBuild').addEventListener('click', () => V.build());
      document.getElementById('impAddBox').addEventListener('click', () => V.setMode('box'));
      document.getElementById('impAddWire').addEventListener('click', () => V.setMode('wire'));
      document.getElementById('impClear').addEventListener('click', () => { V.boxes = []; V.wires = []; V.aiNets = null; V.sel = null; V.renderOverlay(); });
      document.getElementById('impShow').addEventListener('change', e => { V.show = e.target.value; V.redraw(); });
      const keyInp = document.getElementById('aiKey');
      try { keyInp.value = localStorage.getItem('d2p.apikey') || ''; } catch (e) { }
      keyInp.addEventListener('change', () => { try { localStorage.setItem('d2p.apikey', keyInp.value.trim()); } catch (e) { } });
      V.svg.addEventListener('mousedown', V.onDown);
      window.addEventListener('mousemove', V.onMove);
      window.addEventListener('mouseup', V.onUp);
      window.addEventListener('keydown', e => {
        if (!V.active() || e.target.matches('input,textarea,select')) return;
        if (e.key === 'Delete' || e.key === 'Backspace') { V.deleteSel(); e.preventDefault(); }
        else if (e.key === 'Escape') { V.setMode('select'); V.sel = null; V.renderOverlay(); }
        else if (e.key === 'b' || e.key === 'B') V.setMode('box');
        else if (e.key === 'w' || e.key === 'W') V.setMode('wire');
        else if (e.key === 'r' || e.key === 'R') { const b = V.selBox(); if (b) { b.rot = ((b.rot || 0) + 90) % 360; V.renderOverlay(); } }
      });
      window.addEventListener('resize', () => { if (V.src) V.redraw(); });
    },
    active() { return document.getElementById('view-import').classList.contains('active'); },
    setMode(m) { V.mode = m; V.svg.style.cursor = m === 'select' ? '' : 'crosshair'; V.stat(m === 'box' ? 'Drag on the image to draw a symbol box.' : m === 'wire' ? 'Drag on the image to draw a wire.' : ''); },
    stat(t) { document.getElementById('impStatus').textContent = t; },
    loadFile(f) { const r = new FileReader(); r.onload = () => V.loadImage(r.result); r.readAsDataURL(f); },
    loadImage(url) {
      const im = new Image();
      im.onload = () => {
        const sc = Math.min(1, 1100 / Math.max(im.width, im.height));
        V.W = Math.max(1, Math.round(im.width * sc)); V.H = Math.max(1, Math.round(im.height * sc));
        V.src = document.createElement('canvas'); V.src.width = V.W; V.src.height = V.H;
        V.src.getContext('2d').drawImage(im, 0, 0, V.W, V.H);
        V.bin = null; V.skel = null; V.boxes = []; V.wires = []; V.aiNets = null; V.sel = null;
        V.redraw(); V.stat(`Image loaded (${V.W}×${V.H}). Click Detect.`);
      };
      im.onerror = () => V.stat('Could not load that image.');
      im.src = url;
    },
    redraw() {
      if (!V.src) return;
      const c = V.canvas, ctx = c.getContext('2d');
      c.width = V.W; c.height = V.H;
      const show = V.show;
      if (show === 'bin' && V.bin) V.paintMask(ctx, V.bin, '#000');
      else if (show === 'skel' && V.skel) { ctx.globalAlpha = 0.25; ctx.drawImage(V.src, 0, 0); ctx.globalAlpha = 1; V.paintMask(ctx, V.skel, '#d00', true); }
      else ctx.drawImage(V.src, 0, 0);
      const ww = V.wrap.clientWidth - 24, wh = V.wrap.clientHeight - 24;
      V.k = Math.min(ww / V.W, wh / V.H, 2);
      V.stage.style.width = c.style.width = (V.W * V.k) + 'px'; V.stage.style.height = c.style.height = (V.H * V.k) + 'px';
      V.svg.setAttribute('viewBox', `0 0 ${V.W} ${V.H}`);
      V.renderOverlay();
    },
    paintMask(ctx, mask, color, overlay) {
      const id = ctx.createImageData(V.W, V.H), d = id.data;
      const r = parseInt(color.slice(1, 2).repeat(2), 16), g = parseInt(color.slice(2, 3).repeat(2), 16), b = parseInt(color.slice(3, 4).repeat(2), 16);
      for (let i = 0; i < mask.length; i++) { const o = i * 4; if (mask[i]) { d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255; } else if (!overlay) { d[o] = d[o + 1] = d[o + 2] = 255; d[o + 3] = 255; } }
      if (overlay) { const tmp = document.createElement('canvas'); tmp.width = V.W; tmp.height = V.H; tmp.getContext('2d').putImageData(id, 0, 0); ctx.drawImage(tmp, 0, 0); }
      else ctx.putImageData(id, 0, 0);
    },

    /* ================= offline CV pipeline ================= */
    detect() {
      if (!V.src) { V.stat('Load an image first.'); return; }
      const t0 = performance.now();
      const W = V.W, H = V.H, thr = +document.getElementById('thr').value, minLen = +document.getElementById('minLen').value, pad = +document.getElementById('boxPad').value;
      const img = V.src.getContext('2d').getImageData(0, 0, W, H).data;
      const gray = new Uint8Array(W * H); let sum = 0;
      for (let i = 0; i < W * H; i++) { const g = (img[i * 4] * 299 + img[i * 4 + 1] * 587 + img[i * 4 + 2] * 114) / 1000; gray[i] = g; sum += g; }
      if (sum / (W * H) < 100) for (let i = 0; i < gray.length; i++) gray[i] = 255 - gray[i]; /* dark background -> invert */
      let bin = V.adaptiveThreshold(gray, W, H, thr);
      V.despeckle(bin, W, H, Math.max(12, Math.round(W * H / 40000)));
      bin = V.dilate(bin, W, H);
      V.bin = bin;
      const skel = V.thin(bin.slice(), W, H);
      V.skel = skel;
      const graph = V.graph(skel, W, H);
      /* straight long pieces -> wires, the rest -> symbol ink */
      let wires = []; const ink = new Uint8Array(W * H), segs = [];
      const idx2pt = i => ({ x: i % W, y: Math.floor(i / W) });
      graph.edges.forEach(e => {
        const pts = e.path.map(idx2pt);
        if (pts.length < 2) return;
        /* tiny spur hanging off a junction: skeletonisation artefact, ignore */
        if (pts.length < 7 && (graph.deg[e.path[0]] === 1 || graph.deg[e.path[e.path.length - 1]] === 1)) return;
        const keep = D.rdp(pts, 2.5);
        /* re-join nearly collinear pieces (wobbly hand strokes get split by RDP) */
        for (let i = 1; i < keep.length - 1;) {
          const a = pts[keep[i - 1]], b = pts[keep[i]], c = pts[keep[i + 1]];
          let d = Math.abs(Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(c.y - b.y, c.x - b.x));
          if (d > Math.PI) d = 2 * Math.PI - d;
          if (d < 0.2) keep.splice(i, 1); else i++;
        }
        for (let s = 0; s + 1 < keep.length; s++) segs.push({ a: { ...pts[keep[s]] }, b: { ...pts[keep[s + 1]] }, px: e.path.slice(keep[s], keep[s + 1] + 1) });
      });
      /* chain collinear pieces that meet end to end (strokes get cut wherever the skeleton has a node) */
      const near = (p, q) => Math.abs(p.x - q.x) <= 3 && Math.abs(p.y - q.y) <= 3;
      const dirDiff = (p, q, r, t) => { let d = Math.abs(Math.atan2(q.y - p.y, q.x - p.x) - Math.atan2(t.y - r.y, t.x - r.x)); return d > Math.PI ? 2 * Math.PI - d : d; };
      for (let changed = true; changed;) {
        changed = false;
        outer: for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
          const si = segs[i], sj = segs[j];
          for (const [ei, ej] of [['b', 'a'], ['b', 'b'], ['a', 'a'], ['a', 'b']]) {
            if (!near(si[ei], sj[ej])) continue;
            const pi = ei === 'b' ? si.a : si.b, pj = ej === 'a' ? sj.b : sj.a;
            if (dirDiff(pi, si[ei], sj[ej], pj) > 0.2) continue;
            si.a = pi; si.b = pj; si.px = si.px.concat(sj.px); segs.splice(j, 1); changed = true; break outer;
          }
        }
      }
      segs.forEach(sg => {
        const a = sg.a, b = sg.b, len = D.dist(a, b);
        /* hand-drawn wires run horizontally/vertically; a steep diagonal stroke is a zigzag/triangle unless it is really long */
        const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y), diag = Math.min(dx, dy) > 0.35 * Math.max(dx, dy);
        if (len >= minLen && !(diag && len < 3 * minLen)) wires.push({ id: D.uid('vw'), a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, px: sg.px });
        else sg.px.forEach(i => ink[i] = 1);
      });
      let boxes = V.clusterInk(ink, W, H, pad);
      /* a shortish "wire" with a free end (touching no wire and no symbol) is really part of a symbol:
         capacitor/battery plates, ground bars, arrows. Demote it to ink and re-cluster. */
      const inkNear = p => { const x = Math.round(p.x), y = Math.round(p.y); for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && ink[yy * W + xx]) return true; } return false; };
      for (let iter = 0; iter < 3; iter++) {
        const boxAt = p => boxes.findIndex(bx => p.x >= bx.x - 4 && p.x <= bx.x + bx.w + 4 && p.y >= bx.y - 4 && p.y <= bx.y + bx.h + 4);
        const demote = wires.filter(w => {
          const len = D.dist(w.a, w.b);
          if (len >= 2.5 * minLen) return false;
          const st = ['a', 'b'].map(end => { const p = w[end], bi = boxAt(p); return { bi, ink: bi >= 0 || inkNear(p), wire: wires.some(o => o !== w && D.segDist(p, o.a, o.b) <= 4) }; });
          if (st.some(s => !s.ink && !s.wire)) return true;                                   /* a free end */
          if (len < 2 * minLen && st[0].bi >= 0 && st[0].bi === st[1].bi && st.every(s => !s.wire)) return true;  /* both ends inside one symbol (e.g. a triangle edge) */
          return false;
        });
        if (!demote.length) break;
        demote.forEach(w => w.px.forEach(i => ink[i] = 1));
        wires = wires.filter(w => !demote.includes(w));
        boxes = V.clusterInk(ink, W, H, pad);
      }
      V.wires = wires.map(w => ({ id: w.id, a: w.a, b: w.b }));
      V.boxes = V.mergeBoxes(boxes);
      V.assignTerminals();
      V.boxes.forEach(b => { const g = V.guessType(b); b.type = g.type; b.rot = g.rot; b.value = V.defValue(g.type); });
      V.aiNets = null; V.sel = null;
      V.redraw();
      V.stat(`Detected ${V.boxes.length} symbol boxes and ${V.wires.length} wire segments in ${Math.round(performance.now() - t0)} ms. Fix types, then Build.`);
    },
    defValue(t) { return D.LIB[t] ? D.LIB[t].value : ''; },
    typeName(t) { return D.LIB[t] ? D.LIB[t].name : 'Text / ignore'; },
    /* group ink pixels into symbol candidate boxes using coarse 9px cells (8-connected) */
    clusterInk(ink, W, H, pad) {
      const cs = 9, CW = Math.ceil(W / cs), CH = Math.ceil(H / cs), cell = new Int32Array(CW * CH).fill(-1), cnt = new Int32Array(CW * CH);
      for (let i = 0; i < ink.length; i++) if (ink[i]) cnt[Math.floor((i % W) / cs) + Math.floor(Math.floor(i / W) / cs) * CW]++;
      const cl = [];
      for (let c = 0; c < cell.length; c++) {
        if (!cnt[c] || cell[c] >= 0) continue;
        const id = cl.length, stack = [c]; cell[c] = id;
        const t = { n: 0, x0: 1e9, y0: 1e9, x1: -1, y1: -1 }; cl.push(t);
        while (stack.length) {
          const q = stack.pop(), qx = q % CW, qy = (q - qx) / CW; t.n += cnt[q];
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = qx + dx, ny = qy + dy; if (nx < 0 || ny < 0 || nx >= CW || ny >= CH) continue; const m = nx + ny * CW; if (cnt[m] && cell[m] < 0) { cell[m] = id; stack.push(m); } }
        }
      }
      for (let i = 0; i < ink.length; i++) if (ink[i]) { const x = i % W, y = (i - x) / W, t = cl[cell[Math.floor(x / cs) + Math.floor(y / cs) * CW]]; t.x0 = Math.min(t.x0, x); t.x1 = Math.max(t.x1, x); t.y0 = Math.min(t.y0, y); t.y1 = Math.max(t.y1, y); }
      const out = [];
      cl.forEach(t => { const w = t.x1 - t.x0 + 1, h = t.y1 - t.y0 + 1; if (t.n < 12 || Math.max(w, h) < 10) return; out.push({ id: D.uid('vb'), x: t.x0 - pad, y: t.y0 - pad, w: w + 2 * pad, h: h + 2 * pad, type: 'R', value: '', rot: null, terms: [] }); });
      return out;
    },
    /* Merge boxes that nearly touch. Two wired boxes always merge (a symbol split into strokes); an unwired
       box (value text, arrows) only merges when it sits on the wire axis of the other box, like battery plates.
       Unwired boxes merge with each other (letters of one word). Needs V.wires. */
    mergeBoxes(boxes) {
      const terms = b => { const out = []; V.wires.forEach(w => ['a', 'b'].forEach(end => { const p = w[end]; if (p.x >= b.x - 6 && p.x <= b.x + b.w + 6 && p.y >= b.y - 6 && p.y <= b.y + b.h + 6) out.push({ w, x: p.x, y: p.y }); })); return out; };
      const onAxis = (t, b) => { const dx = t.w.b.x - t.w.a.x, dy = t.w.b.y - t.w.a.y, L = Math.hypot(dx, dy) || 1; const cx = b.x + b.w / 2, cy = b.y + b.h / 2; return Math.abs((cx - t.x) * dy - (cy - t.y) * dx) / L < 12; };
      const gap = 10;
      for (let merged = true; merged;) {
        merged = false;
        const T = boxes.map(terms);
        outer: for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j];
          if (!(a.x - gap < b.x + b.w && a.x + a.w + gap > b.x && a.y - gap < b.y + b.h && a.y + a.h + gap > b.y)) continue;
          const ta = T[i], tb = T[j];
          let ok = (ta.length > 0) === (tb.length > 0);
          if (!ok) ok = ta.length ? ta.some(t => onAxis(t, b)) : tb.some(t => onAxis(t, a));
          if (!ok) continue;
          const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
          a.w = Math.max(a.x + a.w, b.x + b.w) - x; a.h = Math.max(a.y + a.h, b.y + b.h) - y; a.x = x; a.y = y;
          boxes.splice(j, 1); merged = true; break outer;
        }
      }
      return boxes;
    },
    adaptiveThreshold(gray, W, H, thr) {
      const S = new Float64Array((W + 1) * (H + 1));
      for (let y = 1; y <= H; y++) { let row = 0; for (let x = 1; x <= W; x++) { row += gray[(y - 1) * W + x - 1]; S[y * (W + 1) + x] = S[(y - 1) * (W + 1) + x] + row; } }
      const r = Math.max(8, Math.round(Math.min(W, H) / 22)), bin = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) {
        const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
        for (let x = 0; x < W; x++) {
          const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
          const area = (x1 - x0) * (y1 - y0);
          const s = S[y1 * (W + 1) + x1] - S[y0 * (W + 1) + x1] - S[y1 * (W + 1) + x0] + S[y0 * (W + 1) + x0];
          if (gray[y * W + x] < s / area - thr) bin[y * W + x] = 1;
        }
      }
      return bin;
    },
    despeckle(bin, W, H, minArea) {
      const lab = new Int32Array(W * H).fill(-1); let id = 0; const stack = [];
      for (let i = 0; i < bin.length; i++) {
        if (!bin[i] || lab[i] >= 0) continue;
        const px = []; stack.push(i); lab[i] = id;
        while (stack.length) {
          const q = stack.pop(); px.push(q); const x = q % W, y = (q - x) / W;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const m = nx + ny * W; if (bin[m] && lab[m] < 0) { lab[m] = id; stack.push(m); } }
        }
        if (px.length < minArea) px.forEach(q => bin[q] = 0);
        id++;
      }
    },
    dilate(bin, W, H) {
      const out = new Uint8Array(W * H);
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; if (bin[i] || bin[i - 1] || bin[i + 1] || bin[i - W] || bin[i + W]) out[i] = 1; }
      return out;
    },
    thin(img, W, H) {
      /* Zhang–Suen */
      let changed = true, it = 0; const del = [];
      while (changed && it < 100) {
        changed = false; it++;
        for (let step = 0; step < 2; step++) {
          del.length = 0;
          for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
            const i = y * W + x; if (!img[i]) continue;
            const p2 = img[i - W], p3 = img[i - W + 1], p4 = img[i + 1], p5 = img[i + W + 1], p6 = img[i + W], p7 = img[i + W - 1], p8 = img[i - 1], p9 = img[i - W - 1];
            const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9; if (B < 2 || B > 6) continue;
            const A = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2); if (A !== 1) continue;
            if (step === 0) { if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue; } else { if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue; }
            del.push(i);
          }
          for (const i of del) img[i] = 0;
          if (del.length) changed = true;
        }
      }
      return img;
    },
    graph(skel, W, H) {
      const N = W * H, deg = new Uint8Array(N), nodeId = new Int32Array(N).fill(-1), visited = new Uint8Array(N);
      const nb = i => { const x = i % W, y = (i - x) / W, out = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const m = nx + ny * W; if (skel[m]) out.push(m); } return out; };
      for (let i = 0; i < N; i++) if (skel[i]) deg[i] = nb(i).length;
      /* prune short whiskers: an endpoint that reaches a junction within a few pixels is a skeleton artefact
         (thick strokes at corners/T-junctions). Removing them keeps long strokes in one piece. */
      for (let i = 0; i < N; i++) {
        if (!skel[i] || deg[i] !== 1) continue;
        const path = [i]; let prev = -1, cur = i, spur = false;
        for (let k = 0; k < 8; k++) {
          const ns = nb(cur).filter(m => m !== prev);
          if (cur !== i && deg[cur] >= 3) { spur = true; path.pop(); break; }
          if (ns.length !== 1) { spur = ns.length === 0 && path.length < 8; break; }
          prev = cur; cur = ns[0]; path.push(cur);
        }
        if (spur) path.forEach(p => skel[p] = 0);
      }
      for (let i = 0; i < N; i++) deg[i] = skel[i] ? nb(i).length : 0;
      const nodes = [];
      for (let i = 0; i < N; i++) {
        if (!skel[i] || deg[i] === 2 || nodeId[i] >= 0) continue;
        const id = nodes.length, px = [i], stack = [i]; nodeId[i] = id;
        while (stack.length) { const q = stack.pop(); for (const m of nb(q)) if (deg[m] !== 2 && nodeId[m] < 0) { nodeId[m] = id; px.push(m); stack.push(m); } }
        let sx = 0, sy = 0; px.forEach(q => { sx += q % W; sy += Math.floor(q / W); });
        nodes.push({ id, px, x: sx / px.length, y: sy / px.length });
      }
      const edges = [];
      const trace = (start, first) => {
        const path = [start, first]; visited[first] = 1; let prev = start, cur = first;
        for (let guard = 0; guard < N; guard++) {
          const ns = nb(cur).filter(m => m !== prev && (nodeId[m] >= 0 || !visited[m]));
          if (!ns.length) break;
          const nxt = ns.find(m => nodeId[m] >= 0 && nodeId[m] !== nodeId[start]) ?? ns.find(m => nodeId[m] < 0);
          if (nxt === undefined) break;
          path.push(nxt);
          if (nodeId[nxt] >= 0) break;
          visited[nxt] = 1; prev = cur; cur = nxt;
        }
        return path;
      };
      nodes.forEach(n => n.px.forEach(p => nb(p).forEach(m => {
        if (nodeId[m] >= 0) { if (nodeId[m] > n.id) edges.push({ path: [p, m] }); return; }
        if (visited[m]) return;
        edges.push({ path: trace(p, m) });
      })));
      for (let i = 0; i < N; i++) if (skel[i] && deg[i] === 2 && !visited[i] && nodeId[i] < 0) {  /* closed loops */
        const ns = nb(i); visited[i] = 1; if (!ns.length) continue;
        edges.push({ path: trace(i, ns[0]) });
      }
      return { nodes, edges, deg };
    },
    assignTerminals() {
      V.boxes.forEach(b => b.terms = []);
      const m = 6;
      V.wires.forEach(w => ['a', 'b'].forEach(end => {
        const p = w[end];
        const b = V.boxes.find(bx => p.x >= bx.x - m && p.x <= bx.x + bx.w + m && p.y >= bx.y - m && p.y <= bx.y + bx.h + m);
        if (b) b.terms.push({ w, end, x: p.x, y: p.y });
      }));
    },
    guessType(b) {
      const W = V.W, bin = V.bin, skel = V.skel;
      const x0 = Math.max(0, Math.round(b.x)), y0 = Math.max(0, Math.round(b.y)), x1 = Math.min(W - 1, Math.round(b.x + b.w)), y1 = Math.min(V.H - 1, Math.round(b.y + b.h));
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, bw = x1 - x0, bh = y1 - y0;
      const nT = b.terms.length;
      let horiz = bw >= bh;
      if (nT === 2) horiz = Math.abs(b.terms[0].x - b.terms[1].x) >= Math.abs(b.terms[0].y - b.terms[1].y);
      else if (nT === 1) { const t = b.terms[0]; horiz = Math.abs(t.x - cx) > Math.abs(t.y - cy); }
      const along = horiz ? bw : bh, perp = horiz ? bh : bw;
      /* ink runs along the centre line (with ±2px tolerance perpendicular); a run is "wide" when the ink at that
         position stretches contiguously across a good part of the box (a plate or bar, not a slanted edge crossing) */
      const inkAt = (s, o) => { const x = horiz ? x0 + s : Math.round(cx) + o, y = horiz ? Math.round(cy) + o : y0 + s; return x >= 0 && y >= 0 && x < W && y < V.H && bin[y * W + x]; };
      const wideAt = s => { let w = 0; for (const dir of [1, -1]) { let gapRun = 0; for (let o = 1; o <= perp; o++) { let hit = false; for (let t = -3; t <= 3 && !hit; t++) if (inkAt(s + t, o * dir)) hit = true; if (hit) { w++; gapRun = 0; } else if (++gapRun > 4) break; } } return w >= perp * 0.35; };
      let runs = 0, wruns = 0, inRun = false, curWide = false;
      for (let s = 0; s <= along; s++) {
        let hit = false;
        for (let o = -2; o <= 2 && !hit; o++) if (inkAt(s, o)) hit = true;
        if (hit) { if (!inRun) { runs++; curWide = false; } if (!curWide && wideAt(s)) { curWide = true; wruns++; } }
        inRun = hit;
      }
      /* ink runs across the perpendicular centre line: a diode's slanted edges give 2, capacitor plates 0 */
      let pruns = 0; inRun = false;
      for (let s = 0; s <= perp; s++) {
        let hit = false;
        for (let o = -2; o <= 2 && !hit; o++) { const x = horiz ? Math.round(cx) + o : x0 + s, y = horiz ? y0 + s : Math.round(cy) + o; if (x >= 0 && y >= 0 && x < W && y < V.H && bin[y * W + x]) hit = true; }
        if (hit && !inRun) pruns++; inRun = hit;
      }
      /* circularity: ink pixels sit at a nearly constant distance from their centroid, all the way around */
      let circ = 0;
      if (Math.min(bw, bh) > 20) {
        const px = [];
        let mx = 0, my = 0;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (bin[y * W + x]) { px.push(x, y); mx += x; my += y; }
        const n = px.length / 2;
        if (n > 30) {
          mx /= n; my /= n;
          const ds = new Float32Array(n); let mu = 0;
          for (let i = 0; i < n; i++) { ds[i] = Math.hypot(px[2 * i] - mx, px[2 * i + 1] - my); mu += ds[i]; }
          mu /= n;
          let v = 0; for (let i = 0; i < n; i++) v += (ds[i] - mu) ** 2;
          const rel = Math.sqrt(v / n) / (mu || 1);
          const bins = new Uint8Array(24);
          for (let i = 0; i < n; i++) if (ds[i] > 0.8 * mu && ds[i] < 1.2 * mu) bins[Math.floor(((Math.atan2(px[2 * i + 1] - my, px[2 * i] - mx) + Math.PI) / (2 * Math.PI)) * 24) % 24] = 1;
          if (rel < 0.14) circ = bins.reduce((a, q) => a + q, 0) / 24;
        }
      }
      /* zigzag: sign changes of the mean skeleton offset from the axis while walking along it
         (mean, so symmetric shapes like triangles and plates average out to ~0) */
      const offSum = new Float32Array(along + 1), offCnt = new Uint16Array(along + 1);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { if (!skel[y * W + x]) continue; const s = horiz ? x - x0 : y - y0, o = horiz ? y - cy : x - cx; if (Math.abs(o) > perp * 0.5) continue; offSum[s] += o; offCnt[s]++; }
      let zz = 0, sign = 0, offRows = 0;
      for (let s = 0; s <= along; s++) { if (!offCnt[s]) continue; const o = offSum[s] / offCnt[s]; if (Math.abs(o) < 2.5) continue; offRows++; const sg = o > 0 ? 1 : -1; if (sign && sg !== sign) zz++; sign = sg; }
      if (offRows < 0.5 * along) zz = 0;   /* off-axis ink must span the symbol to count as a zigzag */
      const rot = horiz ? 0 : 90;
      b.feat = { nT, horiz, along, perp, runs, wruns, pruns, zz, circ: +circ.toFixed(2), box: [x0, y0, x1, y1] };
      if (nT === 0) return { type: 'TEXT', rot: 0 };   /* nothing wired to it: most likely a value label */
      if (circ >= 0.75 && Math.min(bw, bh) > 20) return { type: nT <= 1 ? 'LAMP' : 'VSRC', rot: horiz ? 90 : 0 };
      if (nT >= 4) return { type: 'IC', rot: 0 };
      if (nT === 3) return { type: 'Q_NPN', rot: 0 };
      /* stacked bars across the axis: ground (leads all on one side) or battery (leads on both sides) */
      const narrow = runs - wruns;   /* centre-line crossings by thin strokes: a zigzag makes many */
      if (nT === 1 && wruns >= 2 && along <= perp * 1.2) return { type: 'GND', rot: horiz ? 90 : 0 };
      if (wruns >= 3 && narrow <= 1 && along <= perp * 1.2) {
        const side = t => Math.sign(horiz ? t.x - cx : t.y - cy);
        const oneSide = nT <= 1 || b.terms.every(t => side(t) === side(b.terms[0]));
        return oneSide ? { type: 'GND', rot: horiz ? 90 : 0 } : { type: 'BATT', rot: horiz ? 90 : 0 };
      }
      if (narrow >= 4) return { type: 'R', rot };
      if (wruns === 2 && along <= perp * 1.3) return { type: pruns >= 2 ? 'D' : 'C', rot };
      if (along > perp * 1.5) return { type: 'R', rot };
      return { type: nT === 2 ? 'D' : 'R', rot };
    },

    /* ================= overlay editing ================= */
    toImg(e) { const r = V.svg.getBoundingClientRect(); return { x: (e.clientX - r.left) / V.k, y: (e.clientY - r.top) / V.k }; },
    selBox() { return V.sel && V.sel.kind === 'box' ? V.boxes.find(b => b.id === V.sel.id) : null; },
    onDown(e) {
      if (e.button !== 0 || !V.src) return;
      const p = V.toImg(e), t = e.target;
      if (V.mode === 'box') { V.draft = { kind: 'box', x0: p.x, y0: p.y, x1: p.x, y1: p.y }; e.preventDefault(); return; }
      if (V.mode === 'wire') { V.draft = { kind: 'wire', a: p, b: p }; e.preventDefault(); return; }
      if (t.classList.contains('vhandle')) { const b = V.boxes.find(x => x.id === t.dataset.id); V.sel = { kind: 'box', id: b.id }; V.drag = { kind: 'resize', b, start: p, w: b.w, h: b.h }; }
      else if (t.classList.contains('vend')) { const w = V.wires.find(x => x.id === t.dataset.id); V.sel = { kind: 'wire', id: w.id }; V.drag = { kind: 'end', w, end: t.dataset.end }; }
      else if (t.classList.contains('vbox')) { const b = V.boxes.find(x => x.id === t.dataset.id); V.sel = { kind: 'box', id: b.id }; V.drag = { kind: 'move', b, start: p, x: b.x, y: b.y }; }
      else if (t.classList.contains('vw')) { V.sel = { kind: 'wire', id: t.dataset.id }; }
      else V.sel = null;
      V.renderOverlay(); e.preventDefault();
    },
    onMove(e) {
      if (!V.src || (!V.drag && !V.draft)) return;
      const p = V.toImg(e);
      if (V.draft) { if (V.draft.kind === 'box') { V.draft.x1 = p.x; V.draft.y1 = p.y; } else V.draft.b = p; V.renderOverlay(); return; }
      const d = V.drag;
      if (d.kind === 'move') { d.b.x = d.x + p.x - d.start.x; d.b.y = d.y + p.y - d.start.y; }
      else if (d.kind === 'resize') { d.b.w = Math.max(8, d.w + p.x - d.start.x); d.b.h = Math.max(8, d.h + p.y - d.start.y); }
      else if (d.kind === 'end') { d.w[d.end] = { x: p.x, y: p.y }; }
      V.renderOverlay(true);
    },
    onUp() {
      if (V.draft) {
        const df = V.draft; V.draft = null;
        if (df.kind === 'box') { const x = Math.min(df.x0, df.x1), y = Math.min(df.y0, df.y1), w = Math.abs(df.x1 - df.x0), h = Math.abs(df.y1 - df.y0); if (w > 6 && h > 6) { const b = { id: D.uid('vb'), x, y, w, h, type: 'R', value: D.LIB.R.value, rot: null, terms: [] }; V.boxes.push(b); V.sel = { kind: 'box', id: b.id }; } }
        else if (D.dist(df.a, df.b) > 6) { const w = { id: D.uid('vw'), a: df.a, b: df.b }; V.wires.push(w); V.sel = { kind: 'wire', id: w.id }; }
        V.setMode('select'); V.assignTerminals(); V.renderOverlay(); return;
      }
      if (V.drag) { V.drag = null; V.assignTerminals(); V.renderOverlay(); }
    },
    deleteSel() {
      if (!V.sel) return;
      if (V.sel.kind === 'box') V.boxes = V.boxes.filter(b => b.id !== V.sel.id); else V.wires = V.wires.filter(w => w.id !== V.sel.id);
      V.sel = null; V.assignTerminals(); V.renderOverlay();
    },
    renderOverlay(light) {
      if (!V.src) return;
      const k = 1 / V.k; /* keep handles a constant screen size */
      let h = '';
      V.wires.forEach(w => { const s = V.sel && V.sel.id === w.id; h += `<line class="vw${s ? ' sel' : ''}" data-id="${w.id}" x1="${w.a.x}" y1="${w.a.y}" x2="${w.b.x}" y2="${w.b.y}" style="stroke-width:${3 * k}"/>`; });
      V.wires.forEach(w => ['a', 'b'].forEach(end => h += `<circle class="vend" data-id="${w.id}" data-end="${end}" cx="${w[end].x}" cy="${w[end].y}" r="${4 * k}"/>`));
      V.boxes.forEach((b, i) => {
        const s = V.sel && V.sel.id === b.id;
        h += `<rect class="vbox${s ? ' sel' : ''}${b.type === 'TEXT' ? ' txt' : ''}" data-id="${b.id}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${3 * k}"/>`;
        h += `<text class="vlabel" x="${b.x + 3 * k}" y="${b.y - 4 * k}" style="font-size:${12 * k}px">${i + 1}: ${b.type}${b.value ? ' ' + D.esc(b.value) : ''}</text>`;
        h += `<rect class="vhandle" data-id="${b.id}" x="${b.x + b.w - 5 * k}" y="${b.y + b.h - 5 * k}" width="${10 * k}" height="${10 * k}"/>`;
        b.terms.forEach(t => h += `<circle class="vterm" cx="${t.x}" cy="${t.y}" r="${3 * k}"/>`);
      });
      if (V.draft) { const d = V.draft; h += d.kind === 'box' ? `<rect class="vdraft" x="${Math.min(d.x0, d.x1)}" y="${Math.min(d.y0, d.y1)}" width="${Math.abs(d.x1 - d.x0)}" height="${Math.abs(d.y1 - d.y0)}"/>` : `<line class="vdraft" x1="${d.a.x}" y1="${d.a.y}" x2="${d.b.x}" y2="${d.b.y}"/>`; }
      V.svg.innerHTML = h;
      if (!light) V.renderPanels();
    },
    renderPanels() {
      const list = document.getElementById('impList'), props = document.getElementById('impProps');
      document.getElementById('impCount').textContent = V.boxes.length;
      list.className = 'props implist'; list.innerHTML = '';
      V.boxes.forEach((b, i) => {
        const it = D.el('div', { class: 'it' + (V.sel && V.sel.id === b.id ? ' sel' : ''), onclick: () => { V.sel = { kind: 'box', id: b.id }; V.renderOverlay(); } });
        it.append(D.el('span', {}, `${i + 1}. ${V.typeName(b.type)}`), D.el('span', { class: 'muted' }, `${b.terms.length} term`));
        list.append(it);
      });
      if (V.aiNets) list.append(D.el('div', { class: 'muted' }, `AI netlist: ${V.aiNets.length} nets (used on Build).`));
      props.innerHTML = '';
      const b = V.selBox();
      if (b) {
        const row = (label, input) => { const kv = D.el('div', { class: 'kv' }); kv.append(D.el('span', {}, label), input); props.append(kv); };
        const sel = D.el('select', { onchange: e => { b.type = e.target.value; b.value = V.defValue(b.type); V.renderOverlay(); } });
        sel.append(D.el('option', { value: 'TEXT', ...(b.type === 'TEXT' ? { selected: '' } : {}) }, 'Text / ignore'));
        D.LIB_ORDER.forEach(t => sel.append(D.el('option', { value: t, ...(t === b.type ? { selected: '' } : {}) }, `${D.LIB[t].name} (${t})`)));
        row('Type', sel);
        row('Value', D.el('input', { value: b.value || '', onchange: e => { b.value = e.target.value.trim(); V.renderOverlay(); } }));
        const rsel = D.el('select', { onchange: e => { b.rot = e.target.value === '' ? null : +e.target.value; } });
        [['', 'auto'], [0, '0°'], [90, '90°'], [180, '180°'], [270, '270°']].forEach(([v, t]) => rsel.append(D.el('option', { value: v, ...(String(v) === String(b.rot ?? '') ? { selected: '' } : {}) }, t)));
        row('Rotation', rsel);
        row('Terminals', D.el('span', {}, String(b.terms.length)));
        props.append(D.el('div', { class: 'hint' }, 'Wire ends (red dots) inside the box become this part’s pins. Drag wire ends into the box if a connection is missing.'));
      } else if (V.sel && V.sel.kind === 'wire') props.innerHTML = '<div><b>Wire</b></div><div class="hint">Drag its end points to fix connections. Del removes it.</div>';
      else props.innerHTML = '<div class="muted">Select a box or wire.</div>';
    },

    /* ================= build schematic ================= */
    build() {
      if (!V.boxes.length && !V.wires.length) { V.stat('Nothing to build — run Detect or draw boxes first.'); return; }
      let design;
      const parts = V.boxes.filter(b => b.type !== 'TEXT');
      if (V.aiNets && parts.every(b => b.aiId)) {
        design = D.designFromNetlist(parts.map(b => ({ id: b.aiId, type: b.type, value: b.value, x: (b.x + b.w / 2) / V.W, y: (b.y + b.h / 2) / V.H, rot: b.rot || 0, n: b.n, net: b.net })), V.aiNets, { width: 1100, height: 1100 * V.H / V.W });
      } else design = V.buildFromStrokes(parts);
      D.annotate(design);
      D.sch.setDesign(design);
      D2P.app.showView('schematic');
      D.sch.fit();
      D.status(`Built schematic: ${design.components.length} parts, ${design.wires.length} wire segments. Check red (unconnected) pins.`);
    },
    buildFromStrokes(parts) {
      const k = 1100 / Math.max(V.W, V.H), g = 10;
      const sn = v => D.snap(v * k, g);
      const design = { components: [], wires: [], junctions: [], labels: [] };
      /* wires: snap and straighten near-axis-aligned segments */
      V.wires.forEach(w => {
        let a = { x: sn(w.a.x), y: sn(w.a.y) }, b = { x: sn(w.b.x), y: sn(w.b.y) };
        const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
        if (dy <= Math.max(g, dx * 0.2)) { const y = D.snap((a.y + b.y) / 2, g); a.y = b.y = y; } else if (dx <= Math.max(g, dy * 0.2)) { const x = D.snap((a.x + b.x) / 2, g); a.x = b.x = x; }
        if (a.x === b.x && a.y === b.y) return;
        w._a = a; w._b = b;
      });
      /* components */
      parts.forEach(b => {
        const def = D.LIB[b.type] || D.LIB.R;
        const cx = sn(b.x + b.w / 2), cy = sn(b.y + b.h / 2);
        let rot = b.rot;
        if (rot == null) rot = b.w >= b.h ? 0 : 90;
        if (def.power && b.rot == null) rot = 0;
        const comp = { id: D.uid('c'), type: b.type, x: cx, y: cy, rot, mirror: false, props: { ref: '', value: b.value || def.value, footprint: '' } };
        if (def.fields && def.fields.includes('n')) comp.props.n = String(Math.max(def.nDefault, b.terms.length + (b.terms.length % 2)));
        design.components.push(comp);
        /* attach terminals to nearest pins */
        const pins = D.getPins(comp).map(p => ({ p, pos: D.pinAbs(comp, p), used: false }));
        const terms = b.terms.map(t => ({ t, x: sn(t.x), y: sn(t.y) })).filter(t => t.t.w._a);
        const pairs = [];
        terms.forEach((t, ti) => pins.forEach((pn, pi) => pairs.push({ d: Math.hypot(t.x - pn.pos.x, t.y - pn.pos.y), ti, pi })));
        pairs.sort((u, v) => u.d - v.d);
        const usedT = new Set();
        pairs.forEach(({ ti, pi }) => {
          if (usedT.has(ti) || pins[pi].used) return;
          usedT.add(ti); pins[pi].used = true;
          const t = terms[ti], w = t.t.w, end = t.t.end === 'a' ? '_a' : '_b', other = end === '_a' ? '_b' : '_a';
          const pin = pins[pi].pos;
          /* move the wire end onto the pin; keep the wire axis-aligned by inserting a bend if needed */
          const o = w[other];
          if (o.x !== pin.x && o.y !== pin.y) {
            const horizontal = Math.abs(o.x - w[end].x) >= Math.abs(o.y - w[end].y);
            const bend = horizontal ? { x: pin.x, y: o.y } : { x: o.x, y: pin.y };
            w._extra = (w._extra || []).concat([[bend, pin]]);
            w[end] = bend;
          } else w[end] = { x: pin.x, y: pin.y };
        });
      });
      /* merge free wire ends that nearly touch */
      const ends = [];
      V.wires.forEach(w => { if (!w._a) return; ends.push({ w, e: '_a' }, { w, e: '_b' }); });
      const pinPts = design.components.flatMap(c => D.getPins(c).map(p => D.pinAbs(c, p)));
      ends.forEach(E => {
        const p = E.w[E.e];
        const near = pinPts.find(q => Math.abs(q.x - p.x) <= 12 && Math.abs(q.y - p.y) <= 12);
        if (near) { E.w[E.e] = { x: near.x, y: near.y }; return; }
        ends.forEach(F => { if (F === E) return; const q = F.w[F.e]; if (Math.abs(q.x - p.x) <= 12 && Math.abs(q.y - p.y) <= 12 && (q.x !== p.x || q.y !== p.y)) F.w[F.e] = { x: p.x, y: p.y }; });
      });
      /* T-junctions: an end that almost touches the middle of another wire is put exactly onto it */
      ends.forEach(E => {
        const p = E.w[E.e];
        for (const F of V.wires) {
          if (F === E.w || !F._a) continue;
          if (D.segDist(p, F._a, F._b) <= 12 && D.dist(p, F._a) > 12 && D.dist(p, F._b) > 12) { if (F._a.x === F._b.x) p.x = F._a.x; else if (F._a.y === F._b.y) p.y = F._a.y; }
        }
      });
      V.wires.forEach(w => {
        if (!w._a) return;
        if (w._a.x !== w._b.x || w._a.y !== w._b.y) design.wires.push({ id: D.uid('w'), a: { ...w._a }, b: { ...w._b } });
        (w._extra || []).forEach(([a, b]) => { if (a.x !== b.x || a.y !== b.y) design.wires.push({ id: D.uid('w'), a: { ...a }, b: { ...b } }); });
        delete w._a; delete w._b; delete w._extra;
      });
      /* junction dots where 3+ wire ends meet */
      const cnt = new Map();
      design.wires.forEach(w => ['a', 'b'].forEach(e => { const kk = w[e].x + ',' + w[e].y; cnt.set(kk, (cnt.get(kk) || 0) + 1); }));
      for (const [kk, n] of cnt) if (n >= 3) { const [x, y] = kk.split(',').map(Number); design.junctions.push({ id: D.uid('j'), x, y }); }
      return design;
    },

    /* ================= Claude vision ================= */
    async analyzeAI() {
      if (!V.src) { V.stat('Load an image first.'); return; }
      const key = document.getElementById('aiKey').value.trim(), model = document.getElementById('aiModel').value;
      if (!key) { V.stat('Enter an Anthropic API key first.'); return; }
      const catalog = D.LIB_ORDER.map(t => { const d = D.LIB[t]; const pins = (typeof d.pins === 'function' ? d.pins({ n: d.nDefault }) : d.pins).map(p => p.n + (p.l ? '(' + p.l + ')' : '')).join(','); return `${t}: ${d.name}; pins ${pins}`; }).join('\n');
      const schema = {
        type: 'object', required: ['components', 'nets'],
        properties: {
          components: { type: 'array', items: { type: 'object', required: ['id', 'type', 'x', 'y'], properties: {
            id: { type: 'string', description: 'unique id such as R1, C2, Q1, GND1, V1' }, type: { type: 'string', enum: D.LIB_ORDER },
            value: { type: 'string', description: 'component value/label as written, e.g. 220, 10k, 100uF, 9V, LED' },
            x: { type: 'number', description: 'normalised centre x (0..1) of the symbol in the image' }, y: { type: 'number', description: 'normalised centre y (0..1)' },
            rot: { type: 'integer', enum: [0, 90, 180, 270], description: '0 = two-terminal part drawn horizontally / transistor with base on the left; 90 = rotated clockwise' },
            n: { type: 'integer', description: 'pin count for IC/HDR only' }, net: { type: 'string', description: 'for VCC: the power net name written next to it' } } } },
          nets: { type: 'array', items: { type: 'object', required: ['pins'], properties: { name: { type: 'string' }, pins: { type: 'array', items: { type: 'string' }, description: 'pins as "<id>.<pin number>" using the pin numbers of the catalog, e.g. "R1.1", "D1.2", "Q1.3"' } } } }
        }
      };
      const prompt = `You are converting a hand-drawn electronic schematic into a netlist for a CAD tool.
Identify every symbol and choose the closest type from this catalog (type: name; pin numbers with meaning):
${catalog}
Rules: use GND for ground symbols and VCC (with "net") for power-rail flags; a battery/DC source is BATT/VSRC with pin 1 = positive. Diodes/LEDs: pin 2 = anode, pin 1 = cathode. NPN/PNP: 1=E, 2=B, 3=C. Give every component a normalised centre (x,y in 0..1) and read its written value. Then list every electrical net as the set of connected pins "<id>.<pin>". Submit using the tool only.`;
      const data = V.src.toDataURL('image/png').split(',')[1];
      V.stat('Asking Claude…'); document.getElementById('btnAI').disabled = true;
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({ model, max_tokens: 6000, tools: [{ name: 'submit_netlist', description: 'Submit the recognised components and nets.', input_schema: schema }], tool_choice: { type: 'tool', name: 'submit_netlist' },
            messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data } }, { type: 'text', text: prompt }] }] })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
        const js = await res.json();
        const tu = (js.content || []).find(b => b.type === 'tool_use');
        if (!tu) throw new Error('No structured result returned.');
        const out = tu.input;
        const sz = Math.max(30, Math.min(V.W, V.H) * 0.09);
        V.boxes = (out.components || []).map(c => { const t = D.LIB[c.type] ? c.type : 'R'; const bw = (c.rot === 90 || c.rot === 270) ? sz * 0.7 : sz * 1.3, bh = (c.rot === 90 || c.rot === 270) ? sz * 1.3 : sz * 0.7; return { id: D.uid('vb'), aiId: String(c.id), x: c.x * V.W - bw / 2, y: c.y * V.H - bh / 2, w: bw, h: bh, type: t, value: c.value || D.LIB[t].value, rot: c.rot || 0, terms: [], n: c.n, net: c.net }; });
        V.aiNets = (out.nets || []).map(n => ({ name: n.name, pins: n.pins }));
        V.wires = []; V.sel = null;
        V.renderOverlay();
        V.stat(`Claude found ${V.boxes.length} components and ${V.aiNets.length} nets. Check the boxes, then Build.`);
      } catch (err) {
        V.stat('AI analysis failed: ' + err.message + (location.protocol === 'file:' ? ' — try serving over http:// (python -m http.server).' : ''));
      } finally { document.getElementById('btnAI').disabled = false; }
    },

    /* ================= synthetic sample drawing ================= */
    makeSample() {
      const W = 900, H = 600, c = document.createElement('canvas'); c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#f6f1e4'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = '#2b2b33'; ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      let seed = 7; const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 - 0.5; };
      const jit = v => v + rnd() * 3;
      const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(jit(x1), jit(y1)); const n = 6; for (let i = 1; i <= n; i++) ctx.lineTo(jit(x1 + (x2 - x1) * i / n), jit(y1 + (y2 - y1) * i / n)); ctx.stroke(); };
      const poly = pts => { for (let i = 0; i + 1 < pts.length; i++) line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]); };
      const circle = (cx, cy, r) => { ctx.beginPath(); for (let i = 0; i <= 40; i++) { const a = i / 40 * Math.PI * 2; const x = cx + Math.cos(a) * (r + rnd() * 2), y = cy + Math.sin(a) * (r + rnd() * 2); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); };
      /* battery (left, vertical) */
      line(150, 180, 150, 250); line(120, 250, 180, 250); line(135, 268, 165, 268); line(120, 286, 180, 286); line(135, 304, 165, 304); line(150, 304, 150, 420);
      ctx.font = '26px cursive'; ctx.fillStyle = '#2b2b33'; ctx.fillText('+', 190, 245); ctx.fillText('9V', 60, 285);
      /* top wire to resistor zigzag */
      line(150, 180, 150, 120); line(150, 120, 330, 120);
      poly([[330, 120], [345, 95], [370, 145], [395, 95], [420, 145], [445, 95], [470, 145], [485, 120]]);
      ctx.fillText('220', 380, 80);
      line(485, 120, 700, 120);
      /* LED (right, vertical, pointing down) */
      line(700, 120, 700, 230); poly([[670, 230], [730, 230], [700, 290], [670, 230]]); line(670, 290, 730, 290); line(700, 290, 700, 420);
      poly([[735, 250], [770, 225]]); poly([[760, 220], [772, 224], [768, 236]]); poly([[735, 275], [770, 250]]); poly([[760, 245], [772, 249], [768, 261]]);
      ctx.fillText('LED', 790, 270);
      /* capacitor in parallel with LED */
      line(700, 170, 560, 170); line(560, 170, 560, 240); line(525, 240, 595, 240); line(525, 262, 595, 262); line(560, 262, 560, 370); line(560, 370, 700, 370);
      ctx.fillText('100u', 590, 215);
      /* bottom return + ground */
      line(150, 420, 700, 420); line(420, 420, 420, 470); line(385, 470, 455, 470); line(397, 485, 443, 485); line(409, 500, 431, 500);
      return c.toDataURL('image/png');
    },
  };
})();
