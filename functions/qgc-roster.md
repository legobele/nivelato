# QGC roster — who counts as Quality Glazing Contractors

The `qgcLogin` Cloud Function grants the QGC company tier only to emails
listed here. No Play SKU, no price — roster membership IS the license.

## Collection

`qgc-roster` — one document per employee.

- **Document ID:** the employee's login email, lowercased.
  Example: `qgc-roster/maria@qualityglazingpr.com`
- **Fields:**
  - `name` (string) — display name, e.g. "María Rivera"
  - `addedAt` (timestamp) — when they were added

## Managing it

Firebase console → Firestore Database → `qgc-roster` → Add document.
No deploy needed — the function reads the roster live on every login.

To revoke someone, delete their document. Their `qgc` claim stays on the
token until it refreshes (≤1h); to kill it instantly, remove the claim via
the Auth panel or re-run `qgcLogin` (it will now fail closed).

## Rules

No Firestore rule change needed: the function reads the roster with the
Admin SDK (bypasses rules), and clients never read this collection
(employee emails stay private).
