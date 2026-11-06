# =============================================================================
#  import-pages.ps1 —— 批量导入本子照片
#
#  用法(在网站根目录,也就是有 index.html 的那一层):
#      powershell -ExecutionPolicy Bypass -File tools\import-pages.ps1
#
#  它会:
#    1. 读取 photos/ 里的 jpg / png / webp(按文件名里的数字排序)
#    2. 缩到长边 maxWidth 像素,输出 images/pages/page-001.jpg ...
#    3. 重写 data/pages.js
#
#  不会动 data/notebook.js —— 你抄进去的文字不会丢,可以反复运行。
#
#  方向:默认相信照片本身已经是正的(手机导出的图常常如此)。
#    个别页码方向不对时,用 -RotatePages 指定,例如:
#        -RotatePages "1,36"      # 第 1 页、第 36 页顺时针转 90 度
#    只有相机的 EXIF 方向可信时,才加 -ExifRotate。
# =============================================================================

param(
  [string]$Source     = "photos",
  [string]$OutDir     = "images/pages",
  [string]$DataFile   = "data/pages.js",
  [int]$MaxWidth      = 1800,
  [int]$Quality       = 82,
  [string]$RotatePages = "",   # 例:"1,36" —— 这些页码顺时针转 90 度
  [switch]$ExifRotate          # 只有 EXIF 方向可信时才用
)

$ErrorActionPreference = "Stop"

try {
  Add-Type -AssemblyName System.Drawing
} catch {
  Write-Host "找不到 System.Drawing,请在 Windows PowerShell 里运行。" -ForegroundColor Red
  exit 1
}

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Test-Path -LiteralPath $Source)) {
  Write-Host "找不到照片文件夹:$Source" -ForegroundColor Red
  Write-Host "请把照片放进 $Source\ 再运行。"
  exit 1
}

$files = @(Get-ChildItem -LiteralPath $Source -File |
  Where-Object { $_.Extension -match '^\.(jpe?g|png|webp)$' } |
  Sort-Object `
    @{ Expression = {
        if ($_.BaseName -match '(\d+)\D*$') { [int]$Matches[1] } else { [int]::MaxValue }
      } }, `
    @{ Expression = { $_.Name } })

$heicCount = @(Get-ChildItem -LiteralPath $Source -File |
  Where-Object { $_.Extension -match '^\.(heic|heif)$' }).Count

if ($heicCount -gt 0 -and $files.Count -eq 0) {
  Write-Host "这里的 $heicCount 张全是 HEIC 格式,Windows 和这个脚本都处理不了。" -ForegroundColor Red
  Write-Host ""
  Write-Host "最省事的办法:iPhone 设置 → 照片 → 传输到 Mac 或 PC → 选「自动」,"
  Write-Host "再用数据线重新导一次,导出来就是 JPG。"
  Write-Host "或者用微信 / QQ 把照片发到电脑(会压缩,但能用)。"
  exit 1
}

if ($heicCount -gt 0) {
  Write-Host "提示:另有 $heicCount 张 HEIC 会被跳过(Windows 打不开)。" -ForegroundColor Yellow
  Write-Host "      iPhone 设置 → 照片 → 传输到 Mac 或 PC → 选「自动」后重新导入,就是 JPG 了。"
  Write-Host ""
}

if ($files.Count -eq 0) {
  Write-Host "$Source 里没有 .jpg / .png / .webp 照片。" -ForegroundColor Red
  Write-Host "把照片拷进 $Source 再运行。"
  exit 1
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
  Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1

$rotateSet = @()
if ($RotatePages) {
  $rotateSet = @($RotatePages -split '[,，\s]+' | Where-Object { $_ } | ForEach-Object { [int]$_ })
}

$entries = New-Object System.Collections.Generic.List[string]
$page = 0

foreach ($file in $files) {
  $page++
  $name = "page-{0:D3}.jpg" -f $page
  $dest = Join-Path $OutDir $name

  try {
    $image = [System.Drawing.Image]::FromFile($file.FullName)
  } catch {
    Write-Host "跳过打不开的文件:$($file.Name)" -ForegroundColor Yellow
    $page--
    continue
  }

  try {
    # 转正方向
    $work = $image.Clone()
    try {
      if ($rotateSet -contains $page) {
        $work.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone)
      } elseif ($ExifRotate -and ($image.PropertyIdList -contains 0x0112)) {
        switch ([int]$image.GetPropertyItem(0x0112).Value[0]) {
          2 { $work.RotateFlip([System.Drawing.RotateFlipType]::RotateNoneFlipX) }
          3 { $work.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone) }
          4 { $work.RotateFlip([System.Drawing.RotateFlipType]::RotateNoneFlipY) }
          5 { $work.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipX) }
          6 { $work.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone) }
          7 { $work.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipX) }
          8 { $work.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone) }
        }
      }

      $w = $work.Width
      $h = $work.Height
      $newW = $w
      $newH = $h
      if ($MaxWidth -gt 0 -and $w -gt $MaxWidth) {
        $newW = $MaxWidth
        $newH = [int][Math]::Round($h * ($MaxWidth / $w))
      }

      $bitmap = New-Object System.Drawing.Bitmap $newW, $newH
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.Clear([System.Drawing.Color]::White)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.DrawImage($work, 0, 0, $newW, $newH)
      } finally {
        $graphics.Dispose()
      }

      $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters 1
      $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
        [System.Drawing.Imaging.Encoder]::Quality, [long]$Quality)

      try {
        $bitmap.Save($dest, $jpegCodec, $encoderParams)
      } finally {
        $encoderParams.Dispose()
        $bitmap.Dispose()
      }
    } finally {
      $work.Dispose()
    }
  } finally {
    $image.Dispose()
  }

  $relative = ($OutDir -replace '\\', '/').TrimEnd('/') + '/' + $name
  $entries.Add(('  { page: ' + $page + ', image: "' + $relative + '" }'))
  Write-Host ("  [OK] {0}  ->  {1}  ({2}x{3})" -f $file.Name, $relative, $newW, $newH)
}

if ($page -eq 0) {
  Write-Host "没有成功导入任何图片。" -ForegroundColor Red
  exit 1
}

$header = @'
/* 页面清单(图片)
   —— 由 tools/import-pages.ps1 自动生成,重新运行会覆盖本文件。
   所以文字内容请写在 data/notebook.js 里,不要写在这里。

   字段:page(页码)image(图片路径)thumb(缩略图,可省略) */
window.NOTEBOOK_PAGES = [
'@

$footer = @'
];
'@

$content = $header + "`r`n" + ($entries -join ",`r`n") + "`r`n" + $footer
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $Root $DataFile), $content, $utf8)

Write-Host ""
Write-Host "完成:$page 页" -ForegroundColor Green
Write-Host "图片:$OutDir"
Write-Host "清单:$DataFile"
Write-Host ""
Write-Host "下一步:打开 data/notebook.js,一页页把文字抄进去。"
Write-Host "提示:data/notebook.js 里没写到的页码,网站上会显示「待转录」——这不影响看图。"
