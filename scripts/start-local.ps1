$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)

try {
    if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
        throw '请先安装 Node.js 长期支持版，再双击 Start-Guitar.cmd。'
    }
    if (-not (Test-Path -LiteralPath 'node_modules/.bin/vite.cmd')) {
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw '依赖安装失败，请检查网络后重试。' }
    } else {
        & npm.cmd run postinstall
        if ($LASTEXITCODE -ne 0) { throw '手部识别运行环境准备失败，请重试。' }
    }
    if (-not (Test-Path -LiteralPath 'public/models/hand_landmarker.task')) {
        & npm.cmd run fetch:model
        if ($LASTEXITCODE -ne 0) { throw '手部识别模型下载失败，请检查网络后重试。' }
    }
    Write-Host '正在启动手势吉他。请保持此窗口打开；按 Ctrl+C 停止服务。'
    & npm.cmd run dev -- --host localhost --port 5173 --open
    exit $LASTEXITCODE
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
