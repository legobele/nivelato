# Nivelato chrome modules

Single source chrome that pages embed in same origin iframes, instead of
every page carrying its own copy of the sidebar and the top bar. This
directory is additive only: no existing page loads these files yet, and
nothing here edits or replaces an existing file. The coordinator owns
service worker cache bumps (sw.js) and any precache list changes; the
module files are intentionally not added to sw.js by this change.

## Files

| File | What it is |
| --- | --- |
| `modules/sidebar.html` | Standalone page rendering the settings tier sidebar as one floating card (niv-dark.css tokens, Inter, tier groups, sub labels and dots, dashboard style icon tiles). Three targets plus three panel list sections. |
| `modules/topbar.html` | Standalone page rendering the static `.niv-topbar` pill bar with the current project indicator. No Firebase, no data of its own. |
| `modules/shell-bridge.js` | Classic (non module) host side helper. Exposes `window.NivShell = { mountSidebar(el, opts), mountTopbar(el, opts) }`. No Firebase. |
| `modules/README.md` | This map. |

Both HTML modules link the design system root absolutely
(`/niv-dark.css`) and import Firebase root absolutely
(`/firebase-config.js`), exactly like the sibling pages resolve their
own copies from nested paths.

## sidebar.html

### Targets (query param `target`)

- `?target=company` (default; any unknown value falls back to company):
  company head at the top (avatar initials, name, and a
  `Nivelato v<version>` line whose version comes from the version
  registry: the `app_updates` projection for the org's update
  channel, `app_updates/beta-latest` for beta orgs and
  `app_updates/backend` for a stable stamp, falling back to the
  repo `VERSION` value when the registry is unreachable; the org
  doc's `dataVersion` is only the Updates-dot comparison state,
  never the displayed version),
  the three panel list sections, then the tier nav groups:
  - Company group: Users (`/company/users`), Company settings
    (`/company/settings`), Updates (`/company/updates`), Billing (see
    gating below).
  - Account group: My account (`/account/settings`).
- `?target=shell`: the dashboard facing sidebar nav (the app shell
  context). Company head, then the app nav (Panel
  `/dashboard.html?view=home`, Proyectos
  `/dashboard.html?view=projects`, Notificaciones
  `/dashboard.html?view=notifications`, Usuarios `/users`), then the
  three panel list sections below. Active keys for init are `home`,
  `projects`, `notifications`, `users`. Height behavior matches the
  company target (fixed by default, internal scroll).
- `?target=user`: the account settings subsettings nav only. Five in
  page navigation buttons carrying `data-section` attributes, in order:
  `cuenta`, `notificaciones`, `interfaz`, `seguridad`,
  `datos-privacidad` (labels Cuenta, Notificaciones, Interfaz, Seguridad,
  Datos y privacidad). The host page maps those section keys to its own
  sections. This target never loads Firebase; it is pure in page
  navigation.

Target enforcement: an early classic script in the module document
resolves the target before the main module script runs and REMOVES
the two non-selected asides from the DOM. The company aside is the
only one not marked `hidden` in markup, so before this guard any
early failure of the main script left the full workspace sidebar
visible in every context, including account settings. With the
guard, the workspace asides do not exist at all in the user and
shell documents (and vice versa), so no later code or stylesheet
can surface them.

### Users routing (IA rule): same label, target decides

The users surfaces split by intent, and the module resolves the
Usuarios label by target:

| Module target | Usuarios href | Surface | Gate |
| --- | --- | --- | --- |
| `company` | `/company/users` | Company level administration: invites, roles, status, removal. Part of the company settings family. | Manager gate (`userManagement`), see below. |
| `shell` | `/users` | Users overview: the people facing directory of the org's users. | No manager gate. Rendered for permitted viewers (signed in org members); the overview page enforces its own access. Managers reach administration through the company tier, not from here. |

The `/users` overview page itself is a later wave's build; this
module only implements the target rule. Page workers must not point
the shell Usuarios entry at `/company/users`: administration and
overview are different doors.

### Panel list sections (company and shell targets)

The scroll region opens with the three list sections of the dashboard
floating panel, in the dashboard order, at every viewport width
(no media query hides or reorders them):

1. Proyectos (Projects): expandable. Its body keeps the dashboard
   semantics: `#niv-snav-projects-body` carries the class `open`
   exactly when the section is not collapsed, and
   `#niv-panel-projects` holds `.niv-panel-item` rows or the empty
   state. Source: `orgs/{orgId}/projects` docs, `name` field.
2. Clientes (Customers): `#niv-panel-customers`. Unique `customer`
   values from the org jobs, first 5.
3. Medidas (Measurements): `#niv-panel-measures`. The 5 newest jobs
   from `orgs/{orgId}/jobs` ordered by `createdAt` desc, labelled
   `customer` then `project`, with the camera marker when
   `annotatedPhoto` is set, like `refreshFloatPanel` in dashboard.html.

Each section collapses individually by clicking its title or its
chevron button, mirroring the dashboard per section collapse; state
persists in the same localStorage record the dashboard uses,
`niv-panel-sections`, keyed by the section `data-seckey`
(`projects`, `customers`, `measures`). All three start expanded.

Row bodies activate like the dashboard rows: clicking a row runs its
primary action (project rows open the project, customer rows open the
customer overview, measure rows open the measure detail) through the
same `niv:row-open` message the "..." menus use. The "..." button is a
real menu button (`aria-haspopup="menu"`, `aria-expanded`, a
localized accessible name): Esc closes and refocuses it, focus moves
into the menu on open, arrow keys navigate the items, Enter activates,
and re-clicking the trigger toggles the menu closed. In demo mode the
Firestore actions (Rename, Delete) show a visible "disabled in demo"
toast instead of failing silently.

### Row actions (`niv:row-open`) and the host contract

The module posts `{ niv: 1, type: 'niv:row-open', kind, action, id,
label }` for the menu's navigation actions (project `open`, customer
`view` and `new-measure`, measure `view`). Hosts mounting the sidebar
through `shell-bridge.js` may pass `opts.onRowAction(d)`: return
`false` to handle the action themselves and suppress the default.
When no host handles it, the bridge navigates to the record itself:

| kind / action | Default destination |
| --- | --- |
| project / open | `/dashboard.html?view=project&project=<id>` |
| customer / view | `/dashboard.html?view=customer&customer=<name>` (the customer name is the record key) |
| customer / new-measure | `/flow.html?customer=<name>` (the flow's existing `?customer=` referral preselects the customer; `projectId`/`projectName` on the message, when present, are forwarded as `?project=` / `?projectName=`) |
| measure / view | `/dashboard.html?view=measure&measure=<id>` |

Standalone (not embedded), the module navigates to these same
defaults itself. Rename and Delete are not host actions: the module
runs them as Firestore writes (rules enforce permissions).

### Permission gate (manager only doors)

Usuarios, Company settings and Updates are manager only doors. They
are stored as `<template data-manager-gate="...">` in the markup and
are NOT rendered at all until the module's own gate passes; non
managers, signed out visitors, and unknown roles get a module without
those anchors in the DOM (not hidden, absent).

How the module obtains the role, in order:

1. It loads `users/{uid}` for the signed in user and runs the pages'
   own permission source on it: `makePermChecker(userData)` imported
   from `/permissions.js`, checked as `_can('userManagement')`, the
   exact semantics users.html and company/settings.html use (explicit
   permission flag wins, then the owner auto grant, then role
   fallbacks).
2. If the user doc cannot be read, it falls back to the flowGate
   claims on the ID token: `claims.role` fed to the same checker.
3. If neither source resolves a role, the gate stays shut
   (fail closed). The Updates status read (`app_updates/latest`) only
   runs when the gate passes, because its entry does not exist
   otherwise.

The demo persona is a manager, so demo mode renders the doors (see
below). Billing is gated separately, by flow, not by this gate.

### Billing gate (flow)

Billing exists today on the pages as a disabled button with a `soon`
badge; the module keeps that exact entry but only inserts it when the
signed in user's org is provably NOT on the qgi flow:

- qgi signals (any one hides Billing): ID token `claims.flow === 'qgi'`,
  org doc `orgs/{orgId}.flow === 'qgi'`, user doc `isQGC === true` or
  `company === 'qgc'`, or the hardcoded quotes disabled org
  `NJBBG5` when its org doc carries no flow field.
- External signals (one required to show Billing):
  `claims.flow === 'external'` or org doc `flow === 'external'`.
- If the flow cannot be determined, Billing stays hidden. Fail closed
  for QGI is the safe default, because a QGI org must never see a
  billing door.

Before reading, the module best effort mints flow claims via
`/geo.js` `ensureFlowClaims()`, like the sibling pages, and fails soft
if that helper or Firebase is unreachable.

### Updates status (manager gated entry)

Same reads and element semantics as `renderUpdatesDot` in users.html:
ids `updates-sub` and `updates-dot` inside the Updates anchor, the org
`dataVersion` (default `0.9`) compared against `app_updates/latest`:
a different latest version sets the sub label to the New version
available state and turns the dot on; otherwise the sub label reads
Up to date and the dot stays off. A failed read blanks the sub label.

### Demo mode (`?demo=1`, combinable with `target` and `lang`)

Renders with placeholder data and NO Firebase import at all, so QA can
screenshot the chrome without auth:

- Company: demo org head (Example Company, Nivelato v1.0), the manager
  doors rendered, Billing shown (the demo org is on the external
  flow), the Updates entry in its pending state (New version
  available, dot on), Users marked active, and one placeholder row in
  each list section.
- Shell: demo org head, the app nav with Panel active and Usuarios
  pointing at `/users`, and one placeholder row in each list section.
- User: the five subsettings with `cuenta` active (or `?section=`).

### Signed out / error state

With no signed in user (and not demo), the module renders the static
skeleton: company head placeholders, the three list sections with
empty states, group titles and the My account entry. No redirect, no
error surface. Manager doors stay absent (gate fail closed) and
Billing stays hidden (flow unknown).

### Sizing

The module posts `niv:resize` with its uncapped content height on
load, on content change (ResizeObserver) and on language or data
changes, so auto sizing hosts can size the iframe with no inner
scrollbar. The company target ALSO works at a fixed host height: the
card caps at the iframe height and its own list region
(`.niv-mod-scroll`, thin themed scrollbar) scrolls internally. The
user target is content sized and its scroll region does not scroll.

## topbar.html

The `.niv-topbar` from dashboard.html and users.html as a static
module: Dashboard, Projects, Notifications and Users pills plus the
`#niv-topbar-project` current project indicator.

- `?active=home|projects|notifications|users` selects the active pill
  (default `home`). Pills are anchors with `target="_top"` to
  `/dashboard.html?view=home|projects|notifications|users`.
- The sliding detent indicator is NOT part of this module; it belongs
  to the dashboard shell and stays there. The active pill here is the
  plain filled gradient, as on users.html.
- Current project text arrives via `?project=<name>` or the `project`
  field of `niv:init` (a topbar only extension, below). There is no
  notification badge: the locked contract has no count channel, and
  the module has no data source of its own.
- Settings context (`?ctx=settings`, or `context: 'settings'` on the
  mount / in `niv:init`): hosts in the settings shell (account and
  company settings, users administration, updates) mount the bar
  this way. The bar is then a frame, not a navigation surface: the
  pills render inert (no `href`, no `target`, no `niv:nav`, no
  active pill), because every pill destination is a dashboard view
  and following one would yank the user out of the settings surface.
  The project label still shows. Default context is unchanged.
- This module carries no account menu or popover. See the
  localization audit below.

## postMessage contract (LOCKED)

Every message is an object `{ niv: 1, type, ... }`. Both sides
validate `event.origin === location.origin` and ignore anything else.
The bridge additionally only accepts messages whose `source` is the
iframe it created, and only navigates to same origin hrefs.

| Type | Direction | Payload | Meaning |
| --- | --- | --- | --- |
| `niv:ready` | module to host | `{ target }` | Module loaded. `target` is `company`, `shell`, `user` or `topbar`. Host replies with `niv:init`; the bridge also sends init on iframe load, and init is idempotent. |
| `niv:init` | host to module | `{ target, active, section, lang }` | Configure the module. `lang` is `es` or `en`. For the sidebar company target, `active` is a nav key (`users`, `settings`, `updates`, `billing`, `account`) or an href or path such as `/company/users`. For the shell target, `active` is `home`, `projects`, `notifications` or `users`. For the user target, `section` (or `active`) is one of the five `data-section` keys. Topbar only extensions: `project` sets the current project label; `context: 'settings'` switches the bar to its inert settings context. |
| `niv:nav` | module to host | `{ href }` | A nav anchor was clicked. The host performs the top frame navigation. Embedded modules suppress the anchor default after posting, so hosts MUST navigate on this message. Module anchors also carry `target="_top"` as the no JS fallback: standalone, or a host that never loads the module script, still navigates. |
| `niv:resize` | module to host | `{ height }` | Content height in CSS pixels (uncapped measurement). Auto mode hosts set the iframe height from it. Fixed mode hosts (the company sidebar default) ignore it. |
| `niv:section` | module to host | `{ section }` | User target only: a subsettings button was clicked. The module marks it active itself, then the host shows the matching section. |
| `niv:row-open` | module to host | `{ kind, action, id, label }` | A row's navigation action (see "Row actions" above). The bridge navigates to the record by default; a host may intercept with `opts.onRowAction` (return `false` to suppress the default). |

## Drag and drop messages (wave 3, niv-drag.js)

Drag and drop measurement to project assignment is owned by a shell
side layer, `niv-drag.js`, loaded by the host page (dashboard.html).
Native HTML5 drag does not cross iframes and does not work on touch,
so the gesture is Pointer Events based and lives entirely in the host:
the module is the geometry and paint side of the contract. The sidebar
module participates only when embedded; the host paints the native
dashboard panel's zones itself from that panel's DOM.

| Type | Direction | Payload | Meaning |
| --- | --- | --- | --- |
| `niv:dragstart` | module to host | `{ measureId, label }` | A Medidas row in the module was pressed (pointerdown). The host starts the drag, raises a transparent shield over the sidebar iframe so every later pointer event stays in the host document, and broadcasts `niv:dragactive`. |
| `niv:dragmove` | module to host | `{ x, y }` | Pointer move forwarded from inside the module while a module sourced press is in flight, in module coordinates. A gesture that starts inside the iframe keeps its pointer events in the module document, so the host shield cannot see them; the module forwards them and the host converts with the iframe rect. Only sent between a measure row pointerdown and its pointerup. |
| `niv:dragup` | module to host | `{ x, y }` | The forwarded pointerup that ends a module sourced gesture, in module coordinates. The host hit tests and drops or cancels. |
| `niv:dragactive` | host to module | `{ on }` | A drag is active (`on: true`) or over (`false`). While on, the module reveals the drag only "Nuevo proyecto" / "New project" drop box below all projects in its Proyectos section and re-reports drop zones on a 150ms cadence and on scroll. |
| `niv:dropzones-request` | host to module | `{}` | Sent at dragstart. The module replies with `niv:dropzones`. |
| `niv:dropzones` | module to host | `{ zones: [{ id, name, rect }], scrollRegion }` | Zone rects in module coordinates; `id` is a project id or `'new'`. `scrollRegion` is the rect of the module scroll region (`.niv-mod-scroll`). The host converts to viewport coordinates with the iframe's bounding rect and hit tests. |
| `niv:draghover` | host to module | `{ zoneId }` | Paint the highlight on the zone with this id (a project id or `'new'`); `zoneId: null` clears it. |
| `niv:dragscroll` | host to module | `{ dy }` | Hot zone auto scroll tick: scroll the projects scroll region by `dy` pixels. Sent only while dragging, when the pointer sits within the 48px edge band of the region; the host ramps speed with edge proximity up to 420 px/s. |
| `niv:dragcancel` | module to host | `{}` | Escape was pressed inside the module while a drag is active (the keydown cannot reach the host document). The host cancels the drag with no write. |

The host performs the assignment write itself (it owns the data path):
`updateDoc` on `orgs/{orgId}/jobs/{measureId}`, the same write the job
edit performs in dashboard.html (`saveEdit`), carrying `project` (the
project name) and `projectId` (the project doc id the project views
filter on). Dropping on `'new'` first runs the existing project
creation pattern (`saveNewProject` in dashboard.html: name plus
optional customer, `addDoc` on `orgs/{orgId}/projects` with
`{name, customer, memberUids: [], createdAt: serverTimestamp(),
createdBy}`), then assigns; cancelling the name step cancels the
whole drop with no write. The new project box exists only while a
drag is active, in the module and in the native panel alike.

## shell-bridge.js

```html
<script src="/modules/shell-bridge.js"></script>
<div id="chrome-sidebar"></div>
<div id="chrome-topbar"></div>
<script>
  const sidebar = window.NivShell.mountSidebar('#chrome-sidebar', {
    target: 'company',           // 'company', 'shell' or 'user'
    // demo: true,               // QA only
    // active: 'settings',       // company nav key, or a user section via section:
    // section: 'cuenta',
    // lang: 'en',               // default: resolved from the lang cookie
    // heightMode: 'fixed',      // company default fixed, user default auto
    // height: 640,              // px number or CSS string, forces fixed
    onSection: (section) => { /* show the matching settings section */ },
    onNav: (href) => { /* return false to cancel the navigation */ },
    onReady: (msg) => {}
  });
  const topbar = window.NivShell.mountTopbar('#chrome-topbar', {
    active: 'home',              // home | projects | notifications | users
    project: 'Current project name'
  });
  // Live updates without reload:
  sidebar.setActive('updates');
  sidebar.setSection('seguridad');
  sidebar.setLang('en');
  topbar.setProject('Other project');
  topbar.setActive('projects');
  // Teardown: handle.destroy()
</script>
```

Mount handles return `{ iframe, element, target, setActive, setSection,
setLang, setProject, setHeightMode, destroy }`. The bridge creates the
iframe (class `niv-shell-frame niv-sidebar-frame` or
`niv-topbar-frame`, borderless, width 100%), appends it to the element
(an element or a selector string), wires the message listener, sends
`niv:init` on load and again on `niv:ready`, navigates the top frame
on `niv:nav`, resizes on `niv:resize` in auto mode, and forwards
`niv:section` to `opts.onSection` plus a bubbling `niv:section`
CustomEvent on the host element.

Default heights: company sidebar fixed at 100% of the host box (the
host controls the height; give the container a height). User sidebar
and topbar start at a placeholder height (200px and 60px) and follow
`niv:resize`.

## Cookies and storage keys the modules READ

The modules never write these; the settings system (another worker's
files) owns writing them.

| Key | Kind | Used for |
| --- | --- | --- |
| `nivelato-login-lang` | Cookie, `Domain=.nivelatolabs.com` (localStorage key of the same name as on origin fallback) | Module language. `en` selects English; anything else, including absent, selects Spanish (the product default). A `?lang=` param or `niv:init` `lang` overrides it for the session. |
| `niv-compact-sidebar` | Cookie, `Domain=.nivelatolabs.com` (localStorage fallback as above) | Value `1` densifies the sidebar card (tighter padding and nav rhythm). The dashboard rail behavior itself stays in the dashboard shell. |
| `niv-panel-sections` | localStorage JSON | Per section collapse state for Proyectos, Clientes, Medidas. The same record and keys the dashboard panel writes. |

## Localization

Every string the modules render ships in a complete ES/EN pair in the
module's string table and is selected by the resolved language
(cookie, then `?lang=`, then `niv:init`). That covers nav labels,
group and section titles, list empty states, chevron labels, the
Updates sub label states, aria labels and document titles. Three
labels are intentionally identical in both languages because that is
how every sibling page renders them in both languages today, as
feature names: `Updates`, `Billing`, and the `soon` badge.

Audit findings outside this directory (not fixed here; page workers
own those files):

- dashboard.html account popup mixes languages in the live shell:
  Account settings, About Nivelato and Help are hardcoded English
  while Cerrar sesión is hardcoded Spanish, so the menu is mixed in
  both UI languages.
- dashboard.html panel section titles and empty states (Proyectos,
  Clientes, Medidas, Sin proyectos, Sin clientes, Sin medidas) are
  hardcoded Spanish only; the EN chrome pass in dashboard.html does
  not translate them. This module implements the missing EN pairs
  (Projects, Customers, Measurements, No projects, No customers,
  No measurements).

## Shell rule (mobile)

Mobile: sidebar always, top bar never. At widths up to 900px no page
renders a top bar, regardless of the compact-mode setting (that setting
governs desktop only). Navigation is the sidebar drawer; account
actions live inside the sidebar. Hosts must not mount the topbar
module at mobile widths; if mounted anyway, the module renders
nothing (it self-suppresses in CSS).

## Embedding checklist for page workers

1. Include `/modules/shell-bridge.js` once, mount with `NivShell`.
2. Do not restyle inside the iframes; theme through niv-dark.css
   tokens only.
3. Company sidebar: give the mount container a definite height
   (fixed mode default), or pass `heightMode: 'auto'` and let
   `niv:resize` drive it.
4. User sidebar: map the five section keys to your sections in
   `onSection`, and pass the initial section via `section:` (or call
   `setSection` after mount). The module highlights; the host shows.
5. Topbar: pass `active` for the current view and keep `project`
   updated with `setProject` when the open project changes.
6. Routes used by the modules (`/company/users`, `/company/settings`,
   `/company/updates`, `/account/settings`, `/dashboard.html?view=...`)
   are the worker served paths the pages already link to; the modules
   do not change any routing.
