$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root 'photos'

Add-Type -AssemblyName System.Drawing

$files = @(Get-ChildItem -LiteralPath $dir -File -Filter '*.jpg' |
  Where-Object { $_.Name -match '^\d{3}\.jpg$' } |
  Sort-Object Name)

$cols = 3
$tw = 500
$th = 375

for ($sheet = 0; $sheet -lt 4; $sheet++) {
  $batch = $files | Select-Object -Skip ($sheet * 9) -First 9
  if (-not $batch) { break }
  $bmp = New-Object System.Drawing.Bitmap ($cols * $tw), (3 * $th)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::FromArgb(30, 30, 30))
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBilinear
  $font = New-Object System.Drawing.Font 'Arial', 28, ([System.Drawing.FontStyle]::Bold)

  for ($i = 0; $i -lt $batch.Count; $i++) {
    $img = [System.Drawing.Image]::FromFile($batch[$i].FullName)
    $c = $i % $cols
    $r = [Math]::Floor($i / $cols)
    $g.DrawImage($img, $c * $tw, $r * $th, $tw, $th)
    $img.Dispose()
    $g.DrawString(($sheet * 9 + $i + 1).ToString('00'), $font, [System.Drawing.Brushes]::Yellow, ($c * $tw + 6), ($r * $th + 4))
  }

  $g.Dispose()
  $path = Join-Path $root ("_sheet{0}.jpg" -f ($sheet + 1))
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Jpeg)
  $bmp.Dispose()
  Write-Output "wrote $path"
}
