param(
  [string]$OutputPath = "android/app/breedingplanner.keystore",
  [string]$Alias = "bpkey",
  [int]$ValidityDays = 10000,
  [string]$StorePassword,
  [string]$KeyPassword,
  [switch]$WriteProperties,
  [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"
$ResolvedOutput = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")) $OutputPath
$Parent = Split-Path $ResolvedOutput -Parent
if (!(Test-Path $Parent)) {
  New-Item -ItemType Directory -Force -Path $Parent | Out-Null
}

if (Test-Path $ResolvedOutput) {
  throw "Keystore already exists: $ResolvedOutput"
}

function New-Password {
  $bytes = New-Object byte[] 24
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  return [Convert]::ToBase64String($bytes).TrimEnd("=")
}

if (!$StorePassword -and $NonInteractive) {
  $StorePassword = New-Password
}
if (!$KeyPassword -and $NonInteractive) {
  $KeyPassword = $StorePassword
}
if ($KeyPassword -and $StorePassword -and $KeyPassword -ne $StorePassword) {
  Write-Warning "PKCS12 keystores use the store password for the key password. Using StorePassword for both."
  $KeyPassword = $StorePassword
}

Write-Host "Generating Android release keystore at $ResolvedOutput"
Write-Host "Store this file and its passwords securely. It is ignored by git."

$Keytool = "keytool"
if ($env:JAVA_HOME) {
  $javaHomeKeytool = Join-Path $env:JAVA_HOME "bin\keytool.exe"
  if (Test-Path $javaHomeKeytool) {
    $Keytool = $javaHomeKeytool
  }
}

$keytoolArgs = @(
  "-genkeypair",
  "-v",
  "-storetype", "PKCS12",
  "-keystore", $ResolvedOutput,
  "-alias", $Alias,
  "-keyalg", "RSA",
  "-keysize", "2048",
  "-validity", "$ValidityDays",
  "-dname", "CN=Breeding Planner Mobile, OU=Mobile, O=Breeding Planner, L=San Juan, ST=PR, C=US"
)

if ($StorePassword) {
  $keytoolArgs += @("-storepass", $StorePassword)
}
if ($KeyPassword) {
  $keytoolArgs += @("-keypass", $KeyPassword)
}

& $Keytool @keytoolArgs

if ($LASTEXITCODE -ne 0) {
  throw "keytool failed with exit code $LASTEXITCODE"
}

if ($WriteProperties) {
  if (!$StorePassword -or !$KeyPassword) {
    throw "WriteProperties requires StorePassword and KeyPassword, or use NonInteractive."
  }
  $PropertiesPath = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..\android")) "key.properties"
  $relativeStoreFile = "app/breedingplanner.keystore"
  Set-Content -Path $PropertiesPath -Encoding ASCII -Value @(
    "storeFile=$relativeStoreFile",
    "storePassword=$StorePassword",
    "keyAlias=$Alias",
    "keyPassword=$KeyPassword"
  )
  Write-Host "Wrote ignored signing properties: $PropertiesPath"
}

Write-Host ""
Write-Host "Set these environment variables before release builds:"
Write-Host "`$env:BREEDING_PLANNER_KEYSTORE_FILE='$ResolvedOutput'"
Write-Host "`$env:BREEDING_PLANNER_KEY_ALIAS='$Alias'"
Write-Host "`$env:BREEDING_PLANNER_KEYSTORE_PASSWORD='your-store-password'"
Write-Host "`$env:BREEDING_PLANNER_KEY_PASSWORD='your-key-password'"
