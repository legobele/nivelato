# Design Tokens — single source of truth

**Nivelato's shared token file.** Both codebases consume this:

- **Web** (`nivelato-repo`): `tokens.css` (`:root` custom properties) — link it in pages and reference `var(--brand)` etc. instead of hardcoded hex values.
- **Android** (`nivelato-android`): `tokens.json` — today the app is a WebView serving the same web code, so it consumes the same CSS; the future native Compose port maps tokens to the Material3 roles listed in `nivelato-design-system/design-system.md` §1.

## Files

| File | Purpose |
|---|---|
| `tokens.json` | The tokens, machine-readable. **This is the source of truth.** |
| `tokens.css` | `:root` CSS custom properties mirroring `tokens.json`, for web pages. |

## Rules

1. Update `tokens.json` first, then regenerate `tokens.css` to match — never the reverse.
2. Values must match `~/workspace/nivelato-design-system/design-system.md` §1 (and the conflict resolutions in §0).
3. Easter eggs (`estradiol.js`, `italiano.js`, `gay.js`) intentionally override token slots at runtime — do not "fix" them back to base tokens.
4. New components must use tokens — no new hardcoded hex values.

## Validating

```bash
python3 -c "import json; json.load(open('design-tokens/tokens.json')); print('tokens.json: válido')"
```
