$root = Split-Path -Parent $PSScriptRoot
Import-Module (Join-Path (Split-Path -Parent $root) 'solution-deploy\src\CommonRelease.psm1') -DisableNameChecking
Import-Module (Join-Path (Split-Path -Parent $root) 'solution-deploy\src\Deployment.psm1') -DisableNameChecking
. (Join-Path $PSScriptRoot 'Publish.ps1')

function Assert-PublishThrows([scriptblock]$Action, [string]$Message) {
    $caught = $null
    try { & $Action | Out-Null } catch { $caught = $_.Exception.Message }
    ($null -ne $caught) | Should Be $true
    $caught | Should BeLike $Message
}

Describe 'Userscript publication and release records' {
    BeforeEach {
        $script:commitId = 'a' * 40
        $script:revisionId = 'b' * 40
        $script:headerText = "// ==UserScript==`n// @version      4.9.39`n// ==/UserScript=="
        $script:bundleText = "$script:headerText`nconsole.log('palette');`n"
        $script:remoteText = $script:bundleText
        $script:records = Join-Path $TestDrive ([guid]::NewGuid().ToString('N'))
        Mock Resolve-CommonReleaseSource { $script:commitId }
        Mock Invoke-UserscriptTool {
            if ($Name -eq 'git') {
                $output = $Arguments | Where-Object { $_ -like '--output=*' }
                $zip = [IO.Compression.ZipFile]::Open($output.Substring(9), 'Create')
                try {
                    foreach ($entry in @(
                        @{ name = 'tampermonkey/webbookmarks-palette.user.js'; text = $script:bundleText },
                        @{ name = 'tampermonkey/src/header.txt'; text = $script:headerText }
                    )) {
                        $writer = [IO.StreamWriter]::new($zip.CreateEntry($entry.name).Open())
                        try { $writer.Write($entry.text) } finally { $writer.Dispose() }
                    }
                } finally { $zip.Dispose() }
            } elseif ($Name -eq 'gh') {
                $script:remoteText = $script:bundleText
            } else { throw "Unexpected tool $Name" }
        }

        Mock Get-UserscriptGist {
            @{ history = @(@{ version = $script:revisionId; committed_at = '2026-10-30T19:20:53Z' }) }
        }
        Mock Get-UserscriptRaw { $script:remoteText }
    }

    It 'records an already published revision with its real publication time without uploading' {
        $result = Invoke-UserscriptRelease $root HEAD -VerifyOnly -GistRevision $script:revisionId -RecordDirectory $script:records
        $result.component | Should Be tampermonkey
        $result.sourceCommit | Should Be $script:commitId
        $result.version | Should Be '4.9.39'
        $result.gistRevision | Should Be $script:revisionId
        ([DateTimeOffset]::Parse($result.completedLocal).ToUnixTimeSeconds()) | Should Be ([DateTimeOffset]::Parse('2026-10-30T19:20:53Z').ToUnixTimeSeconds())
        (Read-DeploymentJson (Join-Path $script:records 'web-bookmarks--tampermonkey.json')).sourceCommit | Should Be $script:commitId
        Assert-MockCalled Invoke-UserscriptTool -Times 0 -Exactly -Scope It -ParameterFilter { $Name -eq 'gh' }
    }

    It 'publishes a higher version and verifies it before recording' {
        $script:remoteText = $script:bundleText.Replace('4.9.39', '4.9.38')
        (Invoke-UserscriptRelease $root HEAD -RecordDirectory $script:records).version | Should Be '4.9.39'
        Assert-MockCalled Invoke-UserscriptTool -Times 1 -Exactly -Scope It -ParameterFilter { $Name -eq 'gh' }
    }

    It 'accepts identical content with CRLF without republishing' {
        $script:remoteText = $script:bundleText.Replace("`n", "`r`n")
        Invoke-UserscriptRelease $root HEAD -RecordDirectory $script:records | Out-Null
        Assert-MockCalled Invoke-UserscriptTool -Times 0 -Exactly -Scope It -ParameterFilter { $Name -eq 'gh' }
    }

    It 'rejects changed content without a higher version' {
        $script:remoteText += '// different'
        Assert-PublishThrows { Invoke-UserscriptRelease $root HEAD -RecordDirectory $script:records } '*Increase @version*'
        Test-Path $script:records | Should Be $false
    }

    It 'refuses a mismatch or stale revision in verify-only mode' {
        $script:remoteText += '// different'
        Assert-PublishThrows { Invoke-UserscriptRelease $root HEAD -VerifyOnly -RecordDirectory $script:records } '*differs from the committed bundle*'
        $script:remoteText = $script:bundleText
        Assert-PublishThrows { Invoke-UserscriptRelease $root HEAD -VerifyOnly -GistRevision ('c' * 40) -RecordDirectory $script:records } '*no longer current*'
        Test-Path $script:records | Should Be $false
    }

    It 'does not record a failed or unverified upload' {
        $script:remoteText = $script:bundleText.Replace('4.9.39', '4.9.38')
        Mock Invoke-UserscriptTool { throw 'Upload failed' } -ParameterFilter { $Name -eq 'gh' }
        Assert-PublishThrows { Invoke-UserscriptRelease $root HEAD -RecordDirectory $script:records } '*Upload failed*'
        Test-Path $script:records | Should Be $false
        Mock Invoke-UserscriptTool {} -ParameterFilter { $Name -eq 'gh' }
        Assert-PublishThrows { Invoke-UserscriptRelease $root HEAD -RecordDirectory $script:records } '*upload did not verify*'
        Test-Path $script:records | Should Be $false
    }

    It 'fails explicitly on release-record write failure' {
        Mock Write-DeploymentJson { throw 'Record denied' }
        Assert-PublishThrows { Invoke-UserscriptRelease $root HEAD -RecordDirectory $script:records } '*Record denied*'
    }

    It 'rejects mismatched committed metadata before contacting the Gist' {
        $script:headerText = $script:headerText.Replace('4.9.39', '4.9.40')
        Assert-PublishThrows { Invoke-UserscriptRelease $root HEAD -RecordDirectory $script:records } '*Rebuild and commit first*'
        Assert-MockCalled Get-UserscriptGist -Times 0 -Exactly -Scope It
    }
}

Describe 'Committed userscript extraction with real Git' {
    It 'exports the exact committed bundle and header as nonempty archive entries' {
        $archive = Join-Path $TestDrive 'real-userscript.zip'
        Invoke-UserscriptTool git @('archive', '--format=zip', "--output=$archive", 'HEAD',
            'tampermonkey/webbookmarks-palette.user.js', 'tampermonkey/src/header.txt') $root
        $zip = [IO.Compression.ZipFile]::OpenRead($archive)
        try {
            $texts = @{}
            foreach ($name in 'tampermonkey/webbookmarks-palette.user.js', 'tampermonkey/src/header.txt') {
                $reader = [IO.StreamReader]::new($zip.GetEntry($name).Open())
                try { $texts[$name] = $reader.ReadToEnd().Replace("`r`n", "`n") } finally { $reader.Dispose() }
            }
            $bundle = $texts['tampermonkey/webbookmarks-palette.user.js']
            $header = $texts['tampermonkey/src/header.txt'].TrimEnd()
            $bundle.Length | Should BeGreaterThan 1000
            $bundle.StartsWith($header + "`n") | Should Be $true
        } finally { $zip.Dispose() }
    }
}
