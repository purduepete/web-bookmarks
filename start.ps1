# Ensure git hooks are configured
git config core.hooksPath .githooks

$apiJob = Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\src\WebBookmarks.Api'; dotnet run" -PassThru
$clientJob = Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\src\WebBookmarks.Client'; npm run dev" -PassThru

$apiJob.Id, $clientJob.Id | Set-Content "$PSScriptRoot\.dev-pids"

Write-Host "API server starting on http://localhost:5288"
Write-Host "Client dev server starting on http://localhost:5173"
Write-Host "Run .\stop.ps1 to stop both servers."
