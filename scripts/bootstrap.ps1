$ErrorActionPreference = "Stop"

Write-Host "Gesture Guitar Web bootstrap"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js is required."
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git for Windows is required."
}

if (-not (Test-Path ".git")) {
    git init
}

$remotes = git remote
if ($remotes) {
    throw "This project must remain local-only. Remove configured Git remotes before continuing."
}

Write-Host "Local Git repository ready; no remote configured."
Write-Host "Claude Code should now create the Vite + React + TypeScript application in this directory."
