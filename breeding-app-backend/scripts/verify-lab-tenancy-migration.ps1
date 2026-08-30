<#
.SYNOPSIS
  Proves the lab-vendor-tenancy migration applies AND back-fills correctly.

.DESCRIPTION
  Applying a migration to an empty database only proves the SQL parses. This
  builds a throwaway database, applies every migration except the tenancy one,
  seeds the state a real deployment is actually in (one vendor laboratory, the
  global catalogue and pricing it sold against, an order placed through it),
  applies the tenancy migration on top, and then asserts what the backfill did.

  Writing this found a real defect: the order-line backfill referenced the
  UPDATE target from inside a JOIN ... ON clause, which Postgres rejects. The
  migration would have failed on deploy.

.PARAMETER Database
  Name of the scratch database. Dropped and recreated on every run.

.EXAMPLE
  ./scripts/verify-lab-tenancy-migration.ps1
#>
param(
    [string]$Database = "lvt_migration_check"
)

$ErrorActionPreference = "Stop"

# Windows PowerShell promotes ANY native-command stderr output to a terminating
# error, and psql writes its RAISE NOTICE output there. Run native tools with
# errors non-terminating and judge them by exit code instead, which is the only
# thing that actually reports success or failure here.
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

try {
    $envLine = Select-String -Path ".env" -Pattern "^DATABASE_URL" | Select-Object -First 1
    if (-not $envLine) { throw "No DATABASE_URL in .env" }
    if ($envLine.Line -notmatch '://([^:]+):([^@]+)@([^:/]+):(\d+)/') {
        throw "Could not parse DATABASE_URL"
    }
    $dbUser = $Matches[1]; $dbPass = $Matches[2]; $dbHost = $Matches[3]; $dbPort = $Matches[4]

    $env:PGPASSWORD = $dbPass
    $scratchUrl = "postgresql://${dbUser}:${dbPass}@${dbHost}:${dbPort}/${Database}?schema=public&sslmode=disable"
    $migration = "prisma/migrations/20260830120000_add_lab_vendor_tenancy"
    $held = Join-Path ([System.IO.Path]::GetTempPath()) "lvt_hold_$(Get-Random)"

    Write-Host "Recreating scratch database '$Database'..."
    Invoke-Native { psql -h $dbHost -p $dbPort -U $dbUser -q -c "DROP DATABASE IF EXISTS `"$Database`";" -c "CREATE DATABASE `"$Database`";" } "Could not recreate the scratch database."

    Write-Host "Applying migrations up to (not including) the tenancy migration..."
    Move-Item $migration $held
    try {
        $env:DATABASE_URL = $scratchUrl
        Invoke-Native { npx prisma migrate deploy } "Baseline migrations failed." | Out-Null
    }
    finally {
        # Always put the migration back, even if the baseline failed — otherwise a
        # failed run leaves the working tree missing a migration directory.
        Move-Item $held $migration
    }

    Write-Host "Seeding the pre-migration state..."
    Invoke-Native { psql -h $dbHost -p $dbPort -U $dbUser -d $Database -q -v ON_ERROR_STOP=1 -f "$migration/seed.sql" } "Seeding failed."

    Write-Host "Applying the tenancy migration onto real data..."
    $env:DATABASE_URL = $scratchUrl
    Invoke-Native { npx prisma migrate deploy } "The tenancy migration failed to apply." | Out-Null

    Write-Host "Verifying the backfill..."
    Invoke-Native { psql -h $dbHost -p $dbPort -U $dbUser -d $Database -v ON_ERROR_STOP=1 -f "$migration/verify.sql" } "Backfill verification FAILED."

    Write-Host ""
    Write-Host "Migration verified: applies cleanly and back-fills correctly." -ForegroundColor Green
    Write-Host "Scratch database '$Database' left in place for inspection." -ForegroundColor DarkGray
}
finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    Pop-Location
}
