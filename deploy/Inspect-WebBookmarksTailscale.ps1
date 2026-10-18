$ErrorActionPreference='Stop'
if((Get-CimInstance Win32_ComputerSystemProduct).UUID -ne '4B3D9000-B6D0-11EA-91A7-1B5B997B1500'){throw 'Wrong target.'}
& 'C:\Program Files\Tailscale\tailscale.exe' serve status
if($LASTEXITCODE){throw 'Tailscale serve status failed.'}
