# API Key Authentication — Maintenance Guide

This is the operations runbook for the shared-key authentication that protects the
WebBookmarks API. Read this before rotating the key, debugging `401`s, or turning
auth on/off.

## How it works

The API accepts requests only when they carry a valid `X-Api-Key` header. A single
shared secret (the "API key") is compared in constant time against the configured
value. There are **no user accounts** — it's one key shared by all clients.

```
┌──────────────┐   X-Api-Key: <key>   ┌────────────────────┐
│  Web app     │ ───────────────────▶ │                    │
│  (browser)   │                      │   WebBookmarks API  │
├──────────────┤   X-Api-Key: <key>   │  (App Service)      │
│  Tampermonkey│ ───────────────────▶ │                    │
│  palette     │                      │  middleware checks  │
└──────────────┘                      │  ApiKey config      │
                                       └────────────────────┘
        missing / wrong key  ──▶  401 Unauthorized
```

**Enforcement is opt-in:** if the `ApiKey` configuration value is empty or unset,
the middleware is skipped and the API stays open. Setting a non-empty value turns
enforcement on. (`OPTIONS` preflight and `/swagger` always pass through.)

Implementation: `src/WebBookmarks.Api/Program.cs` (middleware + `KeysMatch` helper).

## Where the key lives (4 places)

The **same** secret value must be present in all of these for the system to work
end-to-end. If you change it, change it everywhere.

| # | Location | Stored as | Used by |
| - | -------- | --------- | ------- |
| 1 | API — local dev | .NET User Secrets (`ApiKey`) | `dotnet run` on your machine |
| 2 | API — production | Azure App Service app setting (`ApiKey`) | the deployed API |
| 3 | Web app | Browser `localStorage` key `webbookmarks_api_key` | the React client |
| 4 | Tampermonkey palette | `GM_setValue('apiKey', ...)` per browser | the userscript |

> Items 3 and 4 are **per-browser/per-device** — every browser you use must have the
> key entered once.

## Creating a key

The key is any hard-to-guess string you invent — there's no registration.

```powershell
# Generate a random 32-char key
[guid]::NewGuid().ToString('N')
```

## Setting / rotating the key

Do these in order. Set the **server** first, then update the clients, so you don't
lock yourself out mid-change.

### 1. API — local dev (User Secrets)

```bash
cd src/WebBookmarks.Api
dotnet user-secrets set "ApiKey" "YOUR_SECRET_KEY"
# verify
dotnet user-secrets list
```

### 2. API — production (App Service)

```bash
az webapp config appsettings set -g webbookmarks -n webbookmarksapi \
  --settings ApiKey="YOUR_SECRET_KEY"

# verify the value actually saved (the set command redacts it as null in output)
az webapp config appsettings list -g webbookmarks -n webbookmarksapi \
  --query "[?name=='ApiKey'].value" -o tsv
```

Changing an app setting **restarts** the App Service automatically, so the new key
takes effect within a few seconds.

### 3. Web app

Open the web app. If the stored key is now wrong, the first failed request returns
`401`, which clears the stored key and shows the unlock prompt again — enter the new
key. To reset manually: clear `localStorage` for the site, or run in the console:

```js
localStorage.removeItem('webbookmarks_api_key');
```

### 4. Tampermonkey palette

In the Tampermonkey menu (on any page where the script runs), choose
**Set WebBookmarks API Key** and paste the new value. Repeat in every browser/profile.

## Updating the Tampermonkey gist

The userscript that browsers actually run is served from a **GitHub gist**, not this
repo. The repo copy at `tampermonkey/webbookmarks-palette.user.js` is the source of
truth; the gist is the deployment target.

- Gist ID: `7e7bb1d0855d688bf683069e786ac524`
- The script's `@updateURL` / `@downloadURL` point at this gist's raw URL.

After changing the script in the repo (and bumping `@version`), publish it:

```bash
# from the repo root, push the current main version to the gist
git show origin/main:tampermonkey/webbookmarks-palette.user.js > palette.user.js
gh gist edit 7e7bb1d0855d688bf683069e786ac524 -f webbookmarks-palette.user.js palette.user.js
del palette.user.js   # (rm on macOS/Linux)
```

Tampermonkey picks up the new `@version` on its next update check; you can force it
from the Tampermonkey dashboard (**Check for userscript updates**).

> Always bump `@version` when you change the script, or Tampermonkey won't update it.

## Disabling auth

Set `ApiKey` to an empty string (or remove the setting) on the API:

```bash
az webapp config appsettings set -g webbookmarks -n webbookmarksapi --settings ApiKey=""
```

With auth disabled, the API ignores the header, so existing clients keep working.

## Troubleshooting

| Symptom | Likely cause | Fix |
| ------- | ------------ | --- |
| Web app keeps showing the unlock prompt | Stored key doesn't match the server key | Re-enter the current key; confirm prod `ApiKey` value |
| Palette stops loading bookmarks (after enabling auth) | Gist not updated, or key not set in Tampermonkey | Update the gist; run **Set WebBookmarks API Key** |
| All requests 401 right after rotation | Clients still have the old key | Update key in web app + Tampermonkey (steps 3–4) |
| Requests succeed without any key | Auth is disabled | `ApiKey` is empty/unset on the API — set a value |
| CORS error mentioning `X-Api-Key` | Preflight didn't allow the header | Ensure the API/App Service CORS allows the `X-Api-Key` request header |

## File reference

| Concern | File |
| ------- | ---- |
| API middleware + key compare | `src/WebBookmarks.Api/Program.cs` |
| `ApiKey` config placeholder | `src/WebBookmarks.Api/appsettings.json` |
| Client key storage helpers | `src/WebBookmarks.Client/src/auth.ts` |
| Header injection + 401 handling | `src/WebBookmarks.Client/src/api.ts` (`apiFetch`) |
| Login gate UI | `src/WebBookmarks.Client/src/components/AuthGate.tsx` |
| Userscript (repo source) | `tampermonkey/webbookmarks-palette.user.js` |
