$ErrorActionPreference='Stop'
if((Get-CimInstance Win32_ComputerSystemProduct).UUID -ne '4B3D9000-B6D0-11EA-91A7-1B5B997B1500'){throw 'Wrong target host.'}
$archive='C:\ProgramData\SolutionDeploy\archives\web-bookmarks-migration-20261018'
$appRoot='C:\ProgramData\SolutionDeploy\apps\web-bookmarks'
if(Test-Path $archive){throw 'Migration archive already exists; inspect before retry.'}
if(Test-Path $appRoot){throw 'Application root already exists; inspect before retry.'}
if(@(Get-NetTCPConnection -State Listen|Where-Object LocalPort -eq 8792).Count){throw 'Port 8792 is already listening.'}
$account='sd-web-bookmarks'
if(Get-LocalUser -Name $account -ErrorAction SilentlyContinue){throw 'Service account already exists; inspect before retry.'}
New-Item -ItemType Directory -Path $archive|Out-Null
$acl=[Security.AccessControl.DirectorySecurity]::new()
$acl.SetAccessRuleProtection($true,$false)
foreach($sid in @('S-1-5-18','S-1-5-32-544')){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))}
Set-Acl $archive $acl
$password='Aa1!'+[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
$secure=ConvertTo-SecureString $password -AsPlainText -Force
$credential=[pscredential]::new("$env:COMPUTERNAME\$account",$secure)
$user=New-LocalUser -Name $account -Password $secure -AccountNeverExpires -PasswordNeverExpires -UserMayNotChangePassword
$credential|Export-Clixml (Join-Path $archive 'task-credential.dpapi.xml')
$password=$null;$secure.Dispose();$credential=$null
if($user.SID.Value -in @(Get-LocalGroupMember -SID S-1-5-32-544|ForEach-Object {$_.SID.Value})){throw 'Service account is an administrator.'}
$module=Import-Module 'C:\ProgramData\SolutionDeploy\control\framework\src\Lifecycle.psm1' -PassThru
$layout=Get-AppLayout -AppRoot $appRoot
foreach($key in @('Root','Releases','Shared','Data','Secrets','Logs','Backups','Run','State')){New-Item -ItemType Directory $layout[$key] -Force|Out-Null}
& $module {param($l,$a) Set-AppAcl -Layout $l -Account $a} $layout "$env:COMPUTERNAME\$account"
$grant='C:\ProgramData\SolutionDeploy\archives\ferry-migration-20261018\batch-logon-1\grant-ferry-batch-logon.ps1'
$ast=[Management.Automation.Language.Parser]::ParseFile($grant,[ref]$null,[ref]$null)
$node=@($ast.FindAll({param($n)$n -is [Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'Add-Type'},$true))
if($node.Count -ne 1){throw 'Batch-logon grant helper unavailable.'}
Invoke-Expression $node[0].Extent.Text
[FerryBatchGrant]::Add($user.SID.Value)
& 'C:\ProgramData\SolutionDeploy\control\framework\scripts\Grant-AppToolkitAccess.ps1' -Root 'C:\ProgramData\SolutionDeploy' -AppId web-bookmarks -Account "$env:COMPUTERNAME\$account" -ExpectedAccountSid $user.SID.Value -ApproveProvisioning -Confirm:$false|Out-Null
$nodeCurrent='C:\Files\ScoopApps\apps\nodejs\current\node.exe'
if(-not(Test-Path $nodeCurrent)){throw 'Node runtime path unavailable.'}
$nodePath=(Resolve-Path $nodeCurrent).Path
$pwsh=(Get-Command pwsh.exe -ErrorAction Stop).Source
$dotnet='C:\Program Files\dotnet\dotnet.exe'
$runtimes=@(& $dotnet --list-runtimes)
if($LASTEXITCODE -or -not($runtimes -match '^Microsoft.AspNetCore.App 9\.')){throw 'ASP.NET Core 9 is unavailable.'}
@{status='HostPrepared';app='web-bookmarks';account="$env:COMPUTERNAME\$account";sid=$user.SID.Value;nodePath=$nodePath;nodeSHA256=(Get-FileHash $nodePath).Hash.ToLowerInvariant();nodeVersion=(& $nodePath --version);dotnetPath=$dotnet;aspNetCore9=($runtimes|Where-Object {$_ -match '^Microsoft.AspNetCore.App 9\.'});powerShellPath=$pwsh;port=8792;publicHost='web-bookmarks.jimlertech.com'}|ConvertTo-Json -Depth 4|Set-Content (Join-Path $archive 'host.json')
Get-Content (Join-Path $archive 'host.json')
