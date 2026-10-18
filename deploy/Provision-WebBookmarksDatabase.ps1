[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ReleasePath,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ApprovedScriptSHA256,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ApprovedProvisioningSqlSHA256,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ApprovedRuntimeGrantsSHA256,
    [Parameter(Mandatory)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ApprovedSchemaSHA256
)
$ErrorActionPreference='Stop'
if((Get-CimInstance Win32_ComputerSystemProduct).UUID -ne '4B3D9000-B6D0-11EA-91A7-1B5B997B1500'){throw 'Wrong database host.'}
$archive='C:\ProgramData\SolutionDeploy\archives\web-bookmarks-migration-20261018'
$appRoot='C:\ProgramData\SolutionDeploy\apps\web-bookmarks'
$journal=Join-Path $archive 'database-ready.json'
if(Test-Path $journal){throw 'Database provisioning already ran; inspect evidence before retry.'}
if((Get-FileHash $MyInvocation.MyCommand.Path).Hash -ine $ApprovedScriptSHA256){throw 'Provisioning script differs from reviewed bytes.'}
$schema=Join-Path $ReleasePath 'deploy\postgresql\001_initial.sql'
$provisioningPath=Join-Path $archive 'provisioning.sql'
$grantsPath=Join-Path $archive 'runtime-grants.sql'
if((Get-FileHash $schema).Hash -ine $ApprovedSchemaSHA256){throw 'Schema differs from independently reviewed bytes.'}
if((Get-FileHash $provisioningPath).Hash -ine $ApprovedProvisioningSqlSHA256){throw 'Provisioning SQL differs from reviewed bytes.'}
if((Get-FileHash $grantsPath).Hash -ine $ApprovedRuntimeGrantsSHA256){throw 'Runtime grants differ from reviewed bytes.'}
$manifest=Get-Content (Join-Path $ReleasePath 'deploy\application.json') -Raw|ConvertFrom-Json -AsHashtable
Import-Module 'C:\ProgramData\SolutionDeploy\control\framework\src\PostgreSQL.psm1' -DisableNameChecking
. 'C:\ProgramData\SolutionDeploy\archives\ferry-migration-20261018\role-credentials-1\New-FerryScramVerifier.ps1'
$psql='C:\Program Files\PostgreSQL\18\bin\psql.exe'
$adminPass='C:\ProgramData\JimlerTech\PostgreSQL\postgres.pgpass'
$snapshot=Get-PostgresSnapshot -PsqlPath $psql -PassFile $adminPass -UserName postgres -HostIdentity '4B3D9000-B6D0-11EA-91A7-1B5B997B1500'
$plan=Get-PostgresProvisioningPlan -Manifest $manifest -Snapshot $snapshot
$schemaLedgerRevoke='REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.solutiondeploy_schema FROM "'+$plan.roles.runtime+'";'
if(-not $plan.runtimeGrantsSql.Contains($schemaLedgerRevoke)){throw 'PostgreSQL framework runtime-grant plan changed unexpectedly.'}
$runtimeGrantsSql=$plan.runtimeGrantsSql.Replace($schemaLedgerRevoke,'')
$liveProvisioningHash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($plan.provisioningSql)))
$liveGrantsHash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($runtimeGrantsSql)))
if($liveProvisioningHash -ine $ApprovedProvisioningSqlSHA256 -or $liveGrantsHash -ine $ApprovedRuntimeGrantsSHA256){throw 'Current plan differs from independently reviewed SQL.'}
if($plan.database -cne 'web_bookmarks' -or $manifest.id -cne 'web-bookmarks' -or $plan.database -in $snapshot.databases){throw 'Database create-only preflight failed.'}
foreach($kind in @('migrator','runtime')){if($plan.roles[$kind] -in $snapshot.roles){throw "Expected database role already exists: $($plan.roles[$kind])"}}
function Invoke-Sql([string]$Text,[string]$Database='postgres',[string]$User='postgres',[string]$PassFile=$adminPass){
    $env:PGPASSFILE=$PassFile
    $output=$Text|& $psql -X -w -h 127.0.0.1 -U $User -d $Database -At -v ON_ERROR_STOP=1 2>&1
    if($LASTEXITCODE){throw "PostgreSQL operation failed: $($output -join ' ')"}
    $output -join "`n"
}
$null=Invoke-Sql ([IO.File]::ReadAllText($provisioningPath))
foreach($kind in @('migrator','runtime')){
    $role=$plan.roles[$kind]
    $password=[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48)).TrimEnd('=').Replace('+','-').Replace('/','_')
    $bytes=[Text.Encoding]::UTF8.GetBytes($password)
    try{$verifier=New-FerryScramVerifier -SecretBytes $bytes -Salt ([Security.Cryptography.RandomNumberGenerator]::GetBytes(16))}finally{[Array]::Clear($bytes,0,$bytes.Length)}
    $null=Invoke-Sql "ALTER ROLE `"$role`" PASSWORD '$verifier';"
    $folder=if($kind -eq 'migrator'){$archive}else{Join-Path $appRoot 'shared\secrets'}
    [IO.File]::WriteAllText((Join-Path $folder "$role.pgpass"),"127.0.0.1:5432:web_bookmarks:$role`:$password`n",[Text.UTF8Encoding]::new($false))
    if($kind -eq 'runtime'){
        $connection="Host=127.0.0.1;Port=5432;Database=web_bookmarks;Username=$role;Password=$password;Pooling=true;Timeout=15;Command Timeout=30"
        [IO.File]::WriteAllText((Join-Path $folder 'app.env'),"ConnectionStrings__WebBookmarksDatabase=$connection`n",[Text.UTF8Encoding]::new($false))
    }
    $password=$null;$verifier=$null
}
$migrator=$plan.roles.migrator
$owner=$plan.roles.owner
$null=Invoke-Sql ("SET ROLE `"$owner`";`nBEGIN;`n"+[IO.File]::ReadAllText($schema)+"`n"+[IO.File]::ReadAllText($grantsPath)+"`nCOMMIT;`n") 'web_bookmarks' $migrator (Join-Path $archive "$migrator.pgpass")
$check="SELECT json_build_object('database',current_database(),'table',to_regclass('public.webbookmarkitems')::text,'tableCount',(SELECT count(*) FROM public.webbookmarkitems),'runtimeCanCreate',has_schema_privilege('$($plan.roles.runtime)','public','CREATE'))"
$catalog=Invoke-Sql $check 'web_bookmarks'
$record=@{status='SchemaReady';database=$plan.database;schema='public';roles=$plan.roles;schemaSHA256=(Get-FileHash $schema).Hash.ToLowerInvariant();provisioningSQLSHA256=(Get-FileHash $provisioningPath).Hash.ToLowerInvariant();runtimeGrantsSHA256=(Get-FileHash $grantsPath).Hash.ToLowerInvariant();targetCatalog=($catalog|ConvertFrom-Json);completedLocal=[DateTimeOffset]::Now.ToString('o')}
$record|ConvertTo-Json -Depth 7|Set-Content $journal
$record|ConvertTo-Json -Depth 7
