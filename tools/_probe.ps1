$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root 'photos'

Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;

public static class PeriodProbe
{
    public static string Probe(string path)
    {
        using (var src = Image.FromFile(path))
        {
            int w = 480, h = 360;
            using (var bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb))
            {
                using (var g = Graphics.FromImage(bmp))
                {
                    g.InterpolationMode = InterpolationMode.HighQualityBilinear;
                    g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                    g.DrawImage(src, 0, 0, w, h);
                }

                var rect = new Rectangle(0, 0, w, h);
                var data = bmp.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
                byte[] buf = new byte[data.Stride * h];
                Marshal.Copy(data.Scan0, buf, 0, buf.Length);
                bmp.UnlockBits(data);

                // central 60% region
                int x0 = (int)(w * 0.2), x1 = (int)(w * 0.8);
                int y0 = (int)(h * 0.2), y1 = (int)(h * 0.8);
                int cw = x1 - x0, ch = y1 - y0;

                double[] rowMean = new double[ch];
                double[] colMean = new double[cw];
                for (int y = y0; y < y1; y++)
                {
                    double sum = 0;
                    for (int x = x0; x < x1; x++)
                    {
                        int off = y * data.Stride + x * 4;
                        double v = (buf[off] + buf[off + 1] + buf[off + 2]) / 3.0;
                        sum += v;
                    }
                    rowMean[y - y0] = sum / cw;
                }
                for (int x = x0; x < x1; x++)
                {
                    double sum = 0;
                    for (int y = y0; y < y1; y++)
                    {
                        int off = y * data.Stride + x * 4;
                        double v = (buf[off] + buf[off + 1] + buf[off + 2]) / 3.0;
                        sum += v;
                    }
                    colMean[x - x0] = sum / ch;
                }

                double bestRow = double.MaxValue, bestCol = double.MaxValue;
                for (int p = 8; p <= 45; p++)
                {
                    double sr = 0; int nr = 0;
                    for (int i = 0; i + p < rowMean.Length; i++) { sr += Math.Abs(rowMean[i] - rowMean[i + p]); nr++; }
                    if (nr > 0) { sr /= nr; if (sr < bestRow) bestRow = sr; }

                    double sc = 0; int nc = 0;
                    for (int i = 0; i + p < colMean.Length; i++) { sc += Math.Abs(colMean[i] - colMean[i + p]); nc++; }
                    if (nc > 0) { sc /= nc; if (sc < bestCol) bestCol = sc; }
                }

                string verdict = bestRow < bestCol * 0.9 ? "RAW_UPRIGHT" : (bestCol < bestRow * 0.9 ? "NEEDS_ROTATE" : "UNCLEAR");
                return string.Format("{0}|row={1:F2}|col={2:F2}|{3}",
                    System.IO.Path.GetFileName(path), bestRow, bestCol, verdict);
            }
        }
    }
}
"@

Get-ChildItem -LiteralPath $dir -File -Filter '*.jpg' |
  Where-Object { $_.Name -match '^\d{3}\.jpg$' } |
  Sort-Object Name |
  ForEach-Object { [PeriodProbe]::Probe($_.FullName) }
