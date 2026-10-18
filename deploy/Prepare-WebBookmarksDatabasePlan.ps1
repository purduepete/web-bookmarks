[CmdletBinding()]
param([Parameter(Mandatory)][string]$ReleasePath)
$ErrorActionPreference='Stop'
if((Get-CimInstance Win32_ComputerSystemProduct).UUID -ne '4B3D9000-B6D0-11EA-91A7-1B5B997B1500'){throw 'Wrong database host.'}
$archive='C:\ProgramData\SolutionDeploy\archives\web-bookmarks-migration-20261018'
if(-not(Test-Path $archive)){throw 'Protected migration archive must be prepared first.'}
$manifest=Get-Content (Join-Path $ReleasePath 'deploy\application.json') -Raw|ConvertFrom-Json -AsHashtable
Import-Module 'C:\ProgramData\SolutionDeploy\control\framework\src\PostgreSQL.psm1' -DisableNameChecking
$snapshot=Get-PostgresSnapshot -PsqlPath 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -PassFile 'C:\ProgramData\JimlerTech\PostgreSQL\postgres.pgpass' -UserName postgres -HostIdentity '4B3D9000-B6D0-11EA-91A7-1B5B997B1500'
$plan=Get-PostgresProvisioningPlan -Manifest $manifest -Snapshot $snapshot
$schemaLedgerRevoke='REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.solutiondeploy_schema FROM "'+$plan.roles.runtime+'";'
if(-not $plan.runtimeGrantsSql.Contains($schemaLedgerRevoke)){throw 'PostgreSQL framework runtime-grant plan changed unexpectedly.'}
$runtimeGrantsSql=$plan.runtimeGrantsSql.Replace($schemaLedgerRevoke,'')
[IO.File]::WriteAllText((Join-Path $archive 'provisioning.sql'),$plan.provisioningSql,[Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText((Join-Path $archive 'runtime-grants.sql'),$runtimeGrantsSql,[Text.UTF8Encoding]::new($false))
$record=@{status='ReadOnlyPlan';app=$manifest.id;database=$plan.database;roles=$plan.roles;databaseAbsent=($plan.database -notin $snapshot.databases);provisioningSqlSHA256=(Get-FileHash (Join-Path $archive 'provisioning.sql')).Hash.ToLowerInvariant();runtimeGrantsSHA256=(Get-FileHash (Join-Path $archive 'runtime-grants.sql')).Hash.ToLowerInvariant();planHash=$plan.planHash;runtimeGrantPolicy='Removed unconditional revoke for absent public.solutiondeploy_schema';serverVersion=$snapshot.serverVersion;hostIdentity=$snapshot.hostIdentity;completedLocal=[DateTimeOffset]::Now.ToString('o')}
$record|ConvertTo-Json -Depth 5|Set-Content (Join-Path $archive 'provisioning-plan.json')
$record|ConvertTo-Json -Depth 5
