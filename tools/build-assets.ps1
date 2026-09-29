<#
  build-assets.ps1 - menu-redesign image pipeline (design plan S9.1)

  Idempotent: safe to re-run; every output is deterministically regenerated
  from assets/work/image{1..6}.png. Uses only System.Drawing (GDI+) - no
  ImageMagick/cwebp, no external packages. Prints a manifest of every file
  written (pixel width x height, KB).

  Run:  powershell -ExecutionPolicy Bypass -File tools\build-assets.ps1
#>

$ErrorActionPreference = 'Stop'

$root      = Split-Path -Parent $PSScriptRoot
$workDir   = Join-Path $root 'assets\work'
$seaDir    = Join-Path $root 'assets\sea'
$imgDir    = Join-Path $root 'assets\img'
$iconsDir  = Join-Path $root 'assets\icons'
$assetsDir = Join-Path $root 'assets'

foreach ($d in @($seaDir, $iconsDir)) {
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}

Add-Type -AssemblyName System.Drawing

if (-not ([System.Management.Automation.PSTypeName]'SeaAssets.Pipeline').Type) {
Add-Type -ReferencedAssemblies System.Drawing.dll -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace SeaAssets {
public static class Pipeline {

    public static Bitmap LoadBitmap(string path) {
        using (var tmp = (Bitmap)Image.FromFile(path)) {
            var bmp = new Bitmap(tmp.Width, tmp.Height, PixelFormat.Format32bppArgb);
            using (var g = Graphics.FromImage(bmp)) { g.DrawImageUnscaled(tmp, 0, 0); }
            return bmp;
        }
    }

    // HighQualityBicubic + TileFlipXY wrap (avoids dark edge fringing on resample).
    public static Bitmap Resize(Bitmap src, int w, int h) {
        w = Math.Max(1, w); h = Math.Max(1, h);
        var dst = new Bitmap(w, h, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(dst)) {
            g.CompositingQuality = CompositingQuality.HighQuality;
            g.InterpolationMode  = InterpolationMode.HighQualityBicubic;
            g.PixelOffsetMode    = PixelOffsetMode.HighQuality;
            g.SmoothingMode      = SmoothingMode.HighQuality;
            using (var ia = new ImageAttributes()) {
                ia.SetWrapMode(WrapMode.TileFlipXY);
                var destRect = new Rectangle(0, 0, w, h);
                g.DrawImage(src, destRect, 0, 0, src.Width, src.Height, GraphicsUnit.Pixel, ia);
            }
        }
        return dst;
    }

    // object-fit:cover equivalent - scale to cover targetW x targetH, then crop at (posX,posY) (0..1).
    public static Bitmap CoverCrop(Bitmap src, int targetW, int targetH, double posX, double posY) {
        double srcAsp = (double)src.Width / src.Height;
        double dstAsp = (double)targetW / targetH;
        int scaledW, scaledH;
        if (srcAsp > dstAsp) { scaledH = targetH; scaledW = (int)Math.Round(targetH * srcAsp); }
        else                 { scaledW = targetW; scaledH = (int)Math.Round(targetW / srcAsp); }
        using (var scaled = Resize(src, scaledW, scaledH)) {
            int offX = (int)Math.Round((scaledW - targetW) * posX);
            int offY = (int)Math.Round((scaledH - targetH) * posY);
            offX = Math.Max(0, Math.Min(offX, scaledW - targetW));
            offY = Math.Max(0, Math.Min(offY, scaledH - targetH));
            var dst = new Bitmap(targetW, targetH, PixelFormat.Format32bppArgb);
            using (var g = Graphics.FromImage(dst)) {
                g.DrawImage(scaled, new Rectangle(0, 0, targetW, targetH), offX, offY, targetW, targetH, GraphicsUnit.Pixel);
            }
            return dst;
        }
    }

    // Duotone via ColorMatrix: out_j = luma*(L_j - D_j) + D_j, luma = BT.601 (plan S9.1).
    public static Bitmap Duotone(Bitmap src, string darkHex, string lightHex) {
        Color d = ColorTranslator.FromHtml(darkHex);
        Color l = ColorTranslator.FromHtml(lightHex);
        double dr = d.R / 255.0, dg = d.G / 255.0, db = d.B / 255.0;
        double lr = l.R / 255.0, lg = l.G / 255.0, lb = l.B / 255.0;
        float[][] m = new float[][] {
            new float[]{ (float)(0.299*(lr-dr)), (float)(0.299*(lg-dg)), (float)(0.299*(lb-db)), 0, 0 },
            new float[]{ (float)(0.587*(lr-dr)), (float)(0.587*(lg-dg)), (float)(0.587*(lb-db)), 0, 0 },
            new float[]{ (float)(0.114*(lr-dr)), (float)(0.114*(lg-dg)), (float)(0.114*(lb-db)), 0, 0 },
            new float[]{ 0f, 0f, 0f, 1f, 0f },
            new float[]{ (float)dr, (float)dg, (float)db, 0f, 1f }
        };
        var cm = new ColorMatrix(m);
        var dst = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(dst))
        using (var ia = new ImageAttributes()) {
            ia.SetColorMatrix(cm);
            g.DrawImage(src, new Rectangle(0, 0, src.Width, src.Height), 0, 0, src.Width, src.Height, GraphicsUnit.Pixel, ia);
        }
        return dst;
    }

    // Flat black -> transparent linear gradient over the left `widthFrac` of the image (in place).
    public static void DarkLeftGradient(Bitmap bmp, double maxAlpha, double widthFrac) {
        using (var g = Graphics.FromImage(bmp)) {
            float gw = (float)Math.Ceiling(bmp.Width * widthFrac);
            using (var brush = new LinearGradientBrush(new PointF(0, 0), new PointF(gw, 0),
                       Color.FromArgb((int)Math.Round(maxAlpha * 255), 0, 0, 0), Color.FromArgb(0, 0, 0, 0))) {
                g.FillRectangle(brush, 0, 0, gw, bmp.Height);
            }
        }
    }

    public static void SaveJpeg(Bitmap bmp, string path, long quality) {
        ImageCodecInfo codec = null;
        foreach (var c in ImageCodecInfo.GetImageEncoders()) {
            if (c.FormatID == ImageFormat.Jpeg.Guid) { codec = c; break; }
        }
        var ep = new EncoderParameters(1);
        ep.Param[0] = new EncoderParameter(Encoder.Quality, quality);
        // Flatten onto white first: opaque source, but JPEG has no alpha channel - draw onto an
        // opaque 24bpp copy to avoid encoder-dependent alpha handling.
        using (var flat = new Bitmap(bmp.Width, bmp.Height, PixelFormat.Format24bppRgb))
        using (var g = Graphics.FromImage(flat)) {
            g.DrawImageUnscaled(bmp, 0, 0);
            flat.Save(path, codec, ep);
        }
    }

    static double Smooth(double e0, double e1, double x) {
        double t = (x - e0) / (e1 - e0);
        if (t < 0) t = 0; if (t > 1) t = 1;
        return t * t * (3 - 2 * t);
    }
    static double Lerp(double a, double b, double t) { return a + (b - a) * t; }

    // 5-stop posterization ramp, hard steps at `stops` softened over a 2*halfW band (plan S7.2).
    static void RampColor(double l, double[] R, double[] G, double[] B, double[] stops, double halfW,
                           out double r, out double g, out double b) {
        if (l <= stops[0]-halfW) { r=R[0]; g=G[0]; b=B[0]; return; }
        if (l <  stops[0]+halfW) { double t=(l-(stops[0]-halfW))/(2*halfW); r=Lerp(R[0],R[1],t); g=Lerp(G[0],G[1],t); b=Lerp(B[0],B[1],t); return; }
        if (l <= stops[1]-halfW) { r=R[1]; g=G[1]; b=B[1]; return; }
        if (l <  stops[1]+halfW) { double t=(l-(stops[1]-halfW))/(2*halfW); r=Lerp(R[1],R[2],t); g=Lerp(G[1],G[2],t); b=Lerp(B[1],B[2],t); return; }
        if (l <= stops[2]-halfW) { r=R[2]; g=G[2]; b=B[2]; return; }
        if (l <  stops[2]+halfW) { double t=(l-(stops[2]-halfW))/(2*halfW); r=Lerp(R[2],R[3],t); g=Lerp(G[2],G[3],t); b=Lerp(B[2],B[3],t); return; }
        if (l <= stops[3]-halfW) { r=R[3]; g=G[3]; b=B[3]; return; }
        if (l <  stops[3]+halfW) { double t=(l-(stops[3]-halfW))/(2*halfW); r=Lerp(R[3],R[4],t); g=Lerp(G[3],G[4],t); b=Lerp(B[3],B[4],t); return; }
        r=R[4]; g=G[4]; b=B[4];
    }

    // Placeholder "baked shader frame" still: cover-crop -> downsample to blurW wide -> back up
    // (soft blur) -> BT.601 luma (gain,bias) -> 5-stop ramp -> top/bottom overlays (plan S7.2).
    public static Bitmap RenderStill(Bitmap src, int outW, int outH, int blurW, double gain, double bias,
                                      double[] rampR, double[] rampG, double[] rampB) {
        using (var cover = CoverCrop(src, outW, outH, 0.5, 0.5)) {
            int blurH = Math.Max(1, (int)Math.Round((double)blurW * outH / outW));
            using (var small = Resize(cover, blurW, blurH))
            using (var blurred = Resize(small, outW, outH)) {
                var result = new Bitmap(outW, outH, PixelFormat.Format32bppArgb);
                var rect = new Rectangle(0, 0, outW, outH);
                var bs = blurred.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
                var bd = result.LockBits(rect, ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
                int stride = bs.Stride;
                int total = stride * outH;
                byte[] sbuf = new byte[total];
                byte[] dbuf = new byte[total];
                Marshal.Copy(bs.Scan0, sbuf, 0, total);
                double[] stops = { 0.31, 0.48, 0.77, 0.81 };
                double halfW = 0.01; // ~.02-wide transition band around each hard step
                for (int y = 0; y < outH; y++) {
                    double v = 1.0 - (double)y / (outH - 1); // v=1 at top
                    double topA = 0.39 * Smooth(0.7, 1.0, v);
                    double botA = 0.8  * Smooth(0.35, 0.0, v);
                    int rowOff = y * stride;
                    for (int x = 0; x < outW; x++) {
                        int idx = rowOff + x * 4;
                        double bch = sbuf[idx] / 255.0, gch = sbuf[idx+1] / 255.0, rch = sbuf[idx+2] / 255.0;
                        double lum = rch*0.299 + gch*0.587 + bch*0.114;
                        lum = lum * gain + bias;
                        if (lum < 0) lum = 0; if (lum > 1) lum = 1;
                        double rr, gg, bb;
                        RampColor(lum, rampR, rampG, rampB, stops, halfW, out rr, out gg, out bb);
                        rr += (0.000000 - rr) * topA; gg += (0.988235 - gg) * topA; bb += (0.949020 - bb) * topA; // -> #00FCF2
                        rr += (0.000000 - rr) * botA; gg += (0.058824 - gg) * botA; bb += (0.427451 - bb) * botA; // -> #000F6D
                        if (rr<0) rr=0; if (rr>1) rr=1;
                        if (gg<0) gg=0; if (gg>1) gg=1;
                        if (bb<0) bb=0; if (bb>1) bb=1;
                        dbuf[idx]   = (byte)Math.Round(bb * 255.0);
                        dbuf[idx+1] = (byte)Math.Round(gg * 255.0);
                        dbuf[idx+2] = (byte)Math.Round(rr * 255.0);
                        dbuf[idx+3] = 255;
                    }
                }
                Marshal.Copy(dbuf, 0, bd.Scan0, total);
                blurred.UnlockBits(bs);
                result.UnlockBits(bd);
                return result;
            }
        }
    }

    // Original site icon: navy square, white heavy-italic "K" drawn as 3 strokes (skewX(-12)
    // pre-computed into the point coordinates), small red triangle cursor.
    public static Bitmap DrawFavicon(int size) {
        var bmp = new Bitmap(size, size, PixelFormat.Format32bppArgb);
        using (var g = Graphics.FromImage(bmp)) {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(ColorTranslator.FromHtml("#06124F"));
            float s = size / 64f;
            using (var pen = new Pen(Color.White, 10f * s)) {
                pen.StartCap = LineCap.Square;
                pen.EndCap   = LineCap.Square;
                g.DrawLine(pen, 15.15f*s, 4f*s,  3.24f*s, 60f*s);
                g.DrawLine(pen,  9.20f*s, 32f*s, 53.15f*s, 4f*s);
                g.DrawLine(pen,  9.20f*s, 32f*s, 41.24f*s, 60f*s);
            }
            var tri = new PointF[] {
                new PointF(50f*s, 42f*s),
                new PointF(60f*s, 48f*s),
                new PointF(50f*s, 54f*s)
            };
            using (var brush = new SolidBrush(ColorTranslator.FromHtml("#F8030A"))) {
                g.FillPolygon(brush, tri);
            }
        }
        return bmp;
    }
}
}
'@
}

function Compute-ScaledWidth([int]$srcW, [int]$maxW) {
    if ($srcW -lt $maxW) { return $srcW } else { return $maxW }
}

function Ramp-Channels([string[]]$hexList) {
    $r = @(); $g = @(); $b = @()
    foreach ($h in $hexList) {
        $c = [System.Drawing.ColorTranslator]::FromHtml($h)
        $r += [double]($c.R / 255.0)
        $g += [double]($c.G / 255.0)
        $b += [double]($c.B / 255.0)
    }
    return @($r, $g, $b)
}

$manifest = New-Object System.Collections.Generic.List[object]
function Add-Manifest([string]$fullPath, [int]$w, [int]$h) {
    $rel = $fullPath.Substring($root.Length + 1) -replace '\\','/'
    $kb  = [Math]::Round((Get-Item $fullPath).Length / 1024.0, 1)
    $manifest.Add([PSCustomObject]@{ File = $rel; Width = $w; Height = $h; KB = $kb })
}

$ramps = @{
    blue  = @('#060A2B','#0C124C','#1B38F0','#3351FF','#FCFEFE')
    night = @('#020702','#0C3A06','#1E8507','#3CFB3B','#E0FE9D')
    red   = @('#060000','#2A0304','#8E0B0C','#C51112','#FFFFFF')
    deep  = @('#000214','#01023C','#06124F','#16197F','#6AE6FA')
}

Write-Host "== 1/5 work + sea per-image (image1..6) =="
for ($i = 1; $i -le 6; $i++) {
    $srcPath = Join-Path $workDir ("image{0}.png" -f $i)
    $src = [SeaAssets.Pipeline]::LoadBitmap($srcPath)
    try {
        $srcW = $src.Width; $srcH = $src.Height

        $w1280 = Compute-ScaledWidth $srcW 1280
        $h1280 = [int][Math]::Round($srcH * $w1280 / [double]$srcW)
        $b1280 = [SeaAssets.Pipeline]::Resize($src, $w1280, $h1280)
        $p1280 = Join-Path $workDir ("image{0}-1280.jpg" -f $i)
        [SeaAssets.Pipeline]::SaveJpeg($b1280, $p1280, 80)
        Add-Manifest $p1280 $w1280 $h1280
        $b1280.Dispose()

        $w640 = Compute-ScaledWidth $srcW 640
        $h640 = [int][Math]::Round($srcH * $w640 / [double]$srcW)
        $b640 = [SeaAssets.Pipeline]::Resize($src, $w640, $h640)
        $p640 = Join-Path $workDir ("image{0}-640.jpg" -f $i)
        [SeaAssets.Pipeline]::SaveJpeg($b640, $p640, 78)
        Add-Manifest $p640 $w640 $h640
        $b640.Dispose()

        $bsea1024 = [SeaAssets.Pipeline]::Resize($src, 1024, 512)
        $psea1024 = Join-Path $seaDir ("image{0}-1024.jpg" -f $i)
        [SeaAssets.Pipeline]::SaveJpeg($bsea1024, $psea1024, 72)
        Add-Manifest $psea1024 1024 512
        $bsea1024.Dispose()

        $bsea512 = [SeaAssets.Pipeline]::Resize($src, 512, 256)
        $psea512 = Join-Path $seaDir ("image{0}-512.jpg" -f $i)
        [SeaAssets.Pipeline]::SaveJpeg($bsea512, $psea512, 70)
        Add-Manifest $psea512 512 256
        $bsea512.Dispose()
    } finally {
        $src.Dispose()
    }
}

Write-Host "== 2/5 contact-duo (image5, duotone abyss->aqua) =="
$src5 = [SeaAssets.Pipeline]::LoadBitmap((Join-Path $workDir 'image5.png'))
$srcW = $src5.Width; $srcH = $src5.Height

$w1280 = Compute-ScaledWidth $srcW 1280
$h1280 = [int][Math]::Round($srcH * $w1280 / [double]$srcW)
$resized1280 = [SeaAssets.Pipeline]::Resize($src5, $w1280, $h1280)
$duo1280 = [SeaAssets.Pipeline]::Duotone($resized1280, '#01023C', '#6AE6FA')
$pDuo1280 = Join-Path $imgDir 'contact-duo-1280.jpg'
[SeaAssets.Pipeline]::SaveJpeg($duo1280, $pDuo1280, 78)
Add-Manifest $pDuo1280 $w1280 $h1280
$resized1280.Dispose(); $duo1280.Dispose()

$w640 = Compute-ScaledWidth $srcW 640
$h640 = [int][Math]::Round($srcH * $w640 / [double]$srcW)
$resized640 = [SeaAssets.Pipeline]::Resize($src5, $w640, $h640)
$duo640 = [SeaAssets.Pipeline]::Duotone($resized640, '#01023C', '#6AE6FA')
$pDuo640 = Join-Path $imgDir 'contact-duo-640.jpg'
[SeaAssets.Pipeline]::SaveJpeg($duo640, $pDuo640, 78)
Add-Manifest $pDuo640 $w640 $h640
$resized640.Dispose(); $duo640.Dispose()

Write-Host "== 3/5 link preview: skipped =="
# The link preview (assets/og-site.jpg, 1200x630) is a screenshot of the page itself, not a project frame:
#   node tools/serve.js 8080
#   node tools/shot.mjs --url "http://127.0.0.1:8080/?og=1" --w 1600 --h 840 --wait 6000 --out <dir> --prefix og
# then downscale the PNG to 1200x630 JPEG q85. When it changes, save it under a NEW file name and update
# og:image in index.html, otherwise Telegram/Discord keep showing their cached copy.
$src5.Dispose()

Write-Host "== 4/5 sea stills (placeholders only where missing; the real ones are baked from tools/bake.html) =="
$src2 = [SeaAssets.Pipeline]::LoadBitmap((Join-Path $workDir 'image2.png'))
$src3 = [SeaAssets.Pipeline]::LoadBitmap((Join-Path $workDir 'image3.png'))

foreach ($name in @('deep','blue','red')) {
    $rgb = Ramp-Channels $ramps[$name]
    $still = [SeaAssets.Pipeline]::RenderStill($src2, 960, 540, 240, 1.25, 0.04, $rgb[0], $rgb[1], $rgb[2])
    $p = Join-Path $seaDir ("still-{0}.jpg" -f $name)
    if (-not (Test-Path $p)) { [SeaAssets.Pipeline]::SaveJpeg($still, $p, 75); Add-Manifest $p 960 540 }
    $still.Dispose()
}
$rgbNight = Ramp-Channels $ramps['night']
$stillNight = [SeaAssets.Pipeline]::RenderStill($src3, 960, 540, 240, 1.30, 0.05, $rgbNight[0], $rgbNight[1], $rgbNight[2])
$pNight = Join-Path $seaDir 'still-night.jpg'
if (-not (Test-Path $pNight)) { [SeaAssets.Pipeline]::SaveJpeg($stillNight, $pNight, 75); Add-Manifest $pNight 960 540 }
$stillNight.Dispose()
$src2.Dispose(); $src3.Dispose()

Write-Host "== 5/5 icons (original K monogram, navy/white/red) =="
$svg = @'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Site icon">
<rect width="64" height="64" fill="#06124F"/>
<g stroke="#FFFFFF" stroke-width="10" stroke-linecap="square" fill="none">
<line x1="15.15" y1="4" x2="3.24" y2="60"/>
<line x1="9.20" y1="32" x2="53.15" y2="4"/>
<line x1="9.20" y1="32" x2="41.24" y2="60"/>
</g>
<polygon points="50,42 60,48 50,54" fill="#F8030A"/>
</svg>
'@
$pSvg = Join-Path $iconsDir 'favicon.svg'
[System.IO.File]::WriteAllText($pSvg, $svg, (New-Object System.Text.UTF8Encoding($false)))
Add-Manifest $pSvg 64 64

$touch = [SeaAssets.Pipeline]::DrawFavicon(180)
$pTouch = Join-Path $iconsDir 'apple-touch-icon.png'
$touch.Save($pTouch, [System.Drawing.Imaging.ImageFormat]::Png)
Add-Manifest $pTouch 180 180
$touch.Dispose()

Write-Host ""
Write-Host "===== MANIFEST ($($manifest.Count) files) ====="
$manifest | Sort-Object File | Format-Table -AutoSize | Out-String -Width 220 | Write-Host
