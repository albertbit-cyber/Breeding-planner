# Breeding Planner - Windows Installer Builder
# This script creates a portable installer without code signing

Write-Host "Building Breeding Planner Windows Installer..." -ForegroundColor Green

# Step 1: Build the React app
Write-Host "`n[1/3] Building React app..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "React build failed!" -ForegroundColor Red
    exit 1
}

# Step 2: Package with electron-builder (unpacked only, skip signing)
Write-Host "`n[2/3] Packaging with Electron..." -ForegroundColor Yellow
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npx electron-builder --win --dir

if ($LASTEXITCODE -ne 0) {
    Write-Host "Electron packaging failed!" -ForegroundColor Red
    exit 1
}

# Step 3: Create a portable installer
Write-Host "`n[3/3] Creating portable installer..." -ForegroundColor Yellow

$version = "0.1.0"
$appName = "Breeding Planner"
$outputDir = "dist"
$unpackedDir = "$outputDir\win-unpacked"
$installerName = "$outputDir\${appName}-Setup-${version}.exe"

# Check if 7-Zip is available
$7zipPath = "C:\Program Files\7-Zip\7z.exe"
if (-not (Test-Path $7zipPath)) {
    $7zipPath = "C:\Program Files (x86)\7-Zip\7z.exe"
}

if (Test-Path $7zipPath) {
    Write-Host "Creating self-extracting archive with 7-Zip..." -ForegroundColor Cyan
    
    # Create 7z archive
    & $7zipPath a -t7z "$outputDir\app.7z" "$unpackedDir\*" -mx9
    
    # Create self-extracting installer
    $sfxModule = "C:\Program Files\7-Zip\7z.sfx"
    if (-not (Test-Path $sfxModule)) {
        $sfxModule = "C:\Program Files (x86)\7-Zip\7z.sfx"
    }
    
    if (Test-Path $sfxModule) {
        # Create config for SFX
        $configFile = "$outputDir\sfx-config.txt"
        @"
;!@Install@!UTF-8!
Title="$appName Installer"
BeginPrompt="Do you want to install $appName?"
RunProgram="Breeding Planner.exe"
;!@InstallEnd@!
"@ | Out-File -FilePath $configFile -Encoding UTF8
        
        # Combine SFX module + config + archive
        cmd /c copy /b "$sfxModule" + "$configFile" + "$outputDir\app.7z" "$installerName"
        
        # Cleanup
        Remove-Item "$outputDir\app.7z" -Force
        Remove-Item $configFile -Force
        
        Write-Host "`nSuccess! Installer created: $installerName" -ForegroundColor Green
    } else {
        Write-Host "7-Zip SFX module not found. Creating ZIP instead..." -ForegroundColor Yellow
        Compress-Archive -Path "$unpackedDir\*" -DestinationPath "$outputDir\${appName}-${version}-portable.zip" -Force
        Write-Host "`nSuccess! Portable ZIP created: $outputDir\${appName}-${version}-portable.zip" -ForegroundColor Green
    }
} else {
    Write-Host "7-Zip not found. Creating ZIP archive..." -ForegroundColor Yellow
    $zipName = "$outputDir\${appName}-${version}-portable.zip"
    Compress-Archive -Path "$unpackedDir\*" -DestinationPath $zipName -Force
    Write-Host "`nSuccess! Portable ZIP created: $zipName" -ForegroundColor Green
    Write-Host "Users can extract and run 'Breeding Planner.exe'" -ForegroundColor Cyan
}

Write-Host "`nOutput location: $outputDir" -ForegroundColor Green
Write-Host "Done!" -ForegroundColor Green
