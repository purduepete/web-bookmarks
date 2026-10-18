[CmdletBinding()]
param(
    [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot),
    [Parameter(Mandatory)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($RepositoryRoot)
$output = [IO.Path]::GetFullPath($OutputDirectory)
$api = Join-Path $root 'src\WebBookmarks.Api\WebBookmarks.Api.csproj'
$client = Join-Path $root 'src\WebBookmarks.Client'
$tool = Join-Path $root 'migration-tool\WebBookmarks.Migration.csproj'
$deploy = Join-Path $root 'deploy'
if(Test-Path $output){throw "Output already exists; inspect before retry: $output"}
New-Item -ItemType Directory -Path $output -Force|Out-Null
& dotnet publish $api -c Release -o $output --nologo
if($LASTEXITCODE){throw 'API publish failed.'}
$toolStage=Join-Path $output '.migration-tool-stage'
& dotnet publish $tool -c Release -o $toolStage --nologo
if($LASTEXITCODE){throw 'Migration utility publish failed.'}
Push-Location $client
try{
    & npm.cmd ci --no-audit --no-fund
    if($LASTEXITCODE){throw 'Client dependency installation failed.'}
    & npm.cmd run build
    if($LASTEXITCODE){throw 'Client build failed.'}
}finally{Pop-Location}
$wwwroot=Join-Path $output 'wwwroot'
New-Item -ItemType Directory -Path $wwwroot -Force|Out-Null
Copy-Item (Join-Path $client 'dist\*') $wwwroot -Recurse -Force
Copy-Item $deploy (Join-Path $output 'deploy') -Recurse -Force
$toolOutput=Join-Path $output 'deploy\migration-tool'
New-Item -ItemType Directory -Path $toolOutput -Force|Out-Null
Copy-Item (Join-Path $toolStage '*') $toolOutput -Recurse -Force
Remove-Item $toolStage -Recurse -Force
if(-not(Test-Path (Join-Path $wwwroot 'index.html'))){throw 'Client index.html missing from published site.'}
$commit=(& git -C $root rev-parse HEAD).Trim()
$record=@{sourceCommit=$commit;builtLocal=[DateTimeOffset]::Now.ToString('o');apiAssemblySHA256=(Get-FileHash (Join-Path $output 'WebBookmarks.Api.dll')).Hash.ToLowerInvariant();clientIndexSHA256=(Get-FileHash (Join-Path $wwwroot 'index.html')).Hash.ToLowerInvariant();migrationAssemblySHA256=(Get-FileHash (Join-Path $toolOutput 'WebBookmarks.Migration.dll')).Hash.ToLowerInvariant()}
$record|ConvertTo-Json|Set-Content (Join-Path $output 'build.json')
$record|ConvertTo-Json
