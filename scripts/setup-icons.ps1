Add-Type -AssemblyName System.Drawing

$srcPath = "d:\My File\ALmEz0\1- Site\photo\logo-512.png"
if (-not (Test-Path $srcPath)) {
    Write-Error "Source icon not found: $srcPath"
    exit 1
}

$srcImg = [System.Drawing.Image]::FromFile($srcPath)

function Resize-Image($destPath, $width, $height) {
    $destBitmap = New-Object System.Drawing.Bitmap($width, $height)
    $graphics = [System.Drawing.Graphics]::FromImage($destBitmap)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.DrawImage($srcImg, 0, 0, $width, $height)
    $graphics.Dispose()
    
    $dir = Split-Path $destPath
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    
    if (Test-Path $destPath) { Remove-Item $destPath -Force }
    $destBitmap.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $destBitmap.Dispose()
    Write-Host "Generated: $destPath ($width x $height)"
}

# Android mipmap icons
$androidRes = "d:\My File\ALmEz0\1- Site\android\app\src\main\res"
$sizes = @{
    "mipmap-mdpi" = 48
    "mipmap-hdpi" = 72
    "mipmap-xhdpi" = 96
    "mipmap-xxhdpi" = 144
    "mipmap-xxxhdpi" = 192
}

foreach ($folder in $sizes.Keys) {
    $sz = $sizes[$folder]
    Resize-Image "$androidRes\$folder\ic_launcher.png" $sz $sz
    Resize-Image "$androidRes\$folder\ic_launcher_round.png" $sz $sz
    Resize-Image "$androidRes\$folder\ic_launcher_foreground.png" $sz $sz
}

# iOS App Icon (1024x1024)
$iosIcon = "d:\My File\ALmEz0\1- Site\ios\App\App\Assets.xcassets\AppIcon.appiconset\AppIcon-512@2x.png"
Resize-Image $iosIcon 1024 1024

# Splash Screen Icons
$splashSizes = @{
    "drawable" = @{ w = 480; h = 800 }
    "drawable-port-mdpi" = @{ w = 320; h = 480 }
    "drawable-port-hdpi" = @{ w = 480; h = 800 }
    "drawable-port-xhdpi" = @{ w = 720; h = 1280 }
    "drawable-port-xxhdpi" = @{ w = 960; h = 1600 }
    "drawable-port-xxxhdpi" = @{ w = 1280; h = 1920 }
}

foreach ($fld in $splashSizes.Keys) {
    $dim = $splashSizes[$fld]
    $dest = "$androidRes\$fld\splash.png"
    Resize-Image $dest $dim.w $dim.h
}

# iOS Splash
$iosSplash = "d:\My File\ALmEz0\1- Site\ios\App\App\Assets.xcassets\Splash.imageset\splash.png"
if (Test-Path (Split-Path $iosSplash)) {
    Resize-Image $iosSplash 1284 2778
}

$srcImg.Dispose()
Write-Host "All icons generated successfully!"
