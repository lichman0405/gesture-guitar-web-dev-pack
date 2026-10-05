$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)

try {
    if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw 'Install Node.js LTS, then double-click Start-Guitar.cmd again.'
    }
    if (-not (Test-Path -LiteralPath 'node_modules/.bin/vite.cmd')) {
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
    } else {
        & npm.cmd run postinstall
        if ($LASTEXITCODE -ne 0) { throw 'MediaPipe WASM preparation failed.' }
    }
    if (-not (Test-Path -LiteralPath 'public/models/hand_landmarker.task')) {
        & npm.cmd run fetch:model
        if ($LASTEXITCODE -ne 0) { throw 'Hand model download failed.' }
    }
    Write-Host 'Starting Gesture Guitar. Keep this window open; Ctrl+C stops the server.'
    & npm.cmd run dev -- --host localhost --port 5173 --open
    exit $LASTEXITCODE
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
