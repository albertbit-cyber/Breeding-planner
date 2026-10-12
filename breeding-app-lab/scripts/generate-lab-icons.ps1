param(
  # The breeder's finished Serpentora mark is the source of truth for the logo
  # itself. It is a two-tone image: the green mark on the cream ground #F5F0E8.
  [string]$SourceImage = (Join-Path $PSScriptRoot "..\..\breeding-app-breeder\android\app\src\main\res\mipmap-xxxhdpi\ic_launcher_foreground.png"),
  # A true 1024 render of the same mark. $SourceImage is only 432px, which is
  # ample for launcher icons (192 max) and the adaptive foreground (432), but
  # upscaling it to a 1024 PWA icon visibly softens the mark.
  [string]$WebSourceImage = (Join-Path $PSScriptRoot "..\..\breeding-app-breeder\public\app-icons\icon_1024x1024.png"),
  [string]$AndroidResDir = (Join-Path $PSScriptRoot "..\android\app\src\main\res"),
  [string]$PublicDir = (Join-Path $PSScriptRoot "..\public"),

  # The ground the breeder's splash already uses. The Lab app keeps the same
  # mark but inverts the ground, so the two Serpentora apps can be told apart
  # in the launcher when both are installed -- which they are meant to be.
  [string]$Ground = "#07110D",
  [string]$SourceGround = "#F5F0E8"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

# --- Recolour ---------------------------------------------------------------
# The source is two-tone, so every pixel is some blend of the cream ground and
# the green mark. Projecting each pixel onto the cream->green line recovers how
# much "mark" it holds, and that coverage is then re-composited over the dark
# ground. Keying the cream to transparent instead would fringe every
# anti-aliased edge with a pale halo once it landed on a dark ground.
function Get-RecolouredBitmap {
  param([string]$Src, [System.Drawing.Color]$To, [System.Drawing.Color]$From)

  $img = [System.Drawing.Image]::FromFile($Src)
  $w = $img.Width; $h = $img.Height
  $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.DrawImage($img, 0, 0, $w, $h)
  $g.Dispose(); $img.Dispose()

  $rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
  $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $count = $data.Stride * $h
  $buf = New-Object byte[] $count
  [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $buf, 0, $count)

  # Direction of the cream -> mark axis, and its squared length, so the
  # projection is a plain dot product per pixel.
  $fr = [double]$From.R; $fg = [double]$From.G; $fb = [double]$From.B
  # Sample the mark colour from the source rather than hard-coding it: the file
  # is the authority on the brand green, and a literal here would drift.
  $markR = 0.0; $markG = 0.0; $markB = 0.0; $markN = 0
  for ($i = 0; $i -lt $count; $i += 4) {
    $b = [double]$buf[$i]; $gg = [double]$buf[$i + 1]; $r = [double]$buf[$i + 2]
    # Strongly-green pixels only, so anti-aliased edges do not dilute the sample.
    if ($gg - $r -gt 60 -and $gg - $b -gt 40) {
      $markR += $r; $markG += $gg; $markB += $b; $markN++
    }
  }
  if ($markN -eq 0) { throw "No mark pixels found in $Src -- is it the two-tone logo?" }
  $markR /= $markN; $markG /= $markN; $markB /= $markN

  $dR = $markR - $fr; $dG = $markG - $fg; $dB = $markB - $fb
  $len2 = $dR * $dR + $dG * $dG + $dB * $dB

  $tR = [double]$To.R; $tG = [double]$To.G; $tB = [double]$To.B

  for ($i = 0; $i -lt $count; $i += 4) {
    $b = [double]$buf[$i]; $gg = [double]$buf[$i + 1]; $r = [double]$buf[$i + 2]
    $t = (($r - $fr) * $dR + ($gg - $fg) * $dG + ($b - $fb) * $dB) / $len2
    if ($t -lt 0) { $t = 0 } elseif ($t -gt 1) { $t = 1 }
    $buf[$i]     = [byte][math]::Round($tB + ($markB - $tB) * $t)
    $buf[$i + 1] = [byte][math]::Round($tG + ($markG - $tG) * $t)
    $buf[$i + 2] = [byte][math]::Round($tR + ($markR - $tR) * $t)
    $buf[$i + 3] = 255
  }

  [System.Runtime.InteropServices.Marshal]::Copy($buf, 0, $data.Scan0, $count)
  $bmp.UnlockBits($data)
  return $bmp
}

function Save-Scaled {
  param([System.Drawing.Bitmap]$Src, [string]$Dst, [int]$W, [int]$H, [bool]$Circle = $false)
  $bmp = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  if ($Circle) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddEllipse(0, 0, $W, $H)
    $g.SetClip($path)
  }
  $g.DrawImage($Src, 0, 0, $W, $H)
  $g.Dispose()
  $dir = Split-Path $Dst -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $bmp.Save($Dst, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "  -> $Dst ($W x $H)"
}

$toColor = [System.Drawing.ColorTranslator]::FromHtml($Ground)
$fromColor = [System.Drawing.ColorTranslator]::FromHtml($SourceGround)

Write-Host "Source: $SourceImage"
Write-Host "Ground: $Ground (was $SourceGround)"
Write-Host ""

$mark = Get-RecolouredBitmap $SourceImage $toColor $fromColor

Write-Host "Launcher icons..."
Save-Scaled $mark "$AndroidResDir\mipmap-mdpi\ic_launcher.png"    48   48
Save-Scaled $mark "$AndroidResDir\mipmap-hdpi\ic_launcher.png"    72   72
Save-Scaled $mark "$AndroidResDir\mipmap-xhdpi\ic_launcher.png"   96   96
Save-Scaled $mark "$AndroidResDir\mipmap-xxhdpi\ic_launcher.png"  144  144
Save-Scaled $mark "$AndroidResDir\mipmap-xxxhdpi\ic_launcher.png" 192  192

Write-Host "Round launcher icons..."
Save-Scaled $mark "$AndroidResDir\mipmap-mdpi\ic_launcher_round.png"    48   48  $true
Save-Scaled $mark "$AndroidResDir\mipmap-hdpi\ic_launcher_round.png"    72   72  $true
Save-Scaled $mark "$AndroidResDir\mipmap-xhdpi\ic_launcher_round.png"   96   96  $true
Save-Scaled $mark "$AndroidResDir\mipmap-xxhdpi\ic_launcher_round.png"  144  144 $true
Save-Scaled $mark "$AndroidResDir\mipmap-xxxhdpi\ic_launcher_round.png" 192  192 $true

# The adaptive foreground is masked by the launcher and only the inner ~66% is
# guaranteed visible, so the mark is inset into that safe zone rather than
# filling the tile -- otherwise a circular mask clips the ouroboros.
Write-Host "Adaptive foregrounds (mark inset into the 66% safe zone)..."
foreach ($pair in @(@("mdpi", 108), @("hdpi", 162), @("xhdpi", 216), @("xxhdpi", 324), @("xxxhdpi", 432))) {
  $dpi = $pair[0]; $size = [int]$pair[1]
  $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear($toColor)
  $inner = [int]($size * 0.66)
  $off = [int](($size - $inner) / 2)
  $g.DrawImage($mark, $off, $off, $inner, $inner)
  $g.Dispose()
  $dst = "$AndroidResDir\mipmap-$dpi\ic_launcher_foreground.png"
  $bmp.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "  -> $dst ($size x $size)"
}

# --- Splash -----------------------------------------------------------------
# Same ground as the icon, mark centred at a restrained size.
function Save-Splash {
  param([string]$Dst, [int]$W, [int]$H)
  $bmp = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear($toColor)
  $logo = [int]([math]::Min($W, $H) * 0.30)
  $g.DrawImage($mark, [int](($W - $logo) / 2), [int](($H - $logo) / 2), $logo, $logo)
  $g.Dispose()
  $dir = Split-Path $Dst -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $bmp.Save($Dst, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "  -> $Dst ($W x $H)"
}

Write-Host "Splash screens..."
Save-Splash "$AndroidResDir\drawable\splash.png"               480  800
Save-Splash "$AndroidResDir\drawable-land-mdpi\splash.png"     480  320
Save-Splash "$AndroidResDir\drawable-land-hdpi\splash.png"     800  480
Save-Splash "$AndroidResDir\drawable-land-xhdpi\splash.png"    1280 720
Save-Splash "$AndroidResDir\drawable-land-xxhdpi\splash.png"   1600 960
Save-Splash "$AndroidResDir\drawable-land-xxxhdpi\splash.png"  1920 1080
Save-Splash "$AndroidResDir\drawable-port-mdpi\splash.png"     320  480
Save-Splash "$AndroidResDir\drawable-port-hdpi\splash.png"     480  800
Save-Splash "$AndroidResDir\drawable-port-xhdpi\splash.png"    720  1280
Save-Splash "$AndroidResDir\drawable-port-xxhdpi\splash.png"   960  1600
Save-Splash "$AndroidResDir\drawable-port-xxxhdpi\splash.png"  1080 1920

# --- Web / PWA icons --------------------------------------------------------
# These sit on the portal's light chrome, so they keep the breeder's cream
# ground: the source image, unrecoloured.
Write-Host "Web app icons (cream ground, as the portal chrome is light)..."
$web = [System.Drawing.Image]::FromFile($WebSourceImage)
$webBmp = New-Object System.Drawing.Bitmap($web)
$web.Dispose()
Save-Scaled $webBmp "$PublicDir\app-icons\icon_1024x1024.png" 1024 1024
Save-Scaled $webBmp "$PublicDir\app-icons\icon_512x512.png"   512  512
Save-Scaled $webBmp "$PublicDir\app-icons\icon_256x256.png"   256  256
Save-Scaled $webBmp "$PublicDir\app-icons\icon_128x128.png"   128  128
Save-Scaled $webBmp "$PublicDir\app-icons\icon_32x32.png"     32   32
Save-Scaled $webBmp "$PublicDir\app-icons\icon_16x16.png"     16   16
Save-Scaled $webBmp "$PublicDir\logo192.png"                  192  192
Save-Scaled $webBmp "$PublicDir\logo512.png"                  512  512
$webBmp.Dispose()

$mark.Dispose()
Write-Host ""
Write-Host "Done."
