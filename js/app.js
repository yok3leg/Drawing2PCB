/* Drawing2PCB — app wiring: tabs, palette, buttons, project save/load, demo, help */
(function () {
  const D = D2P;
  const $ = id => document.getElementById(id);
  const A = D.app = {
    showView(name) {
      document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
      document.querySelectorAll('#tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
      if (name === 'pcb') D.pcb.fit();
      if (name === 'import' && D.vision.src) D.vision.redraw();
    },
    projectName() { return ($('projName').value.trim() || 'untitled').replace(/[^\w.-]+/g, '_'); },
    project() { const B = D.pcb.board; return { app: 'Drawing2PCB', v: 1, name: $('projName').value, design: D.sch.design, board: { w: B.w, h: B.h, trace: B.trace, clr: B.clr, nl: B.nl, parts: B.parts, traces: B.traces, vias: B.vias } }; },
    load(p) {
      if (!p || !p.design) throw new Error('Not a Drawing2PCB project');
      $('projName').value = p.name || 'untitled';
      D.sch.setDesign(p.design);
      const B = D.pcb.board = Object.assign(D.pcb.blank(), p.board || {});
      B.unrouted = [];
      $('pcbW').value = B.w; $('pcbH').value = B.h; $('pcbTrace').value = B.trace; $('pcbClr').value = B.clr; $('pcbLayers').value = B.nl;
      /* rebuild nets from the schematic so the board is consistent */
      if (B.parts.length) { const traces = B.traces, vias = B.vias; D.pcb.generate(D.sch.design); B.traces = traces; B.vias = vias; }
      D.pcb.render();
      D.sch.fit();
    },
    autosave() { try { localStorage.setItem('d2p.autosave', JSON.stringify(A.project())); } catch (e) { } },
    readBoardInputs() {
      const B = D.pcb.board;
      B.w = Math.max(10, +$('pcbW').value || 50); B.h = Math.max(10, +$('pcbH').value || 40);
      B.trace = Math.max(0.15, +$('pcbTrace').value || 0.4); B.clr = Math.max(0.15, +$('pcbClr').value || 0.3); B.nl = +$('pcbLayers').value || 2;
    },
    buildPalette(filter = '') {
      const list = $('palList'); list.innerHTML = '';
      const f = filter.toLowerCase();
      D.CATS.forEach(cat => {
        const types = D.LIB_ORDER.filter(t => D.LIB[t].cat === cat && (!f || D.LIB[t].name.toLowerCase().includes(f) || t.toLowerCase().includes(f)));
        if (!types.length) return;
        list.append(D.el('div', { class: 'palcat' }, cat));
        types.forEach(t => {
          const def = D.LIB[t];
          const comp = { type: t, props: { n: String(def.nDefault || ''), net: 'VCC' } };
          const [bx, by, bw, bh] = D.getLocalBBox(comp);
          const item = D.el('div', { class: 'part', draggable: 'true', title: def.name + ' — drag onto the sheet or click, then click the sheet' });
          item.innerHTML = `<svg viewBox="${bx - 4} ${by - 4} ${bw + 8} ${bh + 8}">${D.primsToSvg(D.getSym(comp))}</svg><span>${D.esc(def.name)}</span>`;
          item.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', t); e.dataTransfer.effectAllowed = 'copy'; });
          item.addEventListener('click', () => { document.querySelectorAll('.part.active').forEach(p => p.classList.remove('active')); item.classList.add('active'); D.sch.startPlacing(t); D.status(`Click on the sheet to place ${def.name} (R rotates, Esc cancels).`); });
          list.append(item);
        });
      });
    },
    demo() {
      const comps = [
        { id: 'BT1', type: 'BATT', value: '9V', x: 0.08, y: 0.5 },
        { id: 'SW1', type: 'BTN', value: 'TACT', x: 0.28, y: 0.18 },
        { id: 'R1', type: 'R', value: '470', x: 0.5, y: 0.18 },
        { id: 'D1', type: 'LED', value: 'RED', x: 0.72, y: 0.36, rot: 90 },
        { id: 'R2', type: 'R', value: '10k', x: 0.5, y: 0.5 },
        { id: 'Q1', type: 'Q_NPN', value: '2N3904', x: 0.72, y: 0.66 },
        { id: 'C1', type: 'CP', value: '100u', x: 0.9, y: 0.5, rot: 90 },
        { id: 'GND1', type: 'GND', x: 0.08, y: 0.9 },
        { id: 'GND2', type: 'GND', x: 0.72, y: 0.9 },
        { id: 'GND3', type: 'GND', x: 0.9, y: 0.9 },
        { id: 'PWR1', type: 'VCC', net: 'VBAT', x: 0.08, y: 0.1 },
        { id: 'PWR2', type: 'VCC', net: 'VBAT', x: 0.9, y: 0.1 },
      ];
      const nets = [
        { name: 'VBAT', pins: ['BT1.1', 'PWR1.1'] }, { name: 'VBAT', pins: ['SW1.1', 'PWR2.1', 'C1.1'] },
        { pins: ['SW1.2', 'R1.1', 'R2.1'] }, { pins: ['R1.2', 'D1.2'] }, { pins: ['D1.1', 'Q1.3'] }, { pins: ['R2.2', 'Q1.2'] },
        { name: 'GND', pins: ['BT1.2', 'GND1.1'] }, { name: 'GND', pins: ['Q1.1', 'GND2.1'] }, { name: 'GND', pins: ['C1.2', 'GND3.1'] },
      ];
      const design = D.designFromNetlist(comps, nets, { width: 700, height: 420 });
      $('projName').value = 'demo-led-switch';
      D.sch.setDesign(design); D.sch.fit();
      D.status('Demo loaded: pushbutton → resistor → LED driven by an NPN transistor. Try "→ PCB".');
    },
    help() {
      D.modal(`<h2>Drawing2PCB — quick help</h2>
<p><b>Workflow:</b> draw or import a schematic → <i>Annotate</i> / <i>ERC</i> → <i>→ PCB</i> → <i>Auto-place</i> → <i>Auto-route</i> → export.</p>
<table>
<tr><td><kbd>W</kbd></td><td>Wire tool — click a pin or grid point, click again for each corner; ends automatically on a pin or existing wire (or <kbd>Enter</kbd> / double-click).</td></tr>
<tr><td><kbd>V</kbd> <kbd>J</kbd> <kbd>L</kbd></td><td>Select / junction dot / net label tools.</td></tr>
<tr><td><kbd>R</kbd> <kbd>M</kbd></td><td>Rotate / mirror the selection (also while placing a part).</td></tr>
<tr><td><kbd>Del</kbd> <kbd>Ctrl+D</kbd></td><td>Delete / duplicate.</td></tr>
<tr><td><kbd>Ctrl+Z</kbd> <kbd>Ctrl+Y</kbd></td><td>Undo / redo.</td></tr>
<tr><td><kbd>F</kbd> <kbd>G</kbd></td><td>Zoom to fit / toggle grid. Wheel zooms, right- or middle-drag (or <kbd>Space</kbd>+drag) pans.</td></tr>
<tr><td>Shift+click / drag on empty sheet</td><td>Multi-select / marquee select.</td></tr>
</table>
<p><b>Connectivity rules:</b> wires join end-to-end or when an end touches another wire (T). Crossing wires do <i>not</i> connect unless you add a junction dot. Ground and power flags connect everything with the same name; net labels do too.</p>
<p><b>Import Drawing:</b> load a photo, <i>Detect</i> finds wires (green) and symbol boxes (blue) with a guessed type; boxes with no wire attached are treated as value text (grey, ignored). Fix the types in the right panel, drag wire ends onto the red terminal dots if a connection was missed, then <i>Build schematic</i>. Clean dark ink on plain paper, symbols at least ~40 px across, works best; adjust <i>Min wire length</i> to the stroke scale of your drawing. The optional Claude vision pass returns a full netlist and usually reads component values.</p>
<p><b>PCB:</b> footprints come from the part's <i>Footprint</i> field (THT by default). The router is a simple grid maze router — it is meant for small hobby boards. Unrouted connections stay as yellow ratlines; export Gerbers and finish them in EasyEDA/KiCad if needed.</p>
<p><b>Exports:</b> Gerber/Excellon zip and KiCad netlist follow standard formats. The EasyEDA .json files follow EasyEDA Standard's document format as documented publicly — open them with <i>File → Open → EasyEDA</i> and verify pin connections.</p>
<p class="muted">Projects autosave to this browser; use Save to keep a .json file.</p>`);
    },
    init() {
      D.sch.init(); D.vision.init(); D.pcb.init();
      A.buildPalette();
      $('palSearch').addEventListener('input', e => A.buildPalette(e.target.value));
      document.querySelectorAll('#tabs .tab').forEach(t => t.addEventListener('click', () => A.showView(t.dataset.view)));
      /* schematic toolbar */
      document.querySelectorAll('#scTools [data-tool]').forEach(b => b.addEventListener('click', () => D.sch.setTool(b.dataset.tool)));
      $('scRotate').onclick = () => D.sch.rotate(); $('scMirror').onclick = () => D.sch.mirror(); $('scDelete').onclick = () => D.sch.deleteSel(); $('scDup').onclick = () => D.sch.duplicate();
      $('scUndo').onclick = () => D.sch.undo(); $('scRedo').onclick = () => D.sch.redo(); $('scFit').onclick = () => D.sch.fit();
      $('scGrid').onclick = () => { D.sch.showGrid = !D.sch.showGrid; D.sch.applyView(); $('scGrid').classList.toggle('active', D.sch.showGrid); };
      $('scAnnotate').onclick = () => { D.annotate(D.sch.design, true); D.sch.commit(); D.status('References renumbered.'); };
      $('scErc').onclick = () => D.sch.runErc();
      const toPcb = () => { if (!D.sch.design.components.length) { D.status('Draw a schematic first.'); return; } D.annotate(D.sch.design); A.readBoardInputs(); D.pcb.generate(D.sch.design); A.showView('pcb'); D.status('Board generated. Auto-place, then Auto-route.'); };
      $('scToPcb').onclick = toPcb; $('pcbFromSch').onclick = toPcb;
      /* pcb */
      ['pcbW', 'pcbH', 'pcbTrace', 'pcbClr', 'pcbLayers'].forEach(id => $(id).addEventListener('change', () => { A.readBoardInputs(); D.pcb.render(); A.autosave(); }));
      $('pcbAutoPlace').onclick = () => { A.readBoardInputs(); D.pcb.autoPlace(); };
      $('pcbRoute').onclick = () => { A.readBoardInputs(); D.pcb.route(); };
      $('pcbUnroute').onclick = () => D.pcb.unroute();
      $('pcbFit').onclick = () => D.pcb.fit(); $('pcbRot').onclick = () => D.pcb.rotateSel(); $('pcbFlip').onclick = () => D.pcb.flipSel();
      [['lyTop', 'top'], ['lyBot', 'bot'], ['lySilk', 'silk'], ['lyRat', 'rat']].forEach(([id, k]) => $(id).addEventListener('change', e => { D.pcb.layers[k] = e.target.checked; D.pcb.render(); }));
      /* exports */
      const needBoard = () => { if (!D.pcb.board.parts.length) { D.status('Generate the PCB first (→ PCB).'); return false; } return true; };
      $('expEasySch').onclick = () => { if (!D.sch.design.components.length) return D.status('Nothing to export.'); D.download(A.projectName() + '-schematic.json', D.Export.easyedaSchematic(D.sch.design), 'application/json'); };
      $('expEasyPcb').onclick = () => { if (needBoard()) D.download(A.projectName() + '-pcb.json', D.Export.easyedaPcb(D.pcb.board), 'application/json'); };
      $('expKicadNet').onclick = () => { if (!D.sch.design.components.length) return D.status('Nothing to export.'); D.download(A.projectName() + '.net', D.Export.kicadNet(D.sch.design, null, A.projectName()), 'text/plain'); };
      $('expGerber').onclick = () => { if (needBoard()) D.download(A.projectName() + '-gerber.zip', D.Export.gerberZip(D.pcb.board, A.projectName())); };
      $('expBom').onclick = () => D.download(A.projectName() + '-bom.csv', D.Export.bom(D.sch.design), 'text/csv');
      $('expSvg').onclick = () => { if (needBoard()) D.download(A.projectName() + '-pcb.svg', D.Export.pcbSvg(D.pcb.board), 'image/svg+xml'); };
      /* project */
      $('btnNew').onclick = () => { if (!D.sch.design.components.length || confirm('Start a new empty project? Unsaved work is lost.')) { D.sch.setDesign(D.sch.blank()); D.pcb.board = D.pcb.blank(); D.pcb.render(); $('projName').value = 'untitled'; A.autosave(); } };
      $('btnSave').onclick = () => D.download(A.projectName() + '.d2p.json', JSON.stringify(A.project()), 'application/json');
      $('btnOpen').onclick = () => $('fileOpen').click();
      $('fileOpen').addEventListener('change', () => { const f = $('fileOpen').files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { A.load(JSON.parse(r.result)); D.status('Project loaded.'); } catch (e) { D.status('Could not open: ' + e.message); } }; r.readAsText(f); $('fileOpen').value = ''; });
      $('btnDemo').onclick = () => A.demo();
      $('btnHelp').onclick = () => A.help();
      $('modalClose').onclick = () => { $('modal').hidden = true; };
      $('modal').addEventListener('click', e => { if (e.target.id === 'modal') $('modal').hidden = true; });
      D.sch.onChange = () => A.autosave(); D.pcb.onChange = () => A.autosave();
      /* restore */
      let restored = false;
      try { const s = localStorage.getItem('d2p.autosave'); if (s) { const p = JSON.parse(s); if (p.design && p.design.components.length) { A.load(p); restored = true; D.status('Restored your last session from this browser.'); } } } catch (e) { }
      if (!restored) A.demo();
      /* layout is not final at DOMContentLoaded — fit once the SVG has a size */
      requestAnimationFrame(() => { D.sch.fit(); D.pcb.fit(); });
      window.addEventListener('resize', () => { if (D.sch.active()) D.sch.fit(); if (D.pcb.active()) D.pcb.fit(); });
    }
  };
  window.addEventListener('DOMContentLoaded', A.init);
})();
