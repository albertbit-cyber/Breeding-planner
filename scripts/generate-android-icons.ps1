param(
  [string]$SourceImage = "C:\Users\alber\Downloads\Logo app.png",
  [string]$AndroidResDir = "d:\Git Clone\Breeding-planner\breeding-app-breeder\android\app\src\main\res"
)

Add-Type -AssemblyName System.Drawing

function Resize-Image {
  param([string]$Src, [string]$Dst, [int]$Width, [int]$Height, [bool]$Circle = $false)
  $srcImg = [System.Drawing.Image]::FromFile($Src)
  $bmp = New-Object System.Drawing.Bitmap($Width, $Height)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  if ($Circle) {
    # Clip to circle
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddEllipse(0, 0, $Width, $Height)
    $g.SetClip($path)
  }

  $g.DrawImage($srcImg, 0, 0, $Width, $Height)
  $g.Dispose()
  $srcImg.Dispose()

  $dir = Split-Path $Dst -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

  $bmp.Save($Dst, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "  -> $Dst ($Width x $Height)"
}

function Resize-ImageWithBackground {
  param([string]$Src, [string]$Dst, [int]$Width, [int]$Height, [string]$BgColor = "#07110d")
  $srcImg = [System.Drawing.Image]::FromFile($Src)
  $bmp = New-Object System.Drawing.Bitmap($Width, $Height)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

  # Fill background
  $bg = [System.Drawing.ColorTranslator]::FromHtml($BgColor)
  $g.Clear($bg)

  # Draw logo centered with padding (75% of the canvas)
  $padding = [int]($Width * 0.125)
  $logoSize = $Width - ($padding * 2)
  $g.DrawImage($srcImg, $padding, $padding, $logoSize, $logoSize)

  $g.Dispose()
  $srcImg.Dispose()

  $dir = Split-Path $Dst -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

  $bmp.Save($Dst, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "  -> $Dst ($Width x $Height)"
}

$src = $SourceImage
$res = $AndroidResDir

Write-Host "Source: $src"
Write-Host "Android res: $res"
Write-Host ""

# ── Launcher icons (square, transparent bg) ──────────────────────────────────
Write-Host "Launcher icons (ic_launcher.png)..."
Resize-Image $src "$res\mipmap-mdpi\ic_launcher.png"    48   48
Resize-Image $src "$res\mipmap-hdpi\ic_launcher.png"    72   72
Resize-Image $src "$res\mipmap-xhdpi\ic_launcher.png"   96   96
Resize-Image $src "$res\mipmap-xxhdpi\ic_launcher.png"  144  144
Resize-Image $src "$res\mipmap-xxxhdpi\ic_launcher.png" 192  192

# ── Round launcher icons (circle crop) ───────────────────────────────────────
Write-Host "Round launcher icons (ic_launcher_round.png)..."
Resize-Image $src "$res\mipmap-mdpi\ic_launcher_round.png"    48   48  $true
Resize-Image $src "$res\mipmap-hdpi\ic_launcher_round.png"    72   72  $true
Resize-Image $src "$res\mipmap-xhdpi\ic_launcher_round.png"   96   96  $true
Resize-Image $src "$res\mipmap-xxhdpi\ic_launcher_round.png"  144  144 $true
Resize-Image $src "$res\mipmap-xxxhdpi\ic_launcher_round.png" 192  192 $true

# ── Adaptive icon foreground (108dp at each density, logo centered in 72dp safe zone) ──
Write-Host "Adaptive icon foreground (ic_launcher_foreground.png)..."
Resize-Image $src "$res\mipmap-mdpi\ic_launcher_foreground.png"    108  108
Resize-Image $src "$res\mipmap-hdpi\ic_launcher_foreground.png"    162  162
Resize-Image $src "$res\mipmap-xhdpi\ic_launcher_foreground.png"   216  216
Resize-Image $src "$res\mipmap-xxhdpi\ic_launcher_foreground.png"  324  324
Resize-Image $src "$res\mipmap-xxxhdpi\ic_launcher_foreground.png" 432  432

# ── Splash screen (dark background with centered logo) ───────────────────────
Write-Host "Splash screen images..."
Resize-ImageWithBackground $src "$res\drawable\splash.png"               480  800
Resize-ImageWithBackground $src "$res\drawable-land-hdpi\splash.png"     800  480
Resize-ImageWithBackground $src "$res\drawable-land-mdpi\splash.png"     480  320
Resize-ImageWithBackground $src "$res\drawable-land-xhdpi\splash.png"    1280 720
Resize-ImageWithBackground $src "$res\drawable-land-xxhdpi\splash.png"   1600 960
Resize-ImageWithBackground $src "$res\drawable-land-xxxhdpi\splash.png"  1920 1080
Resize-ImageWithBackground $src "$res\drawable-port-hdpi\splash.png"     480  800
Resize-ImageWithBackground $src "$res\drawable-port-mdpi\splash.png"     320  480
Resize-ImageWithBackground $src "$res\drawable-port-xhdpi\splash.png"    720  1280
Resize-ImageWithBackground $src "$res\drawable-port-xxhdpi\splash.png"   960  1600
Resize-ImageWithBackground $src "$res\drawable-port-xxxhdpi\splash.png"  1080 1920

# ── Also update the web app icons ────────────────────────────────────────────
Write-Host "Web app icons..."
Resize-Image $src "d:\Git Clone\Breeding-planner\breeding-app-breeder\public\app-icons\icon_1024x1024.png" 1024 1024
Resize-Image $src "d:\Git Clone\Breeding-planner\breeding-app-breeder\public\app-icons\icon_512x512.png"   512  512
Resize-Image $src "d:\Git Clone\Breeding-planner\breeding-app-breeder\public\app-icons\icon_256x256.png"   256  256
Resize-Image $src "d:\Git Clone\Breeding-planner\breeding-app-breeder\public\app-icons\icon_128x128.png"   128  128
Resize-Image $src "d:\Git Clone\Breeding-planner\breeding-app-breeder\public\logo192.png"                  192  192
Resize-Image $src "d:\Git Clone\Breeding-planner\breeding-app-breeder\public\logo512.png"                  512  512

Write-Host ""
Write-Host "Done. All icons generated."
