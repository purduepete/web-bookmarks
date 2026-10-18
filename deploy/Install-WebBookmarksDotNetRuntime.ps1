$ErrorActionPreference='Stop'
if((Get-CimInstance Win32_ComputerSystemProduct).UUID -ne '4B3D9000-B6D0-11EA-91A7-1B5B997B1500'){throw 'Wrong target host.'}
$dotnet='C:\Program Files\dotnet\dotnet.exe'
if(-not(Test-Path $dotnet)){throw 'Machine-wide dotnet host is missing.'}
$runtime=@(& $dotnet --list-runtimes)
if($runtime -match '^Microsoft.AspNetCore.App 9\.'){ @{status='AlreadyInstalled';runtimes=$runtime}|ConvertTo-Json -Depth 3; return }
$installer=Join-Path $PSScriptRoot 'dotnet-install.ps1'
try{
    Invoke-WebRequest -Uri 'https://dot.net/v1/dotnet-install.ps1' -OutFile $installer
    & $installer -Runtime aspnetcore -Version 9.0.21 -InstallDir 'C:\Program Files\dotnet' -NoPath
    if($LASTEXITCODE){throw 'ASP.NET Core 9 runtime installation failed.'}
}finally{Remove-Item $installer -Force -ErrorAction SilentlyContinue}
$runtime=@(& $dotnet --list-runtimes)
if(-not($runtime -match '^Microsoft.AspNetCore.App 9\.')){throw 'ASP.NET Core 9 runtime was not registered after install.'}
@{status='Installed';runtimes=$runtime;completedLocal=[DateTimeOffset]::Now.ToString('o')}|ConvertTo-Json -Depth 3
