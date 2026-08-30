<#
.SYNOPSIS
  Rehearses the pending migrations against a copy of production data.

.DESCRIPTION
  The local harness (verify-lab-tenancy-migration.ps1) proves the SQL applies and
  back-fills correctly against a seeded single-laboratory database. This proves
  it against your real data: real row volume, real edge cases, and the branches
  the seeded case never reaches — orders with no laboratory to attribute them to,
  catalogue rows that were edited by hand, order lines whose test no longer
  exists.

  It never touches production. It dumps from the source, restores into a fresh
  scratch database, and runs the migrations there. The source connection is only
  ever read from.

.PARAMETER SourceUrl
  Connection string of the database to COPY. Read-only use.
  Get it from the Railway dashboard: project > Postgres > Variables >
  DATABASE_URL (use the public/proxy URL, not the internal one).

.PARAMETER ScratchDatabase
  Name of the local scratch database to restore into. Dropped and recreated.

.PARAMETER KeepDump
  Keep the intermediate .dump file instead of deleting it. It contains real
  customer data — only keep it if you have somewhere safe to put it.

.EXAMPLE
  ./scripts/rehearse-migration-on-production-copy.ps1 -SourceUrl "postgresql://user:pass@host:5432/railway"

.NOTES
  What to look for in the output:
    * every migration applies without error
    * the NOTICE lines from the tenancy migration — they report how many orders
      and order lines could NOT be attributed. Anything above zero needs a
      decision before you deploy, not after.
#>
param(
    [Parameter(Mandatory = $true)][string]$SourceUrl,
    [string]$ScratchDatabase = "prod_rehearsal",
    [switch]$KeepDump
)

$ErrorActionPreference = "Stop"

# Windows PowerShell promotes any native stderr output to a terminating error,
# and both pg_dump and psql report progress there. Judge by exit code instead.
function Invoke-Native {
    param([scriptblock]$Command, [string]$FailureMessage)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try { & $Command 2>&1 | ForEach-Object { "$_" } }
    finally { $ErrorActionPreference = $previous }
    if ($LASTEXITCODE -ne 0) { throw $FailureMessage }
}

$backendRoot = Split-Path $PSScriptRoot -Parent
Push-Location $backendRoot

$dumpFile = Join-Path ([System.IO.Path]::GetTempPath()) "serpentora-rehearsal-$(Get-Random).dump"

try {
    if ($SourceUrl -notmatch '://([^:]+):([^@]+)@([^:/]+):(\d+)/(.+?)(\?|$)') {
        throw "Could not parse -SourceUrl. Expected postgresql://user:pass@host:port/database"
    }

    $localLine = Select-String -Path ".env" -Pattern "^DATABASE_URL" | Select-Object -First 1
    if ($localLine.Line -notmatch '://([^:]+):([^@]+)@([^:/]+):(\d+)/') {
        throw "Could not parse the local DATABASE_URL from .env"
    }
    $localUser = $Matches[1]; $localPass = $Matches[2]; $localHost = $Matches[3]; $localPort = $Matches[4]

    Write-Host "1/4  Dumping the source database (read-only)..." -ForegroundColor Cyan
    # --no-owner/--no-acl so the restore does not need the production roles to
    # exist locally; -Fc so the restore can run in parallel and skip cleanly.
    Invoke-Native { pg_dump --no-owner --no-acl --format=custom --file=$dumpFile $SourceUrl } `
        "pg_dump failed. Check the connection string and that pg_dump is on PATH."

    $sizeMb = [math]::Round((Get-Item $dumpFile).Length / 1MB, 1)
    Write-Host "     Dump written, ${sizeMb} MB" -ForegroundColor DarkGray

    Write-Host "2/4  Recreating scratch database '$ScratchDatabase'..." -ForegroundColor Cyan
    $env:PGPASSWORD = $localPass
    Invoke-Native {
        psql -h $localHost -p $localPort -U $localUser -q `
             -c "DROP DATABASE IF EXISTS `"$ScratchDatabase`";" `
             -c "CREATE DATABASE `"$ScratchDatabase`";"
    } "Could not recreate the scratch database."

    Write-Host "3/4  Restoring the copy..." -ForegroundColor Cyan
    # pg_restore exits non-zero on benign notices (extensions that already exist,
    # for instance), so its exit code is reported rather than thrown on.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    pg_restore --no-owner --no-acl --dbname="postgresql://${localUser}:${localPass}@${localHost}:${localPort}/${ScratchDatabase}" $dumpFile 2>&1 |
        ForEach-Object { "$_" } | Select-Object -Last 5
    $ErrorActionPreference = $previous
    Write-Host "     Restore finished (exit $LASTEXITCODE; non-zero is common and usually benign)" -ForegroundColor DarkGray

    Write-Host "4/4  Applying pending migrations to the copy..." -ForegroundColor Cyan
    Write-Host "     Read the NOTICE lines below carefully." -ForegroundColor Yellow
    $env:DATABASE_URL = "postgresql://${localUser}:${localPass}@${localHost}:${localPort}/${ScratchDatabase}?schema=public&sslmode=disable"
    Invoke-Native { npx prisma migrate deploy } "MIGRATION FAILED against the production copy. Do not deploy."

    Write-Host ""
    Write-Host "Rehearsal complete. The migrations applied to a copy of production." -ForegroundColor Green
    Write-Host ""
    Write-Host "Before deploying, confirm from the output above:" -ForegroundColor Yellow
    Write-Host "  - no migration errored" -ForegroundColor Yellow
    Write-Host "  - the tenancy migration's NOTICE reported 0 unattributed orders and lines," -ForegroundColor Yellow
    Write-Host "    or you have decided what to do about the ones it named" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Scratch database '$ScratchDatabase' holds a copy of real customer data." -ForegroundColor Red
    Write-Host "Drop it when you are done:" -ForegroundColor Red
    Write-Host "  psql -h $localHost -U $localUser -c 'DROP DATABASE `"$ScratchDatabase`";'" -ForegroundColor Red
}
finally {
    if (-not $KeepDump -and (Test-Path $dumpFile)) {
        Remove-Item $dumpFile -Force
        Write-Host "Deleted the intermediate dump." -ForegroundColor DarkGray
    }
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    Pop-Location
}
