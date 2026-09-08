/* Drawing2PCB — shared helpers (no build step, plain globals under D2P) */
window.D2P = window.D2P || {};
(function () {
  const D = D2P;
  const NS = 'http://www.w3.org/2000/svg';

  let _uid = 0;
  D.uid = (p = 'id') => p + (++_uid).toString(36) + Date.now().toString(36).slice(-4);
  D.snap = (v, g = 10) => Math.round(v / g) * g;
  D.clone = o => JSON.parse(JSON.stringify(o));
  D.dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  D.clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* rotate/mirror a local point: mirror (x -> -x) first, then rotate by r degrees (multiples of 90 expected) */
  D.rot = (x, y, r = 0, m = false) => {
    if (m) x = -x;
    const a = (r * Math.PI) / 180, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
    return { x: x * c - y * s, y: x * s + y * c };
  };

  D.ptOnSeg = (p, a, b, tol = 0.5) => {
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    if (L2 === 0) return D.dist(p, a) <= tol;
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2;
    if (t < -1e-9 || t > 1 + 1e-9) return false;
    return D.dist(p, { x: a.x + t * dx, y: a.y + t * dy }) <= tol;
  };

  D.segDist = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    if (L2 === 0) return D.dist(p, a);
    const t = D.clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / L2, 0, 1);
    return D.dist(p, { x: a.x + t * dx, y: a.y + t * dy });
  };

  class DSU {
    constructor() { this.p = new Map(); }
    find(x) {
      if (!this.p.has(x)) this.p.set(x, x);
      let r = x;
      while (this.p.get(r) !== r) r = this.p.get(r);
      while (this.p.get(x) !== r) { const n = this.p.get(x); this.p.set(x, r); x = n; }
      return r;
    }
    union(a, b) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.p.set(ra, rb); }
  }
  D.DSU = DSU;

  D.el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else if (k === 'html') e.innerHTML = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    kids.forEach(k => e.append(k));
    return e;
  };
  D.svg = (tag, attrs = {}) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };
  D.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  D.download = (name, content, mime = 'application/octet-stream') => {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  };

  D.status = msg => { const s = document.getElementById('status'); if (s) s.textContent = msg; };
  D.modal = html => {
    const m = document.getElementById('modal');
    document.getElementById('modalBody').innerHTML = html;
    m.hidden = false;
  };

  D.fmt = (n, d = 3) => {
    let s = (+n).toFixed(d);
    if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s === '-0' ? '0' : s;
  };

  /* ---------- tiny stroke font for silkscreen (glyphs on a 4x6 grid, y down) ---------- */
  const G = {
    '0': '0,0 4,0 4,6 0,6 0,0|0,5 4,1', '1': '1,1 2,0 2,6|1,6 3,6', '2': '0,1 1,0 3,0 4,1 4,2 0,6 4,6',
    '3': '0,0 4,0 2,2.5 4,3.5 4,5 3,6 1,6 0,5', '4': '3,6 3,0 0,4 4,4', '5': '4,0 0,0 0,3 3,3 4,4 4,5 3,6 0,6',
    '6': '4,0 1,0 0,1 0,5 1,6 3,6 4,5 4,4 3,3 0,3', '7': '0,0 4,0 1,6',
    '8': '1,0 3,0 4,1 4,2 3,3 1,3 0,4 0,5 1,6 3,6 4,5 4,4 3,3|1,3 0,2 0,1 1,0', '9': '0,6 3,6 4,5 4,1 3,0 1,0 0,1 0,2 1,3 4,3',
    'A': '0,6 0,2 2,0 4,2 4,6|0,4 4,4', 'B': '0,6 0,0 3,0 4,1 4,2 3,3 0,3|3,3 4,4 4,5 3,6 0,6', 'C': '4,1 3,0 1,0 0,1 0,5 1,6 3,6 4,5',
    'D': '0,0 0,6 3,6 4,5 4,1 3,0 0,0', 'E': '4,0 0,0 0,6 4,6|0,3 3,3', 'F': '4,0 0,0 0,6|0,3 3,3', 'G': '4,1 3,0 1,0 0,1 0,5 1,6 3,6 4,5 4,3 2,3',
    'H': '0,0 0,6|4,0 4,6|0,3 4,3', 'I': '1,0 3,0|2,0 2,6|1,6 3,6', 'J': '3,0 3,5 2,6 1,6 0,5', 'K': '0,0 0,6|4,0 0,4|1,3 4,6',
    'L': '0,0 0,6 4,6', 'M': '0,6 0,0 2,3 4,0 4,6', 'N': '0,6 0,0 4,6 4,0', 'O': '1,0 3,0 4,1 4,5 3,6 1,6 0,5 0,1 1,0',
    'P': '0,6 0,0 3,0 4,1 4,2 3,3 0,3', 'Q': '1,0 3,0 4,1 4,5 3,6 1,6 0,5 0,1 1,0|2,4 4,6', 'R': '0,6 0,0 3,0 4,1 4,2 3,3 0,3|2,3 4,6',
    'S': '4,1 3,0 1,0 0,1 0,2 1,3 3,3 4,4 4,5 3,6 1,6 0,5', 'T': '0,0 4,0|2,0 2,6', 'U': '0,0 0,5 1,6 3,6 4,5 4,0', 'V': '0,0 2,6 4,0',
    'W': '0,0 1,6 2,3 3,6 4,0', 'X': '0,0 4,6|4,0 0,6', 'Y': '0,0 2,3 4,0|2,3 2,6', 'Z': '0,0 4,0 0,6 4,6',
    '-': '1,3 3,3', '+': '1,3 3,3|2,2 2,4', '.': '2,5.5 2,6', '/': '4,0 0,6', '_': '0,6 4,6', '?': '0,1 1,0 3,0 4,1 4,2 2,3 2,4|2,5.5 2,6', ' ': ''
  };
  const glyphCache = {};
  const glyph = ch => {
    ch = ch.toUpperCase();
    if (!glyphCache[ch]) {
      const src = G[ch] !== undefined ? G[ch] : G['?'];
      glyphCache[ch] = src ? src.split('|').map(pl => pl.trim().split(/\s+/).map(pt => pt.split(',').map(Number))) : [];
    }
    return glyphCache[ch];
  };
  /* returns polylines [[{x,y},...],...]; h = glyph height; anchor 'start'|'middle'|'end' */
  D.textStrokes = (text, x, y, h, anchor = 'middle') => {
    const sc = h / 6, adv = 5.5 * sc, width = text.length * adv - 1.5 * sc;
    let x0 = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
    const y0 = y - h / 2, out = [];
    for (const ch of text) {
      for (const pl of glyph(ch)) if (pl.length) out.push(pl.map(([gx, gy]) => ({ x: x0 + gx * sc, y: y0 + gy * sc })));
      x0 += adv;
    }
    return out;
  };
  D.textWidth = (text, h) => text.length * (5.5 * h / 6) - 1.5 * h / 6;

  /* ---------- store-only ZIP writer ---------- */
  D.crc32 = (() => {
    const t = new Int32Array(256);
    for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[i] = c; }
    return buf => { let c = -1; for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  })();
  D.zipStore = files => {
    const enc = new TextEncoder(), parts = [], cd = [];
    let off = 0;
    const le16 = v => [v & 255, (v >> 8) & 255];
    const le32 = v => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
    const now = new Date();
    const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
    const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;
    for (const f of files) {
      const name = enc.encode(f.name);
      const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      const crc = D.crc32(data);
      const lh = new Uint8Array([...le32(0x04034b50), ...le16(20), ...le16(0), ...le16(0), ...le16(dosTime), ...le16(dosDate),
        ...le32(crc), ...le32(data.length), ...le32(data.length), ...le16(name.length), ...le16(0)]);
      parts.push(lh, name, data);
      cd.push(new Uint8Array([...le32(0x02014b50), ...le16(20), ...le16(20), ...le16(0), ...le16(0), ...le16(dosTime), ...le16(dosDate),
        ...le32(crc), ...le32(data.length), ...le32(data.length), ...le16(name.length), ...le16(0), ...le16(0), ...le16(0), ...le16(0),
        ...le32(0), ...le32(off)]), name);
      off += lh.length + name.length + data.length;
    }
    let cdLen = 0; cd.forEach(u => cdLen += u.length);
    const eocd = new Uint8Array([...le32(0x06054b50), ...le16(0), ...le16(0), ...le16(files.length), ...le16(files.length),
      ...le32(cdLen), ...le32(off), ...le16(0)]);
    return new Blob([...parts, ...cd, eocd], { type: 'application/zip' });
  };

  /* Prim MST over points -> [[i,j],...] */
  D.mst = pts => {
    const n = pts.length, edges = [];
    if (n < 2) return edges;
    const inT = new Array(n).fill(false), best = new Array(n).fill(Infinity), from = new Array(n).fill(-1);
    inT[0] = true;
    for (let i = 1; i < n; i++) { best[i] = D.dist(pts[0], pts[i]); from[i] = 0; }
    for (let k = 1; k < n; k++) {
      let mi = -1;
      for (let i = 0; i < n; i++) if (!inT[i] && (mi < 0 || best[i] < best[mi])) mi = i;
      inT[mi] = true; edges.push([from[mi], mi]);
      for (let i = 0; i < n; i++) if (!inT[i]) { const d = D.dist(pts[mi], pts[i]); if (d < best[i]) { best[i] = d; from[i] = mi; } }
    }
    return edges;
  };

  /* Ramer–Douglas–Peucker on array of {x,y}; returns indices of kept vertices */
  D.rdp = (pts, tol) => {
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      if (b - a < 2) continue;
      let mi = -1, md = -1;
      for (let i = a + 1; i < b; i++) { const d = D.segDist(pts[i], pts[a], pts[b]); if (d > md) { md = d; mi = i; } }
      if (md > tol) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
    }
    const idx = [];
    for (let i = 0; i < pts.length; i++) if (keep[i]) idx.push(i);
    return idx;
  };
})();
