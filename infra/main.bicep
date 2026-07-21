targetScope = 'resourceGroup'

@description('Primary location for all resources')
param location string = resourceGroup().location

@description('Base name for all resources')
param baseName string = 'webbookmarks'

@description('SQL database name')
param sqlDatabaseName string = 'webportfolio'

@description('Name of the shared Azure SQL logical server')
param sharedSqlServerName string = 'sqlgkhw25ijhyzzy'

@description('Resource group that holds the shared Azure SQL server')
param sharedSqlResourceGroup string = 'investmentportfolio'

// Reference the shared Azure SQL server (lives in another resource group).
// webbookmarks connects with its system-assigned identity via a
// CREATE USER ... FROM EXTERNAL PROVIDER grant managed out-of-band on the
// shared database (DB-altering changes are reviewed before running).
resource sharedSql 'Microsoft.Sql/servers@2023-08-01-preview' existing = {
  name: sharedSqlServerName
  scope: resourceGroup(sharedSqlResourceGroup)
}

// ── App Service Plan (F1 Free) ──────────────────────────────────────

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${baseName}-plan'
  location: location
  sku: {
    name: 'F1'
    tier: 'Free'
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

// ── App Service (API) ───────────────────────────────────────────────

resource apiApp 'Microsoft.Web/sites@2023-12-01' = {
  name: '${baseName}api'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      linuxFxVersion: 'DOTNETCORE|9.0'
      healthCheckPath: '/healthz'
      connectionStrings: [
        {
          name: 'WebBookmarksDatabase'
          connectionString: 'Server=tcp:${sharedSql.properties.fullyQualifiedDomainName},1433;Database=${sqlDatabaseName};Authentication=Active Directory Default;Encrypt=True;TrustServerCertificate=False;'
          type: 'SQLAzure'
        }
      ]
      // CORS is owned by the app (Program.cs reads Cors:AllowedOrigins) rather
      // than App Service platform CORS, so there's a single, source-controlled
      // mechanism. The API key must be supplied separately as a secret setting.
      appSettings: [
        {
          name: 'Cors__AllowedOrigins__0'
          value: 'https://${staticWebApp.properties.defaultHostname}'
        }
      ]
    }
    httpsOnly: true
  }
}

// ── Static Web App (Frontend, Free) ─────────────────────────────────
// Free SKU: no linkedBackend (Standard-only). The SPA calls the App
// Service API origin directly; CORS is handled in Program.cs.

resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: '${baseName}-web'
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    buildProperties: {
      appLocation: 'src/WebBookmarks.Client'
      outputLocation: 'dist'
    }
  }
}

// ── Outputs ─────────────────────────────────────────────────────────

output apiAppName string = apiApp.name
output staticWebAppName string = staticWebApp.name
output staticWebAppHostname string = staticWebApp.properties.defaultHostname
output apiPrincipalId string = apiApp.identity.principalId
