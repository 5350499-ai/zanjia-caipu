param(
  [Parameter(Mandatory = $true)]
  [string]$Source
)

Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$iconsDir = Join-Path $projectRoot 'icons'
$splashDir = Join-Path $projectRoot 'splash'
New-Item -ItemType Directory -Force -Path $iconsDir, $splashDir | Out-Null

function Save-SquareImage([System.Drawing.Image]$image, [int]$size, [string]$outputPath) {
  $bitmap = New-Object System.Drawing.Bitmap($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.DrawImage($image, 0, 0, $size, $size)
  $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}

function Save-SplashImage([System.Drawing.Image]$image, [int]$width, [int]$height, [string]$outputPath) {
  $bitmap = New-Object System.Drawing.Bitmap($width, $height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#f7f4ed'))
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $iconSize = [int]([Math]::Min($width, $height) * 0.34)
  $x = [int](($width - $iconSize) / 2)
  $y = [int](($height - $iconSize) / 2)
  $graphics.DrawImage($image, $x, $y, $iconSize, $iconSize)
  $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}

$sourceImage = [System.Drawing.Image]::FromFile((Resolve-Path $Source))
try {
  Save-SquareImage $sourceImage 1024 (Join-Path $iconsDir 'app-icon-source-1024.png')
  Save-SquareImage $sourceImage 512 (Join-Path $iconsDir 'icon-512.png')
  Save-SquareImage $sourceImage 512 (Join-Path $iconsDir 'icon-maskable-512.png')
  Save-SquareImage $sourceImage 192 (Join-Path $iconsDir 'icon-192.png')
  Save-SquareImage $sourceImage 180 (Join-Path $iconsDir 'apple-touch-icon-180.png')
  Save-SquareImage $sourceImage 167 (Join-Path $iconsDir 'apple-touch-icon-167.png')
  Save-SquareImage $sourceImage 152 (Join-Path $iconsDir 'apple-touch-icon-152.png')
  Save-SquareImage $sourceImage 32 (Join-Path $iconsDir 'favicon-32.png')

  Save-SplashImage $sourceImage 1290 2796 (Join-Path $splashDir 'iphone-430x932.png')
  Save-SplashImage $sourceImage 1179 2556 (Join-Path $splashDir 'iphone-393x852.png')
  Save-SplashImage $sourceImage 1284 2778 (Join-Path $splashDir 'iphone-428x926.png')
  Save-SplashImage $sourceImage 750 1334 (Join-Path $splashDir 'iphone-375x667.png')
}
finally {
  $sourceImage.Dispose()
}
