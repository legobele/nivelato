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
