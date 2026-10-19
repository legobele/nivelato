# Nivelato Design System: Labs Monochrome (draft, Oct 2026)

Extracted from the Nivelato Labs site draft (nivelatolabs-redesign-draft)
and applied to the web app UI in this branch. References: Belgrade Arbor
(cinematic scale, restraint), Heron AI (agent product storytelling),
HOLOGRAPHIK / CoMinVi (boring industrial company, huge white type on
black, one central object, tiny mono labels, nothing competing).

## Tokens

- Background: #050505
- Surface 2: #0a0a0b
- Card / surface: #0e0e10
- Surface raised: #16161a
- Line: #26262b (borders rgba(255,255,255,.14) soft / .28 strong)
- Ink: #fafafa
- Muted: #a8a8b0
- Dim: #6f6f77
- Accent: white #ffffff (buttons white on black, black text on white)
- Radius: 6px cards, 4px buttons (sharp geometry)
- Type: Space Grotesk for display, Inter for UI text,
  JetBrains Mono for kickers and micro-labels (letter-spacing .28em,
  uppercase, .78rem)
- Motif: a glass pane drawn in lines (SVG strokes, dimension lines with
  end ticks, one center point). One central object per entry screen.
  Never an AI image, never clip art.
- Motion: additive only, ease-out cubic-bezier(.22,1,.36,1), content
  fully visible if JS fails, everything off under
  prefers-reduced-motion.

## Functional exception

Semantic status colors (success green, error red) stay colored in the
working app. They are signals, not branding. Killing them would make a
field tool worse. Branding colors (blue, amber, teal) are gone from
chrome.

## Where it is applied in this draft

- niv-dark.css: token retune (bg, surfaces, accent, radius) plus a
  labeled Labs Monochrome section fixing text on accent backgrounds.
- login.html: site-draft palette vars, white glow, CoMinVi treatment:
  pane motif behind the sign-in card, tiny mono corner labels
  ("Nivelato Labs" / "Offset measuring software"), oversized restraint.
- dashboard.html / settings.html / autism.css: chrome CSS only
  (active tabs, nav active state, badges, primary buttons, focus
  rings, logo accent). No scripts, no markup logic.
- sso.html: presentational only (monochrome light card, plain
  "Inicia sesion con tu cuenta" tagline). The page itself is NOT
  deleted: see the coordinator report, it is load-bearing for the
  login cross-origin session handoff.

## Android mapping (spec only, nothing built)

- Theme colors: bg #050505, surface #0E0E10, raised #16161A,
  line #26262B, onSurface #FAFAFA, muted #A8A8B0, primary = white
  with #050505 content color.
- Shape: 6dp card corners, 4dp buttons, no pill primary buttons.
- Type: Space Grotesk (display/headlines), Inter (body),
  JetBrains Mono (labels, measurement readouts get mono as an option
  in measurement rows only, do not force existing users).
- Entry, empty states, and the sign-in-adjacent screens get the
  CoMinVi treatment: pane motif drawn with Canvas/Compose lines,
  huge wordmark, mono corner labels. Dense measurement workflows
  keep current layout, monochrome chrome only.
- Status colors unchanged (success/error semantics).
- Ships later through the normal route only: build, Play closed
  track, download from Play. Nothing ships from this draft.

## Fourth reference: Terminal Industries (Awwwards SOTD Sep 3, 2025)

Trucking/logistics presented cinematically: real truck at dusk, a
digital wireframe overlay on the trailer, one bold claim, floating
pill nav. The pattern across all four references is the same:
industrial software, presented like it matters.

- Overlay motif: for Nivelato this is a measurement grid and
  dimension lines drawn over the work. No suitable real glass/shop
  photo exists in this repo (only icons, logos, and a test fixture),
  so the login motif is done purely in CSS/SVG geometry: an outlined
  glass pane with dimension lines and end ticks. When a real shop
  photo is chosen later, the same SVG overlay drops on top of it.
  Never AI generated imagery.
- Bold claim on entry surfaces: login carries one line,
  "Field measurement, reinvented", in mono micro-label style.
  Capability-neutral on purpose: it claims an attitude, not a
  feature the product does not have.
- Floating pill nav: recorded as a CANDIDATE component for entry
  and marketing-adjacent surfaces only. Not adopted in working app
  screens in this draft: the app shell nav is structural (sidebar
  with state), and the site draft nav is a sticky full-width bar;
  a floating pill would fight both. Revisit at go-live review.

## Fifth reference: Bennett & Clive (Awwwards SOTD)

Received as an additional visual reference in the same black and
white cinematic family as Belgrade Arbor, Heron AI, CoMinVi, and
Terminal Industries. Both fetches of its Awwwards page returned
jury scores only (individual jurors 7.0-8.4, Awwwards users 8.63),
with no usable element breakdown, so no specific technique is
borrowed or asserted from it. It changes nothing in this system:
the earlier explicit directives win in any conflict (monochrome,
futuristic, functional app screens first).

## Primary app reference: Aevion (LiDAR drone scanning)

Autonomous LiDAR inspection drone site (drone.riotters.com).
Closest functional cousin to Nivelato: it is also a measuring
product. Now a primary reference for the APP UI specifically,
alongside Belgrade Arbor and Heron AI.

Translated into the pass:
- Measurement data presented like a precision instrument HUD:
  key dimensions and readouts get small bracketed mono labels in
  the style of [ MAX RANGE ] and [ Detection Accuracy ], values
  set in mono with tabular numerals, spec-sheet styling for
  measurement summaries.
- Numbered sections in working flows: step titles gain a bracketed
  mono index [ 01 ], [ 02 ] via CSS counters. Decoration only;
  the underlying titles and flow are untouched.
- In the app: autism.css carries an "AEVION HUD" section making
  .summary-label a mono spec label and .summary-val a mono
  readout, plus the step numbering above.
- In the sample (login): the pane motif's dimension lines are
  labeled [ WIDTH ] and [ HEIGHT ] in the SVG itself, and the
  corner labels are bracketed, e.g. [ OFFSET MEASURING SOFTWARE ].
- Taste limit, binding: HUD labels belong on readouts, summaries,
  and entry surfaces. They are not pasted over dense workflows,
  and no spec values are invented: labels name the measurement,
  the product's own numbers supply the value.

## Liquid Glass pass (Oct 17, 2026)

Giulia's directive: "We need a good image of some mountains, and a
glassy texture. See Apple's Liquid Glass."

Principles taken from Apple's Liquid Glass overview and HIG
guidance (verified at overview level): Liquid Glass is a dynamic
material for the controls and navigation layer; that layer floats
above edge-to-edge content, content lives underneath and infuses
the material; be judicious with color in controls and navigation
so they stay legible and let the content show through; put the
most important content in focus; it does not mean reinventing the
app. Named optical details (refraction, specular highlights) live
in Apple's "Adopting Liquid Glass" sub-doc and WWDC sessions, not
the overview; the specular edge used here is the CSS translation.

Web translation used in this draft:
- One functional glass layer: translucency (white at 3 to 14
  percent over dark), backdrop-filter blur 8 to 18px with
  saturation 140 to 160 percent, a 1px specular top edge via
  box-shadow inset, and a soft inner glow. Content infuses the
  layer because the photo shows through the blur.
- Glass sits on interactive surfaces only: login sign-in card
  (20px radius, glass forms run rounder than the 6px work cards),
  the brand panel nested inside it, account pills, and the
  floating header pills (brand and nav) on login. On flow: the
  rail and step cards only, dimmed deeper for a working screen.
- Never over body text. (The QGC gray theme that used to hide the
  mountain layer was retired Oct 17, 2026; glass now applies on
  every login surface, QGC included. See the QGC section below.)
- Fallback: where backdrop-filter is unsupported, an @supports
  block takes the glass near-opaque dark so every surface stays
  fully readable over the photo.
- Motion unchanged: nothing new animates; the existing pane-in
  entrance still respects prefers-reduced-motion.

Backdrop photo (real photograph, never AI generated):
- Subject: Oeschinensee (Oeschinen Lake) and the Bluemlisalp
  massif, Kandersteg, Switzerland. Snow peaks above a turquoise
  lake. File: assets/mountains-oeschinensee.jpg (1600 x 855,
  384 KB, re-encoded from the 1920px Commons version).
- Photographer: Günter Seggebäing (Wikimedia Commons user
  "Watzmann"), photo taken 25 July 2019.
- License: CC BY-SA 3.0. Source page:
  https://commons.wikimedia.org/wiki/File:20190725_Oeschinensee-Panorama,_Kandersteg_(06540-42_stitch).jpg
  License text: https://creativecommons.org/licenses/by-sa/3.0/
- Design call: the shipped asset is the untouched color photo.
  The monochrome treatment happens in CSS at display time
  (grayscale, slight contrast lift, brightness down, plus a dark
  scrim gradient), so the black and white language holds while a
  whisper of the scene stays underneath the glass. Recorded here
  because the license asks for changes to be indicated: display
  treatment only, file unmodified.
- Credit on the page: login carries a small mono photo credit
  line (bottom center, desktop) linking the photographer credit
  and the license, per the license's online-use terms.

## Sixth reference: Landmarks, "Building an app with Liquid Glass"

Apple's Landmarks sample tutorial (developer.apple.com,
"Landmarks: Building an app with Liquid Glass"), pointed at by
Giulia for implementation-level technique. Verified techniques
from the page, and their web translations in this draft (effects
translated, no SwiftUI APIs invented into the web build):

- Background extension effect: the featured image extends edge
  to edge and blurs underneath the glass panels; headline and
  controls are layered above the extension, only the image
  extends. Here: the mountain photo is a full-bleed fixed layer
  (inset 0, cover) and blurs under the glass sign-in card and the
  glass header pills via backdrop-filter; all text and controls
  sit in layers above it.
- Scroll content extends underneath glass panels: here, the
  fixed glass header pills let the login page scroll beneath
  them on short screens, and on flow mobile the fixed primary
  action bar is now glass, a sheet floating over the scrolling
  form. The desktop flow rail and cards are glass over the same
  full-bleed mountain layer.
- Toolbars take the glass automatically, grouped into related
  clusters rather than one blob: here, the login header is two
  distinct glass pills (brand cluster, nav cluster).
- Custom elements get glass, grouped in a container so they read
  as one material with their own identities: here, the glass
  group (card, brand panel, account pills, header pills, flow
  rail and cards, flow continue sheet) shares one token set
  (fill stops, edge highlight, blur range) and one transition
  timing, so grouped glass settles together.
- Animations: no new motion was invented for this pass. The
  existing entrance animation and hover states carry the glass,
  and everything still honors prefers-reduced-motion.

## Motion system: "zero jump-cuts" (Oct 17, 2026)

Giulia's rule: no jump-cuts anywhere in Nivelato. One motion
language covers the app AND the marketing site (the site repo
mirrors this section in docs/motion-system.md). Motion is
additive only — transitions and keyframe entrances layered on
the existing view toggles — and every animation collapses
under `prefers-reduced-motion`.

**Tokens** (identical names and values in both repos):
- `--niv-mo-ease: cubic-bezier(.22, 1, .36, 1)` — the system's
  one easing family (the ease-out already used by the login
  pane entrance and the site hero).
- `--niv-mo-micro: 160ms` — state changes: hover, press,
  focus, chevrons, switch knobs, dropdown pops.
- `--niv-mo-view: 300ms` — view/panel/menu/modal transitions:
  step swaps, section swaps, overlay fades, progress width.
- `--niv-mo-enter: 560ms` — page entrances only: the app body
  fade, the site hero rise and scroll reveals.
- Distances: entrances rise 10px (app views/modals) or 26px
  (site hero/reveal, the established site standard); page
  fades travel 0px. Everything fades from opacity 0.

**Safety rules (binding):**
- Entrances animate FROM a hidden keyframe TO the element's
  natural state, with no fill mode holding a hidden end
  state. If JS fails, content is simply there — animation
  never gates visibility. (The site's reveal system already
  works this way: `.reveal` only hides under `html.js`.)
- No transform animations on `<body>`, step containers, or
  any ancestor of a fixed element: a transform makes that
  ancestor the containing block for fixed descendants and
  the mobile flow action bar jumps when the animation ends
  (the trap the Liquid Glass pass documented). Page and
  flow-step entrances are opacity-only for this reason.
- The brand watermark overlay never animates. It is a static
  deterrent layer; motion on it would be decoration on a
  security surface.

**Where it lives:**
- App: token definitions, keyframes (`niv-mo-page-in`,
  `niv-mo-fade`, `niv-mo-view-in`, `niv-mo-pop`), the body
  page fade, button/tab/field/select/switch/row transitions
  and the global reduced-motion collapse are in niv-dark.css
  (loaded by every app page). Retimes on top: flow.html
  (step fade, progress fill, rail sections, continue press),
  settings.html (section swap), dashboard.html (modal
  overlay + desktop dialog entrance, sidebar width, float
  panel fade), login.html (view slides, variant menu),
  autism.css (step panels, canvas-app progress, buttons),
  modules/sidebar.html (toast, chevrons, glyphs).
- Site: one motion block per page before `</head>` unifies
  the hero rise and scroll reveals on the enter token, the
  variant menu open/close on the view token (both
  directions), menu content rise, the language selector
  expand, and button/link micro transitions. The scroll cue
  (scroll-fix pass) should adopt these tokens for its fade
  when it is next touched: its 450ms ease fade is the one
  remaining off-system timing.

**Deferred, deliberately:**
- Number tweens (flow % label, flow totals, dashboard
  builder totals): the values swap via textContent in
  existing render code; easing them needs JS counters, and
  this pass is CSS-only by the no-break rule. Width-based
  numbers (progress fills) already ease.
- Skeleton-to-content crossfades in the dashboard: content
  replaces skeletons through many independent render paths;
  a CSS-only crossfade would need a hook in each. The page
  fade plus the skeleton pulse covers the wait for now.
- Sidebar section collapse (`.niv-panel-sec`): the body is
  display-toggled; a smooth collapse needs height
  restructuring (the codebase's own notes flag a previous
  attempt snapping). Chevron rotation already eases.
- Menu content exit on the site: the overlay fade covers
  close; a content exit would need a closing-state class
  hook in the menu JS. Enter is animated, exit is the fade.
- App cross-page transitions beyond the fade: pages are
  full reloads; the body fade-in is the transition.

## Brand watermark: free-tier screenshot deterrent (Oct 17, 2026)

Giulia's spec: on web, free-tier accounts get the logo as a
watermark across the app content area. Built as `niv-brandmark.js`
(call `NivBrandmark.apply({ email, tier, orgId })` once a page has
resolved the signed-in user; wired into dashboard.html and
flow.html at the points where those pages already resolve tier).

**What it is for, stated honestly:** the watermark deters casual
screenshotting and makes any leaked screenshot visibly branded and
marked confidential. No web technology can literally prevent
screenshots — anyone determined can capture a screen. This is a
deterrent and a tracing/branding layer, not DRM, and it should
never be described to customers as screenshot-proof.

**The tile:** the full lockup — Breakout mark + "Nivelato Labs"
wordmark — with a "DO NOT SHARE" line in small mono caps under
the lockup inside each tile. (Giulia's wording preference was
DO NOT SHARE; CONFIDENTIAL was the fallback floor, not the
choice.) Tiles repeat on a -22° diagonal on a fixed,
pointer-events-none overlay above the content and below
menus/modals (z-index 800), so it survives scrolling and never
blocks a click or hurts readability. One tradeoff: the tile is an
SVG background image, and SVG images cannot load webfonts, so the
tile wordmark renders in a system bold sans instead of Anybody
Expanded Black. The mark geometry is exact.

**Dark-background treatment (Oct 17, 2026):** the first tile
filled the wordmark with the raw gradient colorway at 0.07 free /
0.09 dev overlay opacity. Giulia's verdict on the samples: "Its
not readable on dark BGs" — the gradient's tail is dark purple
#8202ff, so over the app's dark surfaces (and doubly over flow's
dark mountain layer) the right half of every wordmark and the
whole notice line washed out. A watermark that cannot be read
fails its purpose, so the tile is now tuned dark-first:

- Wordmark and notice render in **white**, each with a thin dark
  halo (SVG `paint-order: stroke`, rgba(8,8,12,0.65)) so the
  same tile also survives light elements instead of vanishing
  into them.
- The mark keeps the gradient, but the tile uses **lightened
  stops** — #fee800 (unchanged, already full brightness) →
  #ff3333 → #ff339e → #a64dff. Same hues, higher lightness. The
  brand assets keep the exact stops (#fee800, #ff0e0e, #ff0d88,
  #8202ff, from concept-3-breakout-gradient.svg); the lift is a
  watermark-only legibility adjustment.
- Overlay opacity is **0.15 free / 0.17 dev** — present and
  readable at a glance, still well under the content's contrast.

Verified in headless Chromium on the real dashboard and flow
pages at mobile width: every tile's "Nivelato Labs" and
"DO NOT SHARE" / "DO NOT SHARE · DEV" reads without squinting,
and app content under the tiles stays perfectly legible. The
app has no light theme — its lightest real surface at the time
was the QGC tenant gray (body #2a2a2e, cards #3a3a3e; that theme
was retired later the same day), where the tile also reads
cleanly. On a hypothetical pure-white page the text would
sit faint (the colored mark still carries the pattern) — the
halo keeps it discernible, and no such surface exists in the
app.

**Three states, in precedence order:**
1. **Dev** — the signed-in email is legobele@gmail.com: the dev
   variant of the same tile system (notice line reads
   "DO NOT SHARE · DEV", slightly higher opacity). Dev beats tier.
2. **Paid** — tier is ultra, pro, or qgc, or the org is the
   exempt full-access org (NJBBG5, mirroring
   QUOTES_DISABLED_ORGS in permissions.js): no watermark.
3. **Free** — anything else, including a missing tier (the rest
   of the app defaults a missing tier to 'free' the same way):
   the free watermark.

Signals are only what the front end already has: the auth email
and users/{uid}.tier/orgId, the same doc the dashboard and flow
already read. No new data is collected, and no billing,
entitlement, or plan data changes — the component only reads the
tier string the call site hands it. If a future page has no tier
signal resolved yet, the activation hook is the single apply()
call above (plus the script include); wire it where that page
resolves its user doc. State is mirrored onto
`<html data-niv-brandmark="dev|free|off">` for testing.

Not to be confused with flow.html's existing loadWatermark():
that is the testing-channel version stamp ("TEST - v…"), a
separate system that predates this one.

## QGC/PR tenant treatment + login layout law (Oct 17, 2026)

Giulia ordered the entire QGC/PR login experience rebuilt in the
main design system ("EVERYTHING qgc/pr needs to be set back to the
main design system"). What changed, presentation only — tenant
detection, geo logic, sign-in methods, handlers and redirects are
untouched:

- **The gray tenant theme is gone.** The `body.qgc-theme` rule set
  (page #2a2a2e, cards #3a3a3e, gray #63636b buttons, and the QGC
  logo stretched fullscreen at distorted aspect behind everything)
  was deleted from login.html, and `qgc-theme.css` — which applied
  the same gray reskin across the whole app for QGC users — is now
  an empty stub with a retirement note. `company-theme.js` still
  sets the `body.qgc-theme` class as a mode flag; no stylesheet
  keys off it. The Liquid Glass rules are no longer gated off in
  QGC mode: QGC users get the same mountain, glass and Breakout
  lockup as everyone else.
- **Tenant treatment.** Inside the brand panel, the tenant is a
  `.tenant-block`: the tenant's logo contained (never cropped,
  never stretched) on a light tile, the tenant's full name, and a
  mono HUD tag. Company pills and the company sign-in header show
  logos contained on white for the same reason. The PR sign-in
  restriction, the PR business-exclusivity banner (with its Google
  Play link) and the exclusivity note keep their exact copy and
  dictionary keys, rendered as glass notice rows (`.qgc-only-notice`,
  `#pr-note`, `.exclusivity-note`, `.geo-note` — one component).
  The green QGI button/tab accents are gone; QGC actions use the
  system primary. The language control is the system's text pill
  at every width (the small-screen globe-emoji swap is deleted).
- **Layout law, every login surface.** Sign-in, company select
  (both modes), company sign-in, add-account, reauth, cant-add,
  travel and the save-login prompt share one contract: the card
  fits the dynamic viewport (`max-height` in dvh, sized between
  `--login-top-clear` and `--login-bottom-clear`, which reserve
  room for the fixed Variant B header and the fixed footer HUD
  labels — the two collision sources in the old layout). There is
  no page-level scroll on the login screen. Inside the card the
  branding/header zone and pinned actions stay put; the middle
  content scrolls internally (`.main-panel`, `.card-scrollzone`,
  the company-select list region). Notices are inserted into the
  scroll zone, never at the card's top edge where the back chevron
  sits. Auth-adjacent pages audited under the same law: sso.html
  and geo-blocked.html already fit it (short centered cards); the
  PR company application page (apply-pr-company.html) was retokened
  from the retired amber brand to monochrome with the Breakout mark.

## Nivelato Neue: the design language in the working app (Oct 18, 2026)

Giulia's call: the whole logged-in app gets the Nivelato Neue
treatment (samples: `nivelato-neue-samples/`, Variant A "Command
Deck" shell) and the QGI tenant theme is killed outright. What
shipped, presentation only (no JS logic, auth, tenant detection
or routing changes):

- **The tenant theme is out of the app.** The gray reskin CSS
  already died Oct 17; now the plumbing follows: dashboard,
  account settings, users, company settings, company users and
  flow no longer load `company-theme.js` or link
  `qgc-theme.css`. Every tenant renders the standard Neue.
  Detection is untouched: the guarded `applyCompanyTheme(...)`
  call sites remain and simply no-op. Login keeps its QGI mode
  logic and tenant treatment; `company-theme.js` and the stub
  stay in the repo for the static/support surfaces that still
  reference them.
- **Type.** Space Grotesk is the display face (page titles,
  card titles, company names, view titles); JetBrains Mono
  carries HUD labels (nav group titles, panel section titles,
  stat labels, list titles) and tabular readout values (stat
  numbers). Inter stays the UI face. Home/customer stat labels
  render bracketed via CSS generated content; the dictionary
  strings are untouched.
- **Geometry.** Sharp scale: content cards 6px, nav rows 6px,
  fields 6px, shell cards (dashboard panel + main frame) 14px,
  avatars 10px tiles instead of circles. Pills survive only
  where the component is a pill (tabs, chips, switches,
  badges). The company users page's local radius tokens were
  retokened to the same scale (28/18/12 -> 14/6/6).
- **Glass.** Liquid Glass on the shell layers only: the
  settings sidebar, the shared `.niv-side` card (chrome
  sidebar module), the dashboard float panel and the top bars
  (dashboard + topbar module) take the translucent fill, top
  edge light and backdrop blur, with the near-opaque fallback
  where backdrop-filter is unsupported. Never over body text.
- **Accent.** White only. The surviving pre-Labs brand colors
  were retired wherever they still painted UI: the amber
  #f5a524 (dashboard buttons, focus rings, badges, join code,
  the two full-page takeover screens, which also had dark text
  on the dark body) and the blues (#1971c2 / #1864ab / the
  teal-blue gradients on the topbar module's active tab and
  the company users selected card). Switches are monochrome
  (white track, dark knob when on; position, not color,
  carries state). Notification category dots and the quote
  "sent" state use the sample signal palette. The per-user
  avatar color arrays on the two users pages are now a
  monochrome ramp. Still colored on purpose: semantic status
  (ok / warn / err), presence dots, and the quote PDF print
  styles (a customer document, not app chrome).
- **Mobile shell.** The collapsed rail is a desktop state
  only. At phone widths the dashboard drawer always renders
  the full sidebar (org head with name, labeled nav, lists,
  account card) at min(86vw, 340px): the old rule kept a
  300px-class width on rail content and rendered the giant
  mostly-empty icon panel. The settings pages keep their
  established hamburger-bar pattern, restyled by the same
  tokens.
- **Not ported from the samples, deliberately.** The home
  hero band (mountain photo + display headline) and the
  sample quick-actions sheet have no counterpart markup in
  the live views; adding them means new localizable copy in
  the views, which is a content change, not a styling pass.
  The live home keeps its stats + recent lists under the
  Neue shell. Follow-up if Giulia wants the band.
