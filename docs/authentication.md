# Authentication guide

Production access is controlled by Cloudflare Access and Tailscale. Local development and the retained Azure rollback can use the legacy `ApiKey` middleware.

## Production gateway

Cloudflare Access restricts `https://web-bookmarks.jimlertech.com` to Microsoft identities. Tailscale serves the app at `https://jimbrownhome1.tail8ad282.ts.net:8792`; the API binds to `127.0.0.1:8792` on the host. Both routes reach the same API, which runs with `GatewayAuth=true` and does not request an additional API key.

The React app uses same-origin `/api` requests. Tampermonkey uses `https://jimbrownhome1.tail8ad282.ts.net:8792/api/bookmarks`, so its browser must be connected to Tailscale. The userscript sends no API key.

## Local development and Azure rollback

With gateway mode disabled, the API can enforce `X-Api-Key` when `ApiKey` is configured. The middleware compares the supplied key in constant time. It exempts `OPTIONS`, `/swagger`, and `/healthz`. Without `GatewayAuth` or `ApiKey`, legacy mode has no authentication, so do not expose that configuration to an untrusted network.

Store a development key in .NET User Secrets:

```powershell
cd src/WebBookmarks.Api
dotnet user-secrets set "ApiKey" "YOUR_SECRET_KEY"
```

The production URL is `https://web-bookmarks.jimlertech.com`. The Azure hosting was deleted on 2026-10-18.

## Tampermonkey userscript

The current script calls the private Tailscale API URL and does not prompt for a key. Keep Tailscale connected on the browser device. The browser also needs access to `web-bookmarks.jimlertech.com` through Microsoft-only Cloudflare Access to use the public UI.

The userscript source is in `tampermonkey/src/`. After a source change, bump `@version` in `tampermonkey/src/header.txt`, run `npm run build` from `tampermonkey`, commit the regenerated `webbookmarks-palette.user.js`, then update Gist `7e7bb1d0855d688bf683069e786ac524` with that generated file. Tampermonkey downloads the new version on its next update check.

## Troubleshooting

| Symptom | Likely cause | Fix |
| ------- | ------------ | --- |
| Public site redirects to Microsoft sign-in | Cloudflare Access is active | Sign in with an allowed Microsoft identity |
| Private site does not load | Device is off Tailscale or port 8792 is unavailable | Connect Tailscale; check Tailscale Serve and the managed app task |
| Tampermonkey cannot load bookmarks | Browser is off Tailscale or the private API URL is stale | Connect Tailscale and verify the API URL in `tampermonkey/src/palette.user.js` |
| Azure rollback returns 401 | Its legacy `ApiKey` is configured and client key is stale | Update the rollback setting and legacy client key, or restore the previous setting |
| Production browser reports a CORS error | The public UI is using a cross-origin API base URL | Use same-origin `/api` for the public app; Tampermonkey uses its private endpoint |

## File reference

| Concern | File |
| ------- | ---- |
| Gateway and legacy API-key middleware | `src/WebBookmarks.Api/Program.cs` |
| `ApiKey` placeholder | `src/WebBookmarks.Api/appsettings.json` |
| Legacy client key storage | `src/WebBookmarks.Client/src/auth.ts` |
| API request URL and key handling | `src/WebBookmarks.Client/src/api.ts` |
| Gateway-mode login gate | `src/WebBookmarks.Client/src/components/AuthGate.tsx` |
| Userscript source | `tampermonkey/src/palette.user.js` |
