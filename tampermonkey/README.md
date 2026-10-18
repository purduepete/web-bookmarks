# WebBookmarks Command Palette (Tampermonkey userscript)

A userscript that brings the WebBookmarks command palette to any page. It reaches the API through the private Tailscale URL, so the browser must be connected to the tailnet. Press
`Ctrl+Alt+/` to open it, search/filter bookmarks, and navigate.

## Architecture — one source of truth

The palette's **pure logic** (wildcard matching, number-selection parsing, URL
resolution, entry filtering, bookmark numbering, MRU) lives in a shared module,
**not** in this userscript:

```
src/WebBookmarks.Client/src/palette-core/   ← shared, tested (vitest)
```

Both surfaces consume it:

- the **React web app** (`CommandPalette.tsx`) imports it directly, and
- **this userscript** is **built** so the same module is bundled in.

So a fix to the filtering/matching/MRU logic is made **once** in `palette-core`
and both surfaces get it. Only host-specific code (DOM, `GM_*`, keyboard
handling, styling) is genuinely different between the two.

## Files

| File | Role |
|------|------|
| `src/palette.user.js` | **Source** — the userscript body; imports from `palette-core`. Edit this. |
| `src/header.txt` | The `==UserScript==` metadata block. **`@version` lives here.** |
| `build.mjs` | esbuild build: bundles the source + core, prepends `header.txt` as a banner. |
| `webbookmarks-palette.user.js` | **Generated output** — the shippable file. **Do not edit by hand** (it is overwritten on every build). |

## Production endpoint

The API endpoint is `https://jimbrownhome1.tail8ad282.ts.net:8792/api/bookmarks`. The public web app is `https://web-bookmarks.jimlertech.com`; Cloudflare Access restricts it to Microsoft identities. The userscript does not need an API key.

## Build

```bash
cd tampermonkey
npm install        # first time only
npm run build      # regenerates webbookmarks-palette.user.js
```

## Distribution

The userscript ships via a **GitHub Gist**, referenced by the `@updateURL` /
`@downloadURL` in `header.txt`. It is **not** deployed by the GitHub Actions
workflow (that only deploys the API + web app). Tampermonkey only auto-updates a
client when `@version` **increases**.

Gist id: `7e7bb1d0855d688bf683069e786ac524`

## Publish checklist (any userscript change)

1. Edit the **source** — `src/palette.user.js` for host-specific behavior, or
   `../src/WebBookmarks.Client/src/palette-core/*` for shared logic (run its
   vitest suite: `cd ../src/WebBookmarks.Client && npm test`).
2. **Bump `@version`** in `src/header.txt` (never in the generated file — it's
   overwritten).
3. **Build:** `npm run build` (regenerates `webbookmarks-palette.user.js`).
4. Commit **both** the source and the regenerated file.
5. **Update the Gist** with the freshly built file:
   ```bash
   gh gist edit 7e7bb1d0855d688bf683069e786ac524 \
     -f "webbookmarks-palette.user.js" "tampermonkey/webbookmarks-palette.user.js"
   ```

> ⚠️ Always **build before updating the Gist** — otherwise the Gist ships a stale
> bundle. And bump the version, or Tampermonkey clients won't pick up the change.
