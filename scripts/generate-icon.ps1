param(
    [string]$Source = "public/app-icons/icon_512x512.png",
    [string]$Destination = "buildResources/icon.ico"
)

Add-Type -AssemblyName System.Drawing
$fullSource = Join-Path $PSScriptRoot ".." | Join-Path -ChildPath $Source
$fullDestination = Join-Path $PSScriptRoot ".." | Join-Path -ChildPath $Destination
$destinationDir = Split-Path $fullDestination -Parent
if (-not (Test-Path $destinationDir)) {
    New-Item -ItemType Directory -Path $destinationDir | Out-Null
}
$bitmap = [System.Drawing.Bitmap]::new($fullSource)
try {
    $iconHandle = $bitmap.GetHicon()
    $icon = [System.Drawing.Icon]::FromHandle($iconHandle)
    try {
        $iconStream = New-Object System.IO.FileStream($fullDestination, [System.IO.FileMode]::Create)
        try {
            $icon.Save($iconStream)
        } finally {
            $iconStream.Dispose()
        }
        Write-Host "Icon generated at $fullDestination"
    } finally {
        $icon.Dispose()
    }
} finally {
    $bitmap.Dispose()
}
