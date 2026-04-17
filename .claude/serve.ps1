$port = if ($env:PORT) { $env:PORT } else { 8080 }
$root = Split-Path $PSScriptRoot -Parent

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:${port}/")

try { $listener.Start() } catch {
    Write-Error "Cannot bind to port ${port}: $_"
    exit 1
}

Write-Host "Serving on http://localhost:${port}"

$mime = @{
    '.html'  = 'text/html; charset=utf-8'
    '.css'   = 'text/css; charset=utf-8'
    '.js'    = 'application/javascript; charset=utf-8'
    '.json'  = 'application/json; charset=utf-8'
    '.png'   = 'image/png'
    '.jpg'   = 'image/jpeg'
    '.svg'   = 'image/svg+xml'
    '.ico'   = 'image/x-icon'
    '.woff'  = 'font/woff'
    '.woff2' = 'font/woff2'
    '.ies'   = 'text/plain'
}

try {
    while ($listener.IsListening) {
        $ctx  = $listener.GetContext()
        $path = $ctx.Request.Url.LocalPath
        if ($path -eq '/') { $path = '/index.html' }

        $file = Join-Path $root ($path.TrimStart('/') -replace '/', '\')

        try {
            if (Test-Path $file -PathType Leaf) {
                $bytes = [System.IO.File]::ReadAllBytes($file)
                $ext   = [System.IO.Path]::GetExtension($file)
                $ctx.Response.ContentType   = if ($mime[$ext]) { $mime[$ext] } else { 'application/octet-stream' }
                $ctx.Response.ContentLength64 = $bytes.Length
                $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $ctx.Response.StatusCode = 404
                $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not Found')
                $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
            }
        } catch {
            Write-Host "Request error: $_"
        } finally {
            $ctx.Response.Close()
        }
    }
} finally {
    $listener.Stop()
}
