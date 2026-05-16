param(
  [ValidateSet("development", "staging", "production")]
  [string]$Environment = "development",

  [ValidateSet("debug", "release")]
  [string]$BuildType = "debug",

  [ValidateSet("apk", "aab", "all")]
  [string]$Artifact = "apk",

  [switch]$SkipWebBuild,
  [switch]$SkipCapSync,
  [switch]$Install
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$AndroidDir = Join-Path $Root "android"
$ArtifactDir = Join-Path $Root "dist\android"
$LocalJdkRoot = Join-Path $Root ".tools\jdk21"
$FallbackJdkRoot = Join-Path $Root ".tools\jdk17"
$LocalAndroidSdk = Join-Path $Root ".tools\android-sdk"

function Invoke-Checked {
  param([string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory = $Root)
  Write-Host ">> $FilePath $($Arguments -join ' ')"
  $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -NoNewWindow -PassThru -Wait
  if ($process.ExitCode -ne 0) {
    throw "Command failed with exit code $($process.ExitCode): $FilePath $($Arguments -join ' ')"
  }
}

if (!(Test-Path $AndroidDir)) {
  throw "Android project not found at $AndroidDir"
}

if (!$env:JAVA_HOME -and ((Test-Path $LocalJdkRoot) -or (Test-Path $FallbackJdkRoot))) {
  $jdkRoot = if (Test-Path $LocalJdkRoot) { $LocalJdkRoot } else { $FallbackJdkRoot }
  $localJdk = Get-ChildItem -LiteralPath $jdkRoot -Directory | Select-Object -First 1
  if ($localJdk) {
    $env:JAVA_HOME = $localJdk.FullName
    $env:PATH = (Join-Path $localJdk.FullName "bin") + [IO.Path]::PathSeparator + $env:PATH
    Write-Host "Using local JDK: $env:JAVA_HOME"
  }
}

if (!$env:ANDROID_HOME -and (Test-Path $LocalAndroidSdk)) {
  $env:ANDROID_HOME = (Resolve-Path $LocalAndroidSdk).Path
  $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
  $env:PATH = (Join-Path $env:ANDROID_HOME "cmdline-tools\latest\bin") + [IO.Path]::PathSeparator + (Join-Path $env:ANDROID_HOME "platform-tools") + [IO.Path]::PathSeparator + $env:PATH
  Write-Host "Using local Android SDK: $env:ANDROID_HOME"
}

if ($env:ANDROID_HOME) {
  $sdkPath = $env:ANDROID_HOME.Replace("\", "/")
  Set-Content -Path (Join-Path $AndroidDir "local.properties") -Value "sdk.dir=$sdkPath" -Encoding ASCII
}

if (!(Test-Path $ArtifactDir)) {
  New-Item -ItemType Directory -Force -Path $ArtifactDir | Out-Null
}

if (!$SkipWebBuild) {
  if ($Environment -eq "development") {
    Invoke-Checked "npm.cmd" @("run", "build:android:dev")
  } elseif ($Environment -eq "staging") {
    Invoke-Checked "npm.cmd" @("run", "build:android:staging")
  } else {
    Invoke-Checked "npm.cmd" @("run", "build:android:prod")
  }
}

if (!$SkipCapSync) {
  Invoke-Checked "npx.cmd" @("cap", "sync", "android")
}

if ($BuildType -eq "release") {
  $keystore = $env:BREEDING_PLANNER_KEYSTORE_FILE
  $storePassword = $env:BREEDING_PLANNER_KEYSTORE_PASSWORD
  $alias = $env:BREEDING_PLANNER_KEY_ALIAS
  $keyPassword = $env:BREEDING_PLANNER_KEY_PASSWORD
  $keyProperties = Join-Path $AndroidDir "key.properties"
  if ((!$keystore -or !$storePassword -or !$alias -or !$keyPassword) -and !(Test-Path $keyProperties)) {
    Write-Warning "Release signing environment variables are not fully set. The release build may be unsigned."
    Write-Warning "Set BREEDING_PLANNER_KEYSTORE_FILE, BREEDING_PLANNER_KEYSTORE_PASSWORD, BREEDING_PLANNER_KEY_ALIAS, and BREEDING_PLANNER_KEY_PASSWORD, or create android/key.properties."
  }
}

$gradle = if ($IsWindows -or $env:OS -match "Windows") {
  Join-Path $AndroidDir "gradlew.bat"
} else {
  Join-Path $AndroidDir "gradlew"
}
$variant = if ($BuildType -eq "release") { "Release" } else { "Debug" }
$tasks = @()
if ($Artifact -eq "apk" -or $Artifact -eq "all") { $tasks += "assemble$variant" }
if ($Artifact -eq "aab" -or $Artifact -eq "all") {
  if ($BuildType -ne "release") { throw "AAB output is only configured for release builds." }
  $tasks += "bundleRelease"
}

foreach ($task in $tasks) {
  Invoke-Checked $gradle @($task, "--no-daemon") $AndroidDir
}

$outputs = @()
if ($BuildType -eq "debug" -and ($Artifact -eq "apk" -or $Artifact -eq "all")) {
  $outputs += Join-Path $AndroidDir "app\build\outputs\apk\debug\app-debug.apk"
}
if ($BuildType -eq "release" -and ($Artifact -eq "apk" -or $Artifact -eq "all")) {
  $outputs += Join-Path $AndroidDir "app\build\outputs\apk\release\app-release.apk"
}
if ($BuildType -eq "release" -and ($Artifact -eq "aab" -or $Artifact -eq "all")) {
  $outputs += Join-Path $AndroidDir "app\build\outputs\bundle\release\app-release.aab"
}

foreach ($output in $outputs) {
  if (Test-Path $output) {
    $destination = Join-Path $ArtifactDir (Split-Path $output -Leaf)
    Copy-Item -LiteralPath $output -Destination $destination -Force
    Write-Host "Built artifact: $destination"
  } else {
    Write-Warning "Expected artifact not found: $output"
  }
}

if ($Install) {
  if ($Artifact -ne "apk") { throw "Install is only supported for APK builds." }
  $apk = $outputs | Select-Object -First 1
  if (!(Test-Path $apk)) { throw "APK not found for install: $apk" }
  Invoke-Checked "adb" @("install", "-r", $apk)
}
