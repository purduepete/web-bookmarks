$pidFile = "$PSScriptRoot\.dev-pids"

if (Test-Path $pidFile) {
    Get-Content $pidFile | ForEach-Object {
        $proc = Get-Process -Id $_ -ErrorAction SilentlyContinue
        if ($proc) {
            Stop-Process -Id $_ -Force
            Write-Host "Stopped process $_"
        }
    }
    Remove-Item $pidFile
    Write-Host "All dev servers stopped."
} else {
    Write-Host "No running dev servers found (.dev-pids not present)."
}
