$pidFile = "$PSScriptRoot\.dev-pids"

if (Test-Path $pidFile) {
    Get-Content $pidFile | ForEach-Object {
        $proc = Get-Process -Id $_ -ErrorAction SilentlyContinue
        if ($proc) {
            taskkill /T /F /PID $_ 2>$null | Out-Null
            Write-Host "Stopped process tree for PID $_"
        }
    }
    Remove-Item $pidFile
    Write-Host "All dev servers stopped."
} else {
    Write-Host "No running dev servers found (.dev-pids not present)."
}
