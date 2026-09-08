# Drawing2PCB

A zero-build web app for hobby electronics: draw a schematic Tinkercad-style, or photograph a hand-drawn circuit and convert it, then turn it into a PCB and export Gerbers / EasyEDA / KiCad files.

## Run

No install. Either double-click `index.html`, or (recommended, needed for the optional AI feature):

```bash
python -m http.server 8000
```

then open <http://localhost:8000>.

## Features

**1 · Schematic editor**
- Drag & drop parts from the palette (resistors, caps, inductors, diodes/LEDs, BJTs, MOSFET, op-amp, DIP IC with any pin count, headers, battery/sources, switches, buzzer, motor, lamp, ground and power flags).
- Wire tool with orthogonal auto-bends, junction dots, net labels, rotate/mirror, undo/redo, marquee select, rubber-band wires when moving parts.
- Live netlist (right panel), red markers on unconnected pins, ERC (unconnected pins, shorted power nets, duplicate refs), auto-annotation.
- Projects autosave in the browser; Save/Open as `.d2p.json`.

**2 · Import a hand-drawn circuit**
- Offline computer vision (pure JS): adaptive threshold → despeckle → skeleton → stroke graph. Long straight strokes become wires; the rest is clustered into symbol boxes with a heuristic type guess (resistor zigzag, capacitor plates, battery, circle sources, 3-terminal → transistor, ground).
- Boxes with no wire attached are classed as *Text / ignore* (handwritten values) and skipped on build.
- Everything is shown as an editable overlay: change types/values, move/resize boxes, drag wire ends onto terminals, add missing boxes/wires, then **Build schematic**. Wire ends that land on a symbol's terminal dots become its pins; T-junctions connect, plain crossings don't (add a junction dot in the schematic if needed).
- Tested on the built-in sample: resistor, capacitor, battery, ground and the LED (as a diode) are recognised and the built schematic passes ERC; a real photo will usually need a few type corrections.
- Optional **Analyze with AI**: sends the image to Claude (your own API key) and gets back components + nets, placed onto the same overlay for review.
- A built-in synthetic sample drawing lets you try the pipeline without a photo.

**3 · PCB**
- Footprints (THT by default, SMD 0805 available) assigned per part; DIP-N and HDR-1xN are generated on the fly.
- Simulated-annealing auto-placement, drag/rotate/flip by hand.
- Two-layer (or single-layer) grid maze auto-router with vias; unrouted connections stay as ratlines.
- Exports: **Gerber RS-274X + Excellon drill (zip)**, **KiCad netlist**, **EasyEDA Std schematic and PCB JSON**, BOM CSV, SVG image.

## Opening the results in EasyEDA

| File | How |
|---|---|
| `*-gerber.zip` | EasyEDA Std/Pro: *File → Import → Gerber*; or upload straight to JLCPCB/PCBWay. Most reliable path. |
| `*.net` (KiCad) | EasyEDA Pro: *Import → Netlist*; KiCad Pcbnew: *File → Import Netlist*. |
| `*-schematic.json`, `*-pcb.json` | EasyEDA Std: *File → Open → EasyEDA…*. These follow EasyEDA's published document format but are generated without access to EasyEDA itself — verify pin connections after opening. |

## Known limits

- Hand-drawing recognition is heuristic; expect to correct some component types. Clean, dark ink on plain paper works best. The AI path is much better at reading values and messy drawings.
- The router is a simple maze router for small boards; it does not do DRC beyond its own clearance grid. Check the result in your PCB tool before fabricating.
- No circuit simulation.

## Layout

```
index.html         UI
css/app.css
js/lib.js          helpers, stroke font, zip writer
js/components.js   symbol library (also drives EasyEDA export)
js/footprints.js   footprint library
js/netlist.js      connectivity, ERC, annotate, netlist → schematic layout
js/schematic.js    schematic editor
js/vision.js       image → overlay → schematic (CV + Claude)
js/pcb.js          placement, routing, PCB view
js/exporters.js    EasyEDA / KiCad / Gerber / BOM / SVG
js/app.js          wiring, project IO, demo, help
```
