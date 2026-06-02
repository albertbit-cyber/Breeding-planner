# Breeding Planner - Windows Installer Builder
# This script creates an NSIS wizard installer without code signing

Write-Host "Building Breeding Planner Windows Installer..." -ForegroundColor Green

# Step 0: Make sure Windows icon exists
Write-Host "`n[1/3] Refreshing Windows icon..." -ForegroundColor Yellow
node "$PSScriptRoot/scripts/generate-icon.cjs"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Icon generation failed!" -ForegroundColor Red
    exit 1
}

# Step 1: Build the React app
Write-Host "`n[2/3] Building React app..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "React build failed!" -ForegroundColor Red
    exit 1
}

# Step 2: Package with electron-builder (NSIS wizard installer)
Write-Host "`n[3/3] Packaging NSIS installer with Electron..." -ForegroundColor Yellow
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npx electron-builder --win nsis --x64

if ($LASTEXITCODE -ne 0) {
    Write-Host "Electron packaging failed!" -ForegroundColor Red
    exit 1
}

$outputDir = "dist"
Write-Host "`nSuccess! Installer(s) available under: $outputDir" -ForegroundColor Green
Write-Host "Done!" -ForegroundColor Green
