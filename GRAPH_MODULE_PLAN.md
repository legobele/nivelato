# Graph module plan

Status: PLAN ONLY. No graph code has moved. The extraction runs as its
own wave after this plan is reported, under the sensitivity protocol
below.

Founding order (Giulia): the measurement graph becomes its own module,
sealed. Rendering, scripting and all attached elements move into a
standalone module consistent with the iframe module architecture in
`modules/`. Its only contact with the shell and other modules is the
interface contract in this doc.

## Sensitivity protocol (non-negotiable)

The graph sits on top of the leveling core (the offset calculations
Giulia reverse-engineered over two weeks). Rules for every worker who
touches this system:

1. Extraction is RELOCATION, not refactor. Moved code travels
   byte-identical where feasible; the extraction diff is checked
   against the pre-move source.
2. Zero changes to graph math, rendering behavior, interaction
   behavior, or offset calculations.
3. Anything inside the graph system that looks wrong: STOP and report.
   Never fix in passing.
4. Parity gate before anything ships: before/after screenshots of the
   graph on the same dataset, an interaction pass, and the print flow,
   all matching. Unprovable parity = that piece does not move.
5. The two existing renderers (wizard live graph and embed graph) are
   DIFFERENT implementations with different geometry. They are both
   relocated as-is. No unification attempt.

## State of main (phase 1, for reference)

- HEAD at plan time: `2f1ba27` (SW v43), working tree clean.
- Phase 1 landed 73 commits on top of the morning baseline `f756602`:
  the cookie settings platform (`niv-settings.js`), the chrome module
  platform (`modules/sidebar.html`, `modules/topbar.html`,
  `modules/shell-bridge.js`, locked postMessage contract), wave 2
  (account settings rebuild with the `target=user` module sidebar,
  updates shell, users split into `/users` overview and
  `/company/users` administration, dashboard platform integration,
  company settings), wave 3 (token consistency pass, per-customer
  overview, drag and drop assignment via `niv-drag.js`, referrer-aware
  back via `nav-referrer.js`), and the QA fixes (themed scrollbar
  completion, the cookie-first localization chain, the company options
  popover rebuild, the account settings back-button fix).
- This plan follows the module conventions phase 1 established:
  same-origin iframe, `{ niv: 1, type, ... }` messages validated by
  origin, host bridge in the `NivShell` style, coordinator owns
  `sw.js` bumps and precache changes.

## Inventory: the graph system today

### Files

| File | Graph content |
| --- | --- |
| `adhd.js` (1543 lines) | BOTH renderers, all graph interaction, plus the wizard flow, the leveling core and job saving (not graph; see boundary). Loaded by `index.html` (`adhd.js?v=2`) and `dashboard.html` (`adhd.js?v=3`). |
| `index.html` | Wizard host. `<canvas id="drawing-canvas">` at the top of the measurement flow; the step panels and form fields the live graph reads. |
| `dashboard.html` | Embed host. `<canvas id="modal-canvas">` (job modal), `<canvas id="measure-canvas">` (measurement detail view), plus a hidden `<canvas id="drawing-canvas" style="display:none">` that exists only because `adhd.js` looks the element up at load. |
| `bread.js` | Bread mode overlay (`window.BREAD`). Both renderers draw it over the graph; `bread.js` dispatches a `breadchange` event both hosts listen for. Its script load path is not a plain `src` in any page (confirm in the extraction audit). |
| `niv-dark.css` / page CSS | Deliberately almost nothing: the graph canvas keeps its own light background (dashboard.html CSS comment, line 433: "GRAPH CANVAS: untouched by design. background stays as the graph system renders it."). `.modal-canvas-wrap` and `#modal-canvas` cursor styles live in dashboard.html. |

### Renderer A: the wizard live graph (adhd.js, approx. lines 666-1255)

- Canvas: `#drawing-canvas` on index.html. Viewport state `vp` /
  `vpTarget`, animated with `requestAnimationFrame`
  (`animateCanvas`, `smoothAnimate`).
- Renderer: `drawCanvas()` plus `drawDimLine`, `drawDesnivelArrow`,
  `drawStepHighlight`. Camera presets: `STEP_VIEWS` (per wizard step)
  and `FIELD_VIEWS` (per form field); `focusField` / `blurField`
  move the camera as the user works through the form.
- Inputs: the wizard's own DOM form fields, read through `readVal()`
  (whole + fraction input pairs), and the leveling core's output
  `results` object, produced by `recalcAll()`.
- Listeners: document-level `input` / `change` / `focusin` handlers
  in adhd.js, `window` `breadchange`, canvas resize handling
  (`resizeCanvas`, `getGlassRect`).

### Renderer B: the embed graph (adhd.js, approx. lines 1256-1498)

- Entry point: `window.embedGraph(cvs, data)`. A self-contained
  renderer (`drawEmbed`) with its own geometry: padded box, offset
  exaggeration (`EXAG`), level reference rect, rough opening path,
  desnivel arrows, dimension lines.
- Data parsing: `ev()` extracts magnitudes from labels like
  `47 1/4"` (a bare fraction `1/4"` is 0.25, NOT 1); `neg()` derives
  signs from the direction arrows in the labels. Offsets and derived
  dimensions (`anchoTop = anchoBot - pIv - pDv`,
  `altoDer = altoIzq - tcv - psv`) are computed inside the renderer.
- Interaction: per-canvas state `cvs.__nvState` (pan/zoom), wired
  once per canvas (`cvs.__nvWired`): mouse drag (canvas `mousedown`,
  window `mousemove` / `mouseup`), `wheel` zoom, touch drag and
  pinch zoom. Cursor managed on the canvas (`grab` / `grabbing`).
- Call sites, all in dashboard.html, all passing the same payload
  shape built from a job doc:
  1. Job modal open (line ~2145): renders into `#modal-canvas`, or
     shows the annotated photo instead when the job has one.
  2. `breadchange` listener (line ~1607): re-renders the open modal
     graph when bread mode toggles.
  3. Measurement detail view `openMeasure` (line ~3725): renders
     into `#measure-canvas`.
- Payload (identical at all three sites):
  `{ anchoBot, altoIzq, pIL, pDL, tL, pL }` from `job.hueco` and
  `job.desniveles` (`paredIzq`, `paredDer`, `techo`, `piso` labels),
  defaults 36 / 84 / `'Nivel'`.

### Attached elements and couplings (audit results)

1. **Global clobbering by embedGraph**: it writes `window._embedData`
   and overwrites `window.results` on the host page. `readVal()`
   checks `_embedData` first (adhd.js lines 15-17). Repo-wide audit:
   nothing outside adhd.js reads `window.results` or
   `window._embedData` today; dashboard.html only calls
   `embedGraph`. In the module era the module frame has its own
   window, so the clobber disappears by construction. The extraction
   wave must re-run this audit before relying on it.
2. **The hidden dummy canvas** in dashboard.html exists only to
   satisfy adhd.js's top-level `document.getElementById('drawing-canvas')`
   (null-safe via `?.`). After extraction it should be removable;
   verify nothing else references it.
3. **Bread mode**: `window.BREAD.isOn()` / `window.BREAD.draw(ctx, W, H)`
   are called inside both renderers, and `breadchange` triggers
   redraws in both hosts. The module contract needs a bread channel
   (below).
4. **Shared helpers**: `toFracStr` (dimension labels) and the label
   conventions are shared with the wizard and the core. The module
   gets its own relocated copy with the renderer; the wizard's copy
   stays. Duplication here is accepted on purpose: sharing code with
   the core is exactly the coupling being removed.
5. **Photo adjacency**: the job modal swaps the graph canvas with
   the annotated photo (`#modal-photo-img`); the photo editor
   (photo.html iframe) receives measurement data derived from
   `results`. The photo system is NOT part of the graph module; the
   modal's swap logic stays with the host.
6. **Print flow**: verified in code: the quote print path
   (`qPdfHtml`, `#qpdf-print-area`, `window.print()`) contains no
   graph output today; no `toDataURL` of any graph canvas exists in
   the repo. Print parity therefore means: quote print output
   byte-identical before/after, and the graph-bearing views (modal,
   measure detail) unchanged.

### Boundary: what does NOT move

- The leveling core: `calcDesnivel_wall`, `calcDesnivel_horiz`,
  `recalcAll`, `runValidation`, `TOLERANCE`, and the `results`
  production path. The graph CONSUMES `results`; it does not own it.
- The wizard flow: steps, validation UI, draft persistence, job
  saving (`saveJob` and friends), the photo editor wiring. All stay
  in adhd.js / index.html.
- The embed renderer's internal derivations DO move with it: they
  are rendering geometry (exaggerated offsets for display), relocated
  verbatim under rule 1, not re-derived from the core.

## Proposed module shape

Following the phase 1 pattern:

- `modules/graph.html`: the module page. Owns one canvas, both
  relocated render paths (live and embed), all graph interaction
  listeners (they attach inside the module frame; unlike drag and
  drop, the graph is self-contained, so no host-side pointer
  forwarding is needed), and the bread overlay hook.
- `modules/graph.js` (or inline, matching module precedent): the
  relocated graph code.
- Host bridge: extend the `NivShell` style with a `mountGraph(el,
  opts)` helper (shell-bridge.js sibling or its own
  `modules/graph-bridge.js`; coordinator decides at wave start).
- Hosts after extraction: index.html mounts the module in live mode;
  dashboard.html mounts one module instance per embed surface
  (modal, measure detail) in embed mode.

## Interface contract (proposed, extends the locked protocol)

All messages `{ niv: 1, type, ... }`, origin-validated both ways,
exactly like the chrome modules.

| Type | Direction | Payload | Meaning |
| --- | --- | --- | --- |
| `niv:ready` | module to host | `{ target: 'graph', mode }` | Module loaded; host replies with `niv:init`. Idempotent like the chrome modules. |
| `niv:init` | host to module | `{ target: 'graph', mode: 'live' \| 'embed', bread: bool }` | Selects the render path and the initial bread state. |
| `niv:graph-data` | host to module | embed: the exact current payload `{ anchoBot, altoIzq, pIL, pDL, tL, pL }`. live: `{ fields: {id: value}, results: {...} }` mirroring what `readVal` and `recalcAll` produce today. | New data; module re-renders. Replaces the `embedGraph(cvs, data)` call and the wizard's direct DOM reads. |
| `niv:graph-view` | host to module | `{ step }` or `{ fieldId }` or `{}` (reset) | Live mode camera moves, replacing the direct `animateCanvas` / `focusField` triggers. Animation itself runs inside the module. |
| `niv:graph-bread` | host to module | `{ on: bool }` | Bread mode toggle, replacing the `breadchange` document event for module instances. Hosts keep listening for `breadchange` and forward the state. |
| `niv:resize` | module to host | `{ height }` | Same semantics as the chrome modules; hosts with fixed canvas boxes may ignore it. |
| `niv:graph-error` | module to host | `{ message }` | NEW, additive only: the module reports a render failure instead of failing silently. Hosts may ignore it. |

Events OUT are deliberately minimal: the graph is a display surface.
It emits no navigation, no data writes, no selection events. Pan and
zoom state lives and dies inside the module (today it lives on the
canvas element as `__nvState`; same lifetime).

## Parity gate (extraction wave entry requirements)

Fixtures and harness BEFORE any code moves:

1. **Fixture dataset**: a fixed set of job payloads covering: all
   four sides `Nivel`; maximum offsets; labels with bare fractions
   (`1/4"`), whole + fraction, and decimals; missing `hueco` /
   `desniveles` (defaults path); a job with an annotated photo
   (modal swap). Wizard fixture: a scripted field-entry sequence
   hitting every step and several field focuses.
2. **Before screenshots**: current build, all three dashboard embed
   sites, the wizard canvas at every step and after field focuses,
   bread on and off, at desktop and mobile widths.
3. **Interaction pass**: scripted pan, wheel zoom, pinch (touch
   emulation) on an embed instance; wizard camera moves on step
   change and field focus; bread toggle redraw on an open modal.
4. **Print**: quote print HTML captured before; must be identical
   after.
5. After the move: the same captures, compared. Any visual or
   behavioral diff stops the wave for that piece.

## Sequencing (recommended)

1. **Step 0 (solo, no code moves)**: parity harness + fixtures +
   the coupling re-audit (items 1, 2 and the bread load path).
2. **Step 1: embed path extraction.** Lower risk: data-in only,
   self-contained listeners, one payload shape, three call sites in
   one file. dashboard.html stops loading adhd.js's graph code;
   audit whether dashboard still needs adhd.js at all after this
   (it loads it today largely for the graph and shared helpers).
3. **Step 2: wizard live path extraction.** Higher coupling: the
   host streams field state and camera commands. index.html keeps
   the wizard, the core and saving; only the canvas and its
   scripting move.
4. **Step 3: cleanup.** Remove the relocated code from adhd.js,
   remove the hidden dummy canvas from dashboard.html, coordinator
   SW bump and precache update, modules/README.md gains the graph
   module entry and this contract.

Scheduling constraints:

- The graph wave runs SOLO on dashboard.html and index.html. No
  parallel wave edits those files while it runs (clean-tree gate;
  dashboard.html is the most contended file in the repo).
- It should not start until any remaining dashboard-touching
  refactor work is landed, so the parity baseline is stable.
- SSO cookie migration is design-only and out of scope; it does not
  block this wave.

## Open questions for Giulia

1. EmbedGraph's `window.results` / `window._embedData` writes
   disappear inside the module frame. Audit says nothing consumes
   them; the extraction proceeds on that basis unless she knows a
   consumer outside the repo (for example the Android WebView shell
   injecting scripts).
2. The graph canvas keeps its light background by design today, in
   both hosts. The module keeps it. Confirming this stays deliberate,
   not a dark-theme migration candidate.
