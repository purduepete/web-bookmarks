[CmdletBinding()]
param([Parameter(Mandatory)][string]$ReleasePath,[Parameter(Mandatory)][string]$SourceSnapshotPath)
$ErrorActionPreference='Stop'
if((Get-CimInstance Win32_ComputerSystemProduct).UUID -ne '4B3D9000-B6D0-11EA-91A7-1B5B997B1500'){throw 'Wrong database host.'}
$archive='C:\ProgramData\SolutionDeploy\archives\web-bookmarks-migration-20261018'
if(Test-Path (Join-Path $archive 'import-result-summary.json')){throw 'Import already completed; inspect evidence before retry.'}
$hostInfo=Get-Content (Join-Path $archive 'host.json') -Raw|ConvertFrom-Json
$databaseInfo=Get-Content (Join-Path $archive 'database-ready.json') -Raw|ConvertFrom-Json
$migrator=$databaseInfo.roles.migrator
$owner=$databaseInfo.roles.owner
$runtime=$databaseInfo.roles.runtime
function Read-Password([string]$Path){
    $parts=[IO.File]::ReadAllText($Path).TrimEnd("`r","`n").Split(':')
    if($parts.Count -ne 5){throw 'Protected PostgreSQL password file has an invalid shape.'}
    $parts[4]
}
$migratorPassword=Read-Password (Join-Path $archive "$migrator.pgpass")
$runtimePassword=Read-Password (Join-Path 'C:\ProgramData\SolutionDeploy\apps\web-bookmarks\shared\secrets' "$runtime.pgpass")
$tool=Join-Path $ReleasePath 'deploy\migration-tool\WebBookmarks.Migration.dll'
if(-not(Test-Path $tool) -or -not(Test-Path $SourceSnapshotPath)){throw 'Migration utility or protected source snapshot is missing.'}
try{
    $env:WEBBOOKMARKS_MIGRATOR_CONNECTION="Host=127.0.0.1;Port=5432;Database=web_bookmarks;Username=$migrator;Password=$migratorPassword;Options=-c role=$owner;Timeout=15;Command Timeout=60"
    & $hostInfo.dotnetPath $tool import $SourceSnapshotPath > (Join-Path $archive 'import-result.json')
    if($LASTEXITCODE){throw 'Target import failed.'}
    $env:WEBBOOKMARKS_MIGRATOR_CONNECTION="Host=127.0.0.1;Port=5432;Database=web_bookmarks;Username=$runtime;Password=$runtimePassword;Timeout=15;Command Timeout=60"
    & $hostInfo.dotnetPath $tool compare $SourceSnapshotPath > (Join-Path $archive 'import-compare-result.json')
    if($LASTEXITCODE){throw 'Post-import row comparison failed.'}
    $import=Get-Content (Join-Path $archive 'import-result.json') -Raw|ConvertFrom-Json
    $compare=Get-Content (Join-Path $archive 'import-compare-result.json') -Raw|ConvertFrom-Json
    if($import.rows -ne $compare.rows -or -not $compare.everyRowMatched){throw 'Post-import row parity did not pass.'}
    $record=@{status='Compared';rows=$compare.rows;sourceSnapshotSHA256=$compare.sourceSnapshotSha256;targetSnapshotSHA256=$compare.targetSnapshotSha256;everyRowMatched=$compare.everyRowMatched;importedLocal=[DateTimeOffset]::Now.ToString('o')}
    $record|ConvertTo-Json -Depth 4|Set-Content (Join-Path $archive 'import-result-summary.json')
    $record|ConvertTo-Json -Depth 4
}finally{
    $migratorPassword=$null;$runtimePassword=$null
    $env:WEBBOOKMARKS_MIGRATOR_CONNECTION=$null
}
