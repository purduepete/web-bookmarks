# Observability — Telemetry & Querying Guide

How to see what the WebBookmarks API is doing in production: where the telemetry
lives, how to query it (portal + CLI), ready-to-paste KQL queries, and the alert
that emails you when things break.

## What's wired up

The API sends telemetry to **Azure Application Insights** via the
`Microsoft.ApplicationInsights.AspNetCore` package (`AddApplicationInsightsTelemetry()`
in `Program.cs`). It auto-collects **requests, dependencies (incl. SQL), exceptions,
and traces** — no per-endpoint code needed.

| Thing | Value |
| ----- | ----- |
| App Insights component | `webbookmarks-insights` |
| Log Analytics workspace | `webbookmarks-logs` (backs the component; 30-day retention) |
| Resource group | `webbookmarks` |
| API App Service | `webbookmarksapi` |
| App setting that enables it | `APPLICATIONINSIGHTS_CONNECTION_STRING` |
| Error alert rule | `wb-api-failed-requests` (>5 failed requests / 5 min) |
| Alert action group | `wb-alerts` → emails `jimbrown368@icloud.com` |

> **Cost:** ingestion is free up to **5 GB/month** (this app uses far less) and
> retention is free for the first 31 days, so telemetry effectively costs **$0**.
> The metric alert is within the free time-series allowance. There is **no** paid
> availability/ping test configured.

> **Note:** GitHub Actions deploys **code only**, not Bicep. The
> `APPLICATIONINSIGHTS_CONNECTION_STRING` app setting was applied directly to the
> live App Service; it persists across code deploys. If the API is ever recreated,
> re-apply it (see *Re-wiring* at the bottom).

---

## Querying in the Azure Portal (easiest)

1. Portal → **Application Insights** → **`webbookmarks-insights`**.
2. Left nav → **Monitoring → Logs**. Close the "Queries" popup.
3. Paste any query from below into the editor and click **Run**.
   - Adjust the time range with the **Time range** picker (or the `ago(...)` in the query).

For quick visuals without KQL, the **Failures**, **Performance**, and **Live Metrics**
blades (also under Monitoring) are pre-built dashboards.

---

## Querying from the command line

Run a KQL query with the Azure CLI (needs the `application-insights` extension,
which installs on first use):

```powershell
# Get the App Insights app id once
$appId = az monitor app-insights component show `
  --app webbookmarks-insights -g webbookmarks --query appId -o tsv

# Run any KQL query
az monitor app-insights query --app $appId `
  --analytics-query "requests | where timestamp > ago(1h) | summarize count() by resultCode" `
  -o table
```

> Telemetry takes ~2–5 minutes to ingest before it's queryable.

---

## Ready-to-use KQL queries

### Request volume & status codes (last hour)
```kusto
requests
| where timestamp > ago(1h)
| summarize count() by name, resultCode
| order by count_ desc
```

### Failures only (4xx/5xx)
```kusto
requests
| where timestamp > ago(24h) and success == false
| summarize failures = count() by name, resultCode
| order by failures desc
```

### Server errors (5xx) over time — the thing the alert watches
```kusto
requests
| where timestamp > ago(24h) and toint(resultCode) >= 500
| summarize errors = count() by bin(timestamp, 5m)
| render timechart
```

### Slowest endpoints (p95 latency)
```kusto
requests
| where timestamp > ago(24h)
| summarize p95_ms = percentile(duration, 95), calls = count() by name
| order by p95_ms desc
```

### SQL dependency health (calls, failures, duration)
```kusto
dependencies
| where timestamp > ago(24h) and type == "SQL"
| summarize calls = count(),
            failures = countif(success == false),
            p95_ms = percentile(duration, 95)
  by target
```

### Exceptions
```kusto
exceptions
| where timestamp > ago(24h)
| summarize count() by type, outerMessage
| order by count_ desc
```

### Health-check history (`/healthz`)
```kusto
requests
| where timestamp > ago(24h) and url endswith "/healthz"
| summarize total = count(),
            unhealthy = countif(toint(resultCode) >= 500)
  by bin(timestamp, 1h)
| order by timestamp desc
```

### Traffic by endpoint (which features get used)
```kusto
requests
| where timestamp > ago(7d) and url contains "/api/bookmarks"
| summarize hits = count() by name
| order by hits desc
```

### Recent failed requests with details (for debugging an incident)
```kusto
requests
| where timestamp > ago(2h) and success == false
| project timestamp, name, resultCode, duration, operation_Id
| order by timestamp desc
| take 50
```

> To trace one failing request end-to-end, copy its `operation_Id` and run:
> `union requests, dependencies, exceptions, traces | where operation_Id == "<id>" | order by timestamp asc`

---

## The error alert

`wb-api-failed-requests` fires when the API records **more than 5 failed requests
in any 5-minute window**, and emails the `wb-alerts` action group.

```powershell
# View the rule
az monitor metrics alert show -n wb-api-failed-requests -g webbookmarks -o yaml

# Temporarily disable / re-enable
az monitor metrics alert update -n wb-api-failed-requests -g webbookmarks --enabled false
az monitor metrics alert update -n wb-api-failed-requests -g webbookmarks --enabled true

# Change recipients
az monitor action-group update -n wb-alerts -g webbookmarks `
  --add-action email jim someone@example.com
```

> First time only: Azure sends a confirmation email when an address is added to an
> action group. The recipient should accept it so alerts aren't filtered.

### (Optional) add a paid availability ping test
Not configured (it costs ~$2/month). If you want proactive "the API is down"
detection even when no one's using it, add a **Standard test** in the App Insights
**Availability** blade pointed at `https://webbookmarksapi.azurewebsites.net/healthz`
(expect `200`).

---

## Re-wiring after an API rebuild

If `webbookmarksapi` is recreated, telemetry stops until the connection string is
re-applied:

```powershell
$conn = az monitor app-insights component show `
  --app webbookmarks-insights -g webbookmarks --query connectionString -o tsv
az webapp config appsettings set -g webbookmarks -n webbookmarksapi `
  --settings "APPLICATIONINSIGHTS_CONNECTION_STRING=$conn"
```
