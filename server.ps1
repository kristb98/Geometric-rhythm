# Geometric Rhythm - Local Server
# Serves the game over http://localhost so audio & localStorage work
# (double-clicked file:// pages are blocked by Edge/Chrome as unique origins).

$port = 8080
$root = $PSScriptRoot

$listener = New-Object System.Net.HttpListener
# Listen on both names: localhost (default) and the raw loopback IP, so pages
# such as result.html can iframe http://127.0.0.1:$port/ without a 400.
$listener.Prefixes.Add("http://localhost:$port/")
try {
    $listener.Prefixes.Add("http://127.0.0.1:$port/")
} catch {
    Write-Warning "Could not register 127.0.0.1 prefix (run as admin once: netsh http add urlacl url=http://127.0.0.1:$port/ user=$env:USERNAME)"
}
$listener.Start()
Write-Host "Geometric Rhythm running at http://localhost:$port/  (and http://127.0.0.1:$port/)  (Ctrl+C to stop)"

Start-Process "http://localhost:$port/"

$mime = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css'
    '.js'   = 'application/javascript'
    '.mp3'  = 'audio/mpeg'
    '.png'  = 'image/png'
    '.ico'  = 'image/x-icon'
    '.json' = 'application/json'
    '.txt'  = 'text/plain'
    '.svg'  = 'image/svg+xml'
}

try {
    while ($listener.IsListening) {
        try {
            $context = $listener.GetContext()
        } catch {
            continue  # client disconnected or listener stopped; keep serving
        }

        try {
            $req = $context.Request
            $res = $context.Response

            $path = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
            if ($path -eq '/') { $path = '/index.html' }
            $file = Join-Path $root ($path.TrimStart('/'))

            $file = [System.IO.Path]::GetFullPath($file)
            if (-not $file.StartsWith([System.IO.Path]::GetFullPath($root))) {
                $res.StatusCode = 403
            } elseif (Test-Path $file -PathType Leaf) {
                $bytes = [System.IO.File]::ReadAllBytes($file)
                $ext = [System.IO.Path]::GetExtension($file).ToLower()
                if ($mime.ContainsKey($ext)) { $res.ContentType = $mime[$ext] }
                $res.ContentLength64 = $bytes.Length
                $res.Headers.Add("Cache-Control", "no-cache")
                if ($req.HttpMethod -ne 'HEAD') {
                    $res.OutputStream.Write($bytes, 0, $bytes.Length)
                }
            } else {
                $res.StatusCode = 404
            }
        } catch {
            try { $res.StatusCode = 500 } catch {}
        }
        try { $res.Close() } catch {}
    }
} finally {
    $listener.Stop()
}
