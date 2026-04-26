# Web Bookmarks

A personal bookmark manager with a .NET 9 API and React frontend, deployed to Azure.

## Architecture

| Component | Technology                      | Azure Host                   |
| --------- | ------------------------------- | ---------------------------- |
| Frontend  | React 19 + Vite + Bootstrap 5   | Azure Static Web Apps (Free) |
| API       | .NET 9 Minimal API + EF Core    | Azure App Service (B1)       |
| Database  | SQL Server                      | Azure SQL (Basic)            |
| Auth      | Managed Identity (passwordless) | —                            |

## Features

- **Bookmark groups** — organized sidebar with filtering and one-click navigation
- **Shortcut aliases** — type a shortcut in the prompt to navigate instantly
- **Create / Edit bookmarks** — modal form with group dropdown (existing or new)
- **Alias conflict detection** — warns on partial matches (e.g. `_stwp` vs `_stwpl`) both in the modal and inline with ⚠ icons
- **Show / Hide hidden bookmarks** — toggle to reveal hidden bookmarks (dimmed at 40% opacity)
- **Prompt mode** — optional browser prompt for quick shortcut-based navigation

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
- Azure CLI (for managed identity local auth)

### API

```bash
# Set your local dev connection string via User Secrets
cd src/WebBookmarks.Api
dotnet user-secrets set "ConnectionStrings:WebBookmarksDatabase" "Server=tcp:YOUR_SERVER.database.windows.net,1433;Database=webportfolio;Authentication=Active Directory Default;"

dotnet run
# → http://localhost:5288  (Swagger at /swagger)
```

### Frontend

```bash
cd src/WebBookmarks.Client
npm install
npm run dev
# → http://localhost:5173  (proxies /api → localhost:5288)
```

## Pre-commit Hooks

A git pre-commit hook runs TypeScript (`tsc`) and .NET build checks before every commit. It is automatically configured when you run `.\start.ps1`, or you can set it up manually:

```bash
git config core.hooksPath .githooks
```

To skip in an emergency: `git commit --no-verify`

## Deployment

### Option 1: Azure Developer CLI (recommended)

```bash
azd init
azd up
```

### Option 2: GitHub Actions

1. Set these repository secrets:
    - `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` (for OIDC login)
    - `SWA_DEPLOYMENT_TOKEN` (from your Static Web App)
2. Push to `main` — the workflow builds and deploys both projects.

### Option 3: Manual

```bash
# API
dotnet publish src/WebBookmarks.Api -c Release -o ./publish
az webapp deploy --resource-group webbookmarkapi --name webbookmarks-api --src-path ./publish

# Frontend
cd src/WebBookmarks.Client && npm run build
# Deploy dist/ to Static Web Apps via SWA CLI or Azure Portal
```

## Infrastructure

Deploy Azure resources with Bicep:

```bash
az deployment group create \
  --resource-group webbookmarkapi \
  --template-file infra/main.bicep \
  --parameters infra/main.parameters.json \
  --parameters sqlAdminLogin=YOUR_ADMIN sqlAdminPassword=YOUR_PASSWORD
```

This provisions: App Service Plan, App Service (with managed identity), Static Web App, Azure SQL Server + Database, and links the SWA backend.

## Live URLs

| Component | URL                                                     |
| --------- | ------------------------------------------------------- |
| Web App   | https://witty-hill-00503bc10.7.azurestaticapps.net/     |
| API       | https://webbookmarksapi.azurewebsites.net/api/bookmarks |
