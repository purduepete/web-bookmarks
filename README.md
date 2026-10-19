# Web Bookmarks

A personal bookmark manager with a .NET 9 API, React frontend, and PostgreSQL database on `jimbrownhome1`.

## Architecture

| Component | Technology                      | Production host              |
| --------- | ------------------------------- | ---------------------------- |
| Frontend  | React 19 + Vite + Bootstrap 5   | .NET API static hosting on `jimbrownhome1` |
| API       | .NET 9 Minimal API + EF Core    | Windows service task, loopback port 8792 |
| Database  | PostgreSQL 18                   | `web_bookmarks`, `public` schema |
| Auth      | Microsoft-only Cloudflare Access and Tailscale | — |

## Features

- **Bookmark groups** — organized sidebar with filtering and one-click navigation
- **Shortcut aliases** — type a shortcut in the prompt to navigate instantly
- **Create / Edit bookmarks** — modal form with group dropdown (existing or new)
- **Alias conflict detection** — warns on partial matches (e.g. `_stwp` vs `_stwpl`) both in the modal and inline with ⚠ icons
- **Show / Hide hidden bookmarks** — toggle to reveal hidden bookmarks (dimmed at 40% opacity)
- **Prompt mode** — optional browser prompt for quick shortcut-based navigation
- **Access gate** — Microsoft-only Cloudflare Access protects the public site; Tailscale protects the private app endpoint

## Project Structure

```
src/
├── WebBookmarks.Api/        # .NET 9 Minimal API
└── WebBookmarks.Client/     # React + Vite (TypeScript)
infra/                        # Bicep infrastructure-as-code
.github/workflows/            # GitHub Actions CI/CD
azure.yaml                    # Azure Developer CLI manifest
```

## Local Development

### Quick Start

```powershell
.\start.ps1      # starts API + client dev servers, configures git hooks
.\stop.ps1        # stops both servers
```

### Prerequisites

- .NET 9 SDK
- Node.js 20+
- Azure CLI (for Azure SQL local development)

### API

```bash
# Set your local dev connection string via User Secrets
cd src/WebBookmarks.Api
dotnet user-secrets set "ConnectionStrings:WebBookmarksDatabase" "Server=tcp:YOUR_SERVER.database.windows.net,1433;Database=webportfolio;Authentication=Active Directory Default;"

dotnet run
# → http://localhost:5288  (Swagger at /swagger)
```

## Authentication

Production traffic enters through Microsoft-only Cloudflare Access or the Tailscale private service. In gateway mode, the API does not ask for an extra key. Local development and the retained Azure rollback continue to support the optional `ApiKey` middleware described in [`docs/authentication.md`](docs/authentication.md).

Local development and the retained Azure rollback can use `ApiKey` from User Secrets or an Azure App Service setting. Production sets `GatewayAuth=true`; Cloudflare Access and Tailscale control entry, so the browser and Tampermonkey script do not prompt for a second key.

> 📖 See [`docs/authentication.md`](docs/authentication.md) for the legacy API-key mode and production gateway setup.

### Frontend

```bash
cd src/WebBookmarks.Client
npm install
npm run dev
# → http://localhost:5173  (proxies /api → localhost:5288)
```

### Tampermonkey userscript

The command palette is also available as a Tampermonkey userscript. The script calls the private API through Tailscale, so the browser must be connected to the tailnet. It shares its
pure logic with the web app (via `src/WebBookmarks.Client/src/palette-core`) and
is **built** from source with esbuild — the shipped file is generated, so edit
`tampermonkey/src/`, not the generated `.user.js`.

```bash
cd tampermonkey
npm install
npm run build   # regenerates tampermonkey/webbookmarks-palette.user.js
```

> 📖 Build details, the file layout, and the publish checklist (bump version →
> build → update the Gist) are in [`tampermonkey/README.md`](tampermonkey/README.md).

## Pre-commit Hooks

A git pre-commit hook runs TypeScript (`tsc`) and .NET build checks before every commit. It is automatically configured when you run `.\start.ps1`, or you can set it up manually:

```bash
git config core.hooksPath .githooks
```

To skip in an emergency: `git commit --no-verify`

## Deployment

### Current production hosting

The production app runs on `jimbrownhome1`. Cloudflare Access restricts the public hostname to Microsoft identities, and Tailscale provides private access on port 8792. The API uses the local PostgreSQL 18 database `web_bookmarks` and listens only on loopback. The Tampermonkey script uses the private Tailscale URL, so the browser must be connected to the tailnet.

The Azure App Service (`webbookmarksapi`), its plan, and the Static Web App were deleted on 2026-10-18, along with the Azure deploy workflow. The original bookmark rows are still in the shared Azure SQL database.

## Infrastructure (retired Azure hosting)

`infra/main.bicep` recreates the old Azure hosting from scratch if it is ever needed:

```bash
az deployment group create \
  --resource-group jimbpersonal-rg \
  --template-file infra/main.bicep \
  --parameters infra/main.parameters.json \
  --parameters sqlAdminLogin=YOUR_ADMIN sqlAdminPassword=YOUR_PASSWORD
```

This provisions: App Service Plan, App Service (with managed identity), Static Web App, Azure SQL Server + Database, and links the SWA backend.

## Live URLs

| Component | URL                                                     |
| --------- | ------------------------------------------------------- |
| Web App   | https://web-bookmarks.jimlertech.com/ |
| Private app | https://jimbrownhome1.tail8ad282.ts.net:8792 |
| Tampermonkey API | https://jimbrownhome1.tail8ad282.ts.net:8792/api/bookmarks |

## Browser Setup: Allow Pop-ups

When opening multiple bookmarks via a shortcut, the browser needs permission to open multiple tabs. To allow pop-ups for this site:

### Edge

1. Go to `edge://settings/content/popups`
2. Under **Allow**, click **Add**
3. Enter the site URL (e.g. `https://web-bookmarks.jimlertech.com`)
4. Click **Add**

### Chrome

1. Go to `chrome://settings/content/popups`
2. Under **Allowed to send pop-ups and use redirects**, click **Add**
3. Enter the site URL
4. Click **Add**

### Safari (macOS)

1. Navigate to the site
2. Go to **Safari → Settings → Websites → Pop-up Windows**
3. Find the site in the list and set it to **Allow**

### Safari (iPad/iPhone)

1. Open **Settings → Safari**
2. Turn off **Block Pop-ups**

> Note: iOS/iPadOS Safari does not support per-site pop-up settings.
