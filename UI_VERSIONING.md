# UI Version Tagging

Backend updates version-tag the UI scheme so the app knows exactly what
each org is running and what changes to show them.

## Tag format

```
v{semver}-{theme}-{orgid}
```

- `semver`: app semantic version, from the Android `versionName` base
  (e.g. `1.1.0` from `1.1.0-20261001`). Always prefixed with `v`.
- `theme`: the UI theme the org is on. One of `darkmode` | `light`.
- `orgid`: the Firestore org document ID (e.g. `qgc`).

Examples:
- `v1.1.1-darkmode-qgc` — QGC org, dark theme, app v1.1.1
- `v1.1.1-light-external` — external org, light theme, app v1.1.1
- `v1.2.0-darkmode-abc123XYZ` — org `abc123XYZ`, dark theme, app v1.2.0

Parsing rule: strip the leading `v`, split on `-`. The first segment is
the semver, the second is the theme, the remainder joined back is the
org ID (org IDs never contain hyphens in practice, but the parser is
tolerant).

## Firestore layout

```
config/ui_versions                      (global)
  latestSemver: "1.1.1"
  releasedAt: <timestamp>
  changelog: {
    "1.1.0": ["Quote PDFs now attach to the job record", ...],
    "1.1.1": ["Dark mode toggle in settings", ...]
  }

config/ui_versions/orgs/{orgId}         (per org)
  tag: "v1.1.1-darkmode-qgc"
  semver: "1.1.1"
  theme: "darkmode"
  orgId: "qgc"
  updatedAt: <timestamp>
  updatedBy: "backend-deploy" | <uid>
```

## Cloud Functions

- `setUiVersion` (callable, owner role required): sets the UI version tag
  for an org. Called by the backend deploy pipeline after a release.
  Params: `{ orgId, semver, theme }`.
- `flowGate`: includes `uiVersion` (the org's current tag, or null) in its
  response so the client learns it during the normal auth flow.

## Client

`webapp/ui-version.js` provides:
- `parseUiTag(tag)` / `buildUiTag(semver, theme, orgId)`
- `getUiVersion(db, orgId)` — reads the org's tag from Firestore
- `getUpdatesForUser(currentTag, latestInfo)` — heuristics: compares the
  user's tag against the latest release and returns what to show them.

## Heuristics

`getUpdatesForUser(currentTag, { latestSemver, changelog })` returns:

```js
{
  hasUpdate: true|false,   // latest semver is newer than the user's
  fromTag: "v1.1.0-darkmode-qgc",
  toTag: "v1.1.1-darkmode-qgc",  // what the tag becomes after update
  fromSemver: "1.1.0",
  toSemver: "1.1.1",
  themeChanged: false,     // true if the update also flips the theme
  changes: [...]           // changelog entries between from and to, newest first
}
```

Rules:
- Semver compare is numeric per segment (`1.10.0` > `1.9.0`).
- `changes` collects every changelog entry for versions newer than the
  user's semver, up to and including the latest.
- If the user has no tag yet (fresh org), `hasUpdate` is false and
  `changes` is empty — nothing to catch up on, they start at latest.
- Theme flips are detected when the latest release pins a different
  theme than the user's tag; the UI can surface that separately.
