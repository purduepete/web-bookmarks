#requires -Version 7.5
[CmdletBinding()]
param(
    [string]$Commit = 'HEAD',
    [switch]$VerifyOnly,
    [ValidatePattern('^[a-f0-9]{40}$')][string]$GistRevision,
    [string]$RecordDirectory = '\\jimbrownhome1.local\c$\ProgramData\SolutionDeploy\apps\solution-deploy\data\releases'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$script:GistId = '7e7bb1d0855d688bf683069e786ac524'
$script:BundleName = 'webbookmarks-palette.user.js'

function Invoke-UserscriptTool {
    param([string]$Name, [string[]]$Arguments, [string]$Repository, [switch]$Capture)
    $tool = (Get-Command $Name -CommandType Application | Select-Object -First 1).Source
    Invoke-DeploymentCommand $tool $Arguments $Repository -Capture:$Capture
}

function Get-UserscriptGist {
    param([string]$Repository)
    $json = Invoke-UserscriptTool gh @('api', "gists/$script:GistId") $Repository -Capture
    $json | ConvertFrom-Json -AsHashtable -DateKind String
}

function Get-UserscriptRaw {
    param([hashtable]$Gist)
    (Invoke-WebRequest -Uri $Gist.files[$script:BundleName].raw_url -TimeoutSec 30).Content
}

function Get-UserscriptVersion {
    param([string]$Content)
    if ($Content -notmatch '(?m)^// @version\s+(\d+\.\d+\.\d+)\s*$') {
        throw 'Userscript metadata must contain a numeric three-part @version.'
    }
    [version]$Matches[1]
}

function Invoke-UserscriptRelease {
    param([string]$Repository, [string]$Commit, [switch]$VerifyOnly, [string]$GistRevision, [string]$RecordDirectory)
    if ($GistRevision -and -not $VerifyOnly) { throw '-GistRevision requires -VerifyOnly.' }
    $sourceCommit = Resolve-CommonReleaseSource $Repository $Commit
    $temporary = Join-Path ([IO.Path]::GetTempPath()) ('web-bookmarks-gist-' + [guid]::NewGuid().ToString('N'))
    [IO.Directory]::CreateDirectory($temporary) | Out-Null
    try {
        $archivePath = Join-Path $temporary 'userscript.zip'
        Invoke-UserscriptTool git @('archive', '--format=zip', "--output=$archivePath", $sourceCommit,
            "tampermonkey/$script:BundleName", 'tampermonkey/src/header.txt') $Repository
        Expand-Archive -LiteralPath $archivePath -DestinationPath $temporary
        $bundlePath = Join-Path $temporary "tampermonkey\$script:BundleName"
        $headerPath = Join-Path $temporary 'tampermonkey\src\header.txt'
        $bundle = [IO.File]::ReadAllText($bundlePath).Replace("`r`n", "`n")
        $header = [IO.File]::ReadAllText($headerPath).Replace("`r`n", "`n").TrimEnd()
        if (-not $bundle.StartsWith($header + "`n")) { throw 'Committed bundle metadata differs from src/header.txt. Rebuild and commit first.' }
        $version = Get-UserscriptVersion $bundle
        $gist = Get-UserscriptGist $Repository
        $published = (Get-UserscriptRaw $gist).Replace("`r`n", "`n")
        if ($GistRevision -and $gist.history[0].version -cne $GistRevision) {
            throw 'The requested Gist revision is no longer current. Nothing was published or recorded.'
        }
        if ($published -cne $bundle) {
            if ($VerifyOnly) { throw 'Published Gist differs from the committed bundle. Nothing was recorded.' }
            if ($version -le (Get-UserscriptVersion $published)) { throw 'Increase @version before publishing changed userscript content.' }
            Invoke-UserscriptTool gh @('gist', 'edit', $script:GistId, '-f', $script:BundleName, $bundlePath) $Repository
            $gist = Get-UserscriptGist $Repository
            $published = (Get-UserscriptRaw $gist).Replace("`r`n", "`n")
            if ($published -cne $bundle) { throw 'Gist upload did not verify against the committed bundle. Nothing was recorded.' }
        }
        $revision = [string]$gist.history[0].version
        if ($revision -cnotmatch '^[a-f0-9]{40}$') { throw 'The verified Gist has no immutable revision.' }
        $completed = [DateTimeOffset]::Parse([string]$gist.history[0].committed_at).ToLocalTime().ToString('o')
        $record = @{
            app = 'web-bookmarks'
            component = 'tampermonkey'
            sourceCommit = $sourceCommit
            completedLocal = $completed
            version = $version.ToString()
            gistRevision = $revision
        }
        [IO.Directory]::CreateDirectory($RecordDirectory) | Out-Null
        $recordPath = Join-Path $RecordDirectory 'web-bookmarks--tampermonkey.json'
        Write-DeploymentJson $recordPath $record
        $saved = Read-DeploymentJson $recordPath
        foreach ($key in $record.Keys) {
            if ($saved[$key] -cne $record[$key]) { throw "Release record verification failed for $key." }
        }
        $record
    } finally {
        Remove-Item -LiteralPath $temporary -Recurse -Force
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    $repository = Split-Path -Parent $PSScriptRoot
    $deployment = Join-Path (Split-Path -Parent $repository) 'solution-deploy\src\CommonRelease.psm1'
    Import-Module $deployment -DisableNameChecking
    Import-Module (Join-Path (Split-Path -Parent $deployment) 'Deployment.psm1') -DisableNameChecking
    Invoke-UserscriptRelease -Repository $repository -Commit $Commit -VerifyOnly:$VerifyOnly `
        -GistRevision $GistRevision -RecordDirectory $RecordDirectory
}
